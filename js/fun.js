// 캠핑 놀이: 불꽃놀이(같은 서버 모두의 하늘에) · 도감(낚시 · 곤충 잡기 · 요리로 모아요, 이 기기에 남아요)
import * as THREE from 'three';

// ───────── 불꽃놀이 ─────────
const COLORS = ['#ff6a4a', '#ffd34a', '#7ad0ff', '#c88aff', '#7dffb0', '#ff8ad0'];
const bursts = [];
let sparkTex = null;
function spark() {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return (sparkTex = new THREE.CanvasTexture(c));
}
// from: 쏜 사람 자리. 하늘로 올라가 1.2초 뒤 터져요
export function launchFirework(scene, from, seed = Math.random()) {
  const n = 140, pos = new Float32Array(n * 3), vel = [];
  const color = new THREE.Color(COLORS[Math.floor(seed * COLORS.length) % COLORS.length]);
  const top = new THREE.Vector3(from.x + (seed - 0.5) * 6, 16 + seed * 6, from.z - 6 - seed * 6);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    vel.push(new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)).multiplyScalar(6 + Math.random() * 2));
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color, size: 0.7, map: spark(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, m); pts.visible = false; scene.add(pts);
  // 올라가는 불씨
  const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: spark(), color: '#fff3c0', blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  trail.scale.setScalar(0.6); trail.position.set(from.x, 1.5, from.z); scene.add(trail);
  bursts.push({ pts, trail, vel, from: trail.position.clone(), top, t: 0 });
}
export function stepFireworks(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt;
    if (b.t < 1.2) { b.trail.position.lerpVectors(b.from, b.top, b.t / 1.2); continue; }
    if (b.trail.parent) { b.trail.removeFromParent(); b.pts.visible = true; }
    const k = b.t - 1.2, p = b.pts.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      const v = b.vel[j];
      p.setXYZ(j, b.top.x + v.x * k, b.top.y + v.y * k - 2.2 * k * k, b.top.z + v.z * k);
    }
    p.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, 1 - k / 2.2);
    if (k > 2.3) { b.pts.removeFromParent(); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
  }
}

// ───────── 도감 ─────────
const KEY = 'campingjang:dex';
export const DEX = {
  fish: { name: '물고기', items: [['피라미', '흔해요'], ['붕어', '흔해요'], ['송사리', '흔해요'], ['쏘가리', '조금 드물어요'], ['꺽지', '조금 드물어요'], ['산천어', '드물어요'], ['무지개송어', '드물어요'], ['황금 잉어', '아주 드물어요']] },
  bug: { name: '곤충', items: [['고추잠자리', '흔해요'], ['배추흰나비', '흔해요'], ['메뚜기', '흔해요'], ['무당벌레', '조금 드물어요'], ['반딧불이', '밤에만'], ['장수풍뎅이', '드물어요'], ['사슴벌레', '드물어요'], ['호랑나비', '아주 드물어요']] },
  food: { name: '요리', items: [['라면', '요리하기'], ['꼬치구이', '요리하기'], ['감자 버터구이', '요리하기'], ['김치찌개', '요리하기'], ['삼겹살', '고기 굽기'], ['소시지', '고기 굽기'], ['생선구이', '잡은 물고기가 있으면'], ['군고구마', '고기 굽기']] },
};
export const loadDex = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
function saveDex(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
// 앞쪽일수록 잘 나와요 (흔한 것 → 드문 것)
function pickWeighted(items, night) {
  const w = items.map(([n, note], i) => (note === '밤에만' && !night ? 0 : 1 / (1 + i * 0.7)));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return items[i][0]; }
  return items[0][0];
}
// 잡거나 만들면 도감에 넣고 [이름, 처음인지] 를 돌려줘요
export function addToDex(kind, { night = false, haveFish = false } = {}) {
  const d = loadDex(), list = DEX[kind].items.filter(([n]) => kind !== 'food' || n !== '생선구이' || haveFish);
  const name = pickWeighted(list, night);
  d[kind] ||= {};
  const first = !d[kind][name];
  d[kind][name] = (d[kind][name] || 0) + 1;
  saveDex(d);
  return [name, first];
}
export function renderDex(el) {
  const d = loadDex();
  el.innerHTML = Object.entries(DEX).map(([k, sec]) => {
    const got = sec.items.filter(([n]) => d[k]?.[n]).length;
    return `<section class="dex-sec"><h3>${sec.name} <small>${got} / ${sec.items.length}</small></h3><div class="dex-grid">${sec.items.map(([n, note]) => {
      const c = d[k]?.[n];
      return `<div class="dex-card${c ? '' : ' locked'}"><b>${c ? n : '???'}</b><small>${c ? `${c}번` : note}</small></div>`;
    }).join('')}</div></section>`;
  }).join('');
}
