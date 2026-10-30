// 실시간 접속. 두 가지 방식을 같은 모양으로 감싼다.
// 1) 방 중계 서버(Cloudflare Durable Objects): RELAY_URL 이 있고 응답하면 이걸 쓴다. 방마다 100명까지 안정적.
// 2) 브라우저끼리 직접 연결(Trystero, WebRTC): 중계 서버가 없을 때. 한 방 30명 안팎까지.
import { APP_ID, RELAY_URL, SERVER_COUNT } from './data.js';

// 이 탭의 열쇠: 잠깐 끊겼다 다시 붙어도(다른 창에 다녀오기, 새로고침) 서버가 같은 사람으로 알아보게
const TAB_KEY = (() => {
  try {
    let k = sessionStorage.getItem('maeum:tab');
    if (!k) { k = crypto.randomUUID().slice(0, 12); sessionStorage.setItem('maeum:tab', k); }
    return k;
  } catch { return crypto.randomUUID().slice(0, 12); }
})();

let trystero = null;
async function lib() {
  if (!trystero) trystero = await import('https://esm.sh/trystero@0.21.8/nostr');
  return trystero;
}

// 첫 화면에서 미리 불러 두면 입장할 때 기다리는 시간이 줄어든다
export const preloadNet = () => (RELAY_URL ? Promise.resolve() : lib().catch(() => {}));

