// 캠핑장 장소: 바깥 풍경(world.js buildExterior)은 그대로 쓰고, 법당 건물 · 탑 자리에 캠핑 시설을 놓아요.
// - 캠프 마당(in): 디자인마다 텐트 · 캠핑카 · 카바나, 가운데 모닥불과 둘러앉는 캠핑 의자(앉는 자리)
// - 물가(out): 같은 풍경에서 마당 앞쪽 끝, 물이 내려다보이는 자리. 낚시 의자와 잡은 것 담는 통
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildExterior, buildWaterside, buildCampRoom } from './world.js';
import { mat } from './avatar.js';

const box = (g, c, w, h, d, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

// 쉼터 모양: 디자인마다 고를 수 있어요 (텐트: 돔 · 티피, 캠핑카: 미니밴 · 모터홈, 카바나: 천막 카바나)
export const SHELTERS = {
  forest: [['dome', '돔 텐트'], ['teepee', '티피 텐트']],
  sea: [['minivan', '레트로 미니밴'], ['motorhome', '모터홈']],
  river: [['cabana', '천막 카바나']],
};
const lambert = (c, o = {}) => mat(c, { roughness: 0.85, ...o });
function guyLines(g, pts, top) { const m = new THREE.LineBasicMaterial({ color: '#d8d0c0' }); for (const p of pts) { const geo = new THREE.BufferGeometry().setFromPoints([top, p]); g.add(new THREE.Line(geo, m)); const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 0.2, 5), lambert('#b0b4b8')); peg.position.copy(p).setY(0.08); g.add(peg); } }
function lantern(g, x, y, z) { const l = new THREE.Group(); l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10), lambert('#2a2a2a'))); const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb74a', emissiveIntensity: 1.6, transparent: true, opacity: 0.9 })); glass.position.y = -0.14; l.add(glass); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.1, 10), lambert('#2a2a2a')); cap.position.y = 0.05; l.add(cap); l.position.set(x, y, z); g.add(l); const pl = new THREE.PointLight('#ffb74a', 2.2, 6, 1.6); pl.position.set(x, y - 0.2, z); g.add(pl); return l; }

function domeTent() {
  const g = new THREE.Group();
  // 몸통: 위아래로 살짝 눌린 돔 + 아래 진한 띠(바닥 시트) + 앞 전실(비 막이)
  const fly = lambert('#e2733a'), dark = lambert('#b9542a'), base = lambert('#3a3f45');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), fly); dome.scale.set(1.25, 0.82, 1); dome.castShadow = dome.receiveShadow = true; g.add(dome);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.02, 0.25, 32, 1, true), base); skirt.scale.set(1, 1, 0.8); skirt.position.y = 0.12; g.add(skirt);
  // 폴대 두 개가 엇갈려 지나가는 줄 (짙은 띠)
  for (const r of [0.55, -0.55]) { const pole = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.035, 6, 48, Math.PI), lambert('#2a2a2a')); pole.rotation.set(0, r, 0); pole.scale.set(1.25, 0.82, 1); g.add(pole); }
  // 앞 전실: 반원 덮개 + 말아 올린 문
  const vest = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 12, -Math.PI / 2, Math.PI, 0, Math.PI / 2), dark); vest.position.z = 1.6; vest.scale.set(1, 1.05, 1.1); vest.castShadow = true; g.add(vest);
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20, 0, Math.PI), lambert('#2a1d16')); door.position.set(0, 0.02, 3.25); g.add(door);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 10), dark); roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.55, 3.0); g.add(roll);
  // 꼭대기 환기창 · 옆 메쉬창
  const vent = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark); vent.position.y = 1.95; vent.scale.y = 0.4; g.add(vent);
  for (const sx of [-1, 1]) { const win = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), lambert('#2a2a2a', { side: THREE.DoubleSide })); win.position.set(sx * 2.6, 1.0, 0.6); win.rotation.y = sx * Math.PI / 2.4; g.add(win); }
  // 앞 타프 + 기둥 + 랜턴, 팩 줄
  const tarp = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.6, 8, 4), lambert('#3f6b55', { side: THREE.DoubleSide })); const tp = tarp.geometry.attributes.position; for (let i = 0; i < tp.count; i++) tp.setZ(i, -Math.abs(tp.getX(i)) * 0.18); tarp.geometry.computeVertexNormals(); tarp.rotation.x = -Math.PI / 2 + 0.22; tarp.position.set(0, 2.45, 4.6); tarp.castShadow = true; g.add(tarp);
  for (const x of [-2.5, 2.5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), lambert('#8a6a4a')); p.position.set(x, 1.15, 6.2); g.add(p); }
  lantern(g, 2.5, 2.0, 6.2);
  guyLines(g, [new THREE.Vector3(-3.6, 0, 7.2), new THREE.Vector3(3.6, 0, 7.2)], new THREE.Vector3(0, 2.3, 6.2));
  guyLines(g, [new THREE.Vector3(-3.4, 0, -2.4), new THREE.Vector3(3.4, 0, -2.4)], new THREE.Vector3(0, 1.8, -1));
  return g;
}

