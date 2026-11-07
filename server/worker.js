// 큰법당 템플스테이 방 중계 서버.
// 방(예: forest-3) 하나가 Durable Object 하나. 최대 20명이 웹소켓으로 붙고,
// 서로의 위치·동작을 그대로 나눠 준다. 연등은 모든 서버가 함께 보는 저장소(Stats)에 60개까지 남는다
// (색·법명만, 소원 글은 받지 않음). 한 접속에서 연등은 1분에 하나.
import { DurableObject } from 'cloudflare:workers';

const CAP = 20;
const SERVERS = 10;   // 서버 hall-1 ~ hall-10 (서버마다 20명) (js/data.js 의 SERVER_COUNT)
const WISH_GAP = 60e3; // 연등은 1분에 하나
const GRACE = 30e3;    // 끊긴 분 자리를 남겨 두는 시간 (다른 창에 잠깐 다녀오기, 휴대폰 화면 끄기)
// 'hall' 이 큰법당 서버 1~12. 예전 위치별 방 이름도 받아 둔다
const ROOM_RE = /^(hall|forest|river|sea)-([1-9]|1[0-9]|20)$/;
// moontr.site = 관리자 허브 (방문 수 잔디를 여기서 읽어 가요)
const ORIGINS = ['https://campingjang.site', 'https://www.campingjang.site', 'https://vaca-at.github.io', 'https://moontr.site', 'http://127.0.0.1:8765', 'http://localhost:8765'];

