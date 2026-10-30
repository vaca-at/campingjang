// 소리는 녹음 파일 없이 Web Audio로 합성한다: 목탁, 싱잉볼(풍경), 동전, 바람, 법당 음악 (실제 녹음 다섯 곡은 assets/audio)
let ctx = null, master = null, ambient = null;
export const sound = { on: false };

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.4;   // 전체 소리는 은은하게
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setSound(on) {
  sound.on = on;
  if (on) { ensure(); startAmbient(); } else stopAmbient();
  setMusic(musicId);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.005, at = 0 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export function moktak(vol = 1) {
  if (!sound.on) return;
  ensure();
  tone(520, 0.18, { gain: 0.5 * vol, attack: 0.002 });
  tone(1040, 0.08, { gain: 0.15 * vol, attack: 0.001 });
  tone(260, 0.12, { type: 'triangle', gain: 0.2 * vol, attack: 0.002 });
}

export function bowl(vol = 1) {
  if (!sound.on) return;
  ensure();
  for (const [f, g, d] of [[220, 0.22, 6], [221.5, 0.18, 6], [596, 0.08, 4], [1150, 0.04, 2.5]]) tone(f, d, { gain: g * vol, attack: 0.02 });
}

export function coin() {
  if (!sound.on) return;
  ensure();
  [0, 0.09, 0.2].forEach((at, i) => tone(1800 + i * 300, 0.35, { gain: 0.12, at, type: 'triangle' }));
}

function startAmbient() {
  if (ambient || !ctx) return;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  const g = ctx.createGain(); g.gain.value = 0.07;
  src.connect(f).connect(g).connect(master); src.start();
  ambient = { src, g };
}
function stopAmbient() { try { ambient?.src.stop(); } catch {} ambient = null; }

// ───────── 법당 음악: 실제 녹음 다섯 곡 + 합성 세 곡 ─────────
// 녹음 파일 없이 여기서 합성해요 (저작권 걱정 없는 소리). 가락은 모두 이 사이트에서 새로 지었어요.
// 곡마다 step(st, at, out) 이 한 박을 out 에 예약하고 다음 박까지 남은 초를 돌려줘요.
// src 가 있는 곡은 실제 녹음 파일을 처음 고를 때 한 번 받아서 끝없이 이어 틀어요.
// list 가 있는 곡은 그 녹음들을 차례로 이어 틀어요. 맨 앞 싱잉볼이 기본 곡
export const TRACKS = [
  { id: 'campfire', name: '타닥타닥 모닥불', cap: '모닥불 타는 소리', src: 'assets/audio/campfire.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'night', name: '모닥불 + 풀벌레', cap: '모닥불 · 귀뚜라미 · 시냇물 이어 듣기', list: ['campfire', 'crickets', 'stream'] },
  { id: 'guitar', name: '통기타와 피아노', cap: 'Your story (Hopefulness)', src: 'assets/audio/acoustic-guitar.m4a', by: '(재)전주정보문화산업진흥원 · 공유마당 공공누리 1유형' },
  { id: 'breeze', name: '선선한 가을바람', cap: '잔잔한 연주곡', src: 'assets/audio/autumn-breeze.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'harmonica', name: '하모니카 잼', cap: '하모니카 즉흥 연주', src: 'assets/audio/harmonica.m4a', by: 'Vibratair · Freesound CC0' },
  { id: 'chip', name: '8비트 게임', cap: '레트로 오락실 소리', list: ['chiptune', 'flash'] },
  { id: 'crickets', name: '밤새 우는 귀뚜라미', cap: '풀숲의 밤', src: 'assets/audio/crickets.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'waves', name: '일출 파도 소리', cap: '잔잔한 바닷가', src: 'assets/audio/waves.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'stream', name: '계곡물 소리', cap: '졸졸 흐르는 계곡', src: 'assets/audio/stream.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'rain', name: '텐트 위 빗소리', cap: '텐트 안에서 듣는 비', src: 'assets/audio/tent-rain.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  // 이어 듣기에만 쓰는 곡 (목록에는 안 나와요)
  { id: 'chiptune', name: '8비트 루프', src: 'assets/audio/chiptune.m4a', by: 'josefpres · Freesound CC0', hidden: true },
  { id: 'flash', name: '플래쉬게임', src: 'assets/audio/flash-game.m4a', by: '한국저작권위원회 · 공유마당 CC BY', hidden: true },
];

// 울림 하나: [배수, 세기, 길이] 여러 개를 겹친다
function ring(at, base, parts, gain, out, attack = 0.004) {
  const c = out.context;
  for (const [m, g, d] of parts) {
    const o = c.createOscillator(), e = c.createGain();
    o.frequency.value = base * m;
    e.gain.setValueAtTime(0, at);
    e.gain.linearRampToValueAtTime(g * gain, at + attack);
    e.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(e).connect(out);
    o.start(at); o.stop(at + d + 0.05);
  }
}


function noiseBuf(c, sec) {
  const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3; }
  return b;
}

// 범종 울림. 1과 1.004 가 겹쳐 '맥놀이'로 웅웅 울려요
const JONG = [[0.5, 0.5, 26], [1, 0.45, 20], [1.004, 0.4, 20], [1.19, 0.18, 12], [1.51, 0.14, 9], [2, 0.16, 8], [2.52, 0.08, 6], [2.68, 0.06, 5], [3.01, 0.05, 4]];

const STEPS = {
  jong(st, at, out) {
    // 처음 한 번은 바로, 그다음부터 14초마다
    ring(at, 128, JONG, 0.7, out, 0.01);
    return 14;
  },
  bowl(st, at, out) {
    const base = [196, 220, 261.6, 293.7][Math.floor(Math.random() * 4)];
    ring(at, base, [[1, 0.3, 9], [1.008, 0.25, 9], [2.71, 0.08, 5], [5.1, 0.03, 2.5], [0.5, 0.1, 7]], 1.3, out, 0.03);
    return 7 + Math.random() * 4;
  },
  wind(st, at, out) {
    if (!st.wind) {
      const c = out.context, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      const lfo = c.createOscillator(), lg = c.createGain();
      src.buffer = noiseBuf(c, 4); src.loop = true;
      f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
      g.gain.value = 0.4; lfo.frequency.value = 0.07; lg.gain.value = 0.25;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(out);
      src.start(at); lfo.start(at);
      st.wind = [src, lfo];
    }
    // 풍경: 한 번에 1~3번 땡그랑
    const n = 1 + Math.floor(Math.random() * 3), base = 1500 * (0.97 + Math.random() * 0.06);
    for (let k = 0; k < n; k++) ring(at + k * (0.18 + Math.random() * 0.25), base, [[1, 0.2, 2.6], [2.76, 0.06, 1.2], [5.4, 0.02, 0.6]], 1.5 - k * 0.35, out, 0.002);
    return 3 + Math.random() * 5;
  },
};

// 모든 곡에 같이 거는 법당 잔향
function reverb(c) {
  const len = c.sampleRate * 3, b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  const cv = c.createConvolver(); cv.buffer = b;
  return cv;
}

// 곡 하나를 out 에 틀고, 멈추는 함수를 돌려준다. 0.6초 앞까지 미리 예약해 두고 0.1초마다 채운다
export function playTrack(id, out, { from = out.context.currentTime + 0.1, until = Infinity } = {}) {
  const c = out.context, step = STEPS[id], st = {};
  const bus = c.createGain(), wet = c.createGain(), cv = reverb(c);
  bus.gain.value = 1; wet.gain.value = 0.35;
  bus.connect(out); bus.connect(cv).connect(wet).connect(out);
  let next = from;
  const fill = (to) => { while (next < Math.min(to, until)) next += step(st, next, bus); };
  if (until !== Infinity) { fill(until); return () => {}; }   // 미리 듣기용 (한 번에 다 예약)
  fill(c.currentTime + 0.6);
  const timer = setInterval(() => fill(c.currentTime + 0.6), 100);
  return () => {
    clearInterval(timer);
    const t = c.currentTime;
    bus.gain.setTargetAtTime(0, t, 0.3); wet.gain.setTargetAtTime(0, t, 0.3);
    setTimeout(() => { st.wind?.forEach((n) => { try { n.stop(); } catch {} }); bus.disconnect(); wet.disconnect(); }, 2000);
  };
}

// 녹음 파일: 받아서 푼 소리를 기억해 두고, 다 받기 전에 다른 곡을 고르면 틀지 않아요
const recorded = new Map();
function loadRecording(src) {
  if (!recorded.has(src)) recorded.set(src, fetch(src).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch((e) => { recorded.delete(src); throw e; }));
  return recorded.get(src);
}
// 녹음 여러 곡을 차례로 이어 틀고 끝나면 처음부터. 한 곡이면 그 곡만 끝없이 돌려요
function playRecording(srcs, out) {
  let cur = null, stopped = false, i = 0;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
  const play = () => loadRecording(srcs[i]).then((buf) => {
    if (stopped) return;
    cur = ctx.createBufferSource(); cur.buffer = buf; cur.loop = srcs.length === 1;
    cur.connect(g); cur.start();
    cur.onended = () => { if (stopped) return; i = (i + 1) % srcs.length; play(); };
    loadRecording(srcs[(i + 1) % srcs.length]).catch(() => {});   // 다음 곡은 미리 받아 둬요
  }).catch(() => { if (!stopped && srcs.length > 1) { i = (i + 1) % srcs.length; setTimeout(play, 1000); } });
  play();
  g.gain.setTargetAtTime(1.4, ctx.currentTime, 0.8);
  return () => {
    stopped = true;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => { try { cur?.stop(); } catch {} g.disconnect(); }, 2000);
  };
}

let musicId = null, stopMusic = null, musicGain = null;
export function setMusic(id) {
  const track = TRACKS.find((t) => t.id === id);
  musicId = track ? id : null;
  stopMusic?.(); stopMusic = null;
  if (!sound.on || !musicId) return;
  ensure();
  if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0.6; musicGain.connect(master); }
  const srcs = track.list ? track.list.map((id) => TRACKS.find((t) => t.id === id).src) : track.src && [track.src];
  stopMusic = srcs ? playRecording(srcs, musicGain) : playTrack(musicId, musicGain);
}
export const music = () => musicId;

// 정각 범종: 음악과 따로, 조금 낮은 대종 소리로 한 번
// 휴대폰 · 노트북 스피커는 100Hz 아래를 거의 못 내서, 낮은 울림(맥놀이)에 '댕' 하는 타격음과 중간 배음을 얹어요.
// 종이 울리는 동안 법당 음악은 잠깐 작게
const JONG_STRIKE = [[2.76, 0.22, 2.2], [3.9, 0.16, 1.4], [5.4, 0.1, 0.9], [7.1, 0.06, 0.5]];
export function bigBell(vol = 1) {
  if (!sound.on) return;
  ensure();
  const t = ctx.currentTime + 0.05;
  ring(t, 140, JONG, 1.5 * vol, master, 0.01);
  ring(t, 140, JONG_STRIKE, 1.2 * vol, master, 0.003);
  if (musicGain) { musicGain.gain.setTargetAtTime(0.18, t, 0.3); musicGain.gain.setTargetAtTime(0.6, t + 9, 2); }
}