function teepee() {
  const g = new THREE.Group();
  const canvas = lambert('#efe6d2'), seam = lambert('#d9cdb4');
  // 원뿔 천: 10각, 세로 이음선, 아래 끝은 살짝 벌어지게
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.2, 10, 1, true), canvas); cone.position.y = 2.6; cone.castShadow = cone.receiveShadow = true; g.add(cone);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const ln = new THREE.Mesh(new THREE.BoxGeometry(0.03, 5.3, 0.03), seam); ln.position.set(Math.sin(a) * 1.3, 2.6, Math.cos(a) * 1.3); ln.rotation.set(Math.cos(a) * 0.46, 0, -Math.sin(a) * 0.46); g.add(ln); }
  // 꼭대기로 삐져나온 나무 장대 다발 + 작은 깃발
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.0, 6), lambert('#8a6a4a')); pole.position.set(Math.sin(a) * 0.18, 5.6, Math.cos(a) * 0.18); pole.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); g.add(pole); }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), lambert('#c9572a', { side: THREE.DoubleSide })); flag.position.set(0.3, 6.45, 0); g.add(flag);
  // 입구: 걷어 올린 천(세모 두 장) + 안 어둠 + 둘레 장식 띠
  const dark = new THREE.Mesh(new THREE.CircleGeometry(1.0, 3, Math.PI / 2 - 0.0, Math.PI * 2), lambert('#2a1d16')); dark.scale.set(0.8, 1.6, 1); dark.position.set(0, 0.9, 2.12); dark.rotation.x = -0.46; g.add(dark);
  for (const sx of [-1, 1]) { const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.4), lambert('#e3d7bd', { side: THREE.DoubleSide })); flap.position.set(sx * 0.62, 1.15, 2.0); flap.rotation.set(-0.46, sx * 0.5, sx * 0.25); g.add(flap); }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.25, 0.25, 10, 1, true), lambert('#c9572a')); band.position.y = 1.2; g.add(band);
  const band2 = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 0.12, 10, 1, true), lambert('#2f5d45')); band2.position.y = 2.1; g.add(band2);
  // 앞 러그 · 의자 · 깃발 줄(가랜드)
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), lambert('#c9a45c')); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 3.6); g.add(rug);
  const gl = new THREE.Group(); for (let i = 0; i < 9; i++) { const t = i / 8; const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 3), lambert(['#c9572a', '#e8b54a', '#2f7a96', '#3f6b55'][i % 4])); f.rotation.x = Math.PI; f.position.set(-2.4 + 4.8 * t, 2.6 - Math.sin(Math.PI * t) * 0.5, 2.6); gl.add(f); } g.add(gl);
  lantern(g, 1.8, 1.5, 3.0);
  return g;
}