function cors(req) {
  const o = req.headers.get('Origin');
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Vary': 'Origin' };
}
const json = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req) } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const origin = req.headers.get('Origin');
      if (origin && !ORIGINS.includes(origin)) return new Response('forbidden', { status: 403 });
      const room = url.searchParams.get('room') || '';
      if (!ROOM_RE.test(room)) return new Response('bad room', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors(req), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Credentials': 'false', 'Access-Control-Max-Age': '86400' } });
    }
    // 방문: 기기마다 하루 한 번 숫자만 센다 (누가 왔는지는 남기지 않음)
    if (url.pathname === '/visit' && req.method === 'POST') {
      await env.STATS.get(env.STATS.idFromName('stats')).fetch('https://stats/visit', { method: 'POST' });
      return json(req, { ok: true });
    }
    // 관리자 로그인: 비밀번호가 맞으면 30일짜리 입장권을 준다 (기기에는 비밀번호 대신 입장권만 남는다)
    if (url.pathname === '/admin/login' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (!env.ADMIN_PASSWORD || !(await same(String(body.password || '').trim(), env.ADMIN_PASSWORD.trim()))) return json(req, { error: 'unauthorized' }, 401);
      const exp = Date.now() + 30 * 24 * 3600 * 1000;
      return json(req, { token: `${exp}.${await sign(String(exp), env.ADMIN_PASSWORD.trim())}`, exp });
    }
    // 관리자 허브(moontr.site)가 읽는 방문 숫자: 날짜별 방문 · 시간대 · 입장 · 머문 시간 · 동시접속 최고 · 지금 인원
    // 모두 '몇 번 · 몇 명' 숫자뿐이라 로그인 없이 내줘요 (누가 왔는지 · 연등 글 · 신고는 들어 있지 않아요)
    if (url.pathname === '/public/visits') {
      const s = await env.STATS.get(env.STATS.idFromName('stats')).fetch('https://stats/read').then((r) => r.json());
      const rooms = await Promise.all(Array.from({ length: SERVERS }, (_, i) => env.ROOMS.get(env.ROOMS.idFromName(`hall-${i + 1}`)).fetch('https://room/live').then((r) => r.json()).then((j) => j.n || 0).catch(() => 0)));
      const online = rooms.reduce((a, b) => a + b, 0);
      return json(req, { total: s.total || 0, today: s.today || 0, days: s.days || {}, hours: s.hours || {}, joins: s.joins || {}, staySec: s.staySec || {}, stayN: s.stayN || {},
        peaks: s.peaks || {}, best: s.best || { n: 0 }, wishDays: s.wishDays || {}, wishTotal: s.wishTotal || 0, online, rooms });
    }
    // 관리자 구글 로그인: Firebase 가 준 구글 로그인 증표(ID 토큰)를 검사해서, 허락된 이메일이면 30일 입장권을 준다
    if (url.pathname === '/admin/google' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const who = await verifyFirebase(String(body.idToken || ''));
      const allowed = (env.ADMIN_EMAILS || ADMIN_EMAILS).split(',').map((s) => s.trim().toLowerCase());
      if (!who || !env.ADMIN_PASSWORD) return json(req, { error: 'unauthorized' }, 401);
      if (!allowed.includes(who.email)) return json(req, { error: 'not admin', email: who.email }, 403);
      const exp = Date.now() + 30 * 24 * 3600 * 1000;
      return json(req, { token: `${exp}.${await sign(String(exp), env.ADMIN_PASSWORD.trim())}`, exp, email: who.email });
    }
    // 관리자: 입장권(또는 비밀번호)이 맞을 때만 방문 수와 접속 인원을 보여 준다
    if (url.pathname === '/admin/stats') {
      const auth = (req.headers.get('Authorization') || '').replace(/^Bearer /, '').trim();
      if (!env.ADMIN_PASSWORD || !(await adminOk(auth, env.ADMIN_PASSWORD.trim()))) return json(req, { error: 'unauthorized' }, 401);
      const stats = await env.STATS.get(env.STATS.idFromName('stats')).fetch('https://stats/read').then((r) => r.json());
      const rooms = {}, live = { scenes: {}, acts: {}, pets: {}, types: {}, designs: {}, bodies: {} };
      await Promise.all(Array.from({ length: SERVERS }, (_, i) => `hall-${i + 1}`).map((k) =>
        env.ROOMS.get(env.ROOMS.idFromName(k)).fetch('https://room/live').then((r) => r.json()).then((j) => {
          if (!j.n) return;
          rooms[k] = j.n;
          for (const g of Object.keys(live)) for (const [x, n] of Object.entries(j[g] || {})) live[g][x] = (live[g][x] || 0) + n;
        }).catch(() => {})));
      return json(req, { ...stats, rooms, live, online: Object.values(rooms).reduce((a, b) => a + b, 0) });
    }
    // 관리자: 연등 하나 내리기 (모든 서버의 법당에서 바로 사라져요)
    if (url.pathname === '/admin/wish-delete' && req.method === 'POST') {
      const auth = (req.headers.get('Authorization') || '').replace(/^Bearer /, '').trim();
      if (!env.ADMIN_PASSWORD || !(await adminOk(auth, env.ADMIN_PASSWORD.trim()))) return json(req, { error: 'unauthorized' }, 401);
      const { id } = await req.json().catch(() => ({}));
      await env.STATS.get(env.STATS.idFromName('stats')).fetch('https://stats/wish/delete', { method: 'POST', body: JSON.stringify({ id: String(id || '') }) });
      const body = JSON.stringify({ id: String(id || '') });
      await Promise.all(Array.from({ length: SERVERS }, (_, i) => env.ROOMS.get(env.ROOMS.idFromName(`hall-${i + 1}`)).fetch('https://room/unwish', { method: 'POST', body }).catch(() => {})));
      return json(req, { ok: true });
    }
    // 신고 보내기: 누구나. 글 1000자, 사진 1장(약 1.3MB까지)
    if (url.pathname === '/report' && req.method === 'POST') {
      const origin = req.headers.get('Origin');
      if (origin && !ORIGINS.includes(origin)) return json(req, { error: 'forbidden' }, 403);
      const body = await req.json().catch(() => null);
      if (!body) return json(req, { error: 'bad' }, 400);
      const text = clean(body.text, 1000).trim();
      const img = typeof body.img === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(body.img) && body.img.length < 1_400_000 ? body.img : null;
      if (!text && !img) return json(req, { error: 'empty' }, 400);
      const c = body.ctx || {};
      const ctx = { server: clean(c.server, 8), scene: clean(c.scene, 12), design: clean(c.design, 20), reporter: clean(c.reporter, 12), people: Array.isArray(c.people) ? c.people.slice(0, 30).map((n) => clean(n, 12)) : [], ua: clean(req.headers.get('User-Agent'), 160) };
      const ip = req.headers.get('CF-Connecting-IP') || '';
      const who = (await sign(ip, env.ADMIN_PASSWORD || 'salt')).slice(0, 16);
      const r = await env.STATS.get(env.STATS.idFromName('stats')).fetch('https://stats/report/add', { method: 'POST', body: JSON.stringify({ text, img, ctx, who }) });
      if (r.status === 429) return json(req, { error: 'too many' }, 429);
      return json(req, { ok: true });
    }
    // 관리자: 신고 목록 보기·지우기
    if (url.pathname === '/admin/reports' || url.pathname === '/admin/report-delete') {
      const auth = (req.headers.get('Authorization') || '').replace(/^Bearer /, '').trim();
      if (!env.ADMIN_PASSWORD || !(await adminOk(auth, env.ADMIN_PASSWORD.trim()))) return json(req, { error: 'unauthorized' }, 401);
      const stub = env.STATS.get(env.STATS.idFromName('stats'));
      if (url.pathname === '/admin/reports') return json(req, await stub.fetch('https://stats/report/list').then((r) => r.json()));
      const { id } = await req.json().catch(() => ({}));
      await stub.fetch('https://stats/report/delete', { method: 'POST', body: JSON.stringify({ id: String(id || '') }) });
      return json(req, { ok: true });
    }
    if (url.pathname === '/counts') {
      const loc = url.searchParams.get('loc') || '';
      const n = Math.min(20, Math.max(1, +url.searchParams.get('n') || 12));
      if (!/^(hall|forest|river|sea)$/.test(loc)) return json(req, { error: 'bad loc' }, 400);
      const counts = await Promise.all(Array.from({ length: n }, (_, i) =>
        env.ROOMS.get(env.ROOMS.idFromName(`${loc}-${i + 1}`)).fetch('https://room/count').then((r) => r.json()).then((j) => j.n).catch(() => 0)));
      return json(req, { counts });
    }
    return json(req, { ok: true, name: 'templestay-rooms' });
  },
};

