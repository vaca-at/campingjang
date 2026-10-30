// 우리 캐릭터: 네모난 블록 사람과 '내 옆 친구'(따라다니는 작은 친구).
// 블록 사람은 Avatar 와 같은 관절(hips, head, 팔다리)을 써서 모든 동작이 그대로 된다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './avatar.js';

// 관절(다리·몸통·팔·머리)마다 붙은 불투명 상자들을 정점 색이 있는 메시 하나로 합친다
const BAKED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
export function bakeBlock(av) {
  for (const node of [av.legL, av.legR, av.hips, av.armL, av.armR, av.head]) {
    const parts = node.children.filter((o) => o.isMesh && !o.material.transparent && o.material.color && o !== av.skirt && !o.userData.keep);
    if (parts.length < 2) continue;
    const geos = parts.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone().applyMatrix4(m.matrix);
      const c = m.material.color;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    parts.forEach((m) => node.remove(m));
    const one = new THREE.Mesh(merged, BAKED);
    one.castShadow = true;
    node.add(one);
  }
  av.baked = true;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
export function box(parent, color, w, h, d, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(BOX, typeof color === 'string' ? mat(color, opts) : color);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// 블록 사람 프리셋. hair: 머리색, top/inner/bottom: 겉옷·안쪽·바지, extra: 고유 소품
export const PRESETS = {
  moral: { hair: '#2b2220', top: '#2f3e66', inner: '#f3f0e8', bottom: '#3a3f4a', extra: 'collar' },
  appteacher: { hair: '#1f1b1a', top: '#3f9a5a', inner: '#3f9a5a', bottom: '#33363d', extra: 'glasses' },
  tycoon: { hair: '#2a2420', top: '#2b2d33', inner: '#f2f2f2', bottom: '#2b2d33', extra: 'tie', tie: '#c23b3b' },
  trainee: { hair: '#4a3426', top: '#f4f4f2', inner: '#f4f4f2', bottom: '#3b4150', extra: 'lanyard', cap: '#3d8fc4' },
  planner: { hair: '#6b3f2a', top: '#e9b8c4', inner: '#e9b8c4', bottom: '#5a6b8a', extra: 'beret' },
  knitdev: { hair: '#2a2220', top: '#4e8a4a', inner: '#4e8a4a', bottom: '#2f3a4a', extra: 'knit' },
  hoodie: { hair: '#3a2a20', top: '#3c9a6a', inner: '#3c9a6a', bottom: '#2c2f36', extra: 'hood' },
  beige: { hair: '#6b4128', top: '#d9c3a0', inner: '#1d1d1f', bottom: '#2a2a2c', extra: 'jacket' },
};

// 캐릭터마다 [여자, 남자] 머리 모양
const HAIR = {
  moral: ['bob', 'part'],
  appteacher: ['lowpony', 'crew'],
  tycoon: ['bun', 'slick'],
  trainee: ['braids', 'bowl'],
  planner: ['wave', 'curtain'],
  knitdev: ['pigtails', 'curly'],
  hoodie: ['pixie', 'twoblock'],
  beige: ['longstraight', 'manbun'],
};

// 머리 모양 만들기. 얼굴은 한 변 S 인 네모, hy = 정수리 높이, fz = 얼굴 앞면
function buildHair(head, style, H, S, hy, fz) {
  const W = S + 0.06, side = S / 2 + 0.03, back = -S / 2 - 0.03;
  const top = (h = 0.12) => box(head, H, W, h, W, 0, hy + (h - 0.12) / 2, 0);
  const backHair = (len, d = 0.1) => box(head, H, W, len, d, 0, hy + 0.04 - len / 2, back);
  const sides = (len, w = 0.08) => { for (const s of [1, -1]) box(head, H, w, len, W, (side + (w - 0.08) / 2) * s, hy + 0.04 - len / 2, -0.02); };
  const bangs = (h = 0.1, w = W) => box(head, H, w, h, 0.08, 0, hy - 0.03 - h / 2 + 0.02, fz + 0.02);
  const tie = '#d24a3a';
  switch (style) {
    case 'bob': // 턱 길이 단발, 일자 앞머리
      top(); backHair(0.46); sides(0.46, 0.1); bangs(0.15);
      for (const s of [1, -1]) box(head, H, 0.12, 0.08, 0.2, (side + 0.02) * s, hy - 0.42, 0.1);
      break;
    case 'part': // 2:8 가르마: 한쪽으로 넘긴 앞머리
      top(); backHair(0.32); sides(0.2);
      box(head, H, W * 0.7, 0.1, 0.08, -0.08, hy - 0.04, fz + 0.02);
      box(head, H, 0.22, 0.06, 0.3, -0.12, hy + 0.08, 0.05);
      break;
    case 'lowpony': // 낮게 묶은 포니테일
      top(); backHair(0.3); sides(0.24);
      box(head, H, W * 0.6, 0.09, 0.08, 0.09, hy - 0.04, fz + 0.02);
      box(head, tie, 0.1, 0.08, 0.08, 0, hy - 0.3, back - 0.07);
      box(head, H, 0.14, 0.4, 0.12, 0, hy - 0.54, back - 0.08);
      break;
    case 'crew': // 짧은 스포츠머리
      top(0.08); backHair(0.18, 0.06); sides(0.12, 0.05);
      box(head, H, W, 0.04, 0.05, 0, hy - 0.02, fz + 0.01);
      break;
    case 'bun': // 올림머리: 정수리 위 동그란 번
      top(); backHair(0.32); sides(0.26);
      for (const s of [1, -1]) box(head, H, W / 2 - 0.04, 0.1, 0.08, 0.15 * s, hy - 0.04, fz + 0.02);
      box(head, H, 0.26, 0.13, 0.22, 0, hy + 0.11, -0.12);
      box(head, H, 0.2, 0.06, 0.16, 0, hy + 0.19, -0.12);
      break;
    case 'slick': // 올백: 앞을 높이 세우고 뒤로 넘김
      top(0.16); backHair(0.3); sides(0.16);
      box(head, H, W, 0.1, 0.16, 0, hy + 0.08, fz - 0.06);
      break;
    case 'braids': // 양갈래 땋은 머리
      // 옆머리를 귀 아래까지 내려 옆통수를 덮고, 거기서 땋은 머리가 이어져 어깨 앞으로 늘어져요
      top(); backHair(0.5); sides(0.5, 0.1); bangs(0.11);
      for (const s of [1, -1]) {
        box(head, H, 0.13, 0.12, 0.16, (side + 0.005) * s, hy - 0.44, 0.04);   // 귀 아래 묶은 곳
        for (let k = 0; k < 5; k++) box(head, H, 0.12 - (k % 2) * 0.03, 0.11, 0.11 - (k % 2) * 0.02, (side - 0.01) * s, hy - 0.54 - k * 0.1, 0.06);
        box(head, tie, 0.11, 0.05, 0.11, (side - 0.01) * s, hy - 1.04, 0.06);
        box(head, H, 0.07, 0.08, 0.07, (side - 0.01) * s, hy - 1.1, 0.06);
      }
      break;
    case 'bowl': // 바가지 머리: 눈썹까지 덮은 두툼한 앞머리
      top(0.14); backHair(0.36); sides(0.3, 0.09); bangs(0.18);
      break;
    case 'curtain': // 가운데 가르마, 양쪽으로 갈라진 앞머리
      top(); backHair(0.36); sides(0.3);
      for (const s of [1, -1]) { const b = box(head, H, 0.22, 0.16, 0.08, 0.14 * s, hy - 0.08, fz + 0.02); b.rotation.z = 0.25 * s; }
      break;
    case 'pigtails': // 양쪽 높이 묶은 머리
      top(); backHair(0.3); sides(0.22); bangs(0.11);
      for (const s of [1, -1]) {
        box(head, tie, 0.08, 0.08, 0.08, (side + 0.04) * s, hy - 0.04, -0.08);
        box(head, H, 0.13, 0.34, 0.13, (side + 0.12) * s, hy - 0.22, -0.1);
      }
      break;
    case 'curly': // 곱슬 파마: 울퉁불퉁한 덩어리
      top(0.1); backHair(0.32, 0.12); sides(0.24, 0.1);
      for (const [x, z, h] of [[-0.18, 0.16, 0.14], [0, 0.18, 0.18], [0.18, 0.16, 0.14], [-0.2, -0.05, 0.18], [0.02, -0.02, 0.22], [0.2, -0.05, 0.16], [-0.16, -0.22, 0.14], [0.06, -0.22, 0.17], [0.2, -0.2, 0.13]])
        box(head, H, 0.2, h, 0.2, x, hy + h / 2 - 0.02, z);
      box(head, H, W, 0.1, 0.08, 0, hy - 0.06, fz + 0.03);
      break;
    case 'pixie': { // 숏컷: 옆으로 비스듬히 내린 앞머리
      top(); backHair(0.24); sides(0.18);
      const b = box(head, H, W * 0.75, 0.13, 0.08, 0.06, hy - 0.07, fz + 0.02); b.rotation.z = -0.18;
      break;
    }
    case 'twoblock': // 투블럭: 옆·뒤는 짧게, 윗머리만 두툼
      top(0.17); box(head, H, W + 0.04, 0.08, W + 0.04, 0, hy - 0.04, 0);
      backHair(0.14, 0.05); sides(0.08, 0.05); bangs(0.08, W * 0.9);
      break;
    case 'longstraight': // 긴 생머리, 가운데 가르마, 얼굴 옆으로 내린 머리
      for (const s of [1, -1]) box(head, H, W / 2 - 0.01, 0.12, W, (W / 4 + 0.005) * s, hy, 0);
      backHair(0.86); sides(0.78);
      for (const s of [1, -1]) box(head, H, 0.1, 0.44, 0.06, 0.2 * s, hy - 0.2, fz + 0.02);
      break;
    case 'manbun': // 꽁지머리: 뒤통수 위쪽에 작은 번
      top(); backHair(0.28); sides(0.2); bangs(0.07, W * 0.8);
      box(head, H, 0.16, 0.14, 0.14, 0, hy - 0.02, back - 0.1);
      break;
    case 'short':
      top(); backHair(0.36); sides(0.2); bangs();
      break;
    default: // wave: 긴 웨이브 (처음 모양)
      top(); backHair(0.7); sides(0.6); bangs();
      box(head, H, 0.12, 0.14, 0.14, S / 2 + 0.06, hy - 0.58, 0.04);
      box(head, H, 0.12, 0.14, 0.14, -S / 2 - 0.06, hy - 0.58, 0.04);
      box(head, H, 0.14, 0.12, 0.12, 0.17, hy + 0.02, fz + 0.03);
  }
}

// 체형 비율 입히기: 다리 길이 · 몸통 · 어깨 너비 · 머리 크기 (머리는 몸통 비율을 되돌려 따로 맞춰요)
export function applyBody(av, B) {
  const legY = 0.46;
  for (const leg of [av.legL, av.legR]) { leg.position.y = legY * B.leg; leg.scale.set(B.limb, B.leg, B.limb); }
  av.hips.position.y = legY * B.leg;
  av.hips.scale.set(B.tw, B.th, B.tw);
  for (const arm of [av.armL, av.armR]) arm.scale.set(B.limb / B.tw, 1, B.limb / B.tw);
  av.head.scale.set(B.head / B.tw, B.head / B.th, B.head / B.tw);
  av.body.scale.setScalar(B.k);
  av.torsoY = B.th;
  av.sitK = B.leg * B.k;
}

export function buildBlock(av, body, look, outfit, skinColor) {
  // 머리 색은 머리 스타일(type)에서, 차림(own 옷)은 고른 옷의 preset 에서 (예전 'own' 은 type 의 차림)
  const H = PRESETS[look.type] || PRESETS.beige;
  const P = PRESETS[outfit.preset || look.type] || H;
  const own = outfit.style === 'own';
  const top = own ? P.top : outfit.top;
  const inner = own ? P.inner : outfit.top;
  const bottom = own ? P.bottom : outfit.bottom;
  const female = look.gender !== 'm';
  const legY = 0.46;

  const mkLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.12 * side, legY, 0);
    box(g, bottom, 0.2, 0.42, 0.22, 0, -0.21, 0);
    box(g, own ? '#2a2420' : '#f2eee6', 0.21, 0.08, 0.27, 0, -0.42, 0.03);
    body.add(g);
    return g;
  };
  av.legL = mkLeg(1);
  av.legR = mkLeg(-1);

  const hips = new THREE.Group();
  hips.position.y = legY;
  body.add(hips);
  av.hips = hips;

  // 몸통: 겉옷 + 가운데 안쪽 옷
  box(hips, top, 0.5, 0.56, 0.28, 0, 0.28, 0);
  if (inner !== top) box(hips, inner, 0.16, 0.5, 0.02, 0, 0.3, 0.145);
  av.skirt = null;
  if (!own && ['robe', 'kasaya', 'coat', 'wizard'].includes(outfit.style)) {
    const sk = box(hips, outfit.style === 'robe' ? bottom : top, 0.54, 0.34, 0.32, 0, -0.12, 0);
    sk.userData = { sx: 0.54, sz: 0.32, h: 0.34, y: -0.12, box: true };
    av.skirt = sk;
  }
  if (!own && (outfit.style === 'robe' || outfit.style === 'kasaya')) {
    const band = box(hips, outfit.sash, outfit.style === 'kasaya' ? 0.18 : 0.12, 0.7, 0.03, 0.02, 0.3, 0.155);
    band.rotation.z = 0.62;
  }
  if (!own && outfit.style === 'hanbok') {
    const c = box(hips, '#f7f3ea', 0.06, 0.34, 0.02, 0.05, 0.4, 0.15); c.rotation.z = 0.6;
    box(hips, outfit.sash, 0.05, 0.2, 0.02, -0.07, 0.22, 0.15);
  }
  if (!own && outfit.style === 'hiking') box(hips, '#f2f2f2', 0.02, 0.5, 0.02, 0, 0.28, 0.15);
  // 옷 무늬: deco 로 상의 겉에 덧그려요
  const dc = outfit.decoC;
  if (!own && outfit.deco === 'puffer') for (let i = 0; i < 4; i++) box(hips, dc, 0.53, 0.025, 0.31, 0, 0.1 + i * 0.13, 0);
  if (!own && outfit.deco === 'track') { for (const s of [1, -1]) box(hips, dc, 0.02, 0.56, 0.02, s * 0.1, 0.28, 0.145); box(hips, dc, 0.02, 0.4, 0.02, 0, 0.32, 0.146); }
  if (!own && outfit.deco === 'overalls') { box(hips, dc, 0.42, 0.24, 0.29, 0, 0.12, 0); for (const s of [1, -1]) box(hips, dc, 0.06, 0.34, 0.29, s * 0.14, 0.38, 0); box(hips, '#f2c94c', 0.04, 0.04, 0.02, 0.14, 0.5, 0.15); box(hips, '#f2c94c', 0.04, 0.04, 0.02, -0.14, 0.5, 0.15); }
  if (!own && outfit.style === 'wizard') {   // 마법사 옷: 금빛 옷깃과 별, 등 뒤 망토
    for (const s of [1, -1]) box(hips, outfit.sash, 0.04, 0.26, 0.02, 0.06 * s, 0.44, 0.15).rotation.z = 0.45 * s;   // V 옷깃
    for (const [x, y] of [[0.14, 0.38], [-0.13, 0.16], [0.16, -0.08], [-0.15, -0.2]]) {
      const st = box(hips, outfit.sash, 0.06, 0.06, 0.02, x, y, 0.17); st.rotation.z = Math.PI / 4;
      box(hips, outfit.sash, 0.025, 0.1, 0.02, x, y, 0.172);
    }
    box(hips, '#3b2766', 0.56, 0.86, 0.04, 0, 0.12, -0.17);
  }
  if (own) {
    if (P.extra === 'tie') box(hips, P.tie, 0.07, 0.34, 0.02, 0, 0.36, 0.16);
    if (P.extra === 'collar') { box(hips, P.inner, 0.24, 0.06, 0.02, 0, 0.53, 0.15); }
    if (P.extra === 'lanyard') { box(hips, '#3d8fc4', 0.03, 0.26, 0.02, 0, 0.42, 0.15); box(hips, '#f2f2f2', 0.1, 0.12, 0.02, 0, 0.26, 0.16, { emissive: '#222' }); }
    if (P.extra === 'knit') for (let i = 0; i < 4; i++) box(hips, '#3f7a3c', 0.5, 0.02, 0.29, 0, 0.08 + i * 0.12, 0);
    if (P.extra === 'hood') { box(hips, P.top, 0.44, 0.16, 0.12, 0, 0.5, -0.18); box(hips, '#f2f2f2', 0.02, 0.18, 0.02, 0.06, 0.4, 0.15); box(hips, '#f2f2f2', 0.02, 0.18, 0.02, -0.06, 0.4, 0.15); }
    if (P.extra === 'jacket') { box(hips, P.top, 0.17, 0.56, 0.02, 0.165, 0.28, 0.145); box(hips, P.top, 0.17, 0.56, 0.02, -0.165, 0.28, 0.145); }
  }

  // 팔
  const mkArm = (side) => {
    const g = new THREE.Group();
    g.position.set(0.33 * side, 0.52, 0);
    box(g, top, 0.15, 0.42, 0.18, 0, -0.18, 0);
    const hand = box(g, skinColor, 0.13, 0.11, 0.15, 0, -0.43, 0);
    hips.add(g);
    return { g, hand };
  };
  const L = mkArm(1), R = mkArm(-1);
  av.armL = L.g; av.armR = R.g; av.handL = L.hand; av.handR = R.hand;
  av.handY = -0.44;

  // 머리: 큰 네모 얼굴
  const head = new THREE.Group();
  head.position.y = 0.56;
  hips.add(head);
  av.head = head;
  const S = 0.52;
  box(head, skinColor, S, S, S, 0, S / 2 + 0.02, 0);
  const fz = S / 2 + 0.005;
  const eyeY = S / 2 + 0.03;
  // 눈은 따로 둬요 (명상할 때 스르르 감도록)
  av.eyes = [box(head, '#1d1a18', 0.07, 0.09, 0.02, 0.11, eyeY, fz), box(head, '#1d1a18', 0.07, 0.09, 0.02, -0.11, eyeY, fz)];
  for (const e of av.eyes) { e.userData.keep = true; e.material = e.material.clone(); }   // 표정 색이 다른 사람 눈에 번지지 않게
  av.mouth = box(head, '#b5584c', 0.1, 0.025, 0.02, 0, eyeY - 0.13, fz); av.mouth.userData.keep = true;   // 표정 따라 모양이 바뀌어요
  box(head, '#f0a090', 0.06, 0.03, 0.015, 0.19, eyeY - 0.08, fz, { transparent: true, opacity: 0.6 });
  box(head, '#f0a090', 0.06, 0.03, 0.015, -0.19, eyeY - 0.08, fz, { transparent: true, opacity: 0.6 });

  // 머리카락: 캐릭터 · 남녀마다 다른 모양 (HAIR 표)
  const hy = S + 0.02;
  buildHair(head, HAIR[look.type]?.[female ? 0 : 1] || (female ? 'wave' : 'short'), H.hair, S, hy, fz);
  if (own && P.extra === 'glasses') {
    const gm = '#1d1a18';
    box(head, gm, 0.16, 0.13, 0.015, 0.11, eyeY, fz + 0.02, { transparent: true, opacity: 0.9 });
    box(head, gm, 0.16, 0.13, 0.015, -0.11, eyeY, fz + 0.02, { transparent: true, opacity: 0.9 });
    box(head, '#cfe6f0', 0.12, 0.09, 0.016, 0.11, eyeY, fz + 0.025, { transparent: true, opacity: 0.35 });
    box(head, '#cfe6f0', 0.12, 0.09, 0.016, -0.11, eyeY, fz + 0.025, { transparent: true, opacity: 0.35 });
  }
  if (own && P.cap && look.acc === 'none') {
    // 야구모자: 머리 위를 푹 덮고 앞으로 챙
    box(head, P.cap, S + 0.12, 0.17, S + 0.12, 0, hy + 0.03, -0.01);
    box(head, H.hair, S + 0.08, 0.12, S + 0.08, 0, hy - 0.1, -0.03);   // 모자 아래로 머리카락이 이어지게
    box(head, P.cap, S - 0.02, 0.04, 0.22, 0, hy - 0.04, fz + 0.1);
    box(head, '#ffffff', 0.08, 0.03, 0.08, 0, hy + 0.13, 0);
  }
  if (own && P.extra === 'beret' && look.acc === 'none') {
    const b = box(head, '#b23a4a', S + 0.1, 0.1, S + 0.06, 0.04, hy + 0.08, 0); b.rotation.z = -0.12;
  }

  // 장신구
  const acc = look.acc;
  if (acc === 'beads') for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    box(head, '#6b3b22', 0.05, 0.05, 0.05, Math.sin(a) * 0.2, -0.02 - Math.max(0, Math.cos(a)) * 0.07, Math.cos(a) * 0.17);
  }
  if (acc === 'bracelet') {
    // 왼쪽 손목을 한 바퀴 두르는 작은 구슬
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      box(av.armL, i === 0 ? '#c9a86a' : '#6b3b22', 0.045, 0.045, 0.045, Math.cos(a) * 0.1, -0.35, Math.sin(a) * 0.11);
    }
  }
  if (acc === 'satgat') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.26, 4, 1), mat('#c9a86a'));
    hat.rotation.y = Math.PI / 4;
    hat.position.set(0, hy + 0.2, 0);
    hat.castShadow = true;
    head.add(hat);
  }
  if (acc === 'witchhat') {   // 할로윈 보라 고깔모자: 넓은 챙 + 뾰족한 고깔 + 주황 띠
    box(head, '#4a2f6b', S + 0.32, 0.05, S + 0.32, 0, hy + 0.04, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 4, 1), mat('#5b3a82'));
    cone.rotation.y = Math.PI / 4; cone.rotation.z = -0.15; cone.position.set(-0.03, hy + 0.3, 0); cone.castShadow = true; head.add(cone);
    box(head, '#e8873a', S - 0.06, 0.06, S - 0.06, 0, hy + 0.1, 0);
  }
  if (acc === 'beanie') { box(head, '#b23a3a', S + 0.1, 0.2, S + 0.1, 0, hy + 0.06, 0); box(head, '#f4efe6', 0.12, 0.1, 0.12, 0, hy + 0.22, 0); }
  if (acc === 'roundglasses' || acc === 'sunglasses') {
    const dark = acc === 'sunglasses';
    for (const sx of [1, -1]) {
      if (dark) box(head, '#151414', 0.17, 0.12, 0.02, 0.11 * sx, eyeY, fz + 0.025);
      else { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 20), mat('#c9a24a')); ring.position.set(0.11 * sx, eyeY, fz + 0.025); head.add(ring); }
    }
    box(head, dark ? '#151414' : '#c9a24a', 0.06, 0.015, 0.015, 0, eyeY + 0.02, fz + 0.025);
  }
  if (acc === 'scarf') { box(hips, '#c84a3a', 0.54, 0.13, 0.36, 0, 0.6, 0); box(hips, '#c84a3a', 0.13, 0.36, 0.05, 0.12, 0.4, 0.17); for (let i = 0; i < 3; i++) box(hips, '#f2e6c8', 0.545, 0.02, 0.365, 0, 0.56 + i * 0.04, 0); for (let i = 0; i < 3; i++) box(hips, '#f2e6c8', 0.135, 0.02, 0.055, 0.12, 0.3 + i * 0.08, 0.17); }
  if (acc === 'ribbon') { const r = new THREE.Group(); r.position.set(0.16, hy + 0.06, 0.1); head.add(r); for (const sx of [1, -1]) { const w = box(r, '#d8323a', 0.16, 0.12, 0.05, sx * 0.09, 0, 0); w.rotation.z = sx * 0.3; } box(r, '#a8242a', 0.06, 0.07, 0.06, 0, 0, 0.01); }
  if (acc === 'headphones') { const band = new THREE.Mesh(new THREE.TorusGeometry(S / 2 + 0.13, 0.03, 6, 24, Math.PI), mat('#2a2a2c')); band.position.set(0, eyeY - 0.02, 0); head.add(band); for (const sx of [1, -1]) box(head, '#2a2a2c', 0.09, 0.2, 0.18, sx * (S / 2 + 0.12), eyeY - 0.02, 0); for (const sx of [1, -1]) box(head, '#e8607a', 0.092, 0.13, 0.12, sx * (S / 2 + 0.135), eyeY - 0.02, 0); }
  if (acc === 'bowtie') { for (const sx of [1, -1]) { const w = box(hips, '#c23b3b', 0.1, 0.08, 0.03, sx * 0.055, 0.53, 0.16); w.rotation.z = sx * 0.25; } box(hips, '#8f2a2a', 0.04, 0.05, 0.035, 0, 0.53, 0.165); }
  if (acc === 'lotuspin') {   // 연꽃 핀: 귀 위 옆머리에 크게, 분홍 꽃잎 여섯 장 + 노란 꽃술
    const pin = new THREE.Group(); pin.position.set(0.27, hy - 0.02, 0.2); pin.rotation.set(0, 0.7, 0); pin.scale.setScalar(1.5); head.add(pin);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pt = box(pin, i % 2 ? '#f48fb0' : '#f9bcd0', 0.07, 0.11, 0.03, Math.sin(a) * 0.06, Math.cos(a) * 0.06, 0); pt.rotation.z = -a; }
    box(pin, '#f3d16a', 0.06, 0.06, 0.05, 0, 0, 0.02); box(pin, '#6aa05a', 0.1, 0.04, 0.02, 0.05, -0.09, -0.01).rotation.z = 0.5;
  }
  if (acc === 'backpack' || (!own && outfit.style === 'hiking')) { box(hips, '#8a8d8a', 0.38, 0.42, 0.18, 0, 0.3, -0.23); box(hips, '#6f726f', 0.3, 0.12, 0.04, 0, 0.18, -0.33); }
}