function minivan() {
  const g = new THREE.Group();
  const sky = lambert('#8fc7d8', { roughness: 0.5 }), white = lambert('#f4f1ea', { roughness: 0.5 }), chrome = lambert('#c9ced3', { metalness: 0.6, roughness: 0.3 }), glass = lambert('#dff2f8', { roughness: 0.15, metalness: 0.2 });
  // 둥근 몸통: 위는 하늘색, 아래는 흰색 (RoundedBox 대신 상자 + 둥근 모서리 느낌의 원기둥)
  const body = new THREE.Group(); g.add(body);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 2.3), white); lower.position.y = 1.05; body.add(lower);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.2, 2.3), sky); upper.position.y = 2.2; body.add(upper);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.3, 20, 1, false, 0, Math.PI), white); nose.rotation.set(Math.PI / 2, 0, -Math.PI / 2); nose.position.set(2.6, 1.6, 0); nose.scale.set(1, 1, 0.55); body.add(nose);
  const vline = new THREE.Mesh(new THREE.BoxGeometry(5.25, 0.08, 2.34), chrome); vline.position.y = 1.62; body.add(vline);
  // 창: 앞 유리(크게), 옆 창 세 칸
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.9), glass); ws.position.set(3.2, 2.15, 0); ws.rotation.y = Math.PI / 2; ws.rotation.z = 0; body.add(ws);
  for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), glass); w.position.set(-1.7 + i * 1.35, 2.2, 1.16); body.add(w); }
  // 앞 V 무늬 · 동그란 전조등 · 범퍼
  for (const sz of [-0.7, 0.7]) { const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 14), lambert('#fff7d6', { emissive: '#fff0b0', emissiveIntensity: 0.4 })); hl.rotation.z = Math.PI / 2; hl.position.set(3.25, 1.25, sz); body.add(hl); }
  const vmark = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 16), chrome); vmark.rotation.y = Math.PI / 2; vmark.position.set(3.26, 1.6, 0); body.add(vmark);
  for (const x of [-2.65, 3.1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 2.4), chrome); b.position.set(x, 0.62, 0); body.add(b); }
  // 바퀴 (흰 휠캡)
  for (const x of [-1.7, 1.9]) for (const z of [-1.1, 1.1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 20), lambert('#222')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.48, z); g.add(w); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 16), white); cap.rotation.x = Math.PI / 2; cap.position.copy(w.position); g.add(cap); }
  // 팝업 지붕 텐트: 위로 비스듬히 열린 천
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.1), white); roof.position.set(-0.4, 2.86, 0); body.add(roof);
  // 팝업 지붕: 길이 방향으로 누운 세모 기둥(천막)이 지붕 위로 열려 있어요
  // 세모 단면을 직접 그려 길이 방향(x)으로 뽑아요: 바닥 너비 2.1, 높이 0.9
  const tri = new THREE.Shape([new THREE.Vector2(-1.05, 0), new THREE.Vector2(1.05, 0), new THREE.Vector2(0.15, 0.9)]);
  const popGeo = new THREE.ExtrudeGeometry(tri, { depth: 3.2, bevelEnabled: false }); popGeo.translate(0, 0, -1.6);
  const pop = new THREE.Mesh(popGeo, lambert('#e8b54a')); pop.rotation.y = Math.PI / 2; pop.position.set(-0.4, 2.92, 0); body.add(pop);
  // 옆으로 펼친 줄무늬 어닝 + 기둥 · 전구 줄
  for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 2.2), lambert(i % 2 ? '#f4f1ea' : '#e8b54a')); st.position.set(-1.6 + i * 0.6, 2.75, 2.25); st.rotation.x = 0.16; g.add(st); }
  for (const x of [-1.85, 1.55]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), chrome); p.position.set(x, 1.3, 3.3); g.add(p); }
  lantern(g, 1.55, 2.2, 3.3);
  g.rotation.y = 0;
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function motorhome() {
  const g = new THREE.Group();
  const white = lambert('#f4f1ea', { roughness: 0.5 }), teal = lambert('#2f7a96'), glass = lambert('#9fd0e3', { roughness: 0.15 });
  const box_ = (c, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), c); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  box_(white, 6.6, 2.7, 2.6, 0, 1.8, 0);           // 거실 칸
  box_(white, 1.8, 1.0, 2.5, 2.6, 3.55, 0);         // 운전석 위 침실
  box_(white, 1.4, 1.7, 2.5, 3.9, 1.4, 0);          // 운전석
  box_(teal, 6.62, 0.3, 2.62, 0, 1.35, 0); box_(lambert('#e8b54a'), 6.62, 0.1, 2.62, 0, 1.6, 0);
  box_(glass, 0.02, 0.8, 2.2, 4.61, 1.85, 0);
  for (const x of [-2.2, -0.6, 1.0]) box_(glass, 1.1, 0.75, 0.02, x, 2.35, 1.31);
  box_(lambert('#c9c3b6'), 0.9, 1.9, 0.02, 2.1, 1.55, 1.31);
  box_(lambert('#555'), 1.6, 0.4, 1.4, -1.2, 3.35, 0);   // 루프박스
  for (let i = 0; i < 6; i++) box_(lambert('#888'), 0.05, 0.05, 0.6, -3.32, 1.0 + i * 0.35, 0.8);   // 뒤 사다리
  for (const x of [-2.2, 2.6]) for (const z of [-1.2, 1.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 20), lambert('#222')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, z); g.add(w); }
  const awn = box_(lambert('#e8b54a'), 4.4, 0.06, 2.4, 0, 3.0, 2.4); awn.rotation.x = 0.18;
  for (const x of [-1.9, 1.9]) box_(lambert('#aaa'), 0.05, 2.8, 0.05, x, 1.4, 3.55);
  lantern(g, 1.9, 2.3, 3.55);
  return g;
}

function shelter(kind, variant) {
  if (kind === 'tent') return variant === 'teepee' ? teepee() : domeTent();
  if (kind === 'van') return variant === 'motorhome' ? motorhome() : minivan();
  return cabana();
}
function cabana() {
  const g = new THREE.Group();
  const box = (c, w, h, d, x, y, z, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  for (const x of [-2, 2]) for (const z of [-1.8, 1.8]) box('#8a6a4a', 0.16, 3.2, 0.16, x, 1.6, z);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4, 1), mat('#f2ece0', { roughness: 0.9 })); roof.rotation.y = Math.PI / 4; roof.position.y = 4.0; roof.castShadow = true; g.add(roof);
  for (const [x, z, ry] of [[0, -1.8, 0], [-2, 0, Math.PI / 2], [2, 0, Math.PI / 2]]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), mat('#f6f1e6', { side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); c.position.set(x, 1.6, z); c.rotation.y = ry; g.add(c); }
  box('#d9c7a6', 3.6, 0.3, 3.2, 0, 0.15, 0);
  box('#f4f1ea', 2.4, 0.35, 1.8, 0, 0.47, -0.4);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd77a' })); const t = i / 8; b.position.set(-2 + 4 * t, 3.1 - Math.sin(Math.PI * t) * 0.35, 1.9); g.add(b); }
  const glow = new THREE.PointLight('#ffcf80', 3, 9, 1.6); glow.position.set(0, 2.6, 0.8); g.add(glow);
  return g;
}