export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.mode = null; // 'relay' | 'p2p' | null(혼자)
    this.online = false;
    this.lobby = null;
    this.room = null;
    this.ws = null;
    this.lobbyPeers = new Map(); // p2p: peerId -> { s, c }
    this.relayCounts = {};
    this.me = { s: 0, c: false };
    this.lastState = null;
    this.selfId = null;
  }

  async joinLobby(locId, hasChar) {
    await this.leaveAll();
    this.locId = locId;
    this.me = { s: 0, c: hasChar };
    if (RELAY_URL) {
      try {
        const r = await fetch(`${RELAY_URL}/counts?loc=${locId}&n=${SERVER_COUNT}`, { signal: AbortSignal.timeout(5000) });
        const j = await r.json();
        this.relayCounts = Object.fromEntries(j.counts.map((c, i) => [i + 1, c]));
        this.mode = 'relay';
        this.online = true;
        return;
      } catch (e) {
        console.warn('방 중계 서버에 닿지 않아 직접 연결로 바꿔요', e);
      }
    }
    try {
      const T = await lib();
      this.selfId = T.selfId;
      this.lobby = T.joinRoom({ appId: APP_ID }, `lobby-${locId}`);
      const [sendSrv, getSrv] = this.lobby.makeAction('srv');
      this.sendSrv = sendSrv;
      getSrv((d, peer) => { this.lobbyPeers.set(peer, d); this.h.onCounts?.(); });
      this.lobby.onPeerJoin((peer) => sendSrv(this.me, peer));
      this.lobby.onPeerLeave((peer) => { this.lobbyPeers.delete(peer); this.h.onCounts?.(); });
      this.mode = 'p2p';
      this.online = true;
    } catch (e) {
      console.warn('실시간 연결을 시작하지 못했어요', e);
      this.mode = null;
      this.online = false;
    }
  }

  async refreshCounts() {
    if (this.mode !== 'relay') return;
    try {
      const r = await fetch(`${RELAY_URL}/counts?loc=${this.locId}&n=${SERVER_COUNT}`, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      this.relayCounts = Object.fromEntries(j.counts.map((c, i) => [i + 1, c]));
      this.h.onCounts?.();
    } catch {}
  }

  // 서버 번호별 캐릭터 인원
  counts() {
    if (this.mode === 'relay') {
      const c = { ...this.relayCounts };
      // 내가 있는 방은 서버 숫자를 기다리지 않고 지금 보이는 사람으로 센다
      if (this.me.s) c[this.me.s] = (this.h.peerCount?.() || 0) + (this.me.c ? 1 : 0);
      return c;
    }
    const c = {};
    for (const v of this.lobbyPeers.values()) if (v.c && v.s) c[v.s] = (c[v.s] || 0) + 1;
    if (this.me.c && this.me.s) c[this.me.s] = (c[this.me.s] || 0) + 1;
    return c;
  }

  setHasChar(on) {
    this.me.c = on;
    this.sendSrv?.(this.me);
  }

  async joinServer(n) {
    await this.leaveRoom();
    this.me.s = n;
    this.sendSrv?.(this.me);
    this.h.onCounts?.();
    if (this.mode === 'relay') return this.openSocket(n);
    if (this.mode !== 'p2p') return;
    const T = await lib();
    const room = T.joinRoom({ appId: APP_ID }, `${this.locId}-${n}`);
    this.room = room;
    const [sendSt, getSt] = room.makeAction('st');
    const [sendAct, getAct] = room.makeAction('act');
    const [sendWish, getWish] = room.makeAction('wish');
    const [sendLan, getLan] = room.makeAction('lan');
    this._st = sendSt; this._act = sendAct; this._wish = sendWish;
    getSt((d, peer) => this.h.onState?.(peer, d));
    getAct((d, peer) => this.h.onAct?.(peer, d));
    getWish((d, peer) => this.h.onWish?.(peer, d, false));
    getLan((list, peer) => list.forEach((w) => this.h.onWish?.(peer, w, true)));
    room.onPeerJoin((peer) => {
      if (this.lastState) sendSt(this.lastState, peer);
      const wishes = this.h.getWishes?.() || [];
      if (wishes.length) sendLan(wishes.slice(-40), peer);
    });
    room.onPeerLeave((peer) => this.h.onLeave?.(peer));
  }

  // 중계 서버 방에 웹소켓으로 들어간다. 끊기면 2초, 4초 … 뒤 다시 붙고, 화면이 가려져 끊겼으면 돌아오자마자 붙는다.
  // 서버는 끊긴 뒤 30초 동안 자리를 남겨 두므로, 그 안에 붙으면 다른 분 화면에서는 나간 적 없는 것처럼 보인다
  openSocket(n, attempt = 0) {
    const url = `${RELAY_URL.replace(/^http/, 'ws')}/ws?room=${this.locId}-${n}&k=${TAB_KEY}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
    this._st = (d) => send({ t: 'st', d });
    this._act = (d) => send({ t: 'act', d });
    this._wish = (d) => send({ t: 'wish', d });
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'hello') {
        this.selfId = m.id;
        this.h.onKeep?.(m.peers.map((p) => p.id));
        m.peers.forEach((p) => this.h.onState?.(p.id, p.st));
        m.wishes.forEach((w) => this.h.onWish?.('relay', w, true));
      } else if (m.t === 'st') this.h.onState?.(m.id, m.d);
      else if (m.t === 'act') this.h.onAct?.(m.id, m.d);
      else if (m.t === 'wish') this.h.onWish?.(m.id, m.d, false);
      else if (m.t === 'unwish') this.h.onUnwish?.(m.d?.id);
      else if (m.t === 'leave') this.h.onLeave?.(m.id);
      else if (m.t === 'full') { ws.onclose = null; ws.close(); this.h.onFull?.(n); }
    };
    ws.onopen = () => { attempt = 0; if (this.lastState) send({ t: 'st', d: this.lastState }); };
    // 끊겨도 다른 분들을 바로 지우지 않는다: 다시 붙으면 hello 에서 정리하고, 끝내 못 붙으면 40초 뒤 저절로 사라진다
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const again = () => { if (this.ws === ws) this.openSocket(n, attempt + 1); };
      if (document.hidden) {
        const back = () => { if (document.hidden) return; removeEventListener('visibilitychange', back); again(); };
        addEventListener('visibilitychange', back);
      } else setTimeout(again, Math.min(15000, 2000 * 2 ** attempt));
    };
    // 웹소켓을 살려 두는 신호
    clearInterval(this.pinger);
    this.pinger = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25000);
  }

  sendState(s) { this.lastState = s; this._st?.(s); }
  sendAct(a) { this._act?.(a); }
  sendWish(w) { this._wish?.(w); }

  async leaveRoom() {
    if (this.ws) { const ws = this.ws; this.ws = null; ws.onclose = null; try { ws.close(); } catch {} }
    clearInterval(this.pinger);
    if (this.room) { try { await this.room.leave(); } catch {} this.room = null; }
    this._st = this._act = this._wish = null;
    this.h.onReset?.();
  }

  async leaveAll() {
    await this.leaveRoom();
    try { await this.lobby?.leave(); } catch {}
    this.lobby = null;
    this.sendSrv = null;
    this.lobbyPeers.clear();
  }
}