// ───────── 내 옆 친구 ─────────
// 고르는 목록 순서 그대로. hidden 은 목록에서 뺐지만 예전에 고른 사람을 위해 그리는 법만 남긴 친구
export const PETS = [
  { id: 'dog', name: '강아지', cap: '꼬리를 흔들어요' },
  { id: 'cat', name: '고양이', cap: '꼬리를 살랑살랑' },
  { id: 'russianblue', name: '러시안 블루', cap: '청회색 털에 초록 눈' },
  { id: 'hamster', name: '햄스터', cap: '볼 빵빵' },
  { id: 'bunny', name: '토끼', cap: '귀가 쫑긋' },
  { id: 'coffee', name: '커피잔', cap: '김이 모락모락' },
  { id: 'icecoffee', name: '아이스커피', cap: '얼음 가득, 초록 빨대' },
  { id: 'book', name: '책 친구', cap: '책장을 펄럭' },
  { id: 'ai', name: 'AI 짝꿍', cap: '화면 얼굴 로봇', hover: true },
  { id: 'claude', name: '클로드', cap: '주황 네모, 다리 넷' },
  { id: 'drone', name: '드론', cap: '프로펠러가 쌩쌩', hover: true },
  { id: 'panda', name: '판다', cap: '푸바오처럼 크고 동글동글', side: 1.15, back: 1.5 },
  { id: 'squirrel', name: '다람쥐', cap: '햄스터만 한 몸, 큰 꼬리' },
  { id: 'turtle', name: '거북이', cap: '느릿느릿 고개 쏙' },
  { id: 'squid', name: '오징어', cap: '둥실둥실 다리 열 개', hover: true },
  { id: 'fishbowl', name: '어항 물고기', cap: '금붕어가 빙글빙글' },
  // 시안 친구 10 (preview: 고르는 목록에는 아직 안 나와요. ?gallery=newpets 로 보기)
  { id: 'chorong', name: '초롱이', cap: '걸어 다니는 연등, 밤에 빛나요', preview: true },
  { id: 'ppokkeum', name: '뽀끔이', cap: '목어 물고기, 거품 뽀글뽀글', preview: true },
  { id: 'dongja', name: '아기 동자', cap: '빡빡머리 꼬마 스님', preview: true },
  { id: 'tiger', name: '아기 호랑이', cap: '민화 속 줄무늬 호랑이', preview: true },
  { id: 'kkachi', name: '까치', cap: '반가운 소식을 물고 오는 새', hover: true, preview: true },
  { id: 'toad', name: '복두꺼비', cap: '입에 엽전을 문 복덩이', preview: true },
  { id: 'haetae', name: '해태', cap: '돌로 된 수호 친구', preview: true },
  { id: 'frog', name: '연잎 개구리', cap: '연잎 배를 타고 미끄러져요', preview: true },
  { id: 'tteok', name: '찹쌀떡 말랑이', cap: '말랑말랑 쫀득쫀득', preview: true },
  { id: 'firefly', name: '반딧불이', cap: '꼬리가 반짝반짝', hover: true, preview: true },
  // 시안 친구 두 번째 10 (?gallery=newpets2)
  { id: 'baekgu', name: '백구', cap: '하얀 진돗개, 말린 꼬리' },
  { id: 'fawn', name: '아기 꽃사슴', cap: '등에 하얀 점박이', preview: 2 },
  { id: 'otter', name: '수달', cap: '조개를 들고 뒤뚱뒤뚱' },
  { id: 'mandarin', name: '원앙', cap: '알록달록 금슬 좋은 새', preview: 2 },
  { id: 'hedgehog', name: '고슴도치', cap: '뾰족뾰족 등, 콧등 촉촉', preview: 2 },
  { id: 'raccoon', name: '너구리', cap: '눈가 까만 줄무늬 꼬리', preview: 2 },
  { id: 'bamtol', name: '밤톨이', cap: '알밤 친구, 머리에 밤송이 가시', preview: 2 },
  { id: 'lotusbud', name: '연꽃 봉오리', cap: '가끔 활짝 피어요', preview: 2 },
  { id: 'cloud', name: '구름이', cap: '몽실몽실 떠다니는 구름', hover: true, preview: 2 },
  { id: 'dragon', name: '아기 청룡', cap: '푸른 비늘, 꼬리 살랑', hover: true, preview: 2 },
  // 시안 친구 세 번째 10: 직장인이 좋아하는 사물 (?gallery=newpets3)
  { id: 'laptop', name: '노트북', cap: '화면에 웃는 얼굴, 뚜껑 팔랑', size: 1.6 },
  { id: 'tablet', name: '태블릿', cap: '펜으로 끄적끄적, 화면에 웃는 얼굴', size: 1.6 },
  { id: 'postit', name: '포스트잇', cap: '노란 메모지가 한 장씩 팔랑', preview: 3, size: 1.6 },
  { id: 'tumbler', name: '텀블러', cap: '빨대 꽂은 하늘색 텀블러', preview: 3, size: 1.6 },
  { id: 'stapler', name: '스테이플러', cap: '입을 딸깍딸깍', preview: 3, size: 1.6 },
  { id: 'mouse', name: '마우스', cap: '꼬리 같은 줄, 휠이 반짝', preview: 3, size: 1.6 },
  { id: 'calc', name: '계산기', cap: '화면에 숫자가 깜빡', preview: 3, size: 1.6 },
  { id: 'stamp', name: '결재 도장', cap: '빨간 인주, 쿵 찍어요', preview: 3, size: 1.6 },
  { id: 'idcard', name: '사원증', cap: '파란 목줄 달린 명찰', preview: 3, size: 1.6 },
  { id: 'deskcal', name: '탁상 달력', cap: '금요일만 기다려요', preview: 3, size: 1.6 },
  { id: 'cupramen', name: '컵라면', cap: '김이 모락모락 야근 친구', preview: 3, size: 1.6 },
  { id: 'none', name: '없음', cap: '혼자 다니기' },
  { id: 'plant', name: '화분 친구', hidden: true },
  { id: 'ghost', name: '꼬마 유령', cap: '할로윈 한정 · 10/31까지', hover: true, season: 'halloween' },
  { id: 'pumpkin', name: '호박 등불', cap: '할로윈 한정 · 밤에 얼굴이 빛나요', season: 'halloween' },
  { id: 'rocket', name: '꼬마 로켓', hover: true, hidden: true },
];

