// 낮과 밤: 우리나라 가운데쯤(북위 36.5°, 동경 127.5°)의 해 뜨고 지는 시각에 맞춰 하늘·햇빛을 어둡고 밝게.
// 시각은 기기 시간대와 상관없이 한국 시간으로 계산해요. 확인용: ?time=21:30 이면 그 시각으로 고정.
import * as THREE from 'three';

const LAT = 36.5, LON = 127.5;
const RAD = Math.PI / 180;
const NIGHT = new THREE.Color('#17233f');   // 밤하늘
const DUSK = new THREE.Color('#f09a64');    // 해 질 녘·해 뜰 녘 노을
const VIEW_NIGHT = new THREE.Color('#2b3a5e'), WHITE = new THREE.Color('#ffffff');   // 창 밖 그림에 곱하는 밤 색

// 한국 시간: [올해 몇째 날, 0~24 시각]
function kstNow() {
  const fixed = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('time') || '');
  const k = new Date(Date.now() + 9 * 3600e3);
  const day = Math.floor((k - Date.UTC(k.getUTCFullYear(), 0, 0)) / 86400e3);
  const hour = fixed ? +fixed[1] + fixed[2] / 60 : k.getUTCHours() + k.getUTCMinutes() / 60 + k.getUTCSeconds() / 3600;
  return [day, hour];
}

// 해 뜨고 지는 시각 (한국 시간, 시 단위). 대략식이라 몇 분 차이는 나요
export function sunTimes(day = kstNow()[0]) {
  const B = (2 * Math.PI * (day - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // 균시차(분)
  const decl = 23.44 * RAD * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const H = Math.acos((Math.sin(-0.833 * RAD) - Math.sin(LAT * RAD) * Math.sin(decl)) / (Math.cos(LAT * RAD) * Math.cos(decl))) / RAD;
  const noon = 12 - (LON - 135) / 15 - eot / 60;
  return { rise: noon - H / 15, set: noon + H / 15 };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 0(밤) ~ 1(낮). 해 뜨고 지는 앞뒤 40분 동안 천천히 바뀐다
export function daylight() {
  const [day, h] = kstNow();
  const { rise, set } = sunTimes(day);
  return smooth(rise - 0.67, rise + 0.67, h) * (1 - smooth(set - 0.67, set + 0.67, h));
}

// 장소 하나에 낮밤을 입히고, 밝기 배율(환경광에도 곱해요)을 돌려준다. 처음 부를 때 원래 밝기·색을 기억해 두고, 그 값에서 줄이거나 늘린다.
// 해·하늘빛(Hemisphere·Directional)은 밤에 어둡게, 등불(Point·Spot)은 밤에 조금 더 밝게.
// world.timeless 인 곳(보리암 노을 풍경)은 그대로
export function applyDaylight(world, d) {
  if (!world || world.timeless) return 1;
  const g = world.group;
  if (!g.userData.dayBase) {
    const lights = [], skies = [], views = [];
    g.traverse((o) => {
      if (o.material?.userData?.view) views.push(o.material);
      if (o.isLight) lights.push([o, o.intensity]);
      else if (o.material?.uniforms?.top) skies.push([o.material.uniforms, o.material.uniforms.top.value.clone(), o.material.uniforms.bottom.value.clone()]);
    });
    g.userData.dayBase = { lights, skies, views, bg: world.background?.isColor ? world.background.clone() : null, fog: world.fog?.color.clone() };
  }
  const base = g.userData.dayBase;
  const low = base.skies.length ? 0.22 : 0.4;   // 하늘이 있는 바깥은 많이, 건물 안은 조금 덜 어두워진다 (등불이 대신 밝아져요)
  const dusk = 4 * d * (1 - d) * 0.28;   // 낮과 밤 사이에만 노을빛
  const tint = (c, out) => out.copy(NIGHT).lerp(c, 0.06 + 0.94 * d).lerp(DUSK, dusk);
  const k = low + (1 - low) * d;
  for (const [o, i] of base.lights) o.intensity = o.isPointLight || o.isSpotLight ? i * (1 + (1 - d) * 0.6) : i * k;
  for (const [u, top, bottom] of base.skies) { tint(top, u.top.value); tint(bottom, u.bottom.value); if (u.day) u.day.value = d; }
  // 창 밖 풍경: 낮엔 그대로, 해 질 녘엔 노을빛, 밤엔 어두운 남색으로 (그림에 색을 곱해요)
  for (const m of base.views) m.color.copy(VIEW_NIGHT).lerp(WHITE, d).lerp(DUSK, Math.min(0.75, dusk * 2.4));
  if (base.bg) tint(base.bg, world.background);
  if (base.fog) tint(base.fog, world.fog.color);
  return k;
}