// 모닥불: 돌 둘레 · 장작 · 흔들리는 불꽃 · 따뜻한 빛
function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), mat('#8c877e')); s.position.set(Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85); s.scale.y = 0.7; s.castShadow = true; g.add(s); }
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.2, 8), mat('#5a3a24')); l.rotation.z = Math.PI / 2 - 0.35; l.rotation.y = (i / 4) * Math.PI * 2; l.position.y = 0.25; g.add(l); }
  const flames = [];
  for (const [s, c, y] of [[0.42, '#ff7a1a', 0.55], [0.3, '#ffb33a', 0.62], [0.17, '#fff1a0', 0.6]]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(s, s * 3, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 }));
    f.position.y = y + s; g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight('#ff9a4a', 6, 14, 1.4); light.position.y = 1.2; g.add(light);
  // 낮에는 꺼 두고(장작만), 어두워지면 불을 붙여요
  g.userData.lit = true;
  g.userData.setLit = (on) => { g.userData.lit = on; flames.forEach((f) => (f.visible = on)); light.visible = on; };
  g.userData.tick = (t) => {
    if (!g.userData.lit) return;
    flames.forEach((f, i) => { const k = 1 + Math.sin(t * (7 + i * 2.3) + i) * 0.12; f.scale.set(1 + Math.sin(t * 5 + i) * 0.06, k, 1); f.rotation.y = t * (0.6 + i * 0.4); });
    light.intensity = 5.5 + Math.sin(t * 9) * 0.8 + Math.sin(t * 13.7) * 0.5;
  };
  return { group: g, flames };
}

function campChair(color) {
  const g = new THREE.Group();
  box(g, color, 0.6, 0.06, 0.55, 0, 0.42, 0);
  const back = box(g, color, 0.6, 0.6, 0.06, 0, 0.75, -0.27); back.rotation.x = -0.2;
  for (const x of [-0.28, 0.28]) for (const z of [-0.24, 0.24]) box(g, '#2a2a2a', 0.03, 0.44, 0.03, x, 0.22, z);
  return g;
}

// ───────── 마당 곳곳 앉을 자리 ─────────
// 자리 하나마다 모양(g)에 seatId 를 달아 seats 에 넣어요. face: 앉은 사람이 바라보는 쪽(y 회전), y: 엉덩이 높이
function addSeat(root, seats, g, x, z, face, y = 0.4) {
  g.position.set(x, 0, z); g.rotation.y = face; root.add(g);
  g.traverse((o) => { if (o.isMesh) o.userData.seats = 'chair'; });
  g.userData.seatId = seats.length;
  seats.push({ id: seats.length, pos: new THREE.Vector3(x, 0, z), rot: face, y, mesh: g });
}
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
// (cx, cz) 에서 rot 만큼 돌린 자리의 (lx, lz) → 마당 좌표
const local = (cx, cz, rot, lx, lz) => [cx + lx * Math.cos(rot) + lz * Math.sin(rot), cz - lx * Math.sin(rot) + lz * Math.cos(rot)];
const WOOD = '#9a7048', WOOD_D = '#6e4c30';
function benchPart() { const g = new THREE.Group(); box(g, WOOD, 0.95, 0.07, 0.34, 0, 0.44, 0); for (const x of [-0.38, 0.38]) box(g, WOOD_D, 0.07, 0.42, 0.3, x, 0.21, 0); return g; }
function stump() { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.4, 12), mat('#7a5232')); m.position.y = 0.2; m.castShadow = true; g.add(m); const top = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), mat('#d8b48a')); top.rotation.x = -Math.PI / 2; top.position.y = 0.401; g.add(top); return g; }
function logSeat() { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.98, 10), mat('#6e4a2c')); m.rotation.z = Math.PI / 2; m.position.y = 0.26; m.castShadow = true; g.add(m); const top = box(g, '#c99d6e', 0.98, 0.03, 0.3, 0, 0.45, 0); top.castShadow = false; return g; }
function relaxChair(color) {   // 낮게 기대앉는 릴렉스 체어
  const g = new THREE.Group();
  const seat = box(g, color, 0.62, 0.05, 0.55, 0, 0.3, 0.02); seat.rotation.x = 0.12;
  const back = box(g, color, 0.62, 0.75, 0.05, 0, 0.62, -0.3); back.rotation.x = -0.4;
  for (const x of [-0.31, 0.31]) { const leg = box(g, '#2a2a2a', 0.03, 0.03, 0.9, x, 0.2, 0); leg.rotation.x = 0.35; const leg2 = box(g, '#2a2a2a', 0.03, 0.03, 0.9, x, 0.2, 0); leg2.rotation.x = -0.35; box(g, '#3a3a3a', 0.05, 0.04, 0.5, x, 0.48, 0.05); }
  return g;
}
function picnicTable(g, cx, cz, rot) {
  const t = new THREE.Group(); t.position.set(cx, 0, cz); t.rotation.y = rot; g.add(t);
  box(t, WOOD, 1.9, 0.07, 0.85, 0, 0.76, 0);
  for (const x of [-0.75, 0.75]) for (const s of [-1, 1]) { const l = box(t, WOOD_D, 0.07, 0.85, 0.07, x, 0.38, s * 0.22); l.rotation.x = s * 0.45; }
  for (const x of [-0.75, 0.75]) box(t, WOOD_D, 0.07, 0.06, 1.5, x, 0.3, 0);
  // 위에 랜턴 · 컵
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb74a', emissiveIntensity: 1.2 })); lamp.position.set(0.3, 0.9, 0); t.add(lamp);
  box(t, '#e8e2d6', 0.08, 0.1, 0.08, -0.4, 0.84, 0.15);
}
function roundTable(g, cx, cz, color = '#3a3f45') {
  const t = new THREE.Group(); t.position.set(cx, 0, cz); g.add(t);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20), mat('#d9cdb4')); top.position.y = 0.68; top.castShadow = true; t.add(top);
  for (let i = 0; i < 3; i++) { const l = box(t, color, 0.03, 0.72, 0.03, Math.sin(i * 2.1) * 0.35, 0.34, Math.cos(i * 2.1) * 0.35); l.rotation.set(Math.cos(i * 2.1) * 0.25, 0, -Math.sin(i * 2.1) * 0.25); }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.14, 12), mat('#c9572a')); pot.position.y = 0.78; t.add(pot);
}
function lowTable(g, cx, cz, rot) { const t = new THREE.Group(); t.position.set(cx, 0, cz); t.rotation.y = rot; g.add(t); box(t, WOOD, 0.9, 0.05, 0.55, 0, 0.36, 0); for (const x of [-0.38, 0.38]) for (const z of [-0.22, 0.22]) box(t, WOOD_D, 0.04, 0.34, 0.04, x, 0.17, z); box(t, '#2f7a96', 0.12, 0.12, 0.12, 0.2, 0.44, 0); }