const eyes = (g, y, z, sep = 0.07, s = 0.05, c = '#1d1a18') => {
  box(g, c, s, s * 1.3, 0.02, sep, y, z);
  box(g, c, s, s * 1.3, 0.02, -sep, y, z);
};

export function buildPet(id) {
  const g = new THREE.Group();
  const anim = []; // (t) => void
  switch (id) {
    case 'ai': {
      box(g, '#eef0f2', 0.36, 0.3, 0.3, 0, 0.15, 0);
      box(g, '#1f2a33', 0.28, 0.2, 0.02, 0, 0.16, 0.155);
      box(g, '#5ff0e0', 0.05, 0.07, 0.02, 0.06, 0.17, 0.168, { emissive: '#5ff0e0', emissiveIntensity: 0.8 });
      box(g, '#5ff0e0', 0.05, 0.07, 0.02, -0.06, 0.17, 0.168, { emissive: '#5ff0e0', emissiveIntensity: 0.8 });
      box(g, '#8a9096', 0.03, 0.14, 0.03, 0, 0.37, 0);
      const tip = box(g, '#e2603d', 0.07, 0.07, 0.07, 0, 0.46, 0, { emissive: '#e2603d', emissiveIntensity: 0.5 });
      anim.push((t) => { tip.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 3)) * 0.7; });
      break;
    }
    case 'dog': {
      const c = '#e8d7b8';
      box(g, c, 0.24, 0.2, 0.36, 0, 0.2, 0);
      box(g, c, 0.24, 0.22, 0.22, 0, 0.36, 0.2);
      box(g, '#f2e6d0', 0.12, 0.08, 0.06, 0, 0.31, 0.32);
      box(g, '#2a2220', 0.05, 0.04, 0.03, 0, 0.34, 0.35);
      eyes(g, 0.4, 0.315, 0.06, 0.04);
      box(g, '#a87a50', 0.06, 0.14, 0.06, 0.12, 0.42, 0.18);
      box(g, '#a87a50', 0.06, 0.14, 0.06, -0.12, 0.42, 0.18);
      box(g, '#d24a3a', 0.26, 0.04, 0.05, 0, 0.27, 0.1);
      for (const [x, z] of [[0.08, 0.12], [-0.08, 0.12], [0.08, -0.12], [-0.08, -0.12]]) box(g, c, 0.07, 0.12, 0.07, x, 0.06, z);
      const tail = box(g, c, 0.05, 0.05, 0.16, 0, 0.3, -0.24);
      anim.push((t) => { tail.rotation.y = Math.sin(t * 12) * 0.6; });
      break;
    }
    case 'cat': {
      // 치즈 고양이: 등에 줄무늬, 세모 귀, 위로 말린 꼬리
      const c = '#e9a25a', stripe = '#c9773a';
      box(g, c, 0.22, 0.18, 0.36, 0, 0.19, 0);
      for (const z of [-0.1, 0, 0.1]) box(g, stripe, 0.23, 0.02, 0.04, 0, 0.285, z);
      box(g, c, 0.24, 0.2, 0.2, 0, 0.36, 0.19);
      box(g, '#f6e6cf', 0.12, 0.07, 0.04, 0, 0.31, 0.29);
      box(g, '#f2a0a8', 0.035, 0.025, 0.02, 0, 0.34, 0.305);
      eyes(g, 0.39, 0.292, 0.06, 0.04, '#2f3a1e');
      for (const s of [1, -1]) {
        const ear = box(g, c, 0.07, 0.08, 0.04, 0.08 * s, 0.49, 0.19);
        ear.rotation.z = -0.5 * s;
        box(g, '#f2a0a8', 0.035, 0.045, 0.01, 0.08 * s, 0.485, 0.212);
        for (const dy of [0.01, -0.02]) box(g, '#f7efe0', 0.1, 0.008, 0.008, 0.15 * s, 0.32 + dy, 0.28);
      }
      for (const [x, z] of [[0.07, 0.12], [-0.07, 0.12], [0.07, -0.12], [-0.07, -0.12]]) box(g, '#f6e6cf', 0.06, 0.11, 0.06, x, 0.055, z);
      const tail = new THREE.Group();
      tail.position.set(0, 0.24, -0.18);
      box(tail, c, 0.05, 0.05, 0.14, 0, 0, -0.06);
      box(tail, stripe, 0.05, 0.16, 0.05, 0, 0.08, -0.13);
      g.add(tail);
      anim.push((t) => { tail.rotation.z = Math.sin(t * 2.2) * 0.35; });
      break;
    }
    case 'russianblue': {
      // 러시안 블루: 은빛 도는 청회색 짧은 털, 초록 눈, 날씬한 몸과 긴 꼬리, 쫑긋 큰 귀
      const c = '#8d99a6', d = '#7a8794', light = '#a9b4bf';
      box(g, c, 0.2, 0.17, 0.38, 0, 0.2, 0);
      box(g, light, 0.21, 0.02, 0.36, 0, 0.29, 0);   // 등에 은빛
      box(g, c, 0.24, 0.2, 0.2, 0, 0.37, 0.21);
      box(g, '#9fa9b4', 0.12, 0.07, 0.04, 0, 0.32, 0.31);
      box(g, '#c98a96', 0.035, 0.025, 0.02, 0, 0.35, 0.325);
      for (const s of [1, -1]) {
        // 사진 속 러시안 블루처럼 동그랗고 까만 큰 눈동자에 초록 테두리만 살짝 (눈동자가 커지면 이렇게 보여요)
        box(g, '#6fae5a', 0.064, 0.064, 0.02, 0.06 * s, 0.4, 0.312);
        box(g, '#151414', 0.054, 0.054, 0.021, 0.06 * s, 0.4, 0.314);
        box(g, '#ffffff', 0.016, 0.016, 0.022, 0.06 * s + 0.012, 0.413, 0.315);   // 반짝
        const ear = box(g, d, 0.08, 0.1, 0.04, 0.08 * s, 0.51, 0.2); ear.rotation.z = -0.4 * s;
        box(g, '#b98c96', 0.035, 0.05, 0.01, 0.08 * s, 0.505, 0.222);
        for (const dy of [0.01, -0.02]) box(g, '#e6ebf0', 0.1, 0.008, 0.008, 0.15 * s, 0.33 + dy, 0.3);
      }
      for (const [x, z] of [[0.06, 0.13], [-0.06, 0.13], [0.06, -0.13], [-0.06, -0.13]]) box(g, c, 0.055, 0.13, 0.055, x, 0.065, z);
      const tail = new THREE.Group();
      tail.position.set(0, 0.25, -0.19);
      box(tail, c, 0.045, 0.045, 0.16, 0, 0, -0.07);
      box(tail, d, 0.045, 0.18, 0.045, 0, 0.09, -0.15);
      g.add(tail);
      anim.push((t) => { tail.rotation.z = Math.sin(t * 1.8) * 0.4; });
      break;
    }
    case 'hamster': {
      box(g, '#d99a55', 0.3, 0.24, 0.3, 0, 0.12, 0);
      box(g, '#f6e6cf', 0.2, 0.14, 0.02, 0, 0.1, 0.155);
      eyes(g, 0.18, 0.155, 0.07, 0.04);
      box(g, '#f2b0a0', 0.06, 0.05, 0.02, 0.11, 0.13, 0.156);
      box(g, '#f2b0a0', 0.06, 0.05, 0.02, -0.11, 0.13, 0.156);
      box(g, '#c0844a', 0.07, 0.07, 0.04, 0.1, 0.27, 0.05);
      box(g, '#c0844a', 0.07, 0.07, 0.04, -0.1, 0.27, 0.05);
      break;
    }
    case 'plant': {
      box(g, '#c8643a', 0.3, 0.24, 0.3, 0, 0.12, 0);
      box(g, '#a84e2c', 0.34, 0.05, 0.34, 0, 0.25, 0);
      eyes(g, 0.15, 0.155, 0.07, 0.045);
      box(g, '#3f8a3a', 0.04, 0.3, 0.04, 0, 0.42, 0);
      const leaf = box(g, '#4fa24a', 0.14, 0.04, 0.08, 0.08, 0.4, 0);
      const flower = new THREE.Group(); flower.position.y = 0.58; g.add(flower);
      for (let i = 0; i < 4; i++) box(flower, '#e2463a', 0.08, 0.08, 0.04, Math.cos(i * 1.57) * 0.06, Math.sin(i * 1.57) * 0.06, 0);
      box(flower, '#f3d16a', 0.05, 0.05, 0.05);
      anim.push((t) => { flower.rotation.z = Math.sin(t * 2) * 0.25; leaf.rotation.z = Math.sin(t * 2 + 1) * 0.2; });
      break;
    }
    case 'drone': {
      box(g, '#f2f2f2', 0.26, 0.08, 0.2, 0, 0.1, 0);
      box(g, '#2a2a2c', 0.08, 0.06, 0.04, 0, 0.08, 0.11);
      const props = [];
      for (const [x, z] of [[0.2, 0.15], [-0.2, 0.15], [0.2, -0.15], [-0.2, -0.15]]) {
        box(g, '#bfc4c8', 0.18, 0.025, 0.025, x / 2, 0.11, z / 2).rotation.y = Math.atan2(z, x);
        const p = box(g, '#4fa2d8', 0.2, 0.01, 0.03, x, 0.14, z);
        props.push(p);
      }
      anim.push((t) => props.forEach((p, i) => (p.rotation.y = t * 30 + i)));
      break;
    }
    case 'bunny': {
      const c = '#f4f1ec';
      box(g, c, 0.24, 0.24, 0.24, 0, 0.12, 0);
      box(g, c, 0.22, 0.2, 0.2, 0, 0.32, 0.03);
      eyes(g, 0.34, 0.135, 0.05, 0.035);
      box(g, '#f2b6bd', 0.04, 0.03, 0.02, 0, 0.3, 0.136);
      for (const s of [1, -1]) { box(g, c, 0.06, 0.24, 0.05, 0.06 * s, 0.53, 0.02); box(g, '#f2b6bd', 0.03, 0.18, 0.02, 0.06 * s, 0.53, 0.05); }
      break;
    }
    case 'coffee': {
      box(g, '#f4f1ec', 0.24, 0.24, 0.24, 0, 0.12, 0);
      box(g, '#6b4026', 0.2, 0.02, 0.2, 0, 0.245, 0);
      box(g, '#f4f1ec', 0.06, 0.12, 0.04, 0.15, 0.13, 0);
      eyes(g, 0.15, 0.125, 0.05, 0.035);
      const steam = box(g, '#ffffff', 0.04, 0.12, 0.04, 0, 0.36, 0, { transparent: true, opacity: 0.6 });
      anim.push((t) => { steam.position.y = 0.32 + ((t * 0.3) % 0.15); steam.material.opacity = 0.6 - ((t * 0.3) % 0.15) * 3; });
      break;
    }
    case 'book': {
      const l = box(g, '#c8443a', 0.2, 0.28, 0.03, -0.1, 0.16, 0); l.rotation.y = 0.35;
      const r = box(g, '#c8443a', 0.2, 0.28, 0.03, 0.1, 0.16, 0); r.rotation.y = -0.35;
      const pl = box(g, '#f7f2e6', 0.18, 0.25, 0.02, -0.09, 0.16, 0.025); pl.rotation.y = 0.35;
      const pr = box(g, '#f7f2e6', 0.18, 0.25, 0.02, 0.09, 0.16, 0.025); pr.rotation.y = -0.35;
      eyes(g, 0.2, 0.06, 0.09, 0.035);
      anim.push((t) => { const a = 0.35 + Math.sin(t * 3) * 0.12; l.rotation.y = pl.rotation.y = a; r.rotation.y = pr.rotation.y = -a; });
      break;
    }
    case 'ghost': {
      const m = mat('#ffffff', { transparent: true, opacity: 0.72 });
      box(g, m, 0.3, 0.32, 0.26, 0, 0.2, 0);
      for (let i = 0; i < 3; i++) box(g, m, 0.08, 0.07, 0.24, -0.1 + i * 0.1, 0.01 + (i % 2) * 0.02, 0);
      eyes(g, 0.25, 0.135, 0.06, 0.045);
      box(g, '#f2a0b0', 0.05, 0.03, 0.02, 0.1, 0.19, 0.135);
      break;
    }
    case 'rocket': {
      box(g, '#f4f1ec', 0.18, 0.32, 0.18, 0, 0.2, 0);
      box(g, '#e2463a', 0.12, 0.1, 0.12, 0, 0.41, 0);
      box(g, '#e2463a', 0.05, 0.05, 0.05, 0, 0.48, 0);
      box(g, '#5ab0e0', 0.08, 0.08, 0.02, 0, 0.26, 0.095);
      for (const s of [1, -1]) box(g, '#e2463a', 0.05, 0.12, 0.12, 0.11 * s, 0.08, 0);
      const flame = box(g, '#ffb040', 0.08, 0.12, 0.08, 0, -0.03, 0, { emissive: '#ff8a20', emissiveIntensity: 1 });
      anim.push((t) => { flame.scale.y = 0.1 + Math.abs(Math.sin(t * 20)) * 0.06; });
      break;
    }
    case 'claude': {
      const c = '#d9774f';
      box(g, c, 0.4, 0.26, 0.24, 0, 0.22, 0);
      box(g, c, 0.08, 0.08, 0.1, 0.24, 0.24, 0);
      box(g, c, 0.08, 0.08, 0.1, -0.24, 0.24, 0);
      box(g, '#1d1a18', 0.04, 0.09, 0.02, 0.08, 0.25, 0.125);
      box(g, '#1d1a18', 0.04, 0.09, 0.02, -0.08, 0.25, 0.125);
      const legs = [];
      for (const x of [0.15, 0.05, -0.05, -0.15]) legs.push(box(g, c, 0.06, 0.1, 0.12, x, 0.05, 0));
      g.userData.legs = legs;
      break;
    }
    case 'icecoffee': {
      box(g, '#dff0f6', 0.22, 0.3, 0.22, 0, 0.15, 0, { transparent: true, opacity: 0.5 });
      box(g, '#7a4a2c', 0.18, 0.2, 0.18, 0, 0.11, 0);
      box(g, '#ffffff', 0.08, 0.07, 0.08, 0.03, 0.24, 0.02, { transparent: true, opacity: 0.8 });
      box(g, '#3fa25a', 0.03, 0.26, 0.03, 0.05, 0.38, 0);
      eyes(g, 0.17, 0.112, 0.05, 0.035, '#f7efe0');
      break;
    }
    case 'panda': {
      // 푸바오처럼 크게: 다른 친구의 두 배쯤. 하얀 몸에 까만 다리·어깨띠·귀·눈 둘레, 손에 대나무
      const w = '#f4f1ea', k = '#262322';
      box(g, w, 0.5, 0.4, 0.56, 0, 0.32, 0);
      box(g, k, 0.52, 0.14, 0.22, 0, 0.44, 0.12);
      for (const [x, z] of [[0.15, 0.17], [-0.15, 0.17], [0.15, -0.17], [-0.15, -0.17]]) box(g, k, 0.15, 0.2, 0.15, x, 0.1, z);
      const head = new THREE.Group(); head.position.set(0, 0.62, 0.26); g.add(head);
      box(head, w, 0.42, 0.36, 0.36);
      for (const s of [1, -1]) {
        box(head, k, 0.12, 0.11, 0.08, 0.16 * s, 0.2, -0.04);
        box(head, k, 0.1, 0.12, 0.02, 0.09 * s, 0.02, 0.18);
        box(head, '#f7f2e8', 0.035, 0.035, 0.02, 0.085 * s, 0.035, 0.192);
        box(head, '#f2b6bd', 0.06, 0.035, 0.02, 0.15 * s, -0.08, 0.181);
      }
      box(head, '#ece6da', 0.16, 0.1, 0.06, 0, -0.08, 0.19);
      box(head, k, 0.07, 0.045, 0.03, 0, -0.05, 0.225);
      const bamboo = new THREE.Group(); bamboo.position.set(0.2, 0.42, 0.34); g.add(bamboo);
      box(bamboo, '#7fae4a', 0.05, 0.4, 0.05, 0, 0.08, 0);
      box(bamboo, '#5f8f36', 0.06, 0.02, 0.06, 0, 0.0, 0);
      box(bamboo, '#5f8f36', 0.06, 0.02, 0.06, 0, 0.16, 0);
      box(bamboo, '#8cc45a', 0.12, 0.03, 0.06, 0.05, 0.27, 0).rotation.z = 0.5;
      anim.push((t) => { head.rotation.z = Math.sin(t * 1.3) * 0.06; bamboo.rotation.x = Math.sin(t * 2.6) * 0.15; });
      break;
    }
    case 'squirrel': {
      // 햄스터만 한 다람쥐: 등에 줄무늬, 도토리를 안고, 몸보다 큰 꼬리가 말려 올라간다
      const c = '#b8733a', d = '#7a4a26', cream = '#f2dcb8';
      box(g, c, 0.2, 0.2, 0.22, 0, 0.11, 0);
      box(g, d, 0.04, 0.2, 0.2, 0, 0.13, -0.01);
      box(g, cream, 0.14, 0.13, 0.02, 0, 0.1, 0.111);
      box(g, c, 0.2, 0.18, 0.18, 0, 0.27, 0.06);
      box(g, cream, 0.12, 0.07, 0.02, 0, 0.23, 0.151);
      eyes(g, 0.29, 0.152, 0.055, 0.035);
      box(g, '#2a2220', 0.03, 0.02, 0.02, 0, 0.25, 0.162);
      for (const s of [1, -1]) box(g, d, 0.05, 0.07, 0.03, 0.07 * s, 0.39, 0.06);
      box(g, '#9a6a3a', 0.07, 0.07, 0.07, 0, 0.13, 0.15);
      box(g, '#5a3a20', 0.08, 0.03, 0.08, 0, 0.175, 0.15);
      const tail = new THREE.Group(); tail.position.set(0, 0.12, -0.12); g.add(tail);
      box(tail, c, 0.16, 0.3, 0.14, 0, 0.15, -0.06);
      box(tail, c, 0.16, 0.14, 0.18, 0, 0.32, 0.0);
      box(tail, cream, 0.12, 0.06, 0.12, 0, 0.4, 0.05);
      anim.push((t) => { tail.rotation.x = Math.sin(t * 3) * 0.12; tail.rotation.z = Math.sin(t * 1.7) * 0.08; });
      break;
    }
    case 'turtle': {
      // 등딱지 무늬, 걸으면 발이 움직이고 가끔 고개를 쏙 넣었다 뺀다
      box(g, '#3f7a40', 0.4, 0.12, 0.46, 0, 0.14, 0);
      box(g, '#5c9a50', 0.3, 0.08, 0.36, 0, 0.24, 0);
      for (const [x, z] of [[0, 0], [0.09, 0.1], [-0.09, 0.1], [0.09, -0.1], [-0.09, -0.1]]) box(g, '#8cc06a', 0.07, 0.02, 0.07, x, 0.285, z);
      box(g, '#d8c79a', 0.38, 0.03, 0.44, 0, 0.085, 0);
      const head = new THREE.Group(); head.position.set(0, 0.15, 0.24); g.add(head);
      box(head, '#a8c77a', 0.14, 0.12, 0.16, 0, 0, 0.06);
      eyes(head, 0.02, 0.141, 0.04, 0.03);
      box(head, '#7a9a5a', 0.06, 0.012, 0.01, 0, -0.03, 0.141);
      const legs = [];
      for (const [x, z] of [[0.16, 0.15], [-0.16, 0.15], [0.16, -0.15], [-0.16, -0.15]]) legs.push(box(g, '#a8c77a', 0.1, 0.08, 0.12, x, 0.05, z));
      box(g, '#a8c77a', 0.04, 0.04, 0.08, 0, 0.1, -0.26);
      g.userData.legs = legs;
      anim.push((t) => { head.position.z = 0.24 - Math.max(0, Math.sin(t * 0.7)) ** 6 * 0.1; });
      break;
    }
    case 'squid': {
      // 공중에 둥실 떠서, 세모 지느러미 몸통 아래로 다리 여덟 개 + 긴 다리 두 개가 하늘하늘
      const c = '#f2c4c8', dot = '#d98a94';
      box(g, c, 0.2, 0.32, 0.2, 0, 0.32, 0);
      for (const [x, y] of [[0.05, 0.38], [-0.04, 0.3], [0.03, 0.24]]) box(g, dot, 0.03, 0.03, 0.01, x, y, 0.101);
      const fin = box(g, c, 0.24, 0.24, 0.05, 0, 0.5, 0); fin.rotation.z = Math.PI / 4;
      box(g, '#ffffff', 0.08, 0.08, 0.02, 0.055, 0.2, 0.1);
      box(g, '#ffffff', 0.08, 0.08, 0.02, -0.055, 0.2, 0.1);
      eyes(g, 0.2, 0.112, 0.055, 0.04);
      const arms = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, long = i === 2 || i === 7;
        const arm = new THREE.Group(); arm.position.set(Math.cos(a) * 0.07, 0.16, Math.sin(a) * 0.07); g.add(arm);
        box(arm, c, 0.03, long ? 0.3 : 0.18, 0.03, 0, long ? -0.15 : -0.09, 0);
        if (long) box(arm, dot, 0.05, 0.05, 0.04, 0, -0.29, 0);
        arms.push([arm, a]);
      }
      anim.push((t) => arms.forEach(([arm, a], i) => { const w = Math.sin(t * 4 + i) * 0.35; arm.rotation.x = Math.sin(a) * w; arm.rotation.z = -Math.cos(a) * w; }));
      break;
    }
    case 'chorong': {
      // 연등 몸통(분홍 꽃잎 줄무늬) + 초록 받침 + 술, 밤에 은은하게 빛나요
      const glow = { emissive: '#ff9fb4', emissiveIntensity: 0.35 };
      box(g, '#f4a3b6', 0.28, 0.3, 0.28, 0, 0.27, 0, glow);
      for (const y of [0.18, 0.27, 0.36]) box(g, '#e27d97', 0.29, 0.02, 0.29, 0, y, 0, glow);
      box(g, '#3f8f5a', 0.24, 0.05, 0.24, 0, 0.1, 0);
      box(g, '#c8443a', 0.04, 0.08, 0.04, 0, 0.47, 0);
      eyes(g, 0.3, 0.142, 0.06, 0.04);
      for (const s of [1, -1]) box(g, '#ff7f9a', 0.05, 0.025, 0.01, 0.1 * s, 0.24, 0.142);
      const tassel = box(g, '#c8443a', 0.03, 0.1, 0.03, 0, 0.03, 0);
      const legs = []; for (const x of [-0.07, 0.07]) legs.push(box(g, '#3f8f5a', 0.05, 0.06, 0.05, x, 0.04, 0.06));
      g.userData.legs = legs;
      anim.push((t) => { tassel.rotation.z = Math.sin(t * 3) * 0.3; });
      break;
    }
    case 'ppokkeum': {
      // 목어: 나무 물고기, 비늘 홈, 입에서 거품이 뽀글
      const c = '#c9954a', d = '#9a6a2e';
      box(g, c, 0.2, 0.2, 0.34, 0, 0.18, 0);
      for (const z of [-0.06, 0.02]) box(g, d, 0.21, 0.16, 0.02, 0, 0.18, z);
      const tail = new THREE.Group(); tail.position.set(0, 0.18, -0.18); g.add(tail);
      box(tail, c, 0.06, 0.2, 0.1, 0, 0, -0.05);
      for (const s of [1, -1]) { box(g, '#f4efe2', 0.02, 0.06, 0.06, 0.1 * s, 0.22, 0.1); box(g, '#1d1a18', 0.022, 0.035, 0.035, 0.1 * s, 0.22, 0.11); }
      box(g, '#5a3a1e', 0.1, 0.04, 0.02, 0, 0.13, 0.171);
      const bubbles = [0, 1, 2].map((k) => box(g, '#cfe8f6', 0.04, 0.04, 0.04, 0, 0.2, 0.2, { transparent: true, opacity: 0.7 }));
      anim.push((t) => { tail.rotation.y = Math.sin(t * 5) * 0.35; bubbles.forEach((b, k) => { const u = (t * 0.6 + k / 3) % 1; b.position.set(Math.sin(u * 9 + k) * 0.03, 0.2 + u * 0.35, 0.2 + u * 0.05); b.material.opacity = 0.7 * (1 - u); }); });
      break;
    }
    case 'dongja': {
      // 아기 동자: 큰 빡빡머리, 회색 승복, 노란 띠. 가끔 두 손을 모아요
      const skin = '#f3d2b2';
      box(g, skin, 0.26, 0.24, 0.24, 0, 0.42, 0);
      box(g, '#e6c3a0', 0.27, 0.05, 0.25, 0, 0.53, 0);
      eyes(g, 0.43, 0.121, 0.06, 0.04);
      for (const s of [1, -1]) box(g, '#f0a090', 0.04, 0.02, 0.01, 0.09 * s, 0.38, 0.121);
      box(g, '#9aa39c', 0.22, 0.22, 0.18, 0, 0.2, 0);
      box(g, '#e9d27a', 0.23, 0.03, 0.19, 0, 0.16, 0);
      const arms = [];
      for (const s of [1, -1]) arms.push(box(g, '#9aa39c', 0.06, 0.14, 0.06, 0.14 * s, 0.22, 0.02));
      for (const x of [-0.05, 0.05]) box(g, '#5a5a5a', 0.07, 0.08, 0.1, x, 0.04, 0.01);
      anim.push((t) => { const k = Math.max(0, Math.sin(t * 0.6)) ** 4; arms[0].rotation.x = arms[1].rotation.x = -k * 1.2; arms[0].rotation.z = -k * 0.5; arms[1].rotation.z = k * 0.5; });
      break;
    }
    case 'tiger': {
      // 민화 아기 호랑이: 주황 몸에 검은 줄, 흰 주둥이, 동그란 눈, 말린 꼬리
      const c = '#e98b2e', k = '#2a2220';
      box(g, c, 0.24, 0.2, 0.34, 0, 0.2, 0);
      for (const z of [-0.1, 0, 0.1]) box(g, k, 0.25, 0.04, 0.03, 0, 0.28, z);
      box(g, c, 0.28, 0.24, 0.22, 0, 0.38, 0.2);
      for (const x of [-0.08, 0.08]) box(g, k, 0.03, 0.06, 0.02, x, 0.47, 0.311);
      box(g, '#f6ecd8', 0.16, 0.08, 0.04, 0, 0.32, 0.31);
      box(g, '#2a2220', 0.05, 0.03, 0.02, 0, 0.36, 0.33);
      for (const s of [1, -1]) { box(g, '#fffbe8', 0.07, 0.07, 0.02, 0.08 * s, 0.41, 0.312); box(g, k, 0.04, 0.04, 0.02, 0.08 * s, 0.41, 0.318); box(g, c, 0.07, 0.07, 0.05, 0.11 * s, 0.52, 0.16); }
      for (const [x, z] of [[0.08, 0.12], [-0.08, 0.12], [0.08, -0.12], [-0.08, -0.12]]) box(g, c, 0.07, 0.12, 0.07, x, 0.06, z);
      const tail = new THREE.Group(); tail.position.set(0, 0.26, -0.17); g.add(tail);
      box(tail, c, 0.05, 0.05, 0.14, 0, 0, -0.06); box(tail, k, 0.05, 0.14, 0.05, 0, 0.08, -0.13);
      anim.push((t) => { tail.rotation.z = Math.sin(t * 2.5) * 0.4; });
      break;
    }
    case 'kkachi': {
      // 까치: 검은 머리와 꼬리, 흰 배, 푸른 날개 끝. 공중에서 파닥파닥
      const k = '#1f2328';
      box(g, k, 0.14, 0.14, 0.14, 0, 0.26, 0.1);
      box(g, '#f4f4f2', 0.16, 0.14, 0.2, 0, 0.16, 0);
      box(g, k, 0.16, 0.06, 0.2, 0, 0.24, -0.01);
      box(g, '#3a4a5a', 0.05, 0.04, 0.26, 0, 0.2, -0.22);
      box(g, '#2c3a52', 0.06, 0.03, 0.08, 0, 0.21, -0.36);
      box(g, '#2a2a2a', 0.04, 0.03, 0.06, 0, 0.25, 0.2);
      for (const s of [1, -1]) box(g, '#fff', 0.02, 0.03, 0.03, 0.071 * s, 0.29, 0.13);
      const wings = [1, -1].map((s) => { const w = new THREE.Group(); w.position.set(0.08 * s, 0.22, 0); g.add(w); box(w, k, 0.16, 0.03, 0.14, 0.08 * s, 0, 0); box(w, '#3f6fa8', 0.06, 0.032, 0.14, 0.14 * s, 0, 0); return [w, s]; });
      anim.push((t) => wings.forEach(([w, s]) => (w.rotation.z = Math.sin(t * 14) * 0.6 * s)));
      break;
    }
    case 'toad': {
      // 복두꺼비: 넓적한 몸, 오돌토돌 등, 입에 금빛 엽전
      const c = '#7f8a3e';
      box(g, c, 0.36, 0.16, 0.3, 0, 0.1, 0);
      box(g, c, 0.32, 0.12, 0.2, 0, 0.2, 0.05);
      for (const [x, z] of [[-0.1, -0.06], [0.1, -0.06], [0, -0.1], [-0.12, 0.04], [0.12, 0.04]]) box(g, '#6a7432', 0.05, 0.03, 0.05, x, 0.19, z);
      for (const s of [1, -1]) { box(g, c, 0.09, 0.08, 0.09, 0.11 * s, 0.28, 0.08); box(g, '#f4e48a', 0.06, 0.05, 0.02, 0.11 * s, 0.29, 0.13); box(g, '#1d1a18', 0.03, 0.04, 0.02, 0.11 * s, 0.29, 0.135); }
      const coin = box(g, '#e0b33a', 0.12, 0.12, 0.02, 0, 0.13, 0.21, { metalness: 0.6, roughness: 0.3 });
      box(g, '#8a6a1a', 0.035, 0.035, 0.025, 0, 0.13, 0.215);
      anim.push((t) => { coin.rotation.z = Math.sin(t * 2) * 0.15; });
      break;
    }
    case 'haetae': {
      // 해태: 돌빛 사자개, 둥근 갈기, 이마에 뿔 하나
      const c = '#b9b4a8', m = '#9a948a';
      box(g, c, 0.24, 0.22, 0.34, 0, 0.21, 0);
      box(g, m, 0.34, 0.3, 0.12, 0, 0.36, 0.14);
      box(g, c, 0.24, 0.22, 0.18, 0, 0.36, 0.22);
      box(g, '#7f7a70', 0.04, 0.08, 0.04, 0, 0.51, 0.22);
      for (const s of [1, -1]) { box(g, '#2a2620', 0.05, 0.05, 0.02, 0.06 * s, 0.4, 0.311); box(g, m, 0.08, 0.08, 0.08, 0.15 * s, 0.24, 0.16); }
      box(g, '#c25a4a', 0.1, 0.03, 0.02, 0, 0.3, 0.311);
      for (const [x, z] of [[0.08, 0.12], [-0.08, 0.12], [0.08, -0.12], [-0.08, -0.12]]) box(g, c, 0.08, 0.12, 0.08, x, 0.06, z);
      const tail = box(g, m, 0.1, 0.12, 0.08, 0, 0.32, -0.2);
      anim.push((t) => { tail.rotation.y = Math.sin(t * 3) * 0.3; });
      break;
    }
    case 'frog': {
      // 연잎 배 위의 청개구리, 연잎째 미끄러져 따라와요
      const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 16), mat('#4f9a4a'));
      leaf.position.y = 0.02; g.add(leaf);
      box(g, '#3f8a3a', 0.02, 0.031, 0.24, 0, 0.02, 0.12);
      box(g, '#8ccf5a', 0.18, 0.1, 0.16, 0, 0.1, 0);
      for (const s of [1, -1]) { box(g, '#8ccf5a', 0.07, 0.07, 0.07, 0.06 * s, 0.17, 0.04); box(g, '#1d1a18', 0.035, 0.04, 0.02, 0.06 * s, 0.18, 0.076); box(g, '#7ab84a', 0.06, 0.04, 0.1, 0.1 * s, 0.05, -0.02); }
      box(g, '#f2a0a8', 0.08, 0.015, 0.02, 0, 0.09, 0.081);
      const flower = box(g, '#f4b6c6', 0.06, 0.06, 0.06, 0.16, 0.06, -0.12);
      anim.push((t) => { flower.rotation.y = t; });
      break;
    }
    case 'tteok': {
      // 찹쌀떡 말랑이: 하얀 말랑 떡, 콩가루 점, 통통 튀며 납작해졌다 늘어나요
      const body = new THREE.Group(); g.add(body);
      box(body, '#fbf7ee', 0.3, 0.2, 0.28, 0, 0.1, 0);
      box(body, '#fbf7ee', 0.24, 0.05, 0.22, 0, 0.22, 0);
      for (const [x, z] of [[-0.08, -0.06], [0.07, -0.08], [0.1, 0.03]]) box(body, '#e8d4a0', 0.03, 0.01, 0.03, x, 0.248, z);
      eyes(body, 0.13, 0.141, 0.06, 0.035);
      for (const s of [1, -1]) box(body, '#f6b1b8', 0.05, 0.025, 0.01, 0.1 * s, 0.1, 0.141);
      box(body, '#c46a5a', 0.04, 0.02, 0.01, 0, 0.09, 0.141);
      anim.push((t) => { const k = Math.sin(t * 4); body.scale.set(1 + k * 0.06, 1 - k * 0.08, 1 + k * 0.06); });
      break;
    }
    case 'firefly': {
      // 반딧불이: 작은 몸, 투명 날개, 꼬리가 노랗게 깜빡깜빡
      box(g, '#2a2a2e', 0.1, 0.08, 0.12, 0, 0.2, 0.04);
      box(g, '#c8443a', 0.08, 0.06, 0.06, 0, 0.22, 0.12);
      eyes(g, 0.23, 0.151, 0.025, 0.025, '#fff');
      const tail = box(g, '#e8f07a', 0.1, 0.09, 0.12, 0, 0.19, -0.08, { emissive: '#e8f05a', emissiveIntensity: 1 });
      for (const s of [1, -1]) box(g, '#2a2a2e', 0.012, 0.08, 0.012, 0.03 * s, 0.28, 0.13);
      const wings = [1, -1].map((s) => { const w = box(g, '#e6f0ff', 0.14, 0.01, 0.08, 0.08 * s, 0.25, 0, { transparent: true, opacity: 0.55 }); return [w, s]; });
      anim.push((t) => { wings.forEach(([w, s]) => (w.rotation.z = Math.sin(t * 20) * 0.5 * s)); tail.material.emissiveIntensity = 0.3 + (Math.sin(t * 2.5) * 0.5 + 0.5) * 1.4; });
      break;
    }
    case 'baekgu': {
      // 백구: 하얀 진돗개, 쫑긋 세모 귀, 등 위로 둥글게 말린 꼬리
      const c = '#f4efe4', d = '#e6dccb';
      box(g, c, 0.24, 0.2, 0.38, 0, 0.21, 0);
      box(g, c, 0.24, 0.22, 0.22, 0, 0.38, 0.21);
      box(g, d, 0.12, 0.08, 0.08, 0, 0.32, 0.34);
      box(g, '#2a2220', 0.05, 0.04, 0.03, 0, 0.36, 0.38);
      eyes(g, 0.42, 0.321, 0.06, 0.04);
      for (const s of [1, -1]) { const e = box(g, c, 0.07, 0.11, 0.04, 0.08 * s, 0.54, 0.19); e.rotation.z = -0.25 * s; box(g, '#f0c6c0', 0.03, 0.06, 0.01, 0.08 * s, 0.53, 0.212); }
      for (const [x, z] of [[0.08, 0.13], [-0.08, 0.13], [0.08, -0.13], [-0.08, -0.13]]) box(g, c, 0.07, 0.12, 0.07, x, 0.06, z);
      const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.2); g.add(tail);
      box(tail, c, 0.08, 0.14, 0.08, 0, 0.06, 0); box(tail, c, 0.08, 0.08, 0.12, 0, 0.13, 0.06);
      anim.push((t) => { tail.rotation.y = Math.sin(t * 8) * 0.35; });
      break;
    }
    case 'fawn': {
      // 아기 꽃사슴: 밤색 몸에 하얀 점, 가는 다리, 큰 귀
      const c = '#b8743e';
      box(g, c, 0.2, 0.18, 0.34, 0, 0.3, 0);
      for (const [x, z] of [[0.05, -0.08], [-0.05, 0.02], [0.04, 0.1], [-0.06, -0.12], [0.0, -0.02]]) box(g, '#f6efe0', 0.035, 0.01, 0.035, x, 0.395, z);
      box(g, c, 0.16, 0.18, 0.18, 0, 0.48, 0.2);
      box(g, '#f2e2c8', 0.1, 0.07, 0.06, 0, 0.42, 0.3);
      box(g, '#2a2220', 0.04, 0.03, 0.02, 0, 0.45, 0.33);
      eyes(g, 0.51, 0.291, 0.05, 0.04);
      for (const s of [1, -1]) { const e = box(g, c, 0.1, 0.05, 0.03, 0.12 * s, 0.56, 0.18); e.rotation.z = 0.4 * s; }
      const legs = []; for (const [x, z] of [[0.06, 0.12], [-0.06, 0.12], [0.06, -0.12], [-0.06, -0.12]]) legs.push(box(g, '#9a5e30', 0.04, 0.22, 0.04, x, 0.11, z));
      g.userData.legs = legs;
      box(g, '#f6efe0', 0.06, 0.06, 0.04, 0, 0.36, -0.18);
      break;
    }
    case 'otter': {
      // 수달: 갈색 길쭉한 몸, 밝은 얼굴, 두 손에 조개
      const c = '#7a5236';
      box(g, c, 0.22, 0.26, 0.2, 0, 0.18, 0);
      box(g, c, 0.2, 0.18, 0.18, 0, 0.38, 0.02);
      box(g, '#d9b894', 0.14, 0.1, 0.04, 0, 0.35, 0.11);
      box(g, '#2a2220', 0.04, 0.03, 0.02, 0, 0.38, 0.135);
      eyes(g, 0.42, 0.111, 0.05, 0.03);
      for (const s of [1, -1]) box(g, c, 0.04, 0.04, 0.03, 0.08 * s, 0.48, 0.02);
      const shell = box(g, '#f2c9b0', 0.1, 0.03, 0.08, 0, 0.24, 0.12);
      for (const s of [1, -1]) box(g, '#6a442c', 0.05, 0.05, 0.05, 0.07 * s, 0.24, 0.1);
      box(g, c, 0.07, 0.05, 0.24, 0, 0.05, -0.18);
      anim.push((t) => { shell.rotation.x = Math.sin(t * 3) * 0.2; });
      break;
    }
    case 'mandarin': {
      // 원앙: 주황 볏, 흰 눈썹 줄, 보라 가슴, 주황 돛깃 — 둘이 한 쌍처럼 꼬마 짝꿍도 함께
      const mk = (x, s) => {
        const b = new THREE.Group(); b.position.x = x; b.scale.setScalar(s); g.add(b);
        box(b, '#8a6a4a', 0.16, 0.12, 0.24, 0, 0.1, 0);
        box(b, '#5b3a6a', 0.15, 0.1, 0.06, 0, 0.12, 0.12);
        box(b, '#e8873a', 0.04, 0.1, 0.08, 0.07, 0.17, -0.04); box(b, '#e8873a', 0.04, 0.1, 0.08, -0.07, 0.17, -0.04);
        box(b, '#e8873a', 0.12, 0.12, 0.12, 0, 0.24, 0.12);
        box(b, '#2f6f4a', 0.12, 0.05, 0.13, 0, 0.31, 0.1);
        box(b, '#f6f2ea', 0.125, 0.025, 0.06, 0, 0.27, 0.13);
        box(b, '#d9443a', 0.05, 0.03, 0.05, 0, 0.23, 0.2);
        for (const s2 of [1, -1]) box(b, '#1d1a18', 0.02, 0.025, 0.02, 0.06 * s2, 0.255, 0.16);
        return b;
      };
      const a = mk(-0.1, 1), b = mk(0.14, 0.8);
      anim.push((t) => { a.position.y = Math.abs(Math.sin(t * 3)) * 0.02; b.position.y = Math.abs(Math.sin(t * 3 + 1)) * 0.02; });
      break;
    }
    case 'hedgehog': {
      // 고슴도치: 동그란 몸 위로 뾰족한 가시, 콩 같은 코
      box(g, '#e8d2b0', 0.26, 0.16, 0.3, 0, 0.1, 0);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, r = 0.09 + (i % 3) * 0.02; const sp = box(g, i % 2 ? '#6a5442' : '#8a7058', 0.05, 0.12, 0.05, Math.cos(a) * r, 0.2 + (i % 2) * 0.02, Math.sin(a) * r - 0.03); sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      box(g, '#e8d2b0', 0.14, 0.1, 0.1, 0, 0.1, 0.17);
      box(g, '#1d1a18', 0.04, 0.035, 0.03, 0, 0.11, 0.23);
      eyes(g, 0.14, 0.221, 0.04, 0.03);
      break;
    }
    case 'raccoon': {
      // 너구리: 회갈색, 눈가 까만 가면, 줄무늬 꼬리
      const c = '#8a7d6e', k = '#2e2a26';
      box(g, c, 0.24, 0.2, 0.34, 0, 0.2, 0);
      box(g, c, 0.26, 0.22, 0.2, 0, 0.38, 0.18);
      box(g, k, 0.26, 0.07, 0.02, 0, 0.4, 0.281);
      box(g, '#f0ebe2', 0.12, 0.07, 0.04, 0, 0.32, 0.29);
      box(g, k, 0.04, 0.03, 0.02, 0, 0.35, 0.31);
      for (const s of [1, -1]) { box(g, '#fff', 0.035, 0.035, 0.01, 0.07 * s, 0.4, 0.292); box(g, c, 0.07, 0.07, 0.04, 0.09 * s, 0.52, 0.16); }
      for (const [x, z] of [[0.08, 0.12], [-0.08, 0.12], [0.08, -0.12], [-0.08, -0.12]]) box(g, k, 0.07, 0.11, 0.07, x, 0.055, z);
      const tail = new THREE.Group(); tail.position.set(0, 0.24, -0.18); g.add(tail);
      for (let i = 0; i < 4; i++) box(tail, i % 2 ? k : '#b0a492', 0.1, 0.1, 0.06, 0, 0, -0.03 - i * 0.06);
      anim.push((t) => { tail.rotation.y = Math.sin(t * 2.4) * 0.35; });
      break;
    }
    case 'bamtol': {
      // 밤톨이: 반질반질 알밤 몸, 머리 위 초록 밤송이 가시
      box(g, '#7a4524', 0.26, 0.24, 0.24, 0, 0.16, 0, { roughness: 0.35 });
      box(g, '#e8d2a8', 0.2, 0.06, 0.2, 0, 0.04, 0);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = box(g, '#8ab04a', 0.03, 0.1, 0.03, Math.cos(a) * 0.06, 0.32, Math.sin(a) * 0.06); sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
      eyes(g, 0.17, 0.121, 0.06, 0.04, '#f6efe0');
      for (const s of [1, -1]) box(g, '#e89a8a', 0.04, 0.02, 0.01, 0.09 * s, 0.13, 0.121);
      const legs = []; for (const x of [-0.06, 0.06]) legs.push(box(g, '#5a3018', 0.05, 0.05, 0.05, x, 0.02, 0.06));
      g.userData.legs = legs;
      break;
    }
    case 'lotusbud': {
      // 연꽃 봉오리: 초록 잎 받침 위 분홍 봉오리, 가끔 꽃잎이 활짝 벌어져요
      box(g, '#4f9a4a', 0.28, 0.03, 0.28, 0, 0.02, 0);
      box(g, '#3f8a3a', 0.04, 0.1, 0.04, 0, 0.08, 0);
      const petals = [];
      for (let i = 0; i < 5; i++) { const p = new THREE.Group(); p.position.y = 0.14; p.rotation.y = (i / 5) * Math.PI * 2; g.add(p); box(p, i % 2 ? '#f4b6c6' : '#f09aae', 0.1, 0.22, 0.04, 0, 0.11, 0.05); petals.push(p); }
      const face = box(g, '#fbe7ec', 0.12, 0.12, 0.12, 0, 0.24, 0);
      eyes(g, 0.25, 0.061, 0.03, 0.025);
      anim.push((t) => { const open = Math.max(0, Math.sin(t * 0.5)) ** 3; petals.forEach((p) => (p.rotation.x = 0.1 + open * 0.8)); face.visible = open > 0.3; });
      break;
    }
    case 'cloud': {
      // 구름이: 몽실몽실 하얀 구름, 졸린 눈, 가끔 작은 빗방울
      const m = mat('#ffffff', { roughness: 0.9 });
      for (const [x, y, z, s] of [[0, 0.2, 0, 0.22], [-0.14, 0.17, 0, 0.16], [0.14, 0.17, 0, 0.16], [0.06, 0.29, -0.02, 0.15], [-0.07, 0.28, 0.02, 0.13]]) box(g, m, s, s * 0.8, s, x, y, z);
      box(g, '#2a2a30', 0.05, 0.015, 0.02, 0.05, 0.21, 0.112); box(g, '#2a2a30', 0.05, 0.015, 0.02, -0.05, 0.21, 0.112);
      box(g, '#f6b1b8', 0.04, 0.02, 0.01, 0.09, 0.18, 0.112); box(g, '#f6b1b8', 0.04, 0.02, 0.01, -0.09, 0.18, 0.112);
      const drop = box(g, '#8cc4f0', 0.025, 0.04, 0.025, 0, 0.05, 0);
      anim.push((t) => { const u = (t * 0.8) % 1; drop.position.y = 0.1 - u * 0.25; drop.visible = Math.sin(t * 0.3) > 0.4; });
      break;
    }
    case 'dragon': {
      // 아기 청룡: 푸른 몸에 노란 배, 작은 뿔 두 개, 구불구불 꼬리
      const c = '#3f8ab0', y = '#f2d37a';
      box(g, c, 0.2, 0.18, 0.28, 0, 0.2, 0);
      box(g, y, 0.14, 0.12, 0.02, 0, 0.18, 0.141);
      box(g, c, 0.2, 0.18, 0.2, 0, 0.36, 0.16);
      box(g, '#5aa6c8', 0.12, 0.08, 0.08, 0, 0.32, 0.29);
      for (const s of [1, -1]) { box(g, '#f6efe0', 0.03, 0.08, 0.03, 0.06 * s, 0.48, 0.12); box(g, '#1d1a18', 0.035, 0.045, 0.02, 0.06 * s, 0.39, 0.261); box(g, '#5aa6c8', 0.1, 0.02, 0.1, 0.14 * s, 0.26, 0.02); }
      for (let i = 0; i < 5; i++) box(g, '#2f6f92', 0.04, 0.04, 0.04, 0, 0.3, 0.1 - i * 0.07);
      const tail = []; for (let i = 0; i < 4; i++) tail.push(box(g, c, 0.1 - i * 0.015, 0.1 - i * 0.015, 0.1, 0, 0.18, -0.18 - i * 0.08));
      anim.push((t) => tail.forEach((b, i) => (b.position.x = Math.sin(t * 3 - i * 0.8) * 0.04 * (i + 1))));
      break;
    }
    case 'laptop': {
      box(g, '#c9ccd2', 0.34, 0.03, 0.24, 0, 0.03, 0);
      box(g, '#9aa0a8', 0.28, 0.005, 0.12, 0, 0.047, 0.03);
      const lid = new THREE.Group(); lid.position.set(0, 0.045, -0.11); g.add(lid);
      box(lid, '#c9ccd2', 0.34, 0.24, 0.02, 0, 0.12, 0);
      box(lid, '#2c3e58', 0.3, 0.2, 0.005, 0, 0.12, 0.011, { emissive: '#2c4e78', emissiveIntensity: 0.4 });
      for (const x of [-0.05, 0.05]) box(lid, '#bff0ff', 0.03, 0.04, 0.006, x, 0.14, 0.014, { emissive: '#bff0ff', emissiveIntensity: 0.8 });
      box(lid, '#bff0ff', 0.07, 0.015, 0.006, 0, 0.09, 0.014, { emissive: '#bff0ff', emissiveIntensity: 0.8 });
      anim.push((t) => { lid.rotation.x = -0.25 + Math.sin(t * 1.5) * 0.12; });
      break;
    }
    case 'tablet': {
      // 태블릿: 얇은 은색 판이 비스듬히 서 있고, 화면에 웃는 얼굴, 옆에 흰 펜이 끄적끄적
      const body = new THREE.Group(); body.position.set(0, 0.02, 0); body.rotation.x = -0.25; g.add(body);
      box(body, '#c9ccd2', 0.26, 0.34, 0.02, 0, 0.17, 0);
      box(body, '#1d2330', 0.235, 0.315, 0.005, 0, 0.17, 0.011);
      box(body, '#3a6fa8', 0.22, 0.3, 0.006, 0, 0.17, 0.013, { emissive: '#3a6fa8', emissiveIntensity: 0.45 });
      for (const x of [-0.05, 0.05]) box(body, '#f4f8ff', 0.03, 0.04, 0.007, x, 0.2, 0.016, { emissive: '#f4f8ff', emissiveIntensity: 0.8 });
      box(body, '#f4f8ff', 0.07, 0.015, 0.007, 0, 0.14, 0.016, { emissive: '#f4f8ff', emissiveIntensity: 0.8 });
      box(body, '#6a7080', 0.02, 0.02, 0.006, 0.07, 0.3, -0.011);
      box(g, '#8a909a', 0.2, 0.02, 0.1, 0, 0.01, -0.06);   // 받침
      const pen = new THREE.Group(); pen.position.set(0.18, 0.12, 0.06); g.add(pen);
      box(pen, '#f6f6f8', 0.02, 0.2, 0.02, 0, 0, 0);
      box(pen, '#9aa0a8', 0.012, 0.025, 0.012, 0, -0.11, 0);
      anim.push((t) => { pen.rotation.z = 0.35 + Math.sin(t * 6) * 0.08; pen.position.y = 0.12 + Math.sin(t * 3) * 0.015; });
      break;
    }
    case 'postit': {
      box(g, '#f2d34a', 0.24, 0.12, 0.24, 0, 0.06, 0);
      for (let k = 0; k < 6; k++) box(g, '#e6c43a', 0.245, 0.004, 0.245, 0, 0.02 + k * 0.018, 0);
      eyes(g, 0.07, 0.121, 0.05, 0.03);
      const sheet = box(g, '#f8e57a', 0.24, 0.005, 0.24, 0, 0.125, 0);
      anim.push((t) => { const u = t % 3; sheet.position.y = 0.125 + Math.max(0, u - 2) * 0.2; sheet.rotation.z = Math.max(0, u - 2) * 0.6; sheet.visible = u < 2.9; });
      break;
    }
    case 'tumbler': {
      box(g, '#8cc4e6', 0.16, 0.34, 0.16, 0, 0.17, 0);
      box(g, '#f4f6f8', 0.17, 0.06, 0.17, 0, 0.37, 0);
      box(g, '#6aa8cc', 0.165, 0.04, 0.165, 0, 0.1, 0);
      const straw = box(g, '#f0806a', 0.025, 0.16, 0.025, 0.03, 0.47, 0);
      eyes(g, 0.24, 0.081, 0.04, 0.03);
      box(g, '#f6b1b8', 0.03, 0.015, 0.01, 0.06, 0.2, 0.081); box(g, '#f6b1b8', 0.03, 0.015, 0.01, -0.06, 0.2, 0.081);
      anim.push((t) => { straw.rotation.z = Math.sin(t * 2) * 0.12; });
      break;
    }
    case 'stapler': {
      box(g, '#2a2c30', 0.12, 0.04, 0.34, 0, 0.02, 0);
      const top = new THREE.Group(); top.position.set(0, 0.05, -0.15); g.add(top);
      box(top, '#d9443a', 0.12, 0.06, 0.32, 0, 0.03, 0.15);
      for (const x of [-0.03, 0.03]) box(top, '#fff', 0.025, 0.03, 0.01, x, 0.04, 0.311);
      for (const x of [-0.03, 0.03]) box(top, '#1d1a18', 0.012, 0.015, 0.012, x, 0.04, 0.315);
      anim.push((t) => { top.rotation.x = -Math.max(0, Math.sin(t * 3)) * 0.35; });
      break;
    }
    case 'mouse': {
      box(g, '#f2f2f4', 0.16, 0.08, 0.24, 0, 0.05, 0);
      box(g, '#f2f2f4', 0.14, 0.04, 0.2, 0, 0.1, -0.01);
      box(g, '#d8d8de', 0.005, 0.05, 0.1, 0, 0.1, 0.06);
      const wheel = box(g, '#5aa6c8', 0.025, 0.04, 0.04, 0, 0.125, 0.06, { emissive: '#5aa6c8', emissiveIntensity: 0.6 });
      eyes(g, 0.07, 0.121, 0.04, 0.025);
      const cord = []; for (let k = 0; k < 4; k++) cord.push(box(g, '#c8c8ce', 0.02, 0.02, 0.06, 0, 0.03, -0.15 - k * 0.06));
      anim.push((t) => { wheel.rotation.x = t * 4; cord.forEach((c, k) => (c.position.x = Math.sin(t * 3 - k) * 0.02 * k)); });
      break;
    }
    case 'calc': {
      box(g, '#3a3e46', 0.22, 0.05, 0.3, 0, 0.03, 0);
      const scr = box(g, '#a8c8a0', 0.18, 0.006, 0.07, 0, 0.058, -0.09, { emissive: '#7a9a70', emissiveIntensity: 0.3 });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) box(g, c === 3 ? '#e8873a' : '#d8dce2', 0.035, 0.012, 0.03, -0.06 + c * 0.04, 0.06, -0.01 + r * 0.04);
      anim.push((t) => { scr.material.emissiveIntensity = 0.2 + (Math.sin(t * 4) > 0 ? 0.4 : 0); });
      break;
    }
    case 'stamp': {
      box(g, '#c8443a', 0.16, 0.03, 0.16, 0, 0.015, 0);
      const st = new THREE.Group(); g.add(st);
      box(st, '#8a5a32', 0.12, 0.08, 0.12, 0, 0.07, 0);
      box(st, '#6a4224', 0.05, 0.14, 0.05, 0, 0.18, 0);
      box(st, '#8a5a32', 0.1, 0.06, 0.1, 0, 0.27, 0);
      eyes(st, 0.08, 0.061, 0.03, 0.025, '#f6efe0');
      anim.push((t) => { const u = t % 2; st.position.y = u < 1.7 ? 0.04 + Math.sin(u / 1.7 * Math.PI) * 0.06 : 0.04 - (u - 1.7) * 0.1; });
      break;
    }
    case 'idcard': {
      const card = new THREE.Group(); g.add(card); card.position.y = 0.05;
      box(card, '#fafafa', 0.18, 0.26, 0.015, 0, 0.13, 0);
      box(card, '#3d8fc4', 0.18, 0.05, 0.016, 0, 0.235, 0);
      box(card, '#d8c4a8', 0.08, 0.09, 0.016, 0, 0.14, 0.001);
      for (const x of [-0.015, 0.015]) box(card, '#1d1a18', 0.012, 0.015, 0.017, x, 0.15, 0.002);
      box(card, '#9aa0a8', 0.12, 0.012, 0.016, 0, 0.06, 0.001);
      box(card, '#3d8fc4', 0.03, 0.12, 0.015, 0, 0.32, 0);
      anim.push((t) => { card.rotation.y = Math.sin(t * 1.5) * 0.4; });
      break;
    }
    case 'deskcal': {
      for (const s of [1, -1]) { const p = box(g, '#3a3e46', 0.26, 0.24, 0.015, 0, 0.12, 0.05 * s); p.rotation.x = 0.25 * s; }
      const page = box(g, '#fbf8f0', 0.24, 0.2, 0.012, 0, 0.12, 0.072); page.rotation.x = 0.25;
      box(g, '#d9443a', 0.24, 0.05, 0.013, 0, 0.21, 0.05).rotation.x = 0.25;
      box(g, '#2a2420', 0.07, 0.07, 0.013, 0, 0.11, 0.077).rotation.x = 0.25;
      for (const x of [-0.07, 0.07]) box(g, '#c8a24a', 0.02, 0.03, 0.03, x, 0.25, 0.03);
      break;
    }
    case 'cupramen': {
      box(g, '#f4efe4', 0.2, 0.2, 0.2, 0, 0.1, 0);
      box(g, '#d9443a', 0.205, 0.06, 0.205, 0, 0.14, 0);
      box(g, '#f2d37a', 0.22, 0.012, 0.22, 0, 0.205, 0);
      const lid = box(g, '#f6f2ea', 0.2, 0.008, 0.12, 0, 0.215, -0.05); lid.rotation.x = -0.4;
      box(g, '#1d1a18', 0.012, 0.15, 0.012, 0.06, 0.28, 0.04).rotation.z = 0.3;
      box(g, '#1d1a18', 0.012, 0.15, 0.012, 0.08, 0.28, 0.04).rotation.z = 0.3;
      eyes(g, 0.08, 0.101, 0.05, 0.03);
      const steam = [0, 1].map((k) => box(g, '#ffffff', 0.04, 0.1, 0.04, -0.04 + k * 0.06, 0.3, 0.03, { transparent: true, opacity: 0.6 }));
      anim.push((t) => steam.forEach((m, k) => { const u = (t * 0.4 + k * 0.5) % 1; m.position.y = 0.26 + u * 0.15; m.material.opacity = 0.6 * (1 - u); }));
      break;
    }
    case 'pumpkin': {
      // 호박 등불: 주황 호박에 세모 눈과 웃는 입이 안에서 빛나요
      const c = '#e8873a';
      box(g, c, 0.38, 0.3, 0.34, 0, 0.17, 0);
      for (const x of [-0.14, 0.14]) box(g, '#d9772e', 0.08, 0.28, 0.35, x, 0.17, 0);
      box(g, '#4f7a3a', 0.05, 0.08, 0.05, 0, 0.36, 0);
      const glow = { emissive: '#ffcf5a', emissiveIntensity: 1.2 };
      for (const x of [-0.08, 0.08]) { const e = box(g, '#ffcf5a', 0.07, 0.06, 0.02, x, 0.22, 0.17, glow); e.rotation.z = 0.785; }
      box(g, '#ffcf5a', 0.18, 0.04, 0.02, 0, 0.11, 0.17, glow);
      for (const x of [-0.05, 0.05]) box(g, c, 0.03, 0.025, 0.025, x, 0.12, 0.172);
      const legs = [];
      for (const x of [-0.1, 0.1]) legs.push(box(g, '#3f6a32', 0.06, 0.06, 0.06, x, 0.02, 0));
      g.userData.legs = legs;
      break;
    }
    case 'fishbowl': {
      // 동그란 어항(블록이라 네모) 속 금붕어가 빙글빙글, 물풀이 흔들흔들
      box(g, '#cfeaf5', 0.36, 0.32, 0.36, 0, 0.17, 0, { transparent: true, opacity: 0.3 });
      box(g, '#4aa6dc', 0.32, 0.22, 0.32, 0, 0.13, 0, { transparent: true, opacity: 0.6 });
      box(g, '#e8d8b0', 0.32, 0.03, 0.32, 0, 0.035, 0);
      for (const [x, z] of [[0.17, 0], [-0.17, 0], [0, 0.17], [0, -0.17]]) box(g, '#f4f8fa', x ? 0.03 : 0.38, 0.03, z ? 0.03 : 0.38, x, 0.33, z);
      const weed = box(g, '#3f9a5a', 0.04, 0.16, 0.04, -0.09, 0.12, -0.08);
      const fish = new THREE.Group(); fish.position.y = 0.15; g.add(fish);
      const body = new THREE.Group(); body.position.x = 0.08; body.scale.setScalar(1.5); fish.add(body);
      box(body, '#f08a3a', 0.05, 0.06, 0.1, 0, 0, 0);
      const tail = box(body, '#f6b06a', 0.02, 0.06, 0.05, 0, 0, -0.07);
      box(body, '#1d1a18', 0.055, 0.015, 0.015, 0, 0.01, 0.035);
      anim.push((t) => { fish.rotation.y = t * 1.2; fish.position.y = 0.14 + Math.sin(t * 1.7) * 0.03; tail.rotation.y = Math.sin(t * 12) * 0.5; weed.rotation.z = Math.sin(t * 1.5) * 0.2; });
      break;
    }
    default:
      return null;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // 사람 무릎~허리 높이가 되도록 키운다
  const wrap = new THREE.Group();
  g.scale.setScalar(1.5 * (PETS.find((p) => p.id === id)?.size || 1));   // 납작한 사물 친구는 조금 크게
  wrap.add(g);
  wrap.userData.anim = anim;
  wrap.userData.legs = g.userData.legs;
  const def = PETS.find((p) => p.id === id);
  wrap.userData.hover = !!def?.hover;
  // 큰 친구(판다)는 주인 바로 옆에 붙되 조금 더 뒤에서 따라와 겹치지 않게 (너무 멀면 남의 친구처럼 보여요)
  wrap.userData.side = def?.side || 1;
  wrap.userData.back = def?.back || 1;
  return wrap;
}
