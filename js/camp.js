// 캠핑장 장소: 바깥 풍경(world.js buildExterior)은 그대로 쓰고, 법당 건물 · 탑 자리에 캠핑 시설을 놓아요.
// - 캠프 마당(in): 디자인마다 텐트 · 캠핑카 · 카바나, 가운데 모닥불과 둘러앉는 캠핑 의자(앉는 자리)
// - 물가(out): 같은 풍경에서 마당 앞쪽 끝, 물이 내려다보이는 자리. 낚시 의자와 잡은 것 담는 통
import * as THREE from 'three';
import { buildExterior } from './world.js';
import { mat } from './avatar.js';

const box = (g, c, w, h, d, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

// 디자인마다 다른 쉼터. 앞면이 +z (마당 가운데 쪽)
function shelter(kind) {
  const g = new THREE.Group();
  if (kind === 'tent') {
    // 돔 텐트 + 앞 타프
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e07a3a', { roughness: 0.8 }));
    dome.scale.set(1.3, 0.9, 1); dome.castShadow = true; g.add(dome);
    for (const r of [-0.5, 0.5]) { const pole = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.03, 6, 32, Math.PI), mat('#2a2a2a')); pole.rotation.set(0, Math.PI / 2 + r, 0); pole.scale.set(1, 0.9, 1.3); g.add(pole); }
    const door = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20, 0, Math.PI), mat('#3a2a20')); door.position.set(0, 0.01, 2.58); g.add(door);
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.4), mat('#3f6b55', { side: THREE.DoubleSide })); tarp.rotation.x = -Math.PI / 2 + 0.25; tarp.position.set(0, 2.5, 3.8); tarp.castShadow = true; g.add(tarp);
    for (const x of [-2.4, 2.4]) box(g, '#5a3d2a', 0.08, 2.2, 0.08, x, 1.1, 5.3);
  } else if (kind === 'van') {
    // 캠핑카: 흰 몸통 · 바다색 띠 · 창 · 바퀴 · 펼친 어닝
    box(g, '#f4f1ea', 6.4, 2.6, 2.6, 0, 1.7, 0);
    box(g, '#f4f1ea', 1.6, 0.7, 2.5, -2.4, 3.3, 0);
    box(g, '#2f7a96', 6.42, 0.35, 2.62, 0, 1.2, 0);
    box(g, '#9fd0e3', 1.2, 0.8, 0.02, -1.6, 2.2, 1.31, { emissive: '#3a5a66', emissiveIntensity: 0.3 });
    box(g, '#9fd0e3', 1.2, 0.8, 0.02, 0.6, 2.2, 1.31, { emissive: '#3a5a66', emissiveIntensity: 0.3 });
    box(g, '#c9c3b6', 0.9, 1.8, 0.02, 2.2, 1.5, 1.31);
    for (const x of [-2.2, 2.0]) for (const z of [-1.2, 1.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16), mat('#222')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.45, z); g.add(w); }
    const awn = box(g, '#e8b54a', 4.2, 0.06, 2.4, 0.6, 3.0, 2.4); awn.rotation.x = 0.18;
    for (let i = 0; i < 6; i++) box(g, i % 2 ? '#f4f1ea' : '#e8b54a', 0.7, 0.18, 0.04, -1.15 + i * 0.7, 2.7, 3.6);
    for (const x of [-1.4, 2.6]) box(g, '#888', 0.06, 2.8, 0.06, x, 1.4, 3.5);
  } else {
    // 카바나: 하얀 천 지붕 · 나무 기둥 · 전구 줄
    for (const x of [-2, 2]) for (const z of [-1.8, 1.8]) box(g, '#8a6a4a', 0.16, 3.2, 0.16, x, 1.6, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4, 1), mat('#f2ece0', { roughness: 0.9 })); roof.rotation.y = Math.PI / 4; roof.position.y = 4.0; roof.castShadow = true; g.add(roof);
    for (const [x, z, ry] of [[0, -1.8, 0], [-2, 0, Math.PI / 2], [2, 0, Math.PI / 2]]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), mat('#f6f1e6', { side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); c.position.set(x, 1.6, z); c.rotation.y = ry; g.add(c); }
    box(g, '#d9c7a6', 3.6, 0.3, 3.2, 0, 0.15, 0);
    box(g, '#f4f1ea', 2.4, 0.35, 1.8, 0, 0.47, -0.4);
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd77a' })); const t = i / 8; b.position.set(-2 + 4 * t, 3.1 - Math.sin(Math.PI * t) * 0.35, 1.9); g.add(b); }
    const glow = new THREE.PointLight('#ffcf80', 3, 9, 1.6); glow.position.set(0, 2.6, 0.8); g.add(glow);
  }
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
  g.userData.tick = (t) => {
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

const KIND = { forest: 'tent', sea: 'van', river: 'cabana' };

// 캠프 마당
export function buildCampsite(loc) {
  const w = buildExterior(loc);
  w.hall.visible = false;
  const site = shelter(KIND[loc.id]);
  site.position.set(0, 0, -11); w.group.add(site);
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
  const baseUpdate = w.update;
  return {
    ...w,
    door: null,
    seats,
    flames: [],
    campfire: fire.group,
    spawn: new THREE.Vector3(0, 0, 8.5), spawnRot: Math.PI,
    camDist: 7, camRise: 0.32, camLookY: 1.6,
    blockers: [{ minX: -3.4, maxX: 3.4, minZ: -14, maxZ: -8 }, { minX: -1.1, maxX: 1.1, minZ: 1.9, maxZ: 4.1 }],
    walkPath: Array.from({ length: 24 }, (_, k) => { const a = (-2 * Math.PI * k) / 24; return new THREE.Vector3(5 * Math.sin(a), 0, 3 + 5 * Math.cos(a)); }),
    update: (t) => { baseUpdate?.(t); fire.group.userData.tick(t); },
  };
}

// 물가: 같은 풍경의 앞쪽 끝. 바깥을 내려다보는 자리에 낚시 의자 둘
export function buildShore(loc) {
  const w = buildExterior(loc);
  w.hall.visible = false;
  w.pagodaSlot.visible = false;
  const seats = [];
  [[-2.2, 18.2], [2.2, 18.2]].forEach(([x, z], i) => {
    const ch = campChair(i ? '#2f7a96' : '#3f6b55'); ch.position.set(x, 0, z); w.group.add(ch);
    ch.traverse((o) => { if (o.isMesh) o.userData.seats = 'chair'; });
    seats.push({ id: i, pos: new THREE.Vector3(x, 0, z), rot: 0, y: 0.4, mesh: ch });
  });
  // 잡은 것 담는 통 · 뜰채
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.4, 14), mat('#2f7a96')); bucket.position.set(0, 0.2, 18.5); bucket.castShadow = true; w.group.add(bucket);
  return {
    ...w,
    door: null,
    seats,
    spawn: new THREE.Vector3(0, 0, 15), spawnRot: 0,
    camDist: 7, camRise: 0.3, camLookY: 1.2,
    blockers: [],
  };
}