// 마당 가구 놓기: 큰 탁자(피크닉 테이블) · 동그란 탁자 + 의자 셋 · 낮은 탁자 + 릴렉스 체어 둘 · 통나무 벤치 · 혼자 앉는 자리 몇 곳
function yardSeats(g, seats) {
  const blockers = [];
  const block = (x, z, w, d) => blockers.push({ minX: x - w, maxX: x + w, minZ: z - d, maxZ: z + d });
  // 피크닉 테이블: 양쪽 벤치에 둘씩
  { const [cx, cz, r] = [-11, 9, 0.5]; picnicTable(g, cx, cz, r); block(cx, cz, 0.55, 0.3);   // 벤치에 닿을 수 있게 탁자 가운데만 막아요
    for (const lx of [-0.48, 0.48]) for (const s of [-1, 1]) { const [x, z] = local(cx, cz, r, lx, s * 0.72); addSeat(g, seats, benchPart(), x, z, r + (s > 0 ? Math.PI : 0), 0.45); } }
  // 동그란 탁자 + 캠핑 의자 셋
  { const [cx, cz] = [11, 9]; roundTable(g, cx, cz); block(cx, cz, 0.6, 0.6);
    ['#e8b54a', '#2f7a96', '#a33b2a'].forEach((c, i) => { const a = i * 2.1 + 0.4, x = cx + Math.sin(a) * 1.0, z = cz + Math.cos(a) * 1.0; addSeat(g, seats, campChair(c), x, z, faceTo(x, z, cx, cz)); }); }
  // 낮은 탁자 + 릴렉스 체어 둘 (마당 바깥 풍경 쪽을 보며)
  { const [cx, cz] = [-13, -3]; lowTable(g, cx, cz, 0.3); block(cx, cz, 0.5, 0.4);
    for (const s of [-1, 1]) { const [x, z] = local(cx, cz, 0.3, s * 0.95, 0.15); addSeat(g, seats, relaxChair(s > 0 ? '#3f6b55' : '#c9822a'), x, z, faceTo(x, z, -40, 8), 0.32); } }
  // 통나무 벤치: 셋이 나란히 모닥불을 바라보며
  { const [cx, cz] = [-6.5, 12]; const r = faceTo(cx, cz, 0, 3);
    for (const lx of [-1, 0, 1]) { const [x, z] = local(cx, cz, r, lx, 0); addSeat(g, seats, logSeat(), x, z, r, 0.45); } }
  // 혼자 앉는 자리: 그루터기 둘, 풍경 보는 릴렉스 체어 둘, 캠핑 의자 하나
  for (const [x, z] of [[7, 13], [8.5, 12]]) addSeat(g, seats, stump(), x, z, faceTo(x, z, 0, 3), 0.4);
  addSeat(g, seats, relaxChair('#6b5a9a'), 15.5, -2, faceTo(15.5, -2, 40, -2), 0.32);
  addSeat(g, seats, relaxChair('#2f7a96'), -16, 14, faceTo(-16, 14, -30, 30), 0.32);
  addSeat(g, seats, campChair('#3f6b55'), 10, -8, faceTo(10, -8, 30, -20));
  return blockers;
}

