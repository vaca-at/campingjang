// 소리: 캠핑 효과음(도끼 · 낚시 · 물 · 고기 굽기 · 기타 · 불꽃놀이)은 Web Audio로 합성, 음악과 장소 바탕 자연음은 assets/audio 녹음
let ctx = null, master = null;
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

// ───────── 장소 바탕 소리: 음악과 따로, 아주 작게 깔리는 자연음 ─────────
// 산속 낮은 새소리 · 밤은 풀벌레, 바닷가는 잔잔한 파도, 별밤은 귀뚜라미, 물가는 시냇물
let ambSrc = 'assets/audio/forest-birds.m4a', stopAmb = null;
function startAmbient() {
  if (stopAmb || !ctx || !ambSrc) return;
  const g = ctx.createGain(); g.gain.value = 0.32; g.connect(master);
  stopAmb = playRecording([ambSrc], g);
}
function stopAmbient() { stopAmb?.(); stopAmb = null; }
export function setAmbience(src) {
  if (src === ambSrc && (stopAmb || !sound.on)) return;
  ambSrc = src; stopAmbient();
  if (sound.on) { ensure(); startAmbient(); }
}

// ───────── 캠핑 효과음 (합성) ─────────
let NOISE = null;
function noise(dur, { type = 'bandpass', freq = 1000, to, q = 1, gain = 0.3, at = 0, attack = 0.004 } = {}) {
  const t = ctx.currentTime + at;
  if (!NOISE) { NOISE = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = ctx.createBufferSource(); src.buffer = NOISE;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
function slide(f0, f1, dur, { gain = 0.1, at = 0, type = 'sine' } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
// 기타 줄 튕김 (Karplus-Strong): 줄마다 소리를 한 번 만들어 기억해 둬요
const STRINGS = new Map();
function pluck(freq, at, gain) {
  let buf = STRINGS.get(freq);
  if (!buf) {
    const n = Math.floor(ctx.sampleRate * 1.6), p = Math.round(ctx.sampleRate / freq);
    buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = i < p ? Math.random() * 2 - 1 : (d[i - p] + d[i - p + 1]) * 0.497;
    STRINGS.set(freq, buf);
  }
  const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; g.gain.value = gain;
  src.connect(g).connect(master); src.start(ctx.currentTime + at);
}
const CHORDS = [[98, 147, 196, 247, 294, 392], [131, 165, 196, 262, 330], [110, 165, 220, 262, 330], [147, 220, 294, 370]];   // G · C · Am · D
// 동작을 시작할 때 한 번, 짧게 (0.2~0.8초). 동작마다 어울리는 소리
const chime = (notes, { gap = 0.08, type = 'triangle', gain = 0.09, dur = 0.35 } = {}) => notes.forEach((f, i) => tone(f, dur, { gain, at: i * gap, type }));
const START = {
  wave: () => chime([880, 1175], { gap: 0.1 }),                                   // 띠링 (인사)
  bugs: () => noise(0.35, { freq: 600, to: 2400, q: 2.5, gain: 0.14 }),          // 휘익 (잠자리채)
  walk: () => [0, 0.28].forEach((at) => noise(0.08, { type: 'lowpass', freq: 700, gain: 0.25, at })),   // 저벅저벅
  stargaze: () => chime([1568, 2093, 2637], { gap: 0.12, type: 'sine', gain: 0.06, dur: 0.8 }),         // 반짝반짝
  jumprope: () => [0, 0.3].forEach((at) => { noise(0.05, { freq: 3000, q: 2, gain: 0.12, at }); slide(220, 120, 0.08, { gain: 0.12, at: at + 0.06 }); }),
  warm: () => { for (let i = 0; i < 4; i++) noise(0.03, { freq: 2000 + Math.random() * 2000, gain: 0.12, at: Math.random() * 0.4 }); },   // 타닥
  roast: () => noise(0.5, { type: 'highpass', freq: 3000, gain: 0.06, attack: 0.05 }),                 // 지글
  fireworks: () => slide(400, 1400, 0.4, { gain: 0.05 }),                                                // 피유
  hammock: () => slide(300, 220, 0.5, { gain: 0.08, type: 'triangle' }),                                 // 끼익
  badminton: () => { noise(0.05, { freq: 2500, q: 3, gain: 0.2 }); slide(900, 600, 0.05, { gain: 0.08 }); },   // 통
  bike: () => chime([1760, 1760], { gap: 0.15, type: 'sine', gain: 0.1, dur: 0.25 }),                    // 따르릉
  fish: () => noise(0.3, { freq: 700, to: 3000, q: 3, gain: 0.15 }),                                      // 휙
  skip: () => slide(800, 400, 0.08, { gain: 0.1 }),                                                       // 톡
  splash: () => noise(0.4, { freq: 1800, to: 400, q: 0.8, gain: 0.25 }),                                  // 첨벙
  bubbles: () => [0, 0.12, 0.22].forEach((at, i) => slide(600 + i * 200, 1200 + i * 200, 0.06, { gain: 0.06, at })),   // 뽀록
  stepstones: () => [0, 0.2].forEach((at) => noise(0.06, { type: 'lowpass', freq: 500, gain: 0.25, at })),
  kayak: () => noise(0.5, { freq: 900, to: 400, q: 1, gain: 0.15 }),                                      // 촤아
  sandcastle: () => noise(0.25, { type: 'lowpass', freq: 900, gain: 0.18 }),                              // 사각
  shells: () => chime([1319, 1760], { gap: 0.07, type: 'sine', gain: 0.07 }),
  kite: () => noise(0.6, { freq: 400, to: 900, q: 0.7, gain: 0.1, attack: 0.15 }),                        // 바람
  cook: () => { slide(150, 150, 0.05, { gain: 0.1 }); noise(0.4, { freq: 1200, q: 0.5, gain: 0.08, at: 0.05 }); },   // 딸깍 + 화르륵
  grill: () => noise(0.6, { type: 'highpass', freq: 3500, gain: 0.1, attack: 0.02 }),                    // 치익
  eat: () => [0, 0.15, 0.3].forEach((at) => noise(0.07, { freq: 1500, q: 1.5, gain: 0.08, at })),        // 후루룩
  wash: () => noise(0.5, { freq: 2500, q: 0.6, gain: 0.08, attack: 0.05 }),                               // 쏴아
  sweep: () => [0, 0.25].forEach((at) => noise(0.15, { freq: 3000, q: 0.5, gain: 0.07, at })),            // 쓱싹
  nap: () => chime([523, 392], { gap: 0.25, type: 'sine', gain: 0.07, dur: 0.6 }),                        // 스르르
  read: () => noise(0.15, { freq: 4000, q: 0.5, gain: 0.08 }),                                            // 사락
  guitar: () => chime([196, 247, 294, 392], { gap: 0.03, type: 'triangle', gain: 0.07, dur: 0.6 }),
  tea: () => [0, 0.08].forEach((at, i) => tone(2600 - i * 300, 0.15, { gain: 0.05, at })),               // 짠 (컵)
  stretch: () => slide(300, 600, 0.4, { gain: 0.06, type: 'sine' }),                                      // 쭈욱
  dance: () => chime([523, 659, 784, 1047], { gap: 0.09, type: 'square', gain: 0.03, dur: 0.15 }),       // 둠칫
};
export function startSfx(id) { if (!sound.on || !START[id]) return; ensure(); START[id](); }

export function sfx(kind, vol = 1, arg = 0) {
  if (!sound.on || vol <= 0) return;
  ensure();
  const v = vol;
  switch (kind) {
    case 'chop':   // 도끼가 장작에 '탁'
      noise(0.09, { freq: 2600, q: 2, gain: 0.45 * v }); slide(160, 70, 0.18, { gain: 0.35 * v, type: 'triangle' }); noise(0.25, { type: 'lowpass', freq: 600, gain: 0.25 * v, at: 0.02 }); break;
    case 'cast':   // 낚싯대 휙 → 찌가 퐁
      noise(0.3, { freq: 700, to: 3000, q: 3, gain: 0.18 * v }); slide(700, 260, 0.12, { gain: 0.16 * v, at: 0.45 }); noise(0.2, { freq: 900, to: 300, gain: 0.12 * v, at: 0.45 }); break;
    case 'swish':  // 잠자리채 휘익
      noise(0.28, { freq: 500, to: 1800, q: 2.5, gain: 0.14 * v }); break;
    case 'splash': // 물 첨벙
      noise(0.45, { freq: 1800, to: 350, q: 0.8, gain: 0.3 * v }); for (let i = 0; i < 3; i++) slide(500 + Math.random() * 500, 250, 0.08, { gain: 0.06 * v, at: 0.05 + i * 0.07 }); break;
    case 'skip':   // 물수제비 퐁 · 퐁 · 퐁 · 풍덩
      for (let i = 0; i < 4; i++) slide(1100 - i * 120, 500, 0.07, { gain: (0.14 - i * 0.025) * v, at: i * (0.32 - i * 0.05) });
      noise(0.35, { freq: 1200, to: 300, gain: 0.15 * v, at: 1.05 }); break;
    case 'plink':  // 물수제비 돌이 수면에 한 번 닿을 때 '퐁'
      slide(1000 + arg * 60, 480, 0.07, { gain: 0.13 * v }); noise(0.12, { freq: 1600, to: 500, gain: 0.05 * v }); break;
    case 'sizzle': // 고기 뒤집으면 치익
      noise(0.9, { type: 'highpass', freq: 3500, gain: 0.1 * v, attack: 0.03 }); noise(0.5, { freq: 6000, q: 0.5, gain: 0.05 * v }); break;
    case 'bubble': // 코펠 보글보글
      for (let i = 0; i < 4; i++) slide(260 + Math.random() * 260, 520 + Math.random() * 300, 0.06, { gain: 0.05 * v, at: Math.random() * 0.8 }); break;
    case 'crackle':   // 장작 타닥
      for (let i = 0; i < 3; i++) noise(0.025, { freq: 1800 + Math.random() * 2500, q: 1.5, gain: (0.08 + Math.random() * 0.12) * v, at: Math.random() * 0.7 }); break;
    case 'strum': {   // 통기타 한 번 쓸어내리기 (arg: 몇 번째 코드)
      const ch = CHORDS[arg % CHORDS.length];
      ch.forEach((f, i) => pluck(f, i * 0.014, 0.16 * v)); break;
    }
    case 'firework':  // 피유우 → 펑 → 타다닥
      slide(500, 1700, 1.1, { gain: 0.05 * v });
      noise(1.6, { type: 'lowpass', freq: 500, gain: 0.8 * v, at: 1.2 }); slide(90, 40, 0.8, { gain: 0.5 * v, at: 1.2 });
      for (let i = 0; i < 14; i++) noise(0.03, { freq: 3000 + Math.random() * 3000, q: 1, gain: 0.05 * v, at: 1.6 + Math.random() * 1.2 }); break;
    case 'catch':     // 잡았다! (낚시 · 곤충 · 요리 완성)
      [0, 0.1, 0.2].forEach((at, i) => tone([660, 880, 1320][i], 0.3, { gain: 0.1, at, type: 'triangle' })); break;
  }
}

// ───────── 법당 음악: 실제 녹음 다섯 곡 + 합성 세 곡 ─────────
// 녹음 파일 없이 여기서 합성해요 (저작권 걱정 없는 소리). 가락은 모두 이 사이트에서 새로 지었어요.
// 곡마다 step(st, at, out) 이 한 박을 out 에 예약하고 다음 박까지 남은 초를 돌려줘요.
// src 가 있는 곡은 실제 녹음 파일을 처음 고를 때 한 번 받아서 끝없이 이어 틀어요.
// list 가 있는 곡은 그 녹음들을 차례로 이어 틀어요. 맨 앞 싱잉볼이 기본 곡
// 폴더: 음악(연주곡 · 8비트) / 자연 소리(모닥불 · 풀벌레 · 새 · 물 · 바다 · 비)
export const MUSIC_IDS = ['guitar', 'sunrise', 'aguitar', 'breeze', 'relax', 'blues', 'harmonica', 'chip'];
export const trackFolder = (id) => (MUSIC_IDS.includes(id) ? 'music' : 'nature');
export const TRACKS = [
  { id: 'campfire', name: '타닥타닥 모닥불', cap: '모닥불', src: 'assets/audio/campfire.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'night', name: '모닥불 + 풀벌레', cap: '이어 듣기 · 모닥불 → 귀뚜라미 → 계곡', list: ['campfire', 'crickets', 'stream'] },
  { id: 'birch', name: '자작나무 장작불', cap: '모닥불', src: 'assets/audio/birch-fire.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'fire2', name: '오래 타는 모닥불', cap: '모닥불', src: 'assets/audio/campfire-long.m4a', by: '김용배 · 공유마당 CC BY' },
  { id: 'guitar', name: '통기타와 피아노', cap: '연주곡', src: 'assets/audio/acoustic-guitar.m4a', by: '(재)전주정보문화산업진흥원 · 공유마당 공공누리 1유형' },
  { id: 'sunrise', name: 'Sunrise', cap: '연주곡 · 통기타', src: 'assets/audio/sunrise-guitar.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'aguitar', name: '가을 기타', cap: '연주곡 · 기타', src: 'assets/audio/autumn-guitar.m4a', by: '공유마당 CC BY' },
  { id: 'breeze', name: '선선한 가을바람', cap: '연주곡', src: 'assets/audio/autumn-breeze.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'relax', name: 'Relax Touch', cap: '연주곡', src: 'assets/audio/relax-touch.m4a', by: '공유마당 CC BY' },
  { id: 'blues', name: '모닥불 블루스', cap: '연주곡 · 기타', src: 'assets/audio/campfire-blues.m4a', by: 'BaDoink · Freesound CC0' },
  { id: 'harmonica', name: '하모니카 잼', cap: '연주곡 · 하모니카', src: 'assets/audio/harmonica.m4a', by: 'Vibratair · Freesound CC0' },
  { id: 'chip', name: '8비트 게임', cap: '이어 듣기 · 레트로', list: ['chiptune', 'flash'] },
  { id: 'crickets', name: '밤새 우는 귀뚜라미', cap: '풀벌레', src: 'assets/audio/crickets.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'bugs', name: '초여름 풀벌레', cap: '풀벌레', src: 'assets/audio/summer-bugs.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'country', name: '깊은 밤 시골', cap: '풀벌레 · 밤', src: 'assets/audio/country-night.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'birds', name: '숲속 새소리', cap: '새소리', src: 'assets/audio/forest-birds.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'morning', name: '봄 아침', cap: '새소리', src: 'assets/audio/spring-morning.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'stream', name: '계곡물 소리', cap: '물소리', src: 'assets/audio/stream.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'brook', name: '산속 시냇물', cap: '물소리', src: 'assets/audio/brook.m4a', by: 'JICA · (재)전주정보문화산업진흥원 · 공유마당 공공누리 1유형' },
  { id: 'waves', name: '일출 파도 소리', cap: '바다', src: 'assets/audio/waves.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'gwaves', name: '잔잔한 파도', cap: '바다', src: 'assets/audio/gentle-waves.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'pebble', name: '몽돌 해변 파도', cap: '바다', src: 'assets/audio/pebble-waves.m4a', by: 'JICA · (재)전주정보문화산업진흥원 · 공유마당 공공누리 1유형' },
  { id: 'rain', name: '텐트 위 빗소리', cap: '빗소리', src: 'assets/audio/tent-rain.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'roofrain', name: '지붕 위 빗소리', cap: '빗소리', src: 'assets/audio/roof-rain.m4a', by: '한국저작권위원회 · 공유마당 CC BY' },
  { id: 'vinylrain', name: '비닐 위 빗소리', cap: '빗소리', src: 'assets/audio/vinyl-rain.m4a', by: 'JICA · (재)전주정보문화산업진흥원 · 공유마당 공공누리 1유형' },
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
