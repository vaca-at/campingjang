// 캐릭터 모델과 동작 애니메이션.
// 모든 부품은 기본 도형으로 만들고, 관절(hips, head, 팔다리) 회전값으로 동작을 표현한다.
// 캐릭터는 +z 방향을 바라본다.
import * as THREE from 'three';
// 걸으면서(움직이면서) 하는 동작: 걷는 중에도 멈추지 않아요
const MOVING = new Set(['tapdori', 'bugs', 'bubbles', 'kite', 'bike', 'kayak', 'stepstones', 'wavedodge', 'shells']);
import { OUTFITS, SKIN_TONES, dressFor, bodyOf } from './data.js';
import { buildBlock, buildPet, bakeBlock, applyBody, PRESETS } from './blocky.js';

const FUR = ['#c27a45', '#a9643a', '#8a5a3c', '#d9a06b', '#6e4a35'];
const RABBIT_FUR = ['#f3efe8', '#e2d6c6', '#cbbba6', '#a99a88', '#8a7d70'];

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...opts }));
  }
  return matCache.get(key);
}

const G = {
  sphere: new THREE.SphereGeometry(1, 28, 20),
  sphereLo: new THREE.SphereGeometry(1, 12, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  cone: new THREE.CylinderGeometry(0.62, 1, 1, 24, 1, true),
  box: new THREE.BoxGeometry(1, 1, 1),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
  torus: new THREE.TorusGeometry(1, 0.08, 8, 40),
};

function mesh(geo, material, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function nameTag(text, mine) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  // 단추와 같은 반투명 먹색 + 고운바탕. 내 이름표는 조금 더 진하고 흰 테두리
  g.font = '400 48px "Ownglyph_UNZ-Rg", "Gowun Dodum", sans-serif';
  const w = Math.min(500, g.measureText(text).width + 52);
  const x = (512 - w) / 2;
  g.fillStyle = mine ? 'rgba(18, 16, 15, 0.78)' : 'rgba(18, 16, 15, 0.55)';
  g.beginPath();
  if (g.roundRect) g.roundRect(x, 20, w, 72, 22); else g.rect(x, 20, w, 72);
  g.fill();
  if (mine) { g.strokeStyle = 'rgba(255, 255, 255, 0.85)'; g.lineWidth = 4; g.stroke(); }
  g.fillStyle = '#fffaf0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 58);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.35, 0.3, 1);
  s.renderOrder = 10;
  return s;
}

// 자세: y(몸 낮추기), hip(상체 숙임), head, 팔·다리 [x회전, z회전]
const STAND = { y: 0, hip: 0, head: 0, aL: [0, 0.08], aR: [0, -0.08], lL: [0, 0], lR: [0, 0] };
const SIT = { y: -0.34, hip: 0.04, head: 0.05, aL: [-0.55, -0.4], aR: [-0.55, 0.4], lL: [-1.5, 0.8], lR: [-1.5, -0.8] };
// 블록 사람은 다리가 길고 네모나서 무릎을 덜 벌리고 앉는다
const SIT_BLOCK = { ...SIT, y: -0.38, lL: [-1.5, 0.28], lR: [-1.5, -0.28] };
const HAPJANG_ARMS = { aL: [-1.25, -0.55], aR: [-1.25, 0.55] };
const KEYS = ['y', 'hip', 'head'];
// 앉아 있을 때만 하는 동작: 일어나거나 다른 장소로 가면 소품을 내려놓는다
const SEATED_ONLY = new Set(['eat', 'read', 'sagyeong', 'wash']);
const LIMBS = ['aL', 'aR', 'lL', 'lR'];

const lerp = (a, b, t) => a + (b - a) * t;
let HALO_TEX = null;   // 명상 두광 그림 (모두 같이 씀)
// 사경 종이 그림: full = 경전(글자가 다 적힘), 아니면 칸 공책에 앞부분만 옮겨 쓴 모습. 세로쓰기 · 오른쪽부터
const SAG_TEX = {};
const SUTRA_TEXT = '마하반야바라밀다심경관자재보살행심반야바라밀다시조견오온개공도일체고액사리자색불이공공불이색색즉시공공즉시색수상행식역부여시';
function sagyeongTex(full) {
  if (SAG_TEX[full]) return SAG_TEX[full];
  const c = document.createElement('canvas'); c.width = 384; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = full ? '#efe2c2' : '#f8f2e2'; g.fillRect(0, 0, 384, 512);
  const cols = 8, rows = 10, cw = 384 / (cols + 1), ch = 512 / (rows + 1);
  if (!full) { g.strokeStyle = 'rgba(190,60,50,0.55)'; g.lineWidth = 1.5; for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(cw * (i + 0.5), ch * 0.5); g.lineTo(cw * (i + 0.5), ch * (rows + 0.5)); g.stroke(); } for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(cw * 0.5, ch * (j + 0.5)); g.lineTo(cw * (cols + 0.5), ch * (j + 0.5)); g.stroke(); } }
  g.fillStyle = '#1d1a18'; g.font = `700 ${Math.floor(ch * 0.72)}px "Gowun Batang", "Nanum Myeongjo", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = full ? cols * rows : 23;   // 옮겨 쓰는 쪽은 아직 앞부분만
  for (let k = 0; k < n && k < SUTRA_TEXT.length * 2; k++) { const col = Math.floor(k / rows), row = k % rows; g.fillText(SUTRA_TEXT[k % SUTRA_TEXT.length], 384 - cw * (col + 1), ch * (row + 1)); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (SAG_TEX[full] = t);
}
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 구간 [a,b] 안에서 0→1로 올라갔다가 [c,d]에서 1→0으로 내려오는 곡선
const bump = (t, a, b, c, d) => ease((t - a) / (b - a)) * (1 - ease((t - c) / (d - c)));

function mix(base, over, k) {
  const out = { ...base };
  for (const key of KEYS) if (over[key] !== undefined) out[key] = lerp(base[key], over[key], k);
  for (const key of LIMBS) if (over[key]) out[key] = [lerp(base[key][0], over[key][0], k), lerp(base[key][1], over[key][1], k)];
  return out;
}

// 동작별 자세 계산. t = 동작 시작 후 경과 초
function actionPose(action, t, base, seated) {
  switch (action) {
    case 'hapjang':
      return mix(base, { ...HAPJANG_ARMS, head: 0.15 }, bump(t, 0, 0.4, 1.9, 2.4));
    case 'banbae': {
      const p = mix(base, HAPJANG_ARMS, bump(t, 0, 0.35, 2.1, 2.6));
      return mix(p, { hip: seated ? 0.5 : 0.55, head: 0.25 }, bump(t, 0.5, 1.0, 1.6, 2.1));
    }
    case 'keunjeol':
    case 'bae108': {
      const T = 4.2, u = t % T;
      let p = mix(base, HAPJANG_ARMS, bump(u, 0, 0.4, 0.8, 1.1));
      // 무릎 꿇기
      if (!seated) p = mix(p, { y: -0.36, lL: [1.5, 0.12], lR: [1.5, -0.12] }, bump(u, 0.8, 1.4, 3.3, 3.9));
      // 이마를 바닥에, 두 팔을 앞으로
      return mix(p, { hip: 1.25, head: 0.3, aL: [-2.6, -0.15], aR: [-2.6, 0.15] }, bump(u, 1.3, 1.9, 2.8, 3.4));
    }
    case 'beads':
      return mix(base, { aR: [-1.15, 0.45], aL: [-0.9, -0.25], head: 0.22 }, ease(t / 0.4));
    case 'moktak': {
      // 서 있었으면 그 자리 바닥에 책상다리로 앉아서 쳐요
      const hit = Math.max(0, Math.sin(t * Math.PI * 2 * 1.1)) ** 3;
      const p = seated ? base : mix(base, SIT_BLOCK, ease(t / 0.6));
      return mix(p, { aL: [-1.0, -0.2], aR: [-1.25 - hit * 0.35, 0.35], head: 0.12 }, ease(t / 0.4));
    }
    case 'meditate':
      return mix(base, { aL: [-0.62, -0.55], aR: [-0.62, 0.55], head: 0.18, hip: -0.04 }, ease(t / 0.8));
    case 'wave': {
      const k = bump(t, 0, 0.3, 1.6, 2.0);
      return mix(base, { aR: [-0.3, -2.5 + Math.sin(t * 12) * 0.35] }, k);
    }
    case 'eat': {
      // 왼손은 발우를 받치고, 오른손 숟가락이 3초마다 입으로
      const u = t % 3;
      const lift = bump(u, 0.6, 1.1, 1.5, 2.0);
      return mix(base, { aL: [-1.05, -0.4], aR: [-0.95 - lift * 0.9, 0.35 + lift * 0.2], head: 0.25 - lift * 0.2 }, ease(t / 0.5));
    }
    case 'tapdori':
      // 걸으면서 두 손을 모은다 (걷는 다리는 그대로)
      return mix(base, { ...HAPJANG_ARMS, head: 0.12 }, ease(t / 0.4));
    case 'jukbi': {
      // 왼손바닥을 펴 두고, 오른손 죽비를 들었다가 1.5초마다 '탁' 내리친다
      const u = t % 1.5, raise = bump(u, 0.1, 0.6, 0.9, 1.05);
      return mix(base, { aL: [-1.05, -0.38], aR: [-0.98 - raise * 0.75, 0.3], head: 0.12 }, ease(t / 0.4));
    }
    case 'stones': {
      // 무릎 꿇고 앉아, 2.4초마다 오른손으로 돌을 집어 앞의 돌탑 위에 살며시 올린다
      const u = t % 2.4, reach = bump(u, 0.2, 0.8, 1.3, 1.9);
      let p = mix(base, { y: -0.36, lL: [1.5, 0.12], lR: [1.5, -0.12], hip: 0.35, head: 0.35, aL: [-0.55, -0.15], aR: [-0.5, 0.2] }, ease(t / 0.6));
      return mix(p, { aR: [-1.05, 0.05], hip: 0.5, head: 0.45 }, reach * ease(t / 0.6));
    }
    // ───── 캠핑 동작 ─────
    case 'warm':   // 두 손을 앞으로 내밀어 불에 녹이기, 가끔 비비기
      return mix(base, { aL: [-1.15 + Math.sin(t * 6) * 0.06 * bump(t % 5, 3, 3.3, 4.2, 4.6), -0.25], aR: [-1.15 - Math.sin(t * 6) * 0.06 * bump(t % 5, 3, 3.3, 4.2, 4.6), 0.25], head: 0.12, hip: 0.08 }, ease(t / 0.5));
    case 'roast':  // 오른손 꼬치를 불 쪽으로, 천천히 돌리기
      return mix(base, { aR: [-1.05 + Math.sin(t * 1.4) * 0.05, 0.15], aL: [-0.3, -0.1], head: 0.18 }, ease(t / 0.5));
    case 'chop': {   // 도끼를 머리 위로 들었다가 내리치기 (2초마다)
      const u = t % 2, up = bump(u, 0.1, 0.8, 1.0, 1.15);
      return mix(base, { aL: [-0.9 - up * 1.9, -0.05], aR: [-0.9 - up * 1.9, 0.05], hip: 0.1 + (1 - up) * 0.25, head: 0.1 }, ease(t / 0.4));
    }
    case 'fireworks':   // 한 손 번쩍 들어 쏘아 올리기
      return mix(base, { aR: [-2.9, 0.2], aL: [-0.4, -0.3], head: -0.35 }, bump(t, 0, 0.35, 2.0, 2.6));
    case 'fish': {   // 두 손으로 낚싯대를 앞으로, 가끔 휙 챔질
      const jerk = bump(t % 7, 5.6, 5.8, 6.1, 6.6);
      return mix(base, { aL: [-0.95 - jerk * 0.6, -0.12], aR: [-0.95 - jerk * 0.6, 0.12], head: 0.05 - jerk * 0.2 }, ease(t / 0.5));
    }
    case 'bugs': {   // 잠자리채를 크게 휘두르기
      const sw = Math.sin(t * 3.2);
      return mix(base, { aR: [-1.7 + sw * 0.6, 0.2 + sw * 0.5], aL: [-0.4, -0.2], head: -0.15, hip: 0.05 }, ease(t / 0.4));
    }
    case 'skip':   // 몸을 낮춰 옆으로 돌 던지기
      return mix(base, { aR: [-0.6 - bump(t, 0.6, 1.0, 1.2, 1.6) * 0.9, 1.2 - bump(t, 0.6, 1.0, 1.2, 1.6) * 1.4], hip: 0.35, head: 0.1 }, bump(t, 0, 0.4, 1.8, 2.2));
    case 'splash': {   // 두 팔로 물 튀기기
      const sp = Math.abs(Math.sin(t * 4));
      return mix(base, { aL: [-0.6 - sp * 0.9, -0.5], aR: [-0.6 - sp * 0.9, 0.5], hip: 0.3, head: 0.15 }, ease(t / 0.4));
    }
    case 'cook': {   // 왼손 코펠 잡고 오른손으로 휘휘 젓기
      const st = Math.sin(t * 5);
      return mix(base, { aL: [-0.8, -0.35], aR: [-0.95 + st * 0.08, 0.3 + Math.cos(t * 5) * 0.12], head: 0.3, hip: 0.12 }, ease(t / 0.4));
    }
    case 'grill': {   // 집게로 뒤집기 (2.5초마다)
      const fl = bump(t % 2.5, 1.4, 1.7, 1.9, 2.2);
      return mix(base, { aR: [-1.0 - fl * 0.5, 0.25 - fl * 0.5], aL: [-0.5, -0.2], head: 0.3, hip: 0.12 }, ease(t / 0.4));
    }
    case 'airout': {   // 창문을 양쪽으로 활짝 → 숨 크게 들이쉬기
      const open = bump(t % 6, 0.2, 0.9, 2.0, 2.6), breathe = bump(t % 6, 2.8, 3.6, 4.6, 5.4);
      return mix(base, { aL: [-1.5 + 0.6 * breathe, -0.3 - 0.9 * open - 0.6 * breathe], aR: [-1.5 + 0.6 * breathe, 0.3 + 0.9 * open + 0.6 * breathe], head: -0.25 * breathe, hip: -0.05 * breathe }, ease(t / 0.4));
    }
    case 'shake': {   // 이불을 두 손으로 잡고 위아래로 탁탁
      const s = Math.sin(t * 11) * bump(t % 3, 0, 0.3, 1.8, 2.2);
      return mix(base, { aL: [-1.25 + s * 0.4, -0.25], aR: [-1.25 + s * 0.4, 0.25], hip: 0.1, head: 0.1 }, ease(t / 0.3));
    }
    case 'kite':   // 한 손으로 실패를 들고 하늘을 올려다보기
      return mix(base, { aR: [-2.0 + Math.sin(t * 2) * 0.15, 0.15], aL: [-1.4, -0.25], head: -0.45 }, ease(t / 0.4));
    case 'frisbee': {   // 3초마다: 옆으로 감았다가 휙 던지기 → 돌아오면 받기
      const u = t % 3, wind = bump(u, 0.1, 0.5, 0.6, 0.75), fling = bump(u, 0.6, 0.75, 0.9, 1.2), catchP = bump(u, 2.3, 2.6, 2.8, 3.0);
      return mix(base, { aR: [-1.4 - catchP * 0.6, 0.2 - wind * 1.4 + fling * 1.6], aL: [-0.5, -0.3], hip: 0.1 * wind, head: -0.1 }, ease(t / 0.3));
    }
    case 'jumprope': {   // 줄이 발밑을 지날 때 폴짝 (0.6초에 한 번)
      const ph = (t / 0.6) % 1, hop = Math.max(0, Math.sin(ph * Math.PI * 2 - Math.PI / 2));
      const w = Math.sin(ph * Math.PI * 2) * 0.12;   // 손목으로 작게 원 그리기
      return mix(base, { y: 0.16 * hop, aL: [-0.4 + w, -0.28], aR: [-0.4 + w, 0.28], lL: [-0.3 * hop, 0], lR: [-0.3 * hop, 0], head: 0.05 }, ease(t / 0.3));
    }
    case 'bike': {   // 안장에 앉아 페달을 빙글빙글 + 손잡이 (발은 땅에서 떨어져요)
      const p = Math.sin(t * 7);
      return mix(base, { y: 0.32, lL: [-0.85 + p * 0.45, 0.06], lR: [-0.85 - p * 0.45, -0.06], aL: [-1.2, -0.18], aR: [-1.2, 0.18], hip: 0.3, head: -0.2 }, ease(t / 0.3));
    }
    case 'kayak': {   // 카약 안에 앉아 좌우로 노 젓기
      const p = Math.sin(t * 2.6);
      return mix(base, { y: -0.5, lL: [-1.45, 0.08], lR: [-1.45, -0.08], aL: [-1.3 + p * 0.35, -0.3], aR: [-1.3 - p * 0.35, 0.3], hip: 0.1, head: 0 }, ease(t / 0.3));
    }
    case 'stepstones':   // 두 팔을 벌려 균형 잡기
      return mix(base, { aL: [-0.35, -1.1 + Math.sin(t * 3) * 0.15], aR: [-0.35, 1.1 - Math.sin(t * 3) * 0.15], head: 0.15 }, ease(t / 0.3));
    case 'wavedodge':   // 신나서 두 팔 번쩍
      return mix(base, { aL: [-2.5, -0.5], aR: [-2.5, 0.5], head: -0.1 }, ease(t / 0.3));
    case 'shells': {   // 걷다가 멈추면 허리 숙여 줍기 (줍는 순간은 main 이 actionT 로 맞춰요)
      // 0~1.3초 허리 숙여 줍기 → 1.3~3.6초 짝! 오른손을 번쩍 들어 보여 주기 (멈춰 있을 때만)
      const pick = bump(t, 0.1, 0.5, 0.9, 1.3), show = bump(t, 1.3, 1.6, 3.2, 3.6);
      return mix(base, { hip: 1.0 * pick, aR: [-0.9 * pick - 2.5 * show, 0.1 + 0.25 * show], aL: [-0.3 - 0.4 * show, -0.2 - 0.5 * show], head: 0.4 * pick - 0.3 * show }, ease(t / 0.3));
    }
    case 'sandcastle': {   // 무릎 꿇고 두 손으로 토닥토닥
      const a = Math.sin(t * 5), b = Math.sin(t * 5 + Math.PI);
      return mix(base, { y: -0.42, lL: [-1.5, 0.1], lR: [-1.5, -0.1], hip: 0.5, aL: [-1.1 + a * 0.25, -0.2], aR: [-1.1 + b * 0.25, 0.2], head: 0.45 }, ease(t / 0.4));
    }
    case 'stretch': {   // 8초에 한 번: 두 팔 번쩍 기지개 → 왼쪽 옆구리 → 오른쪽 옆구리 → 앞으로 숙이기
      const u = t % 8, up = bump(u, 0.2, 0.8, 1.6, 2.0), l = bump(u, 2.0, 2.5, 3.3, 3.8), r = bump(u, 3.8, 4.3, 5.1, 5.6), fold = bump(u, 5.6, 6.2, 7.2, 7.8);
      const arms = Math.max(up, l, r);
      return mix(base, { aL: [-2.9 * arms - 1.2 * fold, -0.15 - 0.5 * r + 0.2 * l], aR: [-2.9 * arms - 1.2 * fold, 0.15 + 0.5 * l - 0.2 * r], hip: 0.9 * fold, head: -0.3 * up + 0.4 * fold }, ease(t / 0.5));
    }
    case 'dance': {   // 무릎 들썩 + 팔을 번갈아 위아래로, 4박마다 한 번 박수
      const b = Math.sin(t * 7), c = Math.sin(t * 3.5);
      return mix(base, { y: -0.04 * Math.abs(b), aL: [-1.4 - c * 1.2, -0.5], aR: [-1.4 + c * 1.2, 0.5], lL: [0.25 * Math.max(0, b), 0], lR: [0.25 * Math.max(0, -b), 0], hip: 0.08 * Math.abs(b), head: 0.15 * c }, ease(t / 0.4));
    }
    case 'nap':   // 누워서 자기: 팔다리를 쭉 펴고 (몸 전체를 눕히는 건 update 에서)
      return mix(base, { y: 0, hip: 0, head: 0.05 + Math.sin(t * 1.1) * 0.02, lL: [0, 0.04], lR: [0, -0.04], aL: [-0.12, -0.12], aR: [-0.12, 0.12] }, ease(t / 0.8));
    case 'guitar': {   // 왼손은 넥, 오른손으로 둥가둥가
      const str = Math.sin(t * 9);
      return mix(base, { aL: [-1.0, -0.7], aR: [-0.75 + str * 0.12, 0.45], head: 0.15 + Math.sin(t * 2) * 0.05 }, ease(t / 0.4));
    }
    case 'hammock':   // 해먹: 누워서 두 팔을 머리 뒤로 (몸 눕히기와 흔들기는 update 에서)
      return mix(base, { y: 0, hip: 0, head: 0.1, lL: [0, 0.06], lR: [0, -0.06], aL: [-2.6, -0.5], aR: [-2.6, 0.5] }, ease(t / 0.8));
    case 'stargaze':  // 매트에 누워 하늘 보며, 가끔 손가락으로 별 가리키기
      return mix(base, { y: 0, hip: 0, head: 0, lL: [0, 0.05], lR: [0, -0.05], aL: [-0.15, -0.15], aR: [-0.2 - bump(t % 7, 2.5, 3, 4.6, 5.2) * 2.6, 0.15] }, ease(t / 0.8));
    case 'badminton': {   // 라켓을 뒤로 젖혔다가 위로 휘두르기 (1.2초마다)
      const sw = bump(t % 1.2, 0.0, 0.25, 0.4, 0.75);
      return mix(base, { aR: [-1.2 - sw * 1.6, 0.35 - sw * 0.2], aL: [-0.6, -0.25], head: -0.2, hip: 0.05 }, ease(t / 0.3));
    }
    case 'catchball': {   // 2.4초마다: 받고(0~0.4) 뒤로 젖혔다가 던지기(1.2~1.6)
      const u = t % 2.4, catchP = bump(u, 0, 0.15, 0.35, 0.6), back = bump(u, 0.7, 1.1, 1.2, 1.35), thr = bump(u, 1.2, 1.4, 1.6, 2.0);
      return mix(base, { aL: [-1.3 * catchP - 0.4, -0.2], aR: [-0.8 - back * 2.2 - thr * 0.4 + catchP * 0.0, 0.2], hip: -0.1 * back + 0.15 * thr, head: -0.1 }, ease(t / 0.3));
    }
    case 'bubbles': {   // 막대를 입 앞에 대고 후 불기 (3초마다), 사이사이 휘휘 젓기
      const blow = bump(t % 3, 0.2, 0.6, 1.4, 1.8);
      return mix(base, { aR: [-1.55 + Math.sin(t * 3) * 0.25 * (1 - blow), 0.1], aL: [-0.3, -0.2], head: -0.1 }, ease(t / 0.4));
    }
    case 'stars':   // 고개를 젖혀 하늘 보기, 가끔 손가락으로 가리키기
      return mix(base, { head: -0.6, aR: [-0.4 - bump(t % 6, 2, 2.4, 3.6, 4) * 2.2, 0.2], aL: [-0.3, -0.2] }, ease(t / 0.8));
    case 'sweep': {
      // 빗자루를 두 손으로 잡고 좌우로 쓱쓱
      const s = Math.sin(t * 3.2);
      return mix(base, { aL: [-0.55 + s * 0.22, -0.35 + s * 0.15], aR: [-0.75 + s * 0.22, 0.2 + s * 0.15], hip: 0.22, head: 0.25 }, ease(t / 0.4));
    }
    case 'bell': {
      // 6초마다: 당목을 뒤로 당겼다가(0~1.6초) 앞으로 쭉 밀어 친다(2.2초)
      const u = t % 6;
      const back = bump(u, 0.2, 1.6, 1.9, 2.2), push = bump(u, 1.9, 2.2, 2.8, 4);
      return mix(base, { aL: [-1.15 + back * 0.55 - push * 0.35, -0.2], aR: [-1.15 + back * 0.55 - push * 0.35, 0.2], hip: -0.05 * back + 0.12 * push, head: 0.05 }, ease(t / 0.4));
    }
    case 'tea': {
      // 왼손은 받침, 오른손 찻잔이 4초마다 입으로
      const lift = bump(t % 4, 1.0, 1.5, 2.3, 2.8);
      return mix(base, { aL: [-0.95, -0.32], aR: [-1.0 - lift * 0.85, 0.32 + lift * 0.12], head: 0.15 - lift * 0.18 }, ease(t / 0.5));
    }
    case 'diary':
    case 'sagyeong': {
      // 앞에 펼친 종이에 붓으로 또박또박. 고개를 숙이고 오른손이 조금씩 움직인다
      const w = Math.sin(t * 5), v = Math.sin(t * 2.1);
      return mix(base, { aL: [-0.75, -0.38], aR: [-0.95 + w * 0.06, 0.28 + v * 0.1], hip: 0.1, head: 0.32 }, ease(t / 0.6));
    }
    case 'wash': {
      // 왼손에 발우, 오른손 행주로 동그랗게 닦는다
      return mix(base, { aL: [-1.05, -0.4], aR: [-1.0 + Math.sin(t * 4) * 0.12, 0.38 + Math.cos(t * 4) * 0.12], head: 0.3 }, ease(t / 0.5));
    }
    case 'read': {
      // 두 손으로 책을 들고 고개를 숙인다. 가끔 책장을 넘긴다
      const flip = bump(t % 9, 7.6, 7.9, 8.2, 8.6);
      return mix(base, { aL: [-1.0, -0.42], aR: [-1.0 - flip * 0.3, 0.42 + flip * 0.3], head: 0.38, hip: 0.08 }, ease(t / 0.6));
    }
  }
  return base;
}

export class Avatar {
  constructor(look, name, { mine = false } = {}) {
    this.group = new THREE.Group();
    this.look = look;
    this.mine = mine;
    this.pose = { ...STAND, aL: [...STAND.aL], aR: [...STAND.aR], lL: [0, 0], lR: [0, 0] };
    this.walkPhase = 0;
    this.speed = 0;
    this.seated = false;
    this.action = null;
    this.actionT = 0;
    this.fresh = true;
    this.baseLook = look;
    this.dressKey = JSON.stringify(look);
    this.build(look);
    this.setName(name);
  }

  // 고른 모습(baseLook)은 그대로 두고, 장소에 맞는 옷으로 갈아입힌다
  setLook(look, scene) {
    this.baseLook = look;
    this.dressKey = null;
    this.dress(scene);
  }

  dress(scene) {
    const eff = dressFor(this.baseLook, scene);
    const key = JSON.stringify(eff);
    if (key === this.dressKey) return;
    this.dressKey = key;
    this.build(eff);
  }

  setName(name) {
    if (this.tag) this.group.remove(this.tag);
    this.name = name;
    this.tag = nameTag(name, this.mine);
    this.tag.position.y = this.tagY ?? 2.05;
    this.group.add(this.tag);
  }

  build(look) {
    if (this.body) this.group.remove(this.body);
    this.look = look;
    const isBlock = !!PRESETS[look.type];
    this.block = isBlock;
    let outfit = OUTFITS.find((o) => o.id === look.outfit) || OUTFITS[0];
    if (outfit.style === 'own' && !isBlock) outfit = OUTFITS.find((o) => o.id === 'seungbok');
    const skinIdx = Math.max(0, SKIN_TONES.indexOf(look.skin));
    const animal = ['squirrel', 'bear', 'rabbit'].includes(look.type);
    const skinColor = look.type === 'rabbit' ? RABBIT_FUR[skinIdx] : animal ? FUR[skinIdx] : look.skin;
    const skin = mat(skinColor);
    const top = mat(outfit.top), bottom = mat(outfit.bottom), sash = mat(outfit.sash);
    const dark = mat('#2a2220');
    const white = mat('#f7f3ea');

    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);
    this.handY = -0.36;

    // 내 옆 친구 (옷만 갈아입을 때는 그대로 둔다)
    const petId = look.pet || 'none';
    if (petId !== this.petId) {
      if (this.pet) this.pet.removeFromParent();
      this.pet = buildPet(petId);
      this.petId = petId;
      this.petFresh = true;
    }

    this.torsoY = 1; this.sitK = 1; this.eyes = null;
    // 이름표는 키에 맞춰 머리 위로
    const B = bodyOf(look);
    this.tagY = isBlock ? B.k * (0.46 * B.leg + 0.56 * B.th + 0.58 * B.head) + 0.45 : 2.05;
    if (this.tag) this.tag.position.y = this.tagY;
    if (isBlock) { buildBlock(this, body, look, outfit, look.skin); applyBody(this, B); }
    else {

    // 다리 (엉덩이 관절에 매달림)
    const legY = 0.4;
    const mkLeg = (side) => {
      const g = new THREE.Group();
      g.position.set(0.13 * side, legY, 0);
      g.add(mesh(G.capsule, outfit.style === 'hanbok' || outfit.style === 'hiking' ? bottom : mat(outfit.bottom), 0.1, 0.13, 0.1, 0, -0.2, 0));
      const foot = mesh(G.sphere, outfit.style === 'hiking' ? mat('#5a3c2a') : white, 0.11, 0.08, 0.15, 0, -0.38, 0.04);
      g.add(foot);
      body.add(g);
      return g;
    };
    this.legL = mkLeg(1);
    this.legR = mkLeg(-1);

    const hips = new THREE.Group();
    hips.position.y = legY;
    body.add(hips);
    this.hips = hips;

    // 몸통: 위로 갈수록 좁아지는 원통 + 아래 치마(장삼 자락)
    const torso = mesh(G.cyl, top, 1, 1, 1, 0, 0.27, 0);
    torso.geometry = new THREE.CylinderGeometry(0.22, 0.3, 0.56, 22);
    hips.add(torso);
    const longSkirt = outfit.style === 'kasaya' || outfit.style === 'wizard';
    if (outfit.style !== 'hiking' && outfit.style !== 'hanbok') {
      const skirt = mesh(G.cone, longSkirt ? top : bottom, 0.34, longSkirt ? 0.4 : 0.3, 0.32, 0, longSkirt ? -0.17 : -0.12, 0);
      skirt.material = (longSkirt ? top : bottom).clone();
      skirt.material.side = THREE.DoubleSide;
      skirt.userData = { sx: skirt.scale.x, sz: skirt.scale.z, h: skirt.scale.y, y: skirt.position.y };
      hips.add(skirt);
      this.skirt = skirt;
    } else {
      this.skirt = null;
      hips.add(mesh(G.cyl, bottom, 0.29, 0.12, 0.27, 0, -0.02, 0));
    }

    // 스타일별 장식
    if (outfit.style === 'robe' || outfit.style === 'kasaya') {
      const band = mesh(G.box, sash, outfit.style === 'kasaya' ? 0.2 : 0.13, 0.66, 0.05, 0.02, 0.28, 0.24);
      band.rotation.z = 0.55;
      band.rotation.x = -0.12;
      hips.add(band);
      if (outfit.style === 'kasaya') {
        const back = band.clone(); back.position.z = -0.24; back.rotation.x = 0.12; hips.add(back);
      }
    }
    if (outfit.style === 'hanbok') {
      const collar = mesh(G.box, white, 0.07, 0.36, 0.03, 0.04, 0.38, 0.23); collar.rotation.z = 0.6; hips.add(collar);
      hips.add(mesh(G.sphere, sash, 0.05, 0.05, 0.04, -0.06, 0.25, 0.27));
      const ribbon = mesh(G.box, sash, 0.05, 0.22, 0.02, -0.08, 0.13, 0.27); ribbon.rotation.z = -0.25; hips.add(ribbon);
    }
    if (outfit.style === 'hiking') {
      hips.add(mesh(G.box, mat('#f2f2f2'), 0.02, 0.5, 0.02, 0, 0.27, 0.27));
      hips.add(mesh(G.cyl, sash, 0.2, 0.08, 0.2, 0, 0.56, 0));
    }

    // 팔: 어깨 관절에서 아래로
    const mkArm = (side) => {
      const g = new THREE.Group();
      g.position.set(0.25 * side, 0.48, 0);
      g.add(mesh(G.capsule, top, 0.085, 0.16, 0.085, 0.01 * side, -0.16, 0));
      const hand = mesh(G.sphere, skin, 0.085, 0.085, 0.085, 0.01 * side, -0.33, 0);
      g.add(hand);
      hips.add(g);
      return { g, hand };
    };
    const L = mkArm(1), R = mkArm(-1);
    this.armL = L.g; this.armR = R.g; this.handL = L.hand; this.handR = R.hand;

    // 머리
    const head = new THREE.Group();
    head.position.y = 0.56;
    hips.add(head);
    this.head = head;
    const hr = animal ? 0.36 : 0.4;
    head.add(mesh(G.sphere, skin, hr, hr * 0.96, hr * 0.94, 0, 0.36, 0));
    // 얼굴
    const eyeY = 0.33, eyeZ = hr * 0.9;
    head.add(mesh(G.sphereLo, dark, 0.035, 0.045, 0.02, 0.13, eyeY, eyeZ));
    head.add(mesh(G.sphereLo, dark, 0.035, 0.045, 0.02, -0.13, eyeY, eyeZ));
    const blush = mat('#f19a8e', { transparent: true, opacity: 0.55 });
    head.add(mesh(G.sphereLo, blush, 0.06, 0.035, 0.015, 0.21, 0.25, eyeZ - 0.06));
    head.add(mesh(G.sphereLo, blush, 0.06, 0.035, 0.015, -0.21, 0.25, eyeZ - 0.06));
    head.add(mesh(G.sphereLo, mat('#b5544a'), 0.035, 0.015, 0.012, 0, 0.21, eyeZ + 0.005));

    if (!animal) {
      head.add(mesh(G.sphereLo, skin, 0.07, 0.09, 0.05, hr * 0.98, 0.33, 0));
      head.add(mesh(G.sphereLo, skin, 0.07, 0.09, 0.05, -hr * 0.98, 0.33, 0));
    }
    const hair = mat('#2b2422');
    if (look.type === 'bosal') {
      const cap = mesh(G.sphere, hair, hr * 1.04, hr * 0.98, hr * 0.98, 0, 0.4, -0.03);
      cap.scale.multiply(new THREE.Vector3(1, 1, 1));
      head.add(cap);
      head.add(mesh(G.sphere, hair, 0.16, 0.15, 0.15, 0, 0.36, -0.42));
      const hairpin = mesh(G.cyl, mat('#d9b44a', { metalness: 0.4, roughness: 0.4 }), 0.015, 0.4, 0.015, 0, 0.36, -0.46);
      hairpin.rotation.z = Math.PI / 2;
      head.add(hairpin);
      // 이마 아래 얼굴 부분이 보이도록 앞머리 영역을 피부로 덮는다
      head.add(mesh(G.sphere, skin, hr * 0.96, hr * 0.78, hr * 0.5, 0, 0.29, hr * 0.48));
    }
    if (look.type === 'cheosa') {
      head.add(mesh(G.sphere, hair, hr * 1.02, hr * 0.62, hr * 1.0, 0, 0.5, -0.02));
      head.add(mesh(G.box, hair, 0.09, 0.02, 0.02, 0.13, 0.41, eyeZ - 0.01));
      head.add(mesh(G.box, hair, 0.09, 0.02, 0.02, -0.13, 0.41, eyeZ - 0.01));
    }
    if (look.type === 'squirrel' || look.type === 'bear') {
      const er = look.type === 'bear' ? 0.11 : 0.08;
      head.add(mesh(G.sphere, skin, er, er * (look.type === 'squirrel' ? 1.5 : 1), er * 0.7, 0.24, 0.66, -0.02));
      head.add(mesh(G.sphere, skin, er, er * (look.type === 'squirrel' ? 1.5 : 1), er * 0.7, -0.24, 0.66, -0.02));
      head.add(mesh(G.sphere, mat('#f2dcc0'), 0.15, 0.1, 0.08, 0, 0.22, hr * 0.84));
      head.add(mesh(G.sphereLo, dark, 0.035, 0.028, 0.02, 0, 0.26, hr * 0.84 + 0.07));
    }
    if (look.type === 'rabbit') {
      const pink = mat('#f2b6bd');
      for (const s of [1, -1]) {
        const ear = new THREE.Group();
        ear.position.set(0.12 * s, 0.62, -0.02);
        ear.rotation.z = -0.18 * s;
        ear.add(mesh(G.capsule, skin, 0.07, 0.3, 0.04, 0, 0.2, 0));
        ear.add(mesh(G.capsule, pink, 0.04, 0.24, 0.02, 0, 0.2, 0.03));
        head.add(ear);
      }
      head.add(mesh(G.sphereLo, pink, 0.03, 0.022, 0.02, 0, 0.26, hr * 0.96));
    }
    // 꼬리
    if (look.type === 'squirrel') {
      const tail = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = i / 5;
        tail.add(mesh(G.sphere, skin, 0.15 + a * 0.06, 0.15 + a * 0.06, 0.13, 0, 0.05 + a * 0.75, -0.32 - Math.sin(a * 2.2) * 0.22));
      }
      hips.add(tail);
    }
    if (look.type === 'bear' || look.type === 'rabbit') {
      hips.add(mesh(G.sphere, look.type === 'rabbit' ? white : skin, 0.08, 0.08, 0.08, 0, -0.02, -0.3));
    }

    // 장신구
    const acc = look.acc;
    if (acc === 'beads') {
      const beadMat = mat('#6b3b22', { roughness: 0.4 });
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        head.add(mesh(G.sphereLo, beadMat, 0.035, 0.035, 0.035, Math.sin(a) * 0.22, -0.01 - Math.max(0, Math.cos(a)) * 0.08, Math.cos(a) * 0.22));
      }
    }
    if (acc === 'bracelet') {
      const bm2 = mat('#6b3b22', { roughness: 0.4 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.armL.add(mesh(G.sphereLo, bm2, 0.025, 0.025, 0.025, Math.cos(a) * 0.09, -0.27, Math.sin(a) * 0.09));
      }
    }
    if (acc === 'satgat') {
      const hat = mesh(new THREE.ConeGeometry(0.62, 0.28, 28, 1, true), mat('#c9a86a', { side: THREE.DoubleSide }), 1, 1, 1, 0, 0.78, 0);
      head.add(hat);
    }
    if (acc === 'beanie') {
      head.add(mesh(G.sphere, mat('#b23a3a'), hr * 1.04, hr * 0.7, hr * 1.04, 0, 0.5, 0));
      head.add(mesh(G.sphere, mat('#f4efe6'), 0.08, 0.08, 0.08, 0, 0.8, 0));
    }
    if (acc === 'lotuspin') {
      const pin = new THREE.Group();
      pin.position.set(0.26, 0.62, 0.12);
      for (let i = 0; i < 6; i++) {
        const p = mesh(G.sphereLo, mat('#f59bb5'), 0.03, 0.07, 0.03, 0, 0.04, 0);
        p.rotation.z = (i / 6) * Math.PI * 2;
        const w = new THREE.Group(); w.rotation.y = (i / 6) * Math.PI; w.add(p); pin.add(w);
      }
      pin.add(mesh(G.sphereLo, mat('#f3d16a'), 0.03, 0.03, 0.03));
      head.add(pin);
    }
    if (acc === 'backpack' || outfit.style === 'hiking') {
      hips.add(mesh(G.box, mat('#8a8d8a'), 0.36, 0.4, 0.18, 0, 0.3, -0.3));
    }

    }
    // 100명이 한 방에 있어도 버티도록 블록 몸은 관절마다 한 덩어리로 합친다
    if (isBlock) bakeBlock(this);

    // 소품: 염주(오른손), 목탁(왼손)과 채(오른손)
    const beads = new THREE.Group();
    const bm = mat('#5a2f1c', { roughness: 0.35 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      beads.add(mesh(G.sphereLo, bm, 0.028, 0.028, 0.028, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0));
    }
    beads.position.set(0, this.handY, 0.08);
    beads.visible = false;
    this.armR.add(beads);
    this.beads = beads;

    const moktak = new THREE.Group();
    moktak.add(mesh(G.sphere, mat('#a0612f', { roughness: 0.5 }), 0.13, 0.11, 0.12));
    moktak.add(mesh(G.box, mat('#3b2014'), 0.18, 0.012, 0.03, 0, 0, 0.11));
    moktak.position.set(-0.02, this.handY - 0.06, 0.08);
    moktak.visible = false;
    this.armL.add(moktak);
    const stick = mesh(G.cyl, mat('#d8b27a'), 0.015, 0.26, 0.015, 0, this.handY - 0.06, 0.1);
    stick.rotation.x = Math.PI / 2;
    stick.visible = false;
    this.armR.add(stick);
    this.moktak = moktak; this.stick = stick;
    // 죽비: 대나무를 반쯤 갈라 만든 채 (오른손)
    const jukbi = new THREE.Group();
    jukbi.add(mesh(G.box, mat('#d9b874'), 0.05, 0.035, 0.4, 0, 0, 0.18));
    jukbi.add(mesh(G.box, mat('#8a6a3a'), 0.052, 0.006, 0.22, 0, 0, 0.27));
    jukbi.add(mesh(G.box, mat('#b8934f'), 0.056, 0.04, 0.03, 0, 0, 0.02));
    jukbi.position.set(0, this.handY - 0.02, 0.02);
    jukbi.visible = false;
    this.armR.add(jukbi);
    this.jukbi = jukbi;

    // 발우(가슴 앞)와 숟가락(오른손), 책(가슴 앞)
    const bowl = new THREE.Group();
    // 캠핑 라면: 노란 양은 냄비(양쪽 손잡이) + 꼬불꼬불 면 · 국물 · 반숙 달걀 · 파
    const tin = mat('#e8b84a', { metalness: 0.55, roughness: 0.35 });
    bowl.add(mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.09, 24, 1, true), tin));
    bowl.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.01, 24), tin, 1, 1, 1, 0, -0.045, 0));
    bowl.add(mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.012, 24), mat('#c9572a'), 1, 1, 1, 0, 0.03, 0));   // 빨간 국물
    for (let i = 0; i < 9; i++) { const n = new THREE.Mesh(new THREE.TorusGeometry(0.035 + (i % 3) * 0.018, 0.007, 4, 12), mat('#f2d88a')); n.rotation.x = Math.PI / 2; n.position.set(Math.cos(i * 2.4) * 0.05, 0.04, Math.sin(i * 2.4) * 0.05); bowl.add(n); }
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f8f4ea')); egg.position.set(0.05, 0.04, -0.03); bowl.add(egg);
    const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), mat('#f2a51a')); yolk.position.set(0.05, 0.065, -0.03); bowl.add(yolk);
    for (let i = 0; i < 4; i++) bowl.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.006, 8), mat('#5fa84a'), 1, 1, 1, -0.06 + i * 0.03, 0.045, 0.06));
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI), tin); h.rotation.y = s * Math.PI / 2; h.position.set(s * 0.15, 0.03, 0); bowl.add(h); }
    bowl.position.set(0, 0.42, 0.34);   // 가슴 앞, 식탁 위로 보이게
    bowl.visible = false;
    this.hips.add(bowl);
    // 젓가락 한 쌍 (오른손)
    const spoon = new THREE.Group(); for (const x of [-0.012, 0.012]) spoon.add(mesh(G.box, mat('#c9c3b6', { metalness: 0.6, roughness: 0.3 }), 0.008, 0.24, 0.008, x, 0, 0)); spoon.position.set(0, this.handY - 0.1, 0.07); spoon.rotation.x = 0.5;
    spoon.visible = false;
    this.armR.add(spoon);
    const book = new THREE.Group();
    const cover = mat('#2f5d50');
    const page = mat('#f7f1e1');
    for (const s of [1, -1]) {
      const half = new THREE.Group();
      half.rotation.y = -0.3 * s;
      half.add(mesh(G.box, cover, 0.18, 0.24, 0.015, 0.09 * s, 0, 0));
      half.add(mesh(G.box, page, 0.16, 0.22, 0.012, 0.085 * s, 0, 0.012));
      book.add(half);
    }
    book.position.set(0, 0.2, 0.36);
    book.rotation.x = -0.7;
    book.visible = false;
    this.hips.add(book);
    this.bowl = bowl; this.spoon = spoon; this.book = book;

    // 찻잔(오른손), 사경 종이(무릎 앞)와 붓(오른손), 빗자루(오른손), 당목(두 손 앞으로 길게), 행주(오른손)
    const cup = new THREE.Group();
    cup.add(mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 14), mat('#a9c9b5', { roughness: 0.3 })));
    cup.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 14), mat('#b5843a'), 1, 1, 1, 0, 0.036, 0));
    cup.position.set(0, this.handY - 0.02, 0.09);
    cup.scale.setScalar(1.8);   // 손에 비해 너무 작아 보이지 않게
    cup.visible = false;
    this.armR.add(cup);
    // 사경: 왼쪽엔 반야심경이 적힌 경전, 오른쪽엔 옮겨 쓰는 사경지(칸 공책)
    const paper = new THREE.Group();
    const sutra = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshStandardMaterial({ map: sagyeongTex(true), roughness: 0.9 }));
    sutra.rotation.x = -Math.PI / 2; sutra.rotation.z = 0.12; sutra.position.set(0.19, 0.012, -0.02); paper.add(sutra);
    paper.add(mesh(G.box, mat('#7a2c22'), 0.31, 0.012, 0.41, 0.19, 0.004, -0.02));   // 경전 표지
    const copy = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshStandardMaterial({ map: sagyeongTex(false), roughness: 0.9 }));
    copy.rotation.x = -Math.PI / 2; copy.rotation.z = -0.05; copy.position.set(-0.14, 0.008, 0.02); paper.add(copy);
    paper.position.set(0, 0.16, 0.42);   // 책 읽기의 책과 같은 높이 (내 방 책상 위)
    paper.visible = false;
    this.hips.add(paper);
    const brush = new THREE.Group();
    brush.add(mesh(G.cyl, mat('#6b4a2a'), 0.018, 0.22, 0.018, 0, -0.05, 0));
    brush.add(mesh(G.cyl, mat('#1d1a18'), 0.026, 0.06, 0.026, 0, -0.18, 0));
    brush.position.set(0, this.handY, 0.07);
    brush.visible = false;
    this.armR.add(brush);
    const broom = new THREE.Group();
    broom.add(mesh(G.cyl, mat('#c8a46a'), 0.03, 1.05, 0.03, 0, -0.35, 0));
    broom.add(mesh(G.box, mat('#d9c07a'), 0.26, 0.2, 0.06, 0, -0.92, 0));
    broom.position.set(0, this.handY, 0.06);
    broom.rotation.x = -0.35;   // 앞쪽 바닥을 비스듬히 쓸게
    broom.visible = false;
    this.armR.add(broom);
    // 당목: 팔을 앞으로 든 자세(약 -1.15)에서 땅과 나란히 앞으로 뻗게
    const log = mesh(G.cyl, mat('#7a5232'), 0.09, 0.9, 0.09, 0, this.handY - 0.27, 0.12);
    log.rotation.x = 2.72;
    log.visible = false;
    this.armR.add(log);
    const cloth = mesh(G.box, mat('#f2efe6'), 0.09, 0.03, 0.09, 0, this.handY - 0.03, 0.06);
    cloth.visible = false;
    this.armR.add(cloth);
    // 돌탑: 캐릭터 앞 바닥에 납작한 돌이 하나씩 쌓인다 (손에는 올릴 돌 하나)
    const cairn = new THREE.Group();
    const stoneGeo = new THREE.DodecahedronGeometry(0.13, 0);
    [['#9a958c', 1.25], ['#b3ada2', 1.05], ['#8c877e', 0.9], ['#c2bcb0', 0.74], ['#a49e93', 0.58]].forEach(([c, k], i) => {
      const st = new THREE.Mesh(stoneGeo, mat(c));
      st.scale.set(k, k * 0.45, k * 0.9);
      st.position.set((i % 2 ? 0.012 : -0.01), 0.04 + [0, 0.085, 0.16, 0.225, 0.28][i], 0);
      st.rotation.y = i * 0.9;
      st.castShadow = true;
      cairn.add(st);
    });
    cairn.position.set(-0.45, 0, 0.4);   // 오른손 쪽 앞 (친구는 왼쪽): 뒤에서 보는 카메라에도 보이게
    cairn.visible = false;
    this.group.add(cairn);
    const handStone = mesh(G.box, mat('#b3ada2'), 0.1, 0.05, 0.08, 0, this.handY - 0.05, 0.05);
    handStone.visible = false;
    this.armR.add(handStone);
    this.cairn = cairn; this.handStone = handStone;
    this.cup = cup; this.paper = paper; this.brush = brush; this.broom = broom; this.log = log; this.cloth = cloth;
    // 캠핑 소품 (오른손에 달아요)
    const hand = (g) => { g.position.set(0, this.handY, 0.06); g.visible = false; this.armR.add(g); return g; };
    const skewer = new THREE.Group(); skewer.add(mesh(G.cyl, mat('#8a6a3a'), 0.015, 0.9, 0.015, 0, -0.42, 0.08)); skewer.add(mesh(G.sphere, mat('#f4ead8'), 0.06, 0.07, 0.06, 0, -0.86, 0.1));
    skewer.children[0].rotation.x = -0.6; skewer.children[1].position.set(0, -0.8, 0.33);   // 마시멜로가 꼬치 끝에 꽂히게
    const axe = new THREE.Group(); axe.add(mesh(G.cyl, mat('#8a6a3a'), 0.025, 0.7, 0.025, 0, -0.3, 0)); axe.add(mesh(G.box, mat('#9aa0a6', { metalness: 0.6, roughness: 0.4 }), 0.04, 0.14, 0.2, 0, -0.62, 0.08));
    const rod = new THREE.Group(); const rp = mesh(G.cyl, mat('#2a2a2a'), 0.012, 1.8, 0.012, 0, -0.9, 0); rp.rotation.x = -0.5; rp.position.set(0, -0.8, 0.4); rod.add(rp); rod.add(mesh(G.cyl, mat('#e8e8e8'), 0.003, 1.2, 0.003, 0, -1.25, 1.2));
    const net = new THREE.Group(); net.add(mesh(G.cyl, mat('#c9a24a'), 0.012, 1.1, 0.012, 0, -0.55, 0)); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 20), mat('#ddd')); ring.position.set(0, -1.15, 0); net.add(ring);
    const bag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.55, side: THREE.DoubleSide })); bag.position.set(0, -1.3, 0); bag.rotation.x = Math.PI; net.add(bag);
    const spoon2 = new THREE.Group(); spoon2.add(mesh(G.cyl, mat('#c9c3b6'), 0.012, 0.35, 0.012, 0, -0.12, 0));
    const tongs = new THREE.Group(); for (const x of [-0.015, 0.015]) tongs.add(mesh(G.box, mat('#b0b4b8', { metalness: 0.6 }), 0.008, 0.36, 0.02, x, -0.16, 0.02));
    const guitar = new THREE.Group(); guitar.add(mesh(G.sphere, mat('#b8742e'), 0.2, 0.24, 0.07, 0, 0, 0)); guitar.add(mesh(G.sphere, mat('#b8742e'), 0.15, 0.17, 0.07, 0, 0.2, 0)); guitar.add(mesh(G.box, mat('#4a3020'), 0.05, 0.42, 0.03, 0, 0.5, 0)); guitar.add(mesh(G.cyl, mat('#2a1a10'), 0.05, 0.01, 0.05, 0, 0.08, 0.04));
    guitar.position.set(0.05, 0.24, 0.24); guitar.rotation.set(0.15, 0, 0.9); guitar.visible = false; this.hips.add(guitar);
    const pot = new THREE.Group(); pot.add(mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.14, 16), mat('#c0c4c8', { metalness: 0.5, roughness: 0.4 }))); pot.position.set(0, 0.02, 0.5); pot.visible = false; this.hips.add(pot);
    const racket = new THREE.Group(); racket.add(mesh(G.cyl, mat('#2a2a2a'), 0.014, 0.3, 0.014, 0, -0.15, 0)); const head = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 18), mat('#e2603d')); head.scale.y = 1.3; head.position.set(0, -0.44, 0); racket.add(head); const strings = new THREE.Mesh(new THREE.CircleGeometry(0.105, 16), new THREE.MeshStandardMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.35, side: THREE.DoubleSide })); strings.scale.y = 1.3; strings.position.copy(head.position); racket.add(strings);
    const glove = new THREE.Group(); glove.add(mesh(G.sphere, mat('#8a5a2c'), 0.11, 0.12, 0.07, 0, -0.04, 0.02));
    const wand = new THREE.Group(); wand.add(mesh(G.cyl, mat('#3f9a6a'), 0.01, 0.28, 0.01, 0, -0.14, 0)); const loop = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 14), mat('#3f9a6a')); loop.position.set(0, -0.3, 0); wand.add(loop);
    // 몸에 붙는 큰 소품: 자전거 · 카약 · 줄넘기 줄 · 이불 · 연 실패
    const onBody = (g) => { g.visible = false; this.group.add(g); return g; };
    const bike = new THREE.Group();
    for (const z of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 20), mat('#2a2a2a')); w.rotation.y = Math.PI / 2; w.position.set(0, 0.34, z); bike.add(w); }
    const fr = mat('#2f7a96');
    [[0, 0.62, 0, 0.05, 0.05, 1.0, 0], [0, 0.5, -0.25, 0.05, 0.5, 0.05, 0.6], [0, 0.62, 0.42, 0.05, 0.6, 0.05, -0.3]].forEach(([x, y, z, sx, sy, sz, rx]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), fr); m.position.set(x, y, z); m.rotation.x = rx; bike.add(m); });
    const seatB = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.26), mat('#2a2a2a')); seatB.position.set(0, 0.78, -0.3); bike.add(seatB);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.04), mat('#2a2a2a')); bar.position.set(0, 0.95, 0.5); bike.add(bar);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.25), mat('#c9a86a')); basket.position.set(0, 0.85, 0.72); bike.add(basket);
    const kayak = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), mat('#e2603d')); hull.scale.set(0.42, 0.22, 1.9); hull.position.y = 0.05; kayak.add(hull);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), mat('#2a2a2a')); hole.scale.z = 1.4; hole.position.y = 0.22; kayak.add(hole);
    const paddle = new THREE.Group(); paddle.add(mesh(G.cyl, mat('#e8e2d6'), 0.025, 2.0, 0.025, 0, 0, 0)); for (const s of [-1, 1]) paddle.add(mesh(G.box, mat('#2f7a96'), 0.2, 0.35, 0.03, 0, s * 1.0, 0)); paddle.rotation.z = Math.PI / 2; paddle.position.set(0, 0.95, 0.35); kayak.add(paddle);
    kayak.userData.paddle = paddle;
    // 줄넘기: 양손에 손잡이, 두 손을 잇는 줄이 손 높이를 축으로 빙글 (머리 위 → 앞 → 발밑 → 뒤)
    const rope = new THREE.Group(); const arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.015, 4, 40, Math.PI), mat('#e2603d')); arc.scale.set(0.34, 1.05, 1); rope.add(arc);
    for (const sx of [-0.34, 0.34]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), mat('#2f7a96')); h.position.set(sx, 0, 0); rope.add(h); }
    rope.position.set(0, 0.82, 0.12);
    const quilt = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6, 6, 4), new THREE.MeshStandardMaterial({ color: '#e8b54a', side: THREE.DoubleSide })); quilt.position.set(0, 1.0, 0.55); quilt.rotation.x = -0.3;
    const disc = new THREE.Group(); disc.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 16), mat('#e2603d'), 1, 1, 1, 0, -0.08, 0.05));
    const shellProp = new THREE.Group(); const sh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f4c7c0')); sh.scale.y = 0.6; sh.position.set(0, -0.08, 0.06); shellProp.add(sh);
    this.shellProp = shellProp;
    const spool = new THREE.Group(); spool.add(mesh(G.cyl, mat('#c9a86a'), 0.05, 0.12, 0.05, 0, -0.06, 0.02));
    const shovel = new THREE.Group(); shovel.add(mesh(G.cyl, mat('#e8b54a'), 0.015, 0.25, 0.015, 0, -0.1, 0)); shovel.add(mesh(G.box, mat('#e8b54a'), 0.1, 0.12, 0.02, 0, -0.26, 0.02));
    this.camp = { roast: hand(skewer), chop: hand(axe), fish: hand(rod), bugs: hand(net), cook: hand(spoon2), grill: hand(tongs), guitar, pot, badminton: hand(racket), catchball: hand(glove), bubbles: hand(wand),
      shells: hand(shellProp), bike: onBody(bike), kayak: onBody(kayak), jumprope: onBody(rope), shake: onBody(quilt), frisbee: hand(disc), kite: hand(spool), sandcastle: hand(shovel) };
    this.rope = rope; this.kayakG = kayak; this.quilt = quilt;

    // 명상할 때 은은한 빛 고리
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.62, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;
    body.add(aura);
    this.aura = aura;
    // 명상: 머리 뒤 두광, 몸 둘레로 천천히 떠오르는 빛 알갱이, 바닥에 핀 연꽃잎
    const glow = (c, o = 0) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    // 두광: 어느 쪽에서 봐도 둥글게 보이도록 늘 카메라를 보는 그림(스프라이트)
    if (!HALO_TEX) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g2 = c.getContext('2d');
      const rg = g2.createRadialGradient(128, 128, 10, 128, 128, 126);
      rg.addColorStop(0, 'rgba(255, 236, 170, 0.95)'); rg.addColorStop(0.55, 'rgba(255, 207, 106, 0.45)'); rg.addColorStop(1, 'rgba(255, 190, 80, 0)');
      g2.fillStyle = rg; g2.fillRect(0, 0, 256, 256);
      g2.strokeStyle = 'rgba(255, 244, 200, 0.9)'; g2.lineWidth = 5; g2.beginPath(); g2.arc(128, 128, 96, 0, Math.PI * 2); g2.stroke();
      HALO_TEX = new THREE.CanvasTexture(c); HALO_TEX.colorSpace = THREE.SRGBColorSpace;
    }
    const halo = new THREE.Group();
    const haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO_TEX, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    haloSprite.scale.set(1.45, 1.45, 1);
    halo.add(haloSprite, haloSprite.clone());
    halo.children[1].material = haloSprite.material.clone();
    halo.position.set(0, 0.32, -0.12);
    this.head.add(halo);
    const motes = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.025 + (i % 3) * 0.008, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffc94a', transparent: true, opacity: 0, depthWrite: false }));
      m.userData = { a: (i / 14) * Math.PI * 2, r: 0.45 + (i % 4) * 0.08, ph: (i * 0.37) % 1 };
      motes.add(m);
    }
    body.add(motes);
    const petals = new THREE.Group();
    const petalGeo = new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    petalGeo.scale(0.55, 0.35, 1.25);
    for (let i = 0; i < 10; i++) {
      const pm = new THREE.Mesh(petalGeo, new THREE.MeshStandardMaterial({ color: i % 2 ? '#f4b3c2' : '#fbd7df', transparent: true, opacity: 0, roughness: 0.6 }));
      const a = (i / 10) * Math.PI * 2;
      pm.position.set(Math.sin(a) * 0.62, 0.04, Math.cos(a) * 0.62);
      pm.rotation.set(0.35, a, 0);
      petals.add(pm);
    }
    body.add(petals);
    this.medFx = { halo, motes, petals, k: 0 };

    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // 동작 시작. 같은 반복 동작을 다시 누르면 멈춘다
  // 표정 바꾸기: 눈 · 입 모양을 잠깐 바꿔요 (blocky 캐릭터만)
  setFace(id) { this.faceId = id; this.faceT = 4; }
  stepFace(dt) {
    if (!this.eyes || !this.mouth) return;
    if (this.faceT > 0) this.faceT -= dt; else this.faceId = null;
    const f = this.faceId, m = this.mouth;
    m.userData.base ??= { sx: m.scale.x, sy: m.scale.y, y: m.position.y };
    const B = m.userData.base;
    // 입: 웃음은 넓게, 크게 웃기는 크게 벌리고, 놀람은 동그랗게, 시무룩은 좁게 내려가요
    const mouth = { smile: [1.5, 1.4, 0], laugh: [1.6, 4.5, -0.02], wow: [0.7, 3.2, -0.02], sad: [0.8, 1, -0.015], sleepy: [0.6, 1, 0], love: [1.3, 1.6, 0] }[f] || [1, 1, 0];
    m.scale.x = lerp(m.scale.x, B.sx * mouth[0], Math.min(1, dt * 10)); m.scale.y = lerp(m.scale.y, B.sy * mouth[1], Math.min(1, dt * 10)); m.position.y = lerp(m.position.y, B.y + mouth[2], Math.min(1, dt * 10));
    // 눈: 웃으면 반달, 졸리면 감기, 놀라면 커지고, 좋아요는 분홍
    const eye = { smile: 0.4, laugh: 0.18, wow: 1.4, sad: 0.75, sleepy: 0.15, love: 1.1 }[f] ?? null;
    if (eye != null && this.action !== 'nap') for (const e of this.eyes) { e.scale.y = lerp(e.scale.y, 0.09 * eye, Math.min(1, dt * 10)); }
    for (const e of this.eyes) e.material.color.set(f === 'love' ? '#e8607a' : '#1d1a18');
  }

  play(action) {
    if (this.action === action) { this.action = null; return false; }
    this.action = action;
    this.actionT = 0;
    this.bowCount = 0;
    return true;
  }

  stop() { this.action = null; }

  update(dt, actionDefs) {
    this.actionT += dt;
    const def = this.action && actionDefs.find((a) => a.id === this.action);
    if (def && def.dur && this.actionT > def.dur) this.action = null;
    if (this.action === 'bae108') {
      const n = Math.floor(this.actionT / 4.2);
      if (n !== this.bowCount) { this.bowCount = n; this.onBow?.(n); }
      if (n >= 108) this.action = null;
    }

    // 발우공양·독서는 앉아 있을 때만: 일어나거나 다른 장소로 가면 밥그릇·책을 내려놓는다
    if (SEATED_ONLY.has(this.action) && !this.seated) this.action = null;
    let target = this.seated ? (this.block ? SIT_BLOCK : SIT) : STAND;
    if (this.action) {
      if (this.speed > 0.2 && !MOVING.has(this.action)) { this.action = null; for (const g of Object.values(this.camp)) g.visible = false; }   // 탑돌이 · 곤충 잡기 · 비눗방울은 걸으면서 하는 동작
      else if (this.action === 'shells' && this.speed > 0.2) { /* 걸을 때는 줍기 자세 없이 */ }
      else target = actionPose(this.action, this.actionT, target, this.seated);
    }

    // 걷기: 다리와 팔을 흔든다
    if (!this.seated && this.speed > 0.05 && !['bike', 'kayak'].includes(this.action)) {   // 자전거 · 카약은 걷는 다리 흔들기 없이
      // 뛸 때(빠를 때)는 보폭이 커지고 몸을 앞으로 숙이며 팔을 굽혀 크게 흔든다
      const run = Math.min(1, Math.max(0, (this.speed - 3.2) / 1.6));
      this.walkPhase += dt * (6 + Math.min(this.speed, 3.2) * 2.5 + run * 4);
      const s = Math.sin(this.walkPhase) * Math.min(1, this.speed / 2) * (0.6 + run * 0.35);
      target = { ...target, hip: target.hip + run * 0.22, head: target.head - run * 0.12,
        lL: [s, 0], lR: [-s, 0], ...(this.action ? {} : { aL: [-s * (0.8 + run * 0.5) - run * 0.5, 0.1], aR: [s * (0.8 + run * 0.5) - run * 0.5, -0.1] }) };   // 동작 중에 걸으면 팔은 동작 그대로
    }
    this.running = !this.seated && this.speed > 4;
    // 점프하는 동안: 두 팔을 번쩍 들고 다리를 굽힌다
    if (this.airborne && !this.seated) target = { ...target, hip: -0.05, head: -0.1, lL: [-0.75, 0.1], lR: [0.45, -0.1], aL: [-2.6, 0.35], aR: [-2.6, -0.35] };

    // 처음 나타날 때는 자세를 바로 맞춘다 (앉아 있던 사람이 서 있다가 앉는 모습 방지)
    const k = this.fresh ? 1 : Math.min(1, dt * 9);
    this.fresh = false;
    const p = this.pose;
    for (const key of KEYS) p[key] = lerp(p[key], target[key], k);
    for (const key of LIMBS) { p[key][0] = lerp(p[key][0], target[key][0], k); p[key][1] = lerp(p[key][1], target[key][1], k); }

    const bob = !this.seated && this.speed > 0.05 ? Math.abs(Math.sin(this.walkPhase)) * (this.running ? 0.09 : 0.04) : 0;
    const breathe = Math.sin(performance.now() / 900) * 0.006;
    this.body.position.y = p.y * this.sitK + bob;   // 다리가 짧은 체형은 앉을 때 덜 내려가요
    // 낮잠: 몸을 뒤로 눕혀요 (발은 제자리, 머리는 뒤쪽)
    const lieT = ['nap', 'hammock', 'stargaze'].includes(this.action) ? 1 : 0;
    this.lieK = lerp(this.lieK || 0, lieT, Math.min(1, dt * 3));
    this.body.rotation.x = -this.lieK * Math.PI / 2;
    // 줄넘기 줄 돌리기 · 카약 노 젓기 · 이불 펄럭
    if (this.rope.visible) {
      // 줄 크기는 키에 맞춰요: 손 높이를 축으로, 머리 위와 발밑을 넉넉히 지나가게
      this.group.updateMatrixWorld(true);
      const base = this.group.position.y, hand = this.armR.localToWorld(new THREE.Vector3(0, this.handY, 0)).y - base, top = this.head.localToWorld(new THREE.Vector3(0, 0.5, 0)).y - base;
      const sc = this.group.scale.y || 1, r = (Math.max(hand, top - hand) + 0.15) / sc;
      this.rope.position.y = hand / sc; this.rope.scale.set(1, r / 1.05, r / 1.05);
      this.rope.rotation.x = (this.actionT / 0.6) * Math.PI * 2;
    }
    if (this.kayakG.visible) this.kayakG.userData.paddle.rotation.x = Math.sin(this.actionT * 2.6) * 0.6;
    if (this.quilt.visible) this.quilt.rotation.x = -0.3 + Math.sin(this.actionT * 11) * 0.25;
    this.body.rotation.y = this.action === 'dance' ? Math.sin(performance.now() / 260) * 0.35 : 0;   // 춤: 몸을 좌우로 비틀기
    this.body.rotation.z = this.action === 'hammock' ? Math.sin(performance.now() / 900) * 0.18 * this.lieK : 0;   // 해먹은 좌우로 흔들흔들
    this.body.position.y += this.lieK * 0.18;
    this.hips.rotation.x = p.hip;
    this.hips.scale.y = this.torsoY * (1 + breathe);
    this.head.rotation.x = p.head;
    this.armL.rotation.set(p.aL[0], 0, p.aL[1]);
    this.armR.rotation.set(p.aR[0], 0, p.aR[1]);
    this.legL.rotation.set(p.lL[0], 0, p.lL[1]);
    this.legR.rotation.set(p.lR[0], 0, p.lR[1]);
    // 앉았을 때 치마 자락이 무릎을 덮도록 넓힌다
    if (this.skirt) {
      const sd = this.skirt.userData;
      this.skirt.scale.x = lerp(this.skirt.scale.x, this.seated ? sd.sx * 1.5 : sd.sx, k);
      this.skirt.scale.z = lerp(this.skirt.scale.z, this.seated ? sd.sz * 1.5 : sd.sz, k);
      this.skirt.scale.y = lerp(this.skirt.scale.y, this.seated ? 0.14 : sd.h, k);
      this.skirt.position.y = lerp(this.skirt.position.y, this.seated ? -0.05 : sd.y, k);
    }
    this.updatePet(dt);

    this.beads.visible = this.action === 'beads';
    // 염주: 1초에 한 알씩, 엄지로 넘기듯 톡 넘어가고 잠시 멈춘다 (16알, 한 바퀴 16초)
    if (this.beads.visible) {
      const t = this.actionT, n = Math.floor(t), f = t - n;
      this.beads.rotation.z = (n + Math.min(1, f / 0.25)) * (Math.PI * 2 / 16);
    }
    this.moktak.visible = this.stick.visible = this.action === 'moktak';
    this.jukbi.visible = this.action === 'jukbi';
    this.bowl.visible = (this.action === 'eat' || this.action === 'wash') && this.seated;
    this.spoon.visible = this.action === 'eat' && this.seated;
    this.cup.visible = this.action === 'tea';
    this.paper.visible = this.brush.visible = this.action === 'sagyeong' && this.seated;
    this.broom.visible = this.action === 'sweep';
    for (const [k, g] of Object.entries(this.camp)) g.visible = this.action === k || (k === 'pot' && (this.action === 'cook' || this.action === 'grill'));
    if (this.action === 'shells') this.shellProp.visible = this.actionT > 0.9 && this.actionT < 3.6 && this.speed < 0.2;   // 주운 뒤 들어 보일 때만
    // 표정: 4초 동안 (그 뒤 원래 얼굴로)
    this.stepFace(dt);
    // 돌탑: 한 번 올릴 때마다 한 층씩 (다섯 층 다 쌓으면 다시 처음부터)
    this.cairn.visible = this.action === 'stones';
    if (this.cairn.visible) {
      // 돌 세 개까지: 2.4초마다 하나씩 (main.js 가 세 개 다 쌓으면 옆으로 옮겨 가요)
      const n = Math.floor(this.actionT / 2.4), u = this.actionT % 2.4;
      const shown = Math.min(3, n + (u > 1.3 ? 1 : 0));
      this.cairn.children.forEach((st, i) => { st.visible = i < shown; });
      this.handStone.visible = u > 0.1 && u < 1.3 && n < 3;
    } else this.handStone.visible = false;
    this.log.visible = this.action === 'bell';
    this.cloth.visible = this.action === 'wash' && this.seated;
    this.book.visible = this.action === 'read' && this.seated;
    // 내 방은 책상 위에 올려놓도록 조금 높게 (main.js 가 propLift 를 정해요)
    this.paper.position.y = 0.16 + (this.propLift || 0); this.book.position.y = 0.2 + (this.propLift || 0);
    const auraOn = this.action === 'meditate';
    this.aura.material.opacity = lerp(this.aura.material.opacity, auraOn ? 0.45 + Math.sin(performance.now() / 500) * 0.15 : 0, k);
    this.aura.scale.setScalar(1 + Math.sin(performance.now() / 700) * 0.06);
    const fx = this.medFx, now = performance.now() / 1000;
    // 명상하면 눈을 감아요 (가는 선)
    if (this.eyes && !this.faceId) { const sy = auraOn || this.action === 'nap' ? 0.18 : 1; for (const e of this.eyes) { e.scale.y = lerp(e.scale.y, 0.09 * sy, Math.min(1, dt * 4)); e.position.y = e.userData.y0 ??= e.position.y; if (auraOn) e.position.y = e.userData.y0 - 0.02; } }
    fx.k = lerp(fx.k, auraOn ? 1 : 0, Math.min(1, dt * 2));
    const on = fx.k > 0.01;
    fx.halo.visible = fx.motes.visible = fx.petals.visible = on;
    if (on) {
      const breath = 0.5 + 0.5 * Math.sin(now * 1.2);   // 숨 쉬듯 밝아졌다 흐려졌다
      fx.halo.children[0].material.opacity = fx.k * (0.75 + 0.25 * breath);
      fx.halo.children[1].material.opacity = 0;
      fx.halo.scale.setScalar(0.95 + 0.08 * breath);
      for (const m of fx.motes.children) {
        const u = (now * 0.18 + m.userData.ph) % 1, a = m.userData.a + now * 0.25;
        m.position.set(Math.sin(a) * m.userData.r * (1 - u * 0.4), 0.1 + u * 1.7, Math.cos(a) * m.userData.r * (1 - u * 0.4));
        m.material.opacity = fx.k * Math.sin(u * Math.PI) * 0.85;
      }
      fx.petals.children.forEach((pm, i) => { pm.material.opacity = fx.k; pm.scale.setScalar(Math.min(1, fx.k * 1.3) * (0.92 + 0.08 * Math.sin(now * 1.2 + i))); });
    }
  }

  // 친구는 주인의 왼쪽 뒤를 졸졸 따라오고, 주인이 앉으면 방석 옆에 앉는다
  updatePet(dt) {
    const pet = this.pet;
    if (!pet) return;
    const parent = this.group.parent;
    if (!parent) return;
    if (pet.parent !== parent) parent.add(pet);
    pet.visible = this.group.visible;
    const g = this.group, ry = g.rotation.y;
    const lx = (this.seated ? 0.85 : 0.72) * (pet.userData.side || 1), lz = this.seated ? 0.15 : -0.45 * (pet.userData.back || 1);
    const tx = g.position.x + lx * Math.cos(ry) + lz * Math.sin(ry);
    const tz = g.position.z - lx * Math.sin(ry) + lz * Math.cos(ry);
    const before = pet.position.clone();
    // 주인이 장소를 옮겨 멀리 떨어지면(문을 지나거나 앉으러 순간 이동) 따라 걷지 않고 바로 옆으로 온다
    const far = Math.hypot(tx - pet.position.x, tz - pet.position.z) > 5;
    const kk = this.petFresh || far ? 1 : Math.min(1, dt * 4);
    this.petFresh = false;
    pet.position.x += (tx - pet.position.x) * kk;
    pet.position.z += (tz - pet.position.z) * kk;
    const moved = Math.hypot(pet.position.x - before.x, pet.position.z - before.z) / Math.max(dt, 1e-4);
    const t = performance.now() / 1000;
    const hover = pet.userData.hover;
    // 주인이 발우공양을 하면 친구 앞에도 작은 밥그릇이 놓이고, 친구가 고개를 숙여 먹는다
    const eating = this.action === 'eat' && this.seated;
    if (eating && !pet.userData.bowl) {
      const b = new THREE.Group();
      b.add(mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.09, 16), mat('#4a2418', { roughness: 0.3 })));
      const rice = mesh(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f6f2e6'), 1, 0.5, 1, 0, 0.04, 0);
      b.add(rice);
      b.position.set(0, 0.045, 0.55);
      pet.add(b);
      pet.userData.bowl = b;
    }
    if (pet.userData.bowl) pet.userData.bowl.visible = eating;
    const inner = pet.children[0];
    if (inner) inner.rotation.x = eating ? 0.18 + Math.max(0, Math.sin(t * 3.2)) * 0.22 : 0;
    pet.position.y = eating ? (hover ? 0.3 : 0) : hover ? 0.95 + Math.sin(t * 2.4) * 0.06 : moved > 0.3 ? Math.abs(Math.sin(t * 11)) * 0.07 : 0;
    if (pet.userData.bowl) pet.userData.bowl.position.y = 0.045 - pet.position.y;
    const want = moved > 0.3 ? Math.atan2(pet.position.x - before.x, pet.position.z - before.z) : ry;
    const diff = Math.atan2(Math.sin(want - pet.rotation.y), Math.cos(want - pet.rotation.y));
    pet.rotation.y += diff * Math.min(1, dt * 6);
    for (const f of pet.userData.anim) f(t);
    pet.userData.legs?.forEach((l, i) => { l.rotation.x = moved > 0.3 ? Math.sin(t * 14 + i * 1.6) * 0.5 : 0; });
  }

  dispose() {
    this.pet?.removeFromParent();
    this.body?.traverse((o) => { if (o.isMesh && o.material?.vertexColors) o.geometry.dispose(); });
    this.tag?.material.map.dispose();
    this.tag?.material.dispose();
  }
}