const KIND = { forest: 'tent', sea: 'van', river: 'cabana' };
// 마당 바닥: 절 마당 돌판 대신 잔디와 흙길 (모래사장은 모래색)
const GROUND = {};
function groundMat(id) {
  if (GROUND[id]) return GROUND[id];
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const base = id === 'sea' ? '#e3d3a8' : id === 'river' ? '#5f7a4a' : '#7a9a54';
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const x = Math.random() * 512, y = Math.random() * 512; g.fillStyle = id === 'sea' ? `rgba(${Math.random() < 0.5 ? '255,255,255' : '150,120,70'},${Math.random() * 0.25})` : `rgba(${Math.random() < 0.5 ? '40,70,30' : '170,200,110'},${Math.random() * 0.35})`; g.fillRect(x, y, 2, id === 'sea' ? 2 : 5); }
  if (id !== 'sea') { g.fillStyle = 'rgba(150,115,70,.55)'; g.beginPath(); g.ellipse(256, 300, 120, 90, 0, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,90,50,${Math.random() * 0.4})`; g.fillRect(150 + Math.random() * 210, 230 + Math.random() * 150, 3, 3); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(4, 4);
  return (GROUND[id] = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
}
// 고른 쉼터 모양 (이 기기에 기억)
export const shelterOf = (locId) => { try { return localStorage.getItem(`campingjang:shelter:${locId}`) || SHELTERS[locId][0][0]; } catch { return SHELTERS[locId][0][0]; } };

// 캠프 마당 바탕 풍경: 산속 · 별밤은 큰법당과 같은 풍경 틀, 바닷가는 해수욕장 바로 뒤 모래밭
// (캠핑카는 바다 앞에: 앞으로 해변 · 등대 방파제, 뒤로 해송 모래언덕)
export function yardBase(loc) {
  if (loc.id !== 'sea') return buildExterior(loc);
  const w = buildWaterside(loc, 14);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(21, 48), mat('#e3d3a8')); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true; w.group.add(plaza);
  return { ...w, floor: plaza, hall: new THREE.Group(), pagodaSlot: new THREE.Group(), radius: 19.8, bounds: null, camRise: 0.3, camLookY: 1.6 };
}

// 캠프 마당
export function buildCampsite(loc) {
  const w = yardBase(loc);
  w.hall.visible = false;
  w.floor.material = groundMat(loc.id);
  const slot = new THREE.Group(); slot.position.set(0, 0, -11); w.group.add(slot);
  const setShelter = (v) => { slot.clear(); slot.add(shelter(KIND[loc.id], v)); slot.userData.v = v; };
  setShelter(shelterOf(loc.id));
  // 탑 자리 대신 가운데 모닥불, 둘레에 의자 8개
  w.pagodaSlot.visible = false;
  const fire = campfire(); fire.group.position.set(0, 0, 3); w.group.add(fire.group);
  const colors = ['#3f6b55', '#c9822a', '#2f7a96', '#a33b2a', '#6b5a9a', '#3f6b55', '#c9822a', '#2f7a96'];
  const seats = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, x = Math.sin(a) * 2.6, z = 3 + Math.cos(a) * 2.6;
    const ch = campChair(colors[i]); ch.position.set(x, 0, z); ch.rotation.y = a + Math.PI; w.group.add(ch);
    ch.traverse((o) => { if (o.isMesh) o.userData.seats = 'chair'; });
    ch.userData.seatId = i;
    seats.push({ id: i, pos: new THREE.Vector3(x, 0, z), rot: a + Math.PI, y: 0.4, mesh: ch });
  }
  const yardBlockers = yardSeats(w.group, seats);
  // 장작더미와 도끼 받침 (장작 패기 하러 오는 곳)
  const pile = new THREE.Group(); pile.position.set(-6.2, 0, -6.2); w.group.add(pile);
  const blockM = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.5, 12), mat('#7a5232')); blockM.position.y = 0.25; blockM.castShadow = true; pile.add(blockM);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5 - r; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.0, 8), mat(i % 2 ? '#8a5a34' : '#6e4a2c')); lg.rotation.x = Math.PI / 2; lg.position.set(-1.3 + i * 0.28 + r * 0.14, 0.13 + r * 0.24, -0.4); lg.castShadow = true; pile.add(lg); }
  yardBlockers.push({ minX: -7.8, maxX: -5.8, minZ: -7.0, maxZ: -5.8 });
  const baseUpdate = w.update;
  return {
    ...w,
    door: null,
    seats,
    flames: [],
    campfire: fire.group,
    setShelter,
    // 동작마다 걸어가서 하는 자리 (x, z, 바라보는 쪽, 옆으로 흩어지는 폭)
    spots: { chop: { x: -6.2, z: -5.3, rot: Math.PI }, fireworks: { x: 0, z: 11, rot: Math.PI, jx: 3 } },
    spawn: new THREE.Vector3(0, 0, 8.5), spawnRot: Math.PI,
    camDist: 7, camRise: 0.32, camLookY: 1.6,
    blockers: [{ minX: -3.4, maxX: 3.4, minZ: -14, maxZ: -8 }, { minX: -1.1, maxX: 1.1, minZ: 1.9, maxZ: 4.1 }, ...yardBlockers],
    walkPath: Array.from({ length: 24 }, (_, k) => { const a = (-2 * Math.PI * k) / 24; return new THREE.Vector3(5 * Math.sin(a), 0, 3 + 5 * Math.cos(a)); }),
    update: (t) => { baseUpdate?.(t); fire.group.userData.tick(t); },
  };
}

// 물가: 마당 앞으로 내려가면 나오는 물가 (산 · 계곡 / 바다 · 해수욕장 / 별밤 · 강가). 물을 바라보는 의자 셋과 잡은 것 담는 통
export function buildShore(loc) {
  const w = buildWaterside(loc), sz = w.bounds.maxZ;
  const seats = [];
  const chairs = loc.id === 'sea'
    ? [[-7.7, 8.6, '#e2603d'], [-6.3, 8.6, '#f4f1ea'], [8.6, 9.1, '#2f7a96']]
    : [[-2.6, sz - 1.2, '#3f6b55'], [0, sz - 1, '#c9822a'], [2.6, sz - 1.2, '#2f7a96']];
  chairs.forEach(([x, z, c], i) => {
    const ch = loc.id === 'sea' ? beachChair(c) : campChair(c);
    addSeat(w.group, seats, ch, x, z, 0, loc.id === 'sea' ? 0.3 : 0.4);
  });
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.4, 14), mat('#2f7a96')); if (loc.id === 'sea') bucket.position.set(-5.2, 0.2, 8.4); else bucket.position.set(1.3, 0.2, sz - 0.4); bucket.castShadow = true; w.group.add(bucket);
  if (loc.id === 'river') { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 8), mat('#5a3a24')); post.position.set(-4.2, 0.9, sz - 1); w.group.add(post); lantern(w.group, -4.2, 1.85, sz - 1); }
  return { ...w, seats, camDist: 7, camRise: 0.3, camLookY: 1.2, spots: { skip: { x: 0, z: sz - 0.1, rot: 0, jx: 4 }, splash: { x: 0, z: sz - 0.1, rot: 0, jx: 4 } } };
}
function beachChair(color) {   // 바닷가 접이식 비치 체어 (줄무늬 천)
  const g = relaxChair(color);
  const towel = box(g, '#f4f1ea', 0.5, 0.02, 0.4, 0, 0.34, 0.05); towel.rotation.x = 0.12;
  return g;
}

// 내 자리: 고른 쉼터 모양 그대로의 안 (돔 · 티피 텐트, 미니밴 · 모터홈, 카바나)
export function buildShelterRoom(loc) { return buildCampRoom(loc, shelterOf(loc.id)); }

// ───────── 취사장: 지붕 덮인 공동 취사장 (개수대 · 버너 조리대 · 긴 식탁 · 분리수거함) ─────────
function signTex(title, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#2f3a33'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#8a6a4a'; g.lineWidth = 18; g.strokeRect(0, 0, 512, 256);
  g.fillStyle = '#f4f1ea'; g.textAlign = 'center'; g.font = '400 92px "Ownglyph_UNZ-Rg", sans-serif'; g.fillText(title, 256, 128);
  g.font = '400 40px "Ownglyph_UNZ-Rg", sans-serif'; g.fillStyle = '#e8d8a8'; g.fillText(sub, 256, 200);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function buildCampKitchen(loc) {
  const w = yardBase(loc);
  w.hall.visible = false; w.pagodaSlot.visible = false;
  w.floor.material = groundMat(loc.id);
  const g = new THREE.Group(); g.position.set(0, 0, -3); w.group.add(g);
  const steel = mat('#c9ced3', { metalness: 0.6, roughness: 0.3 }), post = mat('#6e4c30'), roofM = mat('#3f6b55');
  // 바닥 콘크리트 · 기둥 · 지붕 (가운데가 높은 박공)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 8.5), mat('#b9b2a4', { roughness: 0.95 })); slab.position.y = 0.04; slab.receiveShadow = true; g.add(slab);
  for (const x of [-5.6, 0, 5.6]) for (const z of [-4, 4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), post); p.position.set(x, 1.7, z); p.castShadow = true; g.add(p); }
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.12, 4.9), roofM); r.position.set(0, 3.75, s * 2.3); r.rotation.x = s * 0.2; r.castShadow = true; g.add(r); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.2, 0.2), post); beam.position.set(0, 4.2, 0); g.add(beam);
  for (const z of [-4, 4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.18, 0.18), post); b.position.set(0, 3.35, z); g.add(b); }
  // 뒤쪽 긴 조리대: 왼쪽 개수대 셋, 오른쪽 버너 둘
  const counter = new THREE.Mesh(new THREE.BoxGeometry(10, 0.9, 0.8), mat('#8a6a4a')); counter.position.set(0, 0.45, -3.5); counter.castShadow = true; g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(10.1, 0.06, 0.86), steel); top.position.set(0, 0.93, -3.5); g.add(top);
  for (const x of [-4, -2.7, -1.4]) {
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.55), mat('#8f969c', { metalness: 0.7, roughness: 0.2 })); sink.position.set(x, 0.95, -3.45); g.add(sink);
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), steel); tap.position.set(x, 1.12, -3.8); g.add(tap);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), steel); spout.position.set(x, 1.28, -3.7); g.add(spout);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(10, 1.3, 0.08), mat('#e8e2d6')); back.position.set(0, 1.6, -3.92); g.add(back);
  for (const x of [1.2, 2.8]) {
    const burner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.6), mat('#2a2a2a')); burner.position.set(x, 1.0, -3.45); g.add(burner);
    for (const dx of [-0.25, 0.25]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16), steel); ring.rotation.x = Math.PI / 2; ring.position.set(x + dx, 1.07, -3.45); g.add(ring); }
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.24, 16), steel); pot.position.set(0.95, 1.2, -3.45); g.add(pot);
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mat('#c9572a', { metalness: 0.3 })); kettle.position.set(2.55, 1.2, -3.45); g.add(kettle);
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.05, 16), mat('#2a2a2a')); pan.position.set(3.05, 1.12, -3.45); g.add(pan);
  // 선반 · 걸린 냄비 · 그릇 건조대
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.05, 0.35), mat('#a07a50')); shelf.position.set(0, 2.15, -3.75); g.add(shelf);
  for (let i = 0; i < 9; i++) { const x = -4.2 + i * 1.05, c = ['#f2ece0', '#2f7a96', '#e8b54a', '#a33b2a'][i % 4]; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.12, 12), mat(c)); b.position.set(x, 2.24, -3.72); g.add(b); }
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.06, 14), steel); p.rotation.x = Math.PI / 2; p.position.set(3.4 + i * 0.35, 1.75, -3.85); g.add(p); }
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: '#d9dde0', wireframe: true })); rack.position.set(-0.6, 1.15, -3.45); g.add(rack);
  for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 14), mat('#f2ece0')); d.rotation.x = Math.PI / 2; d.position.set(-0.95 + i * 0.17, 1.15, -3.45); g.add(d); }
  // 표지판
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: signTex('취사장', '설거지는 개수대에서') })); sign.position.set(-2.7, 2.8, -3.85); g.add(sign);
  // 분리수거함 셋
  [['#2f7a96', '플라스틱'], ['#3f6b55', '캔 · 병'], ['#c9822a', '종이']].forEach(([c], i) => { const bin = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.85, 0.55, 3, 0.06), mat(c)); bin.position.set(5.0, 0.45, 1.6 - i * 0.75); bin.castShadow = true; g.add(bin); const lid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.57), mat('#2a2a2a')); lid.position.set(5.0, 0.9, 1.6 - i * 0.75); g.add(lid); });
  // 물통 · 아이스박스
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16), mat('#2f7a96')); tank.position.set(-5.0, 0.3, -2.6); g.add(tank);
  const cooler = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.45, 0.45, 3, 0.05), mat('#e2603d')); cooler.position.set(-5.0, 0.23, -1.6); g.add(cooler);
  const clid = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.08, 0.47, 2, 0.03), mat('#f4f1ea')); clid.position.set(-5.0, 0.48, -1.6); g.add(clid);
  // 긴 식탁 둘 (벤치 자리 8개씩)
  const seats = [];
  const blockers = [{ minX: -5.2, maxX: 5.2, minZ: -7, maxZ: -6.1 }];
  for (const tz of [-1.0, 2.0]) {
    const tbl = new THREE.Group(); tbl.position.set(0, 0, tz); g.add(tbl);
    box(tbl, '#9a7048', 5.2, 0.08, 1.0, 0, 0.76, 0);
    for (const x of [-2.2, 2.2]) for (const z of [-0.35, 0.35]) box(tbl, '#6e4c30', 0.08, 0.76, 0.08, x, 0.38, z);
    // 식탁 위 컵 · 양념통 · 랜턴
    for (let i = 0; i < 4; i++) box(tbl, ['#f2ece0', '#e8b54a', '#a33b2a', '#2f7a96'][i], 0.08, 0.12, 0.08, -1.8 + i * 1.2, 0.86, (i % 2 ? 0.2 : -0.2));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb74a', emissiveIntensity: 1.2 })); lamp.position.set(0, 0.92, 0); tbl.add(lamp);
    blockers.push({ minX: -2.6, maxX: 2.6, minZ: tz - 3 - 0.5, maxZ: tz - 3 + 0.5 });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = -1.8 + i * 1.2, z = tz - 3 + s * 0.85;
      addSeat(w.group, seats, benchPart(), x, z, s > 0 ? Math.PI : 0, 0.45);
    }
  }
  seats.forEach((st) => (st.y = 0.45));
  // 전구 줄 · 밤 불빛
  for (const z of [-4, 4]) fairy(g, -5.6, 5.6, 3.25, z);
  for (const x of [-3, 3]) { const l = new THREE.PointLight('#ffcf8a', 3, 10, 1.5); l.position.set(x, 3.0, 0); g.add(l); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    ...w,
    door: null, seats,
    spawn: new THREE.Vector3(0, 0, 6), spawnRot: Math.PI,
    camDist: 6, camRise: 0.2, camLookY: 1.3,   // 지붕 아래에서 식탁 · 조리대가 보이게 낮게
    blockers,
    walkPath: null,
    // 요리 · 고기 굽기는 버너 앞, 설거지는 개수대 앞, 청소는 분리수거함 앞
    spots: { cook: { x: 1.2, z: -5.55, rot: Math.PI, jx: 0.3 }, grill: { x: 2.8, z: -5.55, rot: Math.PI, jx: 0.3 }, wash: { x: -2.7, z: -5.55, rot: Math.PI, jx: 2.4 }, sweep: { x: 4.2, z: -2.15, rot: Math.PI / 2, jx: 0 } },
  };
}
function fairy(g, x0, x1, y, z) {
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff1c0', emissive: '#ffcf6a', emissiveIntensity: 1.6 });
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, x = x0 + (x1 - x0) * t, yy = y - Math.sin(Math.PI * ((t * 2) % 1)) * 0.25; pts.push(new THREE.Vector3(x, yy, z)); const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bulb); b.position.set(x, yy - 0.05, z); g.add(b); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#3a2a20' })));
}