const clean = (s, n) => String(s ?? '').slice(0, n);

// 비밀번호 비교: 해시끼리 비교해서 글자 수나 앞부분으로 알아낼 수 없게
async function same(a, b) {
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// 입장권 서명: 비밀번호를 열쇠로 한 HMAC. 비밀번호를 바꾸면 예전 입장권은 모두 무효가 된다
async function sign(msg, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function adminOk(auth, secret) {
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(auth);
  if (m) return +m[1] > Date.now() && (await same(m[2], await sign(m[1], secret)));
  return same(auth, secret); // 예전처럼 비밀번호를 바로 보내도 된다
}

// ───────── 구글(Firebase) 로그인 검사 ─────────
const FIREBASE_PROJECT = 'moon-d528d';
const ADMIN_EMAILS = 'bellachord@gmail.com'; // 관리자로 들어올 수 있는 구글 계정 (쉼표로 여러 개)
let googleKeys = { at: 0, keys: [] };
async function firebaseKeys() {
  if (Date.now() - googleKeys.at < 3600e3 && googleKeys.keys.length) return googleKeys.keys;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  googleKeys = { at: Date.now(), keys: (await r.json()).keys || [] };
  return googleKeys.keys;
}
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
// 서명(구글 공개 열쇠), 발급처, 대상 프로젝트, 만료, 이메일 확인 여부를 모두 본다. 맞으면 { email }
async function verifyFirebase(token) {
  try {
    const [h, p, sgn] = token.split('.');
    if (!sgn) return null;
    const head = JSON.parse(new TextDecoder().decode(b64u(h)));
    const pay = JSON.parse(new TextDecoder().decode(b64u(p)));
    if (head.alg !== 'RS256') return null;
    const jwk = (await firebaseKeys()).find((k) => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(sgn), new TextEncoder().encode(`${h}.${p}`));
    const now = Date.now() / 1000;
    if (!ok || pay.aud !== FIREBASE_PROJECT || pay.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT}`) return null;
    if (!(pay.exp > now) || !(pay.iat <= now + 60) || !pay.sub || !pay.email || pay.email_verified !== true) return null;
    return { email: String(pay.email).toLowerCase() };
  } catch { return null; }
}

// 한국 시간 기준 날짜
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 방문 수 저장소 (하나뿐)
export class Stats extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    // 신고: 한 건씩 'r:<시각>' 열쇠로 저장, 최근 200건만
    if (url.pathname === '/report/add') {
      const r = await req.json();
      // 같은 사람(접속 주소를 알아볼 수 없게 바꾼 값)은 한 시간에 5건까지
      const rl = (await this.ctx.storage.get(`rl:${r.who}`)) || [];
      const recent = rl.filter((t) => Date.now() - t < 3600e3);
      if (recent.length >= 5) return Response.json({ error: 'too many' }, { status: 429 });
      await this.ctx.storage.put(`rl:${r.who}`, [...recent, Date.now()]);
      const id = `r:${String(Date.now()).padStart(15, '0')}`;
      await this.ctx.storage.put(id, { ...r, id, at: Date.now() });
      const all = await this.ctx.storage.list({ prefix: 'r:', reverse: true });
      const old = [...all.keys()].slice(200);
      if (old.length) await this.ctx.storage.delete(old);
      return Response.json({ ok: true });
    }
    // 연등: 모든 서버가 함께 보는 목록, 최근 60개. 여러 개를 한 번에 받기도 한다 (예전 방별 연등 옮기기)
    if (url.pathname === '/wish/add') {
      const add = [].concat(await req.json());
      const list = (await this.ctx.storage.get('wishes')) || [];
      const fresh = add.filter((w) => w?.id && !list.some((x) => x.id === w.id)).map((w) => ({ at: Date.now(), ...w }));
      if (fresh.length) {
        await this.ctx.storage.put('wishes', [...list, ...fresh].slice(-60));
        // 날짜별 연등 수 (예전 연등을 한꺼번에 옮길 때는 세지 않음)
        if (add.length === 1) { await this.bump('wishDays', kstDay(), 1); await this.ctx.storage.put('wishTotal', ((await this.ctx.storage.get('wishTotal')) || 0) + 1); }
      }
      return Response.json({ added: fresh.map((w) => w.id) });
    }
    // 숫자 세기: 날짜별 입장 수 · 머문 시간, 누적 순위(캐릭터 · 친구 · 옷 · 장신구 · 디자인 · 동작)
    if (url.pathname === '/tally') {
      const b = await req.json(), d = kstDay();
      if (b.join) await this.bump('joins', d, 1);
      if (b.stay > 0 && b.stay < 86400) { await this.bump('staySec', d, Math.round(b.stay)); await this.bump('stayN', d, 1); }
      if (b.picks) {
        const t = (await this.ctx.storage.get('tally')) || {};
        for (const [g, k] of Object.entries(b.picks)) if (k) { t[g] = t[g] || {}; t[g][k] = (t[g][k] || 0) + 1; }
        await this.ctx.storage.put('tally', t);
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === '/wish/delete') {
      const { id } = await req.json();
      const list = (await this.ctx.storage.get('wishes')) || [];
      await this.ctx.storage.put('wishes', list.filter((w) => w.id !== id));
      return Response.json({ ok: true });
    }
    // 동시접속 최고 기록: 방마다 인원이 바뀔 때 알려 오면 모두 더해서 오늘 최고 · 역대 최고를 남긴다
    if (url.pathname === '/peak') {
      const { room, n } = await req.json();
      const live = (await this.ctx.storage.get('live')) || {};
      if (n) live[room] = n; else delete live[room];
      await this.ctx.storage.put('live', live);
      const sum = Object.values(live).reduce((a, b) => a + b, 0), d = kstDay();
      const peaks = (await this.ctx.storage.get('peaks')) || {};
      if (sum > (peaks[d]?.n || 0)) {
        peaks[d] = { n: sum, at: Date.now() };
        for (const k of Object.keys(peaks).sort().slice(0, -90)) delete peaks[k];
        await this.ctx.storage.put('peaks', peaks);
      }
      const best = (await this.ctx.storage.get('best')) || { n: 0 };
      if (sum > best.n) await this.ctx.storage.put('best', { n: sum, at: Date.now() });
      return Response.json({ ok: true });
    }
    if (url.pathname === '/wish/list') return Response.json({ wishes: (await this.ctx.storage.get('wishes')) || [] });
    if (url.pathname === '/report/list') {
      const all = await this.ctx.storage.list({ prefix: 'r:', reverse: true, limit: 100 });
      return Response.json({ reports: [...all.values()].map(({ who, ...x }) => x) });
    }
    if (url.pathname === '/report/delete') {
      const { id } = await req.json();
      if (/^r:\d{15}$/.test(id)) await this.ctx.storage.delete(id);
      return Response.json({ ok: true });
    }
    const s = (await this.ctx.storage.get('s')) || { total: 0, days: {} };
    if (url.pathname === '/visit') {
      const d = kstDay();
      s.total++;
      s.days[d] = (s.days[d] || 0) + 1;
      // 최근 90일만 남긴다
      const keys = Object.keys(s.days).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete s.days[k];
      await this.ctx.storage.put('s', s);
      // 시간대별 방문 (한국 시각 0~23시, 날짜마다 24칸)
      const hours = (await this.ctx.storage.get('hours')) || {};
      (hours[d] = hours[d] || Array(24).fill(0))[new Date(Date.now() + 9 * 3600e3).getUTCHours()]++;
      for (const k of Object.keys(hours).sort().slice(0, -30)) delete hours[k];
      await this.ctx.storage.put('hours', hours);
      return Response.json({ ok: true });
    }
    const K = ['hours', 'wishDays', 'peaks', 'best', 'wishes', 'wishTotal', 'joins', 'staySec', 'stayN', 'tally'];
    const v = Object.fromEntries((await Promise.all(K.map((k) => this.ctx.storage.get(k)))).map((x, i) => [K[i], x]));
    return Response.json({ total: s.total, today: s.days[kstDay()] || 0, days: s.days, hours: v.hours || {}, wishDays: v.wishDays || {}, peaks: v.peaks || {}, best: v.best || { n: 0 }, wishes: v.wishes || [],
      wishTotal: v.wishTotal || 0, joins: v.joins || {}, staySec: v.staySec || {}, stayN: v.stayN || {}, tally: v.tally || {} });
  }

  // 날짜별 숫자 하나 올리기 (최근 90일만)
  async bump(key, day, by) {
    const m = (await this.ctx.storage.get(key)) || {};
    m[day] = (m[day] || 0) + by;
    for (const k of Object.keys(m).sort().slice(0, -90)) delete m[k];
    await this.ctx.storage.put(key, m);
  }
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // 'ping' 에는 깨어나지 않고 바로 'pong' 으로 답한다 (잠든 방 비용 절약)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // 캐릭터가 있는(상태를 보낸) 사람만 센다
  members() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() })).filter((m) => m.a?.st && !m.a.quiet);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/count') return Response.json({ n: this.members().length });
    // 관리자 현황판: 지금 어디서(법당·마당…) 무엇을(합장·108배…) 하는지, 어떤 친구·캐릭터인지 숫자만
    if (url.pathname === '/live') {
      const out = { n: 0, scenes: {}, acts: {}, pets: {}, types: {}, designs: {}, bodies: {} };
      const add = (g, k) => { if (k) out[g][k] = (out[g][k] || 0) + 1; };
      for (const { a } of this.members()) {
        out.n++;
        add('scenes', clean(a.st.s, 12)); add('acts', clean(a.st.a, 12));
        add('pets', a.st.l?.pet && a.st.l.pet !== 'none' ? clean(a.st.l.pet, 16) : '');
        add('types', clean(a.st.l?.type, 16)); add('designs', clean(a.st.d, 12)); add('bodies', clean(a.st.l?.body || 'base', 12));
      }
      return Response.json(out);
    }
    // 관리자가 내린 연등을 이 방 사람들 화면에서도 내린다
    if (url.pathname === '/unwish') { this.broadcast({ t: 'unwish', d: await req.json() }); return Response.json({ ok: true }); }
    // 다른 서버에서 올라온 연등을 이 방 사람들에게
    if (url.pathname === '/push') { this.broadcast({ t: 'wish', id: 'relay', d: await req.json() }); return Response.json({ ok: true }); }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    if (this.members().length >= CAP) {
      server.send(JSON.stringify({ t: 'full' }));
      server.close(4001, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    // 같은 탭(k)이 30초 안에 다시 붙으면 예전 번호와 모습을 그대로 이어 받는다
    const k = clean(url.searchParams.get('k'), 24);
    let id = crypto.randomUUID().slice(0, 8), st = null, lw = 0, t0 = Date.now();
    if (k) {
      const back = await this.ctx.storage.get(`gone:${k}`);
      if (back) { ({ id, st, lw } = back); t0 = back.t0 || t0; await this.ctx.storage.delete(`gone:${k}`); }
      // 서버가 아직 못 알아챈 예전 연결이 남아 있으면 조용히 닫는다
      for (const m of this.ctx.getWebSockets()) {
        const x = m.deserializeAttachment();
        if (m === server || x?.k !== k) continue;
        if (!back) ({ id, st, lw = 0 } = x), t0 = x.t0 || t0;
        m.serializeAttachment({ ...x, quiet: true });
        try { m.close(4000, 'replaced'); } catch {}
      }
    }
    server.serializeAttachment({ id, k, st, n: 0, w: Date.now(), room: url.searchParams.get('room') || '', lw, t0 });
    if (st) this.reportPeak(url.searchParams.get('room') || '', this.members().length);   // 30초 안에 돌아온 분
    const gone = await this.ctx.storage.list({ prefix: 'gone:' });
    const peers = [...this.members().filter((m) => m.ws !== server && !m.a.quiet), ...[...gone.values()].map((g) => ({ a: g }))].map((m) => ({ id: m.a.id, st: m.a.st }));
    const stats = this.env.STATS.get(this.env.STATS.idFromName('stats'));
    // 예전에 방마다 따로 남긴 연등은 글을 빼고 공용 목록으로 옮긴다 (한 번만)
    const legacy = await this.ctx.storage.get('wishes');
    if (legacy) {
      await stats.fetch('https://stats/wish/add', { method: 'POST', body: JSON.stringify(legacy.map(({ t, ...w }) => w)) });
      await this.ctx.storage.delete('wishes');
    }
    const { wishes } = await stats.fetch('https://stats/wish/list').then((r) => r.json());
    server.send(JSON.stringify({ t: 'hello', id, peers, wishes }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 3000) return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    // 1초에 15개 넘게 보내면 버린다
    const now = Date.now();
    if (now - a.w > 1000) { a.w = now; a.n = 0; }
    if (++a.n > 15) { ws.serializeAttachment(a); return; }
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (m.t === 'st' && m.d && typeof m.d === 'object') {
      const first = !a.st;
      a.st = m.d;
      if (first) {
        this.reportPeak(a.room, this.members().length + (this.members().some((x) => x.ws === ws) ? 0 : 1));
        // 들어올 때 고른 모습을 센다 (누가 골랐는지는 남기지 않고 숫자만)
        const l = m.d.l || {};
        this.tally({ join: 1, picks: { type: `${clean(l.type, 16)}:${l.gender === 'm' ? 'm' : 'f'}`, pet: clean(l.pet || 'none', 16), outfit: clean(l.outfit || 'own', 16), acc: clean(l.acc || 'none', 16), design: clean(m.d.d, 12), body: clean(l.body || 'base', 12) } });
      }
      ws.serializeAttachment(a);
      this.broadcast({ t: 'st', id: a.id, d: m.d }, ws);
    } else if (m.t === 'act' && m.d) {
      ws.serializeAttachment(a);
      this.broadcast({ t: 'act', id: a.id, d: { a: clean(m.d.a, 16), on: m.d.on !== false } }, ws);
      if (m.d.on !== false && m.d.a !== 'jump') this.tally({ picks: { act: clean(m.d.a, 16) } });
    } else if (m.t === 'wish' && m.d) {
      if (now - (a.lw || 0) < WISH_GAP) { ws.serializeAttachment(a); return; }
      a.lw = now;
      ws.serializeAttachment(a);
      // 소원 글은 비공개라 받지도 저장하지도 않는다 (예전 버전이 보내도 버림)
      const w = { id: clean(m.d.id, 40), n: clean(m.d.n, 12), c: clean(m.d.c, 9), v: Math.max(0, Math.min(100000, m.d.v | 0)) };
      if (!w.id) return;
      const stats = this.env.STATS.get(this.env.STATS.idFromName('stats'));
      const { added } = await stats.fetch('https://stats/wish/add', { method: 'POST', body: JSON.stringify(w) }).then((r) => r.json());
      if (!added.length) return;
      this.broadcast({ t: 'wish', id: a.id, d: w }, ws);
      // 다른 큰법당 서버에도 바로 걸리게
      const body = JSON.stringify(w);
      await Promise.all(Array.from({ length: SERVERS }, (_, i) => `hall-${i + 1}`).filter((r) => r !== a.room).map((r) =>
        this.env.ROOMS.get(this.env.ROOMS.idFromName(r)).fetch('https://room/push', { method: 'POST', body }).catch(() => {})));
    }
  }

  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {}
    if (!a?.st || a.quiet) return;
    this.reportPeak(a.room, this.members().filter((m) => m.ws !== ws).length);
    // 바로 '나섰어요' 하지 않고 30초 기다린다. 그 안에 같은 탭이 다시 붙으면 없던 일
    if (a.k) {
      await this.ctx.storage.put(`gone:${a.k}`, { id: a.id, st: a.st, lw: a.lw || 0, t0: a.t0, at: Date.now() });
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + GRACE);
      return;
    }
    this.broadcast({ t: 'leave', id: a.id }, ws);
    if (a.t0) this.tally({ stay: (Date.now() - a.t0) / 1000 });
  }

  // 숫자 세기 저장소(Stats)에 보내기: join(입장 1) · stay(머문 초) · picks({무리: 이름})
  tally(body) {
    this.ctx.waitUntil?.(this.env.STATS.get(this.env.STATS.idFromName('stats')).fetch('https://stats/tally', { method: 'POST', body: JSON.stringify(body) }).catch(() => {}));
  }

  // 인원이 바뀌면 동시접속 최고 기록 저장소(Stats)에 알린다
  reportPeak(room, n) {
    if (!room) return;
    this.ctx.waitUntil?.(this.env.STATS.get(this.env.STATS.idFromName('stats')).fetch('https://stats/peak', { method: 'POST', body: JSON.stringify({ room, n }) }).catch(() => {}));
  }

  // 30초 지나도 돌아오지 않은 분만 '나섰어요'
  async alarm() {
    const gone = await this.ctx.storage.list({ prefix: 'gone:' });
    let next = Infinity;
    for (const [key, g] of gone) {
      if (Date.now() - g.at >= GRACE) {
        this.broadcast({ t: 'leave', id: g.id }); await this.ctx.storage.delete(key);
        if (g.t0) this.tally({ stay: (g.at - g.t0) / 1000 });   // 끊긴 때까지 머문 시간
      }
      else next = Math.min(next, g.at + GRACE);
    }
    if (next !== Infinity) await this.ctx.storage.setAlarm(next);
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(s); } catch {} }
  }
}
