// 앱 흐름: 로딩(두물머리 풍경이 돈다) → 바로 법당 안 → 꾸미기·시간표는 들어간 다음에.
// 장소는 마당(out) · 법당(in) · 공양간(meal) · 내 방(room). 시간표가 바뀌는 때마다 캐릭터가 알아서 옮겨 간다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  LOCATIONS, CHAR_TYPES, OUTFITS, ACCESSORIES, SKIN_TONES, ACTIONS, SERVER_COUNT, SERVER_CAP, GENDERS,
  SCENES, SCENE_ACTIONS, SCENE_ACTION_NAMES, BODIES, FACES, hairName, season, inSeason, BUDDHAS, randomName, defaultLook, isOldAutoName,
} from './data.js';
import { PETS } from './blocky.js';
import { Avatar } from './avatar.js';
import { buildInterior, buildExterior, buildMealHall, buildRoom, buildBoriamView, buildLantern, paintView, PAGODAS, setPanorama } from './world.js';
import { Net, preloadNet } from './net.js';
import { hangScroll, stopScrolls } from './scrolls.js';
import { setSound, sound, moktak, bowl, coin, bigBell, TRACKS, setMusic, music } from './audio.js';
import { buildCampsite, buildShore } from './camp.js';
import { launchFirework, stepFireworks, addToDex, renderDex, loadDex } from './fun.js';
import { daylight, applyDaylight } from './daytime.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('maeum:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('maeum:' + k, JSON.stringify(v)); } catch {} },
};
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (sec) => {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
const fmtLong = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}시간 ${m}분` : `${m}분`;
};
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 다른 분에게 보내는 연등: 소원 글은 빼고 색·법명·시주만
const publicWish = ({ id, n, c, v }) => ({ id, n, c, v });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── 렌더러 ─────────
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const ENV = 0.45; // 환경광. 밤에는 낮밤 배율만큼 줄여요 (js/daytime.js)
scene.environmentIntensity = ENV;
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.enableDamping = true;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = 1.5;
const players = new THREE.Group();
scene.add(players);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ───────── 상태 ─────────
// 처음 온 사람도 기본 캐릭터로 바로 들어간다 (꾸미기는 나중에)
let profile = store.get('profile', null);
if (!profile) { profile = { name: randomName(), look: defaultLook() }; store.set('profile', profile); }
// 예전 낱말로 저절로 지어진 법명은 지금 낱말로 한 번 바꿔 줘요 (직접 지은 이름은 그대로)
if (isOldAutoName(profile.name)) { profile.name = randomName(); store.set('profile', profile); }
profile.look = { ...defaultLook(), ...profile.look };
if (!CHAR_TYPES.some((t) => t.id === profile.look.type)) profile.look.type = defaultLook().type;
// 예전 '캐릭터 기본 옷'은 그 캐릭터 차림을 옷 목록의 같은 옷으로 옮겨요 (모습은 그대로)
if (profile.look.outfit === 'own') { profile.look.outfit = `wear_${profile.look.type}`; store.set('profile', profile); }

const S = {
  profile,
  loc: null,
  server: 0,
  scene: 'in',
  worlds: {},
  active: null,
  me: null,
  seat: null,
  target: null,
  remotes: new Map(),
  wishes: [],
  lanterns: new Map(),
  enteredAt: 0,
  mode: 'loading', // loading | world | gallery
  walking: false,
};

if (params.has('debug')) window.__S = S; // 확인용: ?debug 일 때만 상태를 들여다볼 수 있게

// 신고하기(js/report.js)에서 쓰는 두 가지: 지금 3D 화면 한 장, 지금 상황(서버·장소·근처에 보이는 분 법명)
window.temple = {
  capture(maxW = 1280) {
    renderer.render(scene, camera); // 바로 그린 직후에 읽어야 빈 화면이 아니다
    const k = Math.min(1, maxW / canvas.width);
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  },
  context() {
    const people = [...S.remotes.values()].filter((r) => r.st.s === S.scene && r.av.group.visible).map((r) => r.st.n);
    return { server: String(S.server || ''), scene: SCENES[S.scene]?.name || '', design: S.loc?.name || '', reporter: S.profile.name, people };
  },
};
const net = new Net({
  onCounts: () => { renderServerGrid(); updateHud(); },
  onState: handleRemoteState,
  onAct: (peer, d) => {
    const r = S.remotes.get(peer);
    if (d.a === 'jump') { if (r) r.jumpT = 0; return; }
    const def = ACTIONS.find((a) => a.id === d.a);
    if (r && def && !def.auto && d.on !== false && r.st.s === S.scene) toast(`${r.st.n}님이 ${def.verb}`);
  },
  onWish: (peer, w, backlog) => addWish(w, { animate: !backlog, announce: !backlog }),
  // 관리자가 내린 연등은 천장에서도 바로 내린다
  onUnwish: (id) => {
    S.wishes = S.wishes.filter((w) => w.id !== id);
    const l = S.lanterns.get(id);
    if (l) { l.removeFromParent(); S.lanterns.delete(id); }
  },
  onLeave: (peer) => removeRemote(peer, true),
  onReset: () => { for (const id of [...S.remotes.keys()]) removeRemote(id, false); },
  // 다시 붙었을 때: 서버가 알려 준 분들만 남기고 정리 (그대로 있는 분은 다시 '오셨어요' 하지 않게)
  onKeep: (ids) => { for (const id of [...S.remotes.keys()]) if (!ids.includes(id)) removeRemote(id, false); },
  onFull: (n) => { toast(`서버 ${n}이 가득 차서 다른 서버로 옮겨요`); switchServer(n % SERVER_COUNT + 1); },
  getWishes: () => S.wishes.map(publicWish),
  peerCount: () => S.remotes.size,
});

// ───────── 월드 ─────────
const BUILDERS = { in: buildCampsite, out: buildShore, meal: buildMealHall, room: buildRoom, boriam: buildBoriamView };
// 창밖 풍경: 바깥 3D 풍경을 법당 자리(건물은 숨기고)에서 네 방향으로 찍어 이어 붙인 사진을 창에 붙여요.
// 디자인마다 한 번만, 화면이 한가할 때 따로 만든 작은 그림판(렌더러)으로 찍어서 지금 화면은 멈추지 않아요
const panoDone = new Set();
function capturePanorama(loc) {
  if (panoDone.has(loc.id) || params.has('nopano')) return;
  panoDone.add(loc.id);
  const run = () => {
    try {
      const FW = 1024, FH = 512;
      const r2 = new THREE.WebGLRenderer({ antialias: true });
      r2.setSize(FW, FH, false);
      r2.toneMapping = renderer.toneMapping; r2.toneMappingExposure = 1.15; r2.outputColorSpace = renderer.outputColorSpace;
      const w = buildExterior(loc);
      // 마당 위 물건(법당 · 탑 · 난간 · 석등)은 숨기고 먼 풍경만 찍어요
      if (w.hall) w.hall.visible = false;
      if (w.pagodaSlot) w.pagodaSlot.visible = false;
      w.group.traverse((o) => { if (o.isMesh && o !== w.floor && o.position.length() < 30 && o.geometry?.type !== 'PlaneGeometry' && !o.isInstancedMesh && o.parent === w.group && Math.abs(o.position.y) < 6) o.visible = false; });
      // 마당 둘레 가까운 큰 단풍나무(잎 덩어리 묶음)도 빼요: 창 하나를 통째로 붉게 가려서
      for (const o of w.group.children) { const d = Math.hypot(o.position.x, o.position.z); if (o.isGroup && d > 14 && d < 80 && o.children.some((c) => c.isInstancedMesh)) o.visible = false; }
      if (w.floor) w.floor.visible = false;
      const sc = new THREE.Scene(); sc.add(w.group); sc.fog = w.fog; sc.background = w.background;
      const pm = new THREE.PMREMGenerator(r2); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = ENV;
      const cam = new THREE.PerspectiveCamera(2 * Math.atan(Math.tan(Math.PI / 4) / 2) * 180 / Math.PI, FW / FH, 0.5, 2500);
      const out = document.createElement('canvas'); out.width = FW * 4; out.height = FH;
      const cg = out.getContext('2d');
      for (let i = 0; i < 4; i++) {
        // 마당 가장자리 바깥, 높은 곳에서 바라봐요 (가까운 마당 바닥이 창을 채우지 않게)
        const yaw = -i * Math.PI / 2 - Math.PI / 2;
        cam.position.set(-Math.sin(yaw) * 19, 14, -Math.cos(yaw) * 19);   // 숲이 시작되는 곳(반지름 25) 안쪽, 나무 위 높이에서
        cam.rotation.set(-0.16, yaw, 0, 'YXZ');
        w.update?.(30);
        r2.render(sc, cam);
        cg.drawImage(r2.domElement, i * FW, 0);
      }
      setPanorama(loc, out);
      pm.dispose(); r2.dispose(); r2.forceContextLoss();
    } catch (e) { console.warn('창밖 풍경을 찍지 못했어요', e); }
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(run, { timeout: 2500 });
}

function worldFor(locId, which) {
  const w = (S.worlds[locId] ||= {});
  if (!w[which]) {
    const loc = LOCATIONS.find((l) => l.id === locId);
    w[which] = BUILDERS[which](loc);
    if (which === 'out') applyPagoda(w.out);
    if (['in', 'room', 'meal'].includes(which)) capturePanorama(loc);
  }
  return w[which];
}

// 실제 불상 3D 스캔 (국립중앙박물관). 법당에서 불상 쪽에 커서를 올리면 ‹ › 로 넘겨 볼 수 있고, 고른 불상은 이 기기에 남는다.
// ?buddha=iron 처럼 주소로도 고를 수 있다
const BUDDHA_IDS = Object.keys(BUDDHAS);
let buddhaId = [params.get('buddha'), store.get('buddha', null)].find((id) => BUDDHAS[id]) || BUDDHA_IDS[0];
const buddhaGLB = {};
async function loadBuddha(world, id = buddhaId) {
  if (!world?.buddhaSlot || !BUDDHAS[id]) return;   // 캠핑장에는 불상이 없어요
  if (world.buddhaSlot.userData.scan === id) return;
  const B = BUDDHAS[id];
  try {
    if (!buddhaGLB[id]) {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      buddhaGLB[id] = loader.loadAsync(B.file);
    }
    const gltf = await buddhaGLB[id];
    if (id !== buddhaId) return; // 불러오는 사이 다른 불상을 골랐으면 그쪽을 건다
    const model = new THREE.Group();
    const inner = gltf.scene.clone(true);
    if (B.zUp) inner.rotation.x = -Math.PI / 2;
    model.add(inner);
    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar((B.height || 4.6) / box.getSize(new THREE.Vector3()).y);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.buddhaSlot.clear();
    world.buddhaSlot.add(model);
    world.buddhaSlot.userData.scan = id;
  } catch (e) { console.warn('불상 모델을 불러오지 못해 기본 불상을 써요', e); }
}

// 불상·탑 고르기: 메뉴의 설정 창에서 ‹ › 로 넘긴다 (화면을 가리지 않게). 고른 것은 이 기기에 남는다
function stepBuddha(step) {
  const i = BUDDHA_IDS.indexOf(buddhaId);
  buddhaId = BUDDHA_IDS[(i + step + BUDDHA_IDS.length) % BUDDHA_IDS.length];
  store.set('buddha', buddhaId);
  for (const w of Object.values(S.worlds)) if (w.in) loadBuddha(w.in);
  renderRelics();
}

const PAGODA_IDS = PAGODAS.map((p) => p.id);
let pagodaId = [params.get('pagoda'), store.get('pagoda', null)].find((id) => PAGODA_IDS.includes(id)) || PAGODA_IDS[0];
function applyPagoda(world) { if (world.pagodaSlot.userData.id !== pagodaId) world.setPagoda(pagodaId); }
function stepPagoda(step) {
  const i = PAGODA_IDS.indexOf(pagodaId);
  pagodaId = PAGODA_IDS[(i + step + PAGODA_IDS.length) % PAGODA_IDS.length];
  store.set('pagoda', pagodaId);
  for (const w of Object.values(S.worlds)) if (w.out) applyPagoda(w.out);
  renderRelics();
}

function renderRelics() {
  const B = BUDDHAS[buddhaId];
  $('#relic-b-name').textContent = B.name;
  $('#relic-b-sub').textContent = `${B.from} · ${B.no} · ${BUDDHA_IDS.indexOf(buddhaId) + 1} / ${BUDDHA_IDS.length}`;
  const P = PAGODAS.find((p) => p.id === pagodaId);
  $('#relic-p-name').textContent = P.name;
  $('#relic-p-sub').textContent = `${P.from} · ${P.note} · ${PAGODA_IDS.indexOf(pagodaId) + 1} / ${PAGODA_IDS.length}`;
}
function openRelics() { renderRelics(); $('#relic-modal').hidden = false; }

function setWorld(world) {
  if (S.active) scene.remove(S.active.group);
  S.active = world;
  scene.add(world.group);
  scene.fog = world.fog;
  scene.background = world.background;
  scene.environmentIntensity = ENV * applyDaylight(world, dayNow());
}
// 낮과 밤: 30초마다 한국의 해 뜨고 지는 시각에 맞춰 다시 칠한다
// 카바나 · 별밤은 늘 밤
const dayNow = () => (S.loc?.night ? 0 : daylight());
setInterval(() => { if (S.active) scene.environmentIntensity = ENV * applyDaylight(S.active, dayNow()); }, 30000);

// 정각마다 범종 한 번 (소리를 켠 분만 들려요)
let bellHour = null;
// 다른 창에 있으면 타이머가 늦게 돌아서, 정각부터 2분 안이면 울려요 (창으로 돌아온 순간에도 확인)
function hourBell() {
  const k = new Date(Date.now() + 9 * 3600e3);
  if (k.getUTCMinutes() > 1 || bellHour === k.getUTCHours()) return;
  if (document.hidden) return;   // 안 보이는 창에서는 소리가 막혀요. 돌아오면 그때 울려요
  bellHour = k.getUTCHours();
  if (S.mode !== 'world' || !sound.on) return;
  bigBell();
  toast(`${bellHour % 12 || 12}시, 범종이 울려요`);
}
// 캠핑장에는 정각 범종이 없어요

// ───────── 내 캐릭터 ─────────
function makeMe() {
  if (S.me) { players.remove(S.me.group); S.me.dispose(); }
  S.me = new Avatar(S.profile.look, S.profile.name, { mine: true });
  S.me.onBow = (n) => {
    $('#bae-counter').innerHTML = `<small>108배</small><b>${n}</b><small>/ 108</small>`;
    if (n > 0) addRecord('bows', 1);
    if (n >= 108) { bowl(); toast('108배를 모두 마쳤어요'); setTimeout(() => ($('#bae-counter').hidden = true), 2500); }
  };
  players.add(S.me.group);
}

// ───────── 장소 옮기기 ─────────
const fade = (on) => new Promise((r) => { $('#fade').classList.toggle('on', on); setTimeout(r, on ? 460 : 10); });

async function goScene(which, { instant = false } = {}) {
  const from = S.scene;
  if (!instant) await fade(true);
  standUp(true);
  S.walking = false;
  S.target = null;
  S.scene = which;
  const world = worldFor(S.loc.id, which);
  setWorld(world);
  if (which === 'in') { rebuildLanterns(); loadBuddha(world); }
  S.me.dress(which);
  const me = S.me.group;
  if (which === 'out' && world.door) {
    // 건물에서 나오면 법당 문 앞에, 바깥을 바라보고 선다
    me.position.copy(world.door).add(new THREE.Vector3(0, 0, 2.6));
    me.rotation.y = from === 'in' || from === 'meal' || from === 'room' ? 0 : world.spawnRot;
  } else {
    me.position.copy(world.spawn);
    me.rotation.y = world.spawnRot;
  }
  controls.minDistance = world.minDist || 2.2;
  controls.maxDistance = world.maxDist || (which === 'out' ? 38 : 13);
  placeCameraBehind(world.camDist || 5);
  if (which === 'room') {
    sitOn(world.seats[0], { auto: true });
    // 책상 건너편 위에서 내려다보게: 책상이 캐릭터를 가리지 않고 손(책·사경·찻잔)과 얼굴이 함께 보여요.
    // 세로로 긴 휴대폰은 옆이 좁아서 그만큼 뒤로 물러나 가운데에 오게
    const back = Math.min(1.7, Math.max(1, 0.85 / (innerWidth / innerHeight)));
    controls.target.set(0, 0.72, -0.75);
    camera.position.set(1.1 * back, 0.72 + 1.3 * back, -0.75 - 1.95 * back);   // 책상 건너편 위에서 얼굴 쪽으로
    controls.update();
  }
  S.me.tag.visible = which !== 'room';
  S.me.propLift = which === 'room' ? 0.07 : 0;   // 내 방: 책·사경 종이가 책상 위에
  renderActions();   // 장소마다 동작 줄이 달라요
  // 내 방 족자는 들어올 때마다 문구가 바뀐다
  if (which === 'room' || which === 'meal') hangScroll(world); else stopScrolls();
  refreshRemoteVisibility();
  updateHud();
  pushState(true);
  if (!instant) fade(false);
}

function placeCameraBehind(dist) {
  const me = S.me.group;
  const back = new THREE.Vector3(Math.sin(me.rotation.y), 0, Math.cos(me.rotation.y)).multiplyScalar(-dist);
  // 아이패드 세로처럼 큰 세로 화면은 하늘이 반이라, 시선을 조금 내려 마당·사람이 크게 보이게
  // (시선이 높은 마당만 많이 내리고, 법당처럼 원래 낮은 곳은 조금만)
  const lookY = S.active.camLookY ?? 1.1;
  const tilt = innerWidth < innerHeight && innerWidth >= 600 ? Math.min(1.3, Math.max(0, lookY - 1.5)) : 0;
  controls.target.copy(me.position).add(new THREE.Vector3(0, lookY - tilt, 0));
  camera.position.copy(me.position).add(back).add(new THREE.Vector3(0, 1.1 + dist * (S.active.camRise ?? 0.42), 0));
  controls.update();
}

// ───────── 다른 사람들 ─────────
// 내 방은 혼자만의 공간이라 서로 보이지 않는다
const visibleTo = (st) => st.s === S.scene && S.scene !== 'room';

function handleRemoteState(peer, d) {
  if (!d || !d.l || !d.n || !Array.isArray(d.p)) return;
  let r = S.remotes.get(peer);
  if (!r) {
    const av = new Avatar(d.l, String(d.n).slice(0, 12));
    players.add(av.group);
    av.group.position.set(d.p[0], 0, d.p[1]);
    av.group.rotation.y = d.r;
    r = { av, st: d, pos: new THREE.Vector3(d.p[0], 0, d.p[1]), rot: d.r, appliedA: null, lookKey: JSON.stringify(d.l), seen: 0 };
    S.remotes.set(peer, r);
    if (S.mode === 'world') toast(`${d.n}님이 캠핑장에 왔어요`);
  }
  const lookKey = JSON.stringify(d.l);
  if (lookKey !== r.lookKey) { r.av.setLook(d.l, d.s); r.lookKey = lookKey; }
  else r.av.dress(d.s);
  if (d.n !== r.st.n) r.av.setName(String(d.n).slice(0, 12));
  if (d.s !== r.st.s) r.av.group.position.set(d.p[0], 0, d.p[1]);
  r.st = d;
  r.seen = performance.now();
  r.pos.set(d.p[0], 0, d.p[1]);
  r.rot = d.r;
  r.av.seated = d.seat != null;
  if (d.f && d.f !== r.faceShown) r.av.setFace(d.f);
  r.faceShown = d.f;
  r.seatY = d.y || 0.12;
  if (d.a !== r.appliedA) {
    r.appliedA = d.a;
    if (d.a === 'fireworks' && S.mode === 'world' && d.s === S.scene) launchFirework(scene, new THREE.Vector3(d.p[0], 0, d.p[1]));
    if (d.a) { r.av.action = d.a; r.av.actionT = d.at || 0; r.av.bowCount = 0; }
    else if (ACTIONS.find((a) => a.id === r.av.action)?.loop) r.av.stop();
  }
  r.av.group.visible = visibleTo(d);
  updateHud();
}

function removeRemote(peer, announce) {
  const r = S.remotes.get(peer);
  if (!r) return;
  players.remove(r.av.group);
  r.av.dispose();
  S.remotes.delete(peer);
  if (announce && S.mode === 'world') toast(`${r.st.n}님이 법당을 나섰어요`);
  updateHud();
}

function refreshRemoteVisibility() {
  for (const r of S.remotes.values()) r.av.group.visible = visibleTo(r.st);
}

function seatTaken(id) {
  for (const r of S.remotes.values()) if (r.st.s === S.scene && r.st.seat === id) return true;
  return false;
}

// ───────── 상태 보내기 ─────────
let lastSent = '', lastSentAt = 0;
function pushState(force = false) {
  if (!S.me || S.mode !== 'world') return;
  const g = S.me.group;
  const st = {
    n: S.profile.name, l: S.profile.look, s: S.scene, d: S.loc?.id,
    p: [Math.round(g.position.x * 100) / 100, Math.round(g.position.z * 100) / 100],
    r: Math.round(g.rotation.y * 100) / 100,
    seat: S.seat, y: S.seat != null ? g.position.y : 0,
    a: S.me.action, at: S.me.action ? Math.round(S.me.actionT * 10) / 10 : 0,
    f: S.faceId && Date.now() - S.faceAt < 4000 ? S.faceId : null,
  };
  const key = JSON.stringify({ ...st, at: 0 });
  const now = performance.now();
  // 바뀐 게 있으면 0.25초마다, 없으면 5초마다 한 번
  if (force || (key !== lastSent && now - lastSentAt > 250) || now - lastSentAt > 5000) {
    lastSent = key; lastSentAt = now;
    net.sendState(st);
  }
}

// ───────── 앉기 / 일어서기 ─────────
function sitOn(seat, { auto = false } = {}) {
  if (seat.id !== undefined && S.scene !== 'room' && seatTaken(seat.id)) { if (!auto) toast('다른 분이 앉아 계신 자리예요'); return false; }
  if (!auto) stopWalk();
  S.seat = seat.id;
  S.target = null;
  S.walking = false;
  const g = S.me.group;
  g.position.set(seat.pos.x, seat.y ?? 0.12, seat.pos.z);
  g.rotation.y = seat.rot ?? Math.PI;
  S.me.seated = true;
  S.me.stop();
  if (S.scene !== 'room') turnCameraToFace(S.active.camDist || 5);
  updateHud();
  pushState(true);
  return true;
}

// 앉으면 카메라가 옆으로 천천히 돌아 앞에서 내 얼굴을 비춘다. 화면을 끌거나 걸으면 바로 멈춘다
let camTurn = null;
function turnCameraToFace(dist) {
  const g = S.me.group;
  const off = camera.position.clone().sub(controls.target);
  camTurn = {
    t: 0,
    from: { yaw: Math.atan2(off.x, off.z), r: Math.hypot(off.x, off.z), y: off.y, at: controls.target.clone() },
    to: { yaw: g.rotation.y + 0.4, r: dist * 0.8, y: dist * 0.2, at: g.position.clone().add(new THREE.Vector3(0, 0.95, 0)) },
  };
}
function stepCameraTurn(dt) {
  if (!camTurn) return;
  camTurn.t = Math.min(1, camTurn.t + dt / 1.4);
  const e = camTurn.t * camTurn.t * (3 - 2 * camTurn.t);
  const { from, to } = camTurn;
  const yaw = from.yaw + Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw)) * e;
  const r = from.r + (to.r - from.r) * e;
  controls.target.lerpVectors(from.at, to.at, e);
  camera.position.set(controls.target.x + Math.sin(yaw) * r, controls.target.y + from.y + (to.y - from.y) * e, controls.target.z + Math.cos(yaw) * r);
  if (camTurn.t >= 1) camTurn = null;
}
controls.addEventListener('start', () => { camTurn = null; });

// 빈자리를 누르면 그 자리까지 천천히 걸어가서 앉는다 (내 방은 자리가 하나라 바로)
function walkToSeat(seat) {
  if (seat.id !== undefined && S.scene !== 'room' && seatTaken(seat.id)) { toast('다른 분이 앉아 계신 자리예요'); return; }
  stopWalk();
  if (S.seat === seat.id) return;
  if (S.me.action) { S.me.stop(); syncActionButtons(); }
  const sit = () => {
    if (!sitOn(seat)) return;
    if (S.scene === 'meal') startLoop('eat');
    if (S.scene === 'room') startLoop('read');
  };
  if (S.scene === 'room') { sit(); return; }
  standUp();
  S.target = { pos: new THREE.Vector3(seat.pos.x, 0, seat.pos.z), speed: SEAT_SPEED, onArrive: sit };
}

function standUp(silent) {
  if (S.seat == null) return;
  camTurn = null;
  const back = S.me.group.rotation.y;
  S.seat = null;
  S.me.seated = false;
  S.me.group.position.y = 0;
  S.me.group.position.x -= Math.sin(back) * 0.9;
  S.me.group.position.z -= Math.cos(back) * 0.9;
  if (S.active) collide(S.me.group.position);
  if (!silent) pushState(true);
  updateHud();
}

function freeSeat(seats, random = true) {
  const free = seats.filter((s) => !seatTaken(s.id));
  if (!free.length) return seats[Math.floor(Math.random() * seats.length)];
  return random ? free[Math.floor(Math.random() * Math.min(free.length, 30))] : free[0];
}

// ───────── 동작 ─────────
const ICONS = {
  hapjang: '<path d="M12 3c-1 2-2 5-2 9v6h4v-6c0-4-1-7-2-9z M9 18h6v2H9z"/>',
  banbae: '<circle cx="12" cy="5" r="2.2"/><path d="M12 8c-3 1-5 4-5 7h3l2-3 2 3h3c0-3-2-6-5-7z"/>',
  keunjeol: '<circle cx="6" cy="15" r="2.2"/><path d="M8 16h9c2 0 3 1 3 3H6z"/>',
  beads: '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="1.5 2.2"/><circle cx="12" cy="19.5" r="1.6"/>',
  jukbi: '<path d="M5 19L17 5l2 2L7 21z"/>',
  stones: '<ellipse cx="12" cy="19" rx="7" ry="2.5"/><ellipse cx="12" cy="14.5" rx="5" ry="2"/><ellipse cx="12" cy="10.5" rx="3.5" ry="1.7"/><ellipse cx="12" cy="7" rx="2.2" ry="1.3"/>',
  moktak: '<ellipse cx="11" cy="14" rx="7" ry="5"/><path d="M14 4l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  meditate: '<path d="M12 6c2 2 3 5 0 9-3-4-2-7 0-9zM4 12c3 0 6 2 8 5-4 1-7-1-8-5zM20 12c-3 0-6 2-8 5 4 1 7-1 8-5z"/>',
  wave: '<path d="M8 21v-7l-2-3 1-1 3 3V5a1 1 0 012 0v6h1V4a1 1 0 012 0v7h1V6a1 1 0 012 0v9c0 3-2 6-5 6z"/>',
  bae108: '<text x="12" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor">108</text>',
};

// 아래 동작 줄: 장소마다 다른 다섯 가지 (js/data.js 의 SCENE_ACTIONS)
function renderActions() {
  const ids = SCENE_ACTIONS[S.scene] || SCENE_ACTIONS.in, names = SCENE_ACTION_NAMES[S.scene] || {};
  $('#actions').innerHTML = ids.map((id) => ACTIONS.find((a) => a.id === id)).map((a) =>
    `<button class="act" data-act="${a.id}" aria-pressed="false"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[a.id] || ''}</svg>${names[a.id] || a.name}<small class="cap">${a.cap}</small></button>`).join('');
  syncActionButtons();
}

function doAction(id) {
  // 산보 · 탑돌이: 길을 따라 걷는 동작이라 따로 (다시 누르면 멈춤)
  if (id === 'walk' || id === 'tapdori') {
    const on = S.walking && S.walkMode === id;
    stopWalk();
    S.target = null;
    if (!on) id === 'walk' ? startSanbo() : startTapdori();
    net.sendAct({ a: id, on: !on });
    syncActionButtons();
    return;
  }
  const stonesWasOn = !!S.stones;
  stopWalk();
  if (id === 'stones') {
    const on = !stonesWasOn;
    S.target = null; stopStones(); S.me.stop();
    if (on) startStones();
    net.sendAct({ a: id, on }); pushState(true); syncActionButtons();
    return;
  }
  // 내 방에서 절은 책상에서 물러나 절하는 방석 위에서 (책상에 머리를 박지 않게)
  if (S.scene === 'room' && ['bae108', 'keunjeol', 'banbae'].includes(id) && S.active.bowSpot) {
    S.seat = null; S.me.seated = false;
    S.me.group.position.copy(S.active.bowSpot); S.me.group.rotation.y = Math.PI;
  }
  // 방석에 앉아서 하는 동작(발우공양 · 발우 씻기 · 책 읽기 · 사경)은 서 있으면 먼저 빈 방석에 앉는다
  if (ACTIONS.find((a) => a.id === id)?.seat && S.seat == null && S.active.seats?.length && S.me.action !== id) {
    const seat = S.scene === 'room' ? S.active.seats[0] : freeSeat(S.active.seats, false);
    if (!sitOn(seat, { auto: true })) return;
  }
  S.target = null;
  S.walking = false;
  const on = S.me.play(id);
  if (on && id === 'fireworks') { launchFirework(scene, S.me.group.position); addRecord('fireworks', 1); }
  if (on && (id === 'keunjeol' || id === 'banbae')) { bowl(0.4); addRecord('bows', 1); }
  $('#bae-counter').hidden = !(on && id === 'bae108');
  if (on && id === 'bae108') S.me.onBow(0);
  net.sendAct({ a: id, on });
  pushState(true);
  syncActionButtons();
}

// 시간표가 시키는 반복 동작 (발우공양, 독서, 명상)
function startLoop(id) {
  S.me.action = id;
  S.me.actionT = 0;
  pushState(true);
  syncActionButtons();
}

function syncActionButtons() {
  const on = (id) => id === 'walk' ? (S.walking && S.walkMode === 'walk') || walkStarting : id === 'tapdori' ? S.walking && S.walkMode === 'tapdori' : id === 'stones' ? !!S.stones : S.me?.action === id;
  document.querySelectorAll('.act').forEach((b) => b.setAttribute('aria-pressed', String(on(b.dataset.act))));
  const sanbo = on('walk');
  $('#btn-sanbo').setAttribute('aria-pressed', String(sanbo));
  $('#btn-sanbo .lbl').textContent = sanbo ? '산보 멈추기' : '산보하기';
  if (S.me?.action !== 'bae108') $('#bae-counter').hidden = true;
}

let walkStarting = false;   // 산보: 합장하고 걷기 시작하기 전 1.8초
// 직접 움직이면(장소 옮기기 · 앉기 · 일어서기 · 동작) 하던 산보 · 탑돌이를 멈춘다
function stopWalk() {
  if (S.walkMode === 'tapdori' && S.me?.action === 'tapdori') S.me.stop();
  stopStones();
  S.walking = false;
  S.walkMode = null;
  walkStarting = false;
}

// 산보는 삼보일배처럼: 세 걸음 걷고 한 번 합장, 이것을 되풀이하며 마당을 돈다
const WALK_STEP = 0.75;
let walkDist = 0, walkBowT = 0;
// 산보 시작: 먼저 합장하고 1.8초 뒤 걷기 시작 (그 사이 다시 누르면 취소)
async function startSanbo() {
  if (S.scene !== 'out') return;
  standUp(true);
  startWalk();   // 캠핑장 산책: 바로 걷기
}

// 탑돌이: 합장한 채로 탑을 오른쪽에 두고(시계 방향) 둥글게 돈다
function startTapdori() {
  const c = S.active.pagodaSlot?.position;
  if (!c) return;
  const path = Array.from({ length: 20 }, (_, k) => { const a = (-2 * Math.PI * k) / 20; return new THREE.Vector3(c.x + 3 * Math.sin(a), 0, c.z + 3 * Math.cos(a)); });
  startWalk(path, 'tapdori');
  S.me.action = 'tapdori';
  S.me.actionT = 0;
  pushState(true);
}

function startWalk(path = S.active.walkPath, mode = 'walk') {
  if (!path) return;
  standUp(true);
  walkDist = 0;
  walkBowT = 0;
  const p = S.me.group.position;
  let i = 0, best = Infinity;
  path.forEach((w, k) => { const d = w.distanceTo(p); if (d < best) { best = d; i = k; } });
  S.walking = true;
  S.walkMode = mode;
  const go = (k) => {
    if (!S.walking) return;
    S.target = { pos: path[k], speed: 1.5, onArrive: () => go((k + 1) % path.length) };
  };
  go(i);
}

// ───────── 염주 · 목탁 세기 ─────────
// 염주: 108알을 1초에 한 알씩 (한 바퀴 108초). 목탁: 치는 횟수 (위쪽 108배 칸을 같이 써요)
const MALA_N = 108;
let malaShown = -1, moktakShown = -1;
function buildMala() {
  if ($('#mala-ring').childElementCount) return;
  let h = '';
  for (let i = 0; i < MALA_N; i++) { const a = (i / MALA_N) * Math.PI * 2 + Math.PI / 2; h += `<circle class="b" cx="${(Math.cos(a) * 92).toFixed(2)}" cy="${(Math.sin(a) * 92).toFixed(2)}" r="3.6"/>`; }
  $('#mala-ring').innerHTML = h + '<circle class="mo" cx="0" cy="102" r="6"/>';   // 모주(어미 알)는 아래
}
function updateCounters() {
  const act = S.me?.action;
  if (act === 'beads') {
    const total = Math.floor(S.me.actionT), n = total % MALA_N, round = Math.floor(total / MALA_N);
    if (total !== malaShown) {
      buildMala(); $('#mala').hidden = false;
      const beads = $('#mala-ring').querySelectorAll('circle.b');
      beads.forEach((b, i) => b.setAttribute('class', `b${i < n ? ' done' : ''}${i === n ? ' now' : ''}`));
      // 지금 알이 늘 아래(엄지 자리)에 오도록 염주를 돌려요
      $('#mala-ring').style.transform = `rotate(${-(n / MALA_N) * 360}deg)`;
      $('#mala-count').textContent = n;
      $('#mala-round').textContent = round ? `${round}바퀴 돌았어요` : '';
      if (total > 0 && n === 0) { bowl(0.5); toast(`염주 한 바퀴 (108알)를 돌렸어요`); addRecord('beads', 1); }
      malaShown = total;
    }
  } else if (malaShown !== -1) { $('#mala').hidden = true; malaShown = -1; }
  if (act === 'moktak') {
    const n = Math.max(0, Math.floor(S.me.actionT * 1.1 + 0.25) - 1);
    if (n !== moktakShown) { $('#bae-counter').innerHTML = `<small>목탁</small><b>${n}</b><small>번</small>`; $('#bae-counter').hidden = false; moktakShown = n; }
  } else if (moktakShown !== -1) { if (act !== 'bae108') $('#bae-counter').hidden = true; moktakShown = -1; }
}

// ───────── 돌탑 쌓기 ─────────
// 돌 세 개를 쌓으면 그 탑은 그 자리에 남기고, 옆으로 몇 걸음 옮겨 가서 또 쌓아요 (마당 끝에 닿으면 반대쪽으로)
const cairns = [];
function startStones() {
  standUp(true);
  S.stones = { dir: 1 };
  S.me.play('stones');
}
function stopStones() { S.stones = null; }
function stepStones() {
  const me = S.me;
  if (me.action === 'stones' && me.actionT >= 7.4) {
    // 다 쌓은 탑을 그 자리에 내려놓고
    me.cairn.updateWorldMatrix(true, true);
    const c = new THREE.Group();
    me.cairn.children.slice(0, 3).forEach((st) => { const m = st.clone(); m.visible = true; c.add(m); });
    me.cairn.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    S.active.group.add(c); cairns.push(c);
    if (cairns.length > 9) cairns.shift().removeFromParent();
    me.stop();
    // 오른쪽으로 1.6칸 옮겨 가요. 마당 끝이면 방향을 바꿔요
    const g = me.group, right = new THREE.Vector3(-Math.cos(g.rotation.y), 0, Math.sin(g.rotation.y));
    let to = g.position.clone().addScaledVector(right, 1.6 * S.stones.dir);
    if (S.active.radius && Math.hypot(to.x, to.z) > S.active.radius - 1) { S.stones.dir *= -1; to = g.position.clone().addScaledVector(right, 1.6 * S.stones.dir); }
    const face = g.rotation.y;
    S.target = { pos: to, speed: 1.2, face, onArrive: () => { if (S.stones) { me.play('stones'); pushState(true); syncActionButtons(); } } };
    pushState(true);
  } else if (!me.action && !S.target) {
    // 길이 막혀 멈췄으면 그 자리에서 다시 쌓아요
    me.play('stones'); pushState(true);
  }
}

// ───────── 도감 · 잡기 ─────────
// 낚시는 챔질할 때(7초마다) 반쯤, 곤충은 휘두를 때(약 2초마다) 셋 중 하나, 요리는 8초 · 고기는 10초마다 한 접시
const CATCH = { fish: [7, 6.0, 0.5, 'fish'], bugs: [1.96, 1.2, 0.33, 'bug'], cook: [8, 7.5, 1, 'food'], grill: [10, 9.5, 1, 'food'] };
let catchKey = null;
function stepCatch() {
  const a = S.me?.action, c = CATCH[a];
  if (!c) { catchKey = null; return; }
  const [period, at, chance, kind] = c, n = Math.floor((S.me.actionT - at) / period);
  const key = `${a}:${n}`;
  if (n < 0 || key === catchKey) return;
  catchKey = key;
  if (Math.random() > chance) return;
  const [name, first] = addToDex(kind, { night: dayNow() < 0.3, haveFish: !!Object.keys(loadDex().fish || {}).length });
  coin(0.6);
  toast(`${kind === 'fish' ? '🐟' : kind === 'bug' ? '🦋' : '🍳'} ${name}${kind === 'food' ? '을(를) 만들었어요' : '을(를) 잡았어요'}${first ? ' · 도감에 새로 올렸어요!' : ''}`);
}
function openDex() { renderDex($('#dex-body')); $('#dex-modal').hidden = false; }

// ───────── 기록 (이 기기에만) ─────────
function addRecord(k, v) {
  const key = `rec:${today()}`;
  const r = store.get(key, {});
  r[k] = (r[k] || 0) + v;
  store.set(key, r);
  const days = store.get('recdays', []);
  if (!days.includes(today())) { days.push(today()); store.set('recdays', days.slice(-120)); }
}

function openRecords() {
  const t = store.get(`rec:${today()}`, {});
  const m = (s) => fmtLong(s || 0);
  const tiles = [['산보·마당', m(t.out)], ['법당', m(t.in)], ['발우공양', m(t.meal)], ['독서', m(t.room)], ['절', `${t.bows || 0}번`], ['소원', `${t.wishes || 0}개`]];
  $('#record-today').innerHTML = `<p class="muted small">오늘 ${today()}</p>` + tiles.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');
  const days = store.get('recdays', []).slice(-14).reverse();
  const mm = (s) => Math.round((s || 0) / 60);
  $('#record-table').innerHTML = `<thead><tr><th>날짜</th><th>산보</th><th>법당</th><th>공양</th><th>독서</th><th>절</th><th>소원</th></tr></thead><tbody>` +
    (days.length ? days.map((d) => { const r = store.get(`rec:${d}`, {}); return `<tr><td>${d.slice(5)}</td><td>${mm(r.out)}분</td><td>${mm(r.in)}분</td><td>${mm(r.meal)}분</td><td>${mm(r.room)}분</td><td>${r.bows || 0}</td><td>${r.wishes || 0}</td></tr>`; }).join('')
      : '<tr><td colspan="7">아직 기록이 없어요. 머무는 동안 10초마다 쌓여요.</td></tr>') + '</tbody>';
  $('#record-modal').hidden = false;
}

// 화면이 가려지면 그리기(와 함께 내 상태 보내기)가 멈추니, 그동안은 5초마다 '여기 있어요'만 보낸다
setInterval(() => { if (document.hidden) pushState(true); }, 5000);

// 10초마다 머문 장소와 누적 시간을 기록
setInterval(() => {
  if (S.mode !== 'world' || !S.loc || document.hidden) return;
  addRecord(S.scene, 10);
  const key = `stay:${S.loc.id}`;
  store.set(key, store.get(key, 0) + 10);
}, 10000);

// ───────── 소원과 연등 ─────────
// 마지막 호박색은 할로윈 때만 고를 수 있어요 (지난 호박 연등도 그대로 보이게 목록에는 늘 둬요)
const LANTERN_COLORS = ['#f08aa0', '#f2c45a', '#f6f2e8', '#9ad0a8', '#9cc0f0', '#f2a05a', '#e8873a'];
const LANTERN_NAMES = ['분홍', '노랑', '하양', '연두', '하늘', '주황', '할로윈 호박'];
const AMOUNTS = [{ v: 0, t: '마음만' }, { v: 1000, t: '1,000원' }, { v: 3000, t: '3,000원' }, { v: 10000, t: '10,000원' }];
let wishColor = LANTERN_COLORS[0], wishAmount = 0;

// 소원 글은 비공개: 서버와 다른 분에게는 연등(색·법명)만 가고, 글은 이 기기의 '내가 올린 소원'에만 남는다
function addWish(w, { animate = false, announce = false } = {}) {
  if (!w || !w.id || S.wishes.some((x) => x.id === w.id)) return;
  const mine = store.get('mywishes', []).find((x) => x.id === w.id);
  S.wishes.push({ id: String(w.id), n: String(w.n).slice(0, 12), t: mine ? String(mine.t).slice(0, 80) : '', c: LANTERN_COLORS.includes(w.c) ? w.c : LANTERN_COLORS[0], v: w.v | 0, mine: !!mine });
  if (S.wishes.length > 60) S.wishes.shift();
  if (announce && S.mode === 'world') toast(`${w.n}님이 복전함에 소원을 올렸어요`);
  const world = S.worlds[S.loc?.id]?.in;
  if (world) hangLantern(world, S.wishes[S.wishes.length - 1], animate);
}

function hangLantern(world, w, animate) {
  if (S.lanterns.has(w.id)) return;
  const slots = world.lanternSlots;
  let i = [...w.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % slots.length;
  const used = new Set([...S.lanterns.values()].map((l) => l.userData.slot));
  for (let k = 0; k < slots.length && used.has(i); k++) i = (i + 1) % slots.length;
  const l = buildLantern(w.c, 1.2);
  l.userData = { slot: i, wish: w };
  l.traverse((o) => (o.userData.wish = w));
  const dest = slots[i].clone().add(new THREE.Vector3(0, -0.35, 0.4));
  if (animate) { l.position.set(0, 1.4, -8.4); l.userData.rise = { from: l.position.clone(), to: dest, t: 0 }; }
  else l.position.copy(dest);
  world.lanternRoot.add(l);
  S.lanterns.set(w.id, l);
}

function rebuildLanterns() {
  const world = S.worlds[S.loc.id].in;
  for (const l of S.lanterns.values()) l.parent?.remove(l);
  S.lanterns.clear();
  for (const w of S.wishes) hangLantern(world, w, false);
}

function openWish() {
  if (S.scene !== 'in') return;
  stopWalk();
  const spot = new THREE.Vector3(0, 0, -7.1);
  if (S.me.group.position.distanceTo(spot) > 1.2) {
    standUp();
    S.target = { pos: spot, face: Math.PI, onArrive: () => { $('#wish-modal').hidden = false; $('#wish-text').focus(); } };
    return;
  }
  $('#wish-modal').hidden = false;
  $('#wish-text').focus();
}

const flyers = [];
function submitWish(e) {
  e.preventDefault();
  const text = $('#wish-text').value.trim();
  if (!text) return;
  // 연등은 1분에 하나 (서버도 같은 규칙으로 막아요)
  const wait = Math.ceil((store.get('lastWishAt', 0) + 60e3 - Date.now()) / 1000);
  if (wait > 0) { toast(`연등은 1분에 하나씩 올릴 수 있어요. ${wait}초 뒤에 올려 주세요`); return; }
  store.set('lastWishAt', Date.now());
  $('#wish-modal').hidden = true;
  $('#wish-text').value = '';
  const w = { id: `${net.selfId || 'local'}-${Date.now().toString(36)}`, n: S.profile.name, t: text, c: wishColor, v: wishAmount };
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.32), new THREE.MeshStandardMaterial({ color: '#fbf3dc', side: THREE.DoubleSide }));
  const start = S.me.group.position.clone().add(new THREE.Vector3(0, 1.0, -0.3));
  paper.position.copy(start);
  S.active.group.add(paper);
  flyers.push({ obj: paper, from: start, to: new THREE.Vector3(0, 1.25, -8.4), t: 0, dur: 0.9, done: () => {
    paper.removeFromParent();
    coin();
    const mine = store.get('mywishes', []);
    mine.unshift({ ...w, place: S.loc.name, at: Date.now() });
    store.set('mywishes', mine.slice(0, 100));
    addWish(w, { animate: true });
    net.sendWish(publicWish(w));
    addRecord('wishes', 1);
    toast(wishAmount ? `소원과 함께 ${AMOUNTS.find((a) => a.v === wishAmount).t}을 마음으로 시주했어요` : '소원이 연등이 되어 걸렸어요');
  } });
  S.me.play('hapjang');
  pushState(true);
}

function renderWishForm() {
  $('#wish-colors').innerHTML = LANTERN_COLORS.map((c, i) => (i === 6 && season() !== 'halloween') ? '' : `<button type="button" class="swatch" style="background:${c}" data-c="${c}" aria-pressed="${c === wishColor}" aria-label="${LANTERN_NAMES[i]} 연등" title="${LANTERN_NAMES[i]} 연등"></button>`).join('');
  $('#wish-amounts').innerHTML = AMOUNTS.map((a) => `<button type="button" class="chip" data-v="${a.v}" aria-pressed="${a.v === wishAmount}"><span class="lbl">${a.t}</span><small class="cap">${a.v ? '가상 금액 · 실제 결제 없음' : '시주 없이 소원만'}</small></button>`).join('');
}

// ───────── 알림 ─────────
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3600);
}

// ───────── 화면 위 정보 ─────────
function renderSceneBar() {
  $('#scene-bar').innerHTML = Object.entries(SCENES).map(([k, s]) =>
    `<button data-scene="${k}" aria-pressed="${S.scene === k}"><span class="lbl">${s.name}</span><small class="cap">${s.cap}</small></button>`).join('');
}

// 접속인원 누르면 지금 이 서버에 있는 분 이름과 있는 곳을 보여 줘요 (나는 맨 위)
function renderOnline() {
  const where = (st) => SCENES[st.s]?.name || '';
  const others = [...S.remotes.values()].map((r) => r.st).filter((st) => st && st.n)
    .sort((a, b) => (a.s === S.scene ? 0 : 1) - (b.s === S.scene ? 0 : 1) || String(a.n).localeCompare(String(b.n), 'ko'));
  const row = (n, place, me) => `<li${me ? ' class="me"' : ''}><b>${escapeHtml(n)}${me ? ' (나)' : ''}</b><small>${escapeHtml(place)}</small></li>`;
  $('#online-list').innerHTML = `<h4>서버 ${S.server || '-'} · 함께 ${others.length + 1}명</h4><ul>${row(S.profile.name, SCENES[S.scene]?.name || '', true)}${others.map((st) => row(st.n, where(st), false)).join('')}</ul>`;
}
function toggleOnline(open = $('#online-list').hidden) {
  $('#online-list').hidden = !open;
  $('#online-pill').setAttribute('aria-expanded', String(open));
  if (open) renderOnline();
}

function updateHud() {
  if (!S.loc || S.mode !== 'world') return;
  $('#hud-place').textContent = `큰법당 · ${S.loc.name}`;
  $('#design-name').textContent = S.loc.name;
  $('#hud-server').textContent = S.server ? `· 서버 ${S.server}` : '· 서버 찾는 중';
  const here = S.scene === 'room' ? 1 : [...S.remotes.values()].filter((r) => r.st.s === S.scene).length + 1;
  $('#hud-people').textContent = `함께 ${S.remotes.size + 1}명 · ${SCENES[S.scene].name} ${here}명`;
  // 동시접속자: 지금 이 서버에 함께 있는 분 (모두에게 보임)
  $('#online-n').textContent = S.remotes.size + 1;
  $('#online-pill').title = `눌러서 서버 ${S.server || '-'}에 함께 접속한 분 보기`;
  if (!$('#online-list').hidden) renderOnline();
  // 오른쪽 상황 단추는 장소마다 두 개: 법당 [내 방으로][일어서기] · 마당 [법당으로][산보하기]
  // 공양간 [법당으로][일어서기] · 내 방 [법당으로][족자 고르기]
  $('#btn-go .lbl').textContent = S.scene === 'in' ? '내 자리로' : '캠프 마당으로';
  $('#btn-yard').hidden = S.scene !== 'room';
  $('#btn-stand').hidden = S.seat == null || !['in', 'meal'].includes(S.scene);
  $('#btn-sanbo').hidden = S.scene !== 'out';
  $('#jump-btn').hidden = !canRun(); // 휴대폰 점프 단추: 점프할 수 있는 곳(마당·내 방)에서만
  document.querySelectorAll('#scene-bar button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === S.scene)));
}

function updateContext() {
  if (S.mode !== 'world' || !S.active) return;
  const p = S.me.group.position;
  $('#btn-wish').hidden = !(S.scene === 'in' && p.distanceTo(new THREE.Vector3(0, 0, -8.4)) < 3.4);
}

let timerTick = 1;
function updateTimer(dt) {
  if (S.mode !== 'world') return;
  timerTick += dt;
  if (timerTick < 1) return;
  timerTick = 0;
  const now = new Date();
  $('#hud-timer').innerHTML = `<b>${pad(now.getHours())}:${pad(now.getMinutes())}</b><small>머문 시간 ${fmtTime((Date.now() - S.enteredAt) / 1000)}</small>`;
  // 누적 시간은 관리자에게만
  $('#hud-timer').title = document.body.classList.contains('admin') ? `${S.loc.name}에 머문 시간 모두 ${fmtLong(store.get(`stay:${S.loc.id}`, 0))}` : '머문 시간';
}

// ───────── 서버 ─────────
function renderServerGrid() {
  if (!S.loc) return;
  const counts = net.counts();
  $('#server-title').textContent = '큰법당 서버';
  $('#server-now').textContent = S.server ? `현재 · 큰법당 서버 ${S.server}` : '서버를 찾는 중이에요';
  let html = '';
  for (let i = 1; i <= SERVER_COUNT; i++) {
    const c = counts[i] || 0;
    const cur = i === S.server, full = c >= SERVER_CAP && !cur;
    html += `<button class="server${cur ? ' current' : ''}${full ? ' full' : ''}" data-server="${i}" ${full ? 'disabled' : ''}>
      <b>큰법당 서버 ${i}</b><span>${c} / ${SERVER_CAP}명${cur ? ' · 이용 중' : full ? ' · 만석' : ''}</span>
      <small class="cap">${cur ? '지금 머무는 서버' : full ? '자리가 없어 들어갈 수 없어요' : '눌러서 이 서버로 옮기기'}</small></button>`;
  }
  $('#server-grid').innerHTML = html;
}

async function switchServer(n) {
  if (n === S.server) return;
  S.server = n;
  S.wishes = [];
  if (S.worlds[S.loc.id]?.in) rebuildLanterns();
  updateHud();
  await net.joinServer(n);
  pushState(true);
  renderServerGrid();
  toast(n === 1 ? '본 서버(1번)에 들어왔어요. 모두 여기 모여요' : `${n}번 서버로 옮겼어요. 조용히 쉬어요`);
}

// 들어오면 모두 1번 서버(본 서버)로. 꽉 찼으면 자리가 남은 다음 번호로
function pickServer() {
  const counts = net.counts();
  for (let i = 1; i <= SERVER_COUNT; i++) if ((counts[i] || 0) < SERVER_CAP) return i;
  return 1;
}
// 혼자 조용히 있고 싶을 때: 1번이 아닌 서버 중 사람이 가장 적은 곳
function quietServer() {
  const counts = net.counts();
  let best = 2, bestC = Infinity;
  for (let i = 2; i <= SERVER_COUNT; i++) { const c = counts[i] || 0; if (i !== S.server && c < bestC) { best = i; bestC = c; } }
  return best;
}

// ───────── 로딩 ─────────
const QUOTES = [
  '천천히 걸어도 산은 그 자리에 있어요.',
  '밥 한 그릇에도 많은 손이 닿아 있어요.',
  '숨을 한 번 고르면 마음도 한 칸 내려앉아요.',
  '오늘 할 일은 오늘의 나에게 맡겨요.',
  '조용한 곳에서는 작은 소리도 잘 들려요.',
];
// 로딩 뒤 3D 풍경 네 가지 중 하나가 무작위로 나온다 (?loading=1~4 로 고정). 글씨는 모두 같다
const LOADING_VIEWS = [
  // 1 두물머리 물안개: 마당 위를 크게 돌며 산과 강을 둘러본다
  { at: () => ['river', 'out'], cam: (t) => { const a = t * 0.05; camera.position.set(Math.sin(a) * 26, 14, Math.cos(a) * 26 + 6); camera.lookAt(Math.sin(a + 2.6) * 60, -8, Math.cos(a + 2.6) * 60 + 40); } },
  // 2 단풍 산: 마당을 낮게 한 바퀴, 법당과 탑이 번갈아 지나간다
  { at: () => ['forest', 'out'], cam: (t) => { const a = t * 0.06; camera.position.set(Math.sin(a) * 19, 5, Math.cos(a) * 19 - 2); camera.lookAt(0, 3.5, -5); } },
  // 3 보리암: 금산 바위 위에서 해가 걸린 남해, 까만 섬들을 좌우로 천천히
  { at: () => ['sea', 'boriam'], cam: (t) => { const a = Math.sin(t * 0.04) * 0.35; camera.position.set(Math.sin(a) * 4, 14, -4); camera.lookAt(Math.sin(a) * 300, -120, 900); } },
  // 4 법당 안: 들어갈 법당 문 앞에서 부처님 쪽으로 천천히 다가간다
  { at: (locId) => [locId, 'in'], cam: (t) => { camera.position.set(Math.sin(t * 0.07) * 2.5, 3.2, 12 - (1 - Math.cos(t * 0.12)) * 3.5); camera.lookAt(0, 3.6, -13); } },
];
const LOADING_N = params.get('loading') ? Math.min(4, Math.max(1, +params.get('loading') || 1)) : 1 + Math.floor(Math.random() * LOADING_VIEWS.length);
const LOADING_VIEW = LOADING_VIEWS[LOADING_N - 1];
let loadP = 0;
function setLoad(p) {
  loadP = Math.max(loadP, p);
  $('#loading').style.setProperty('--p', loadP / 100);
  $('#loading .ld-pct').textContent = `${Math.round(loadP)}%`;
}

function showLoading(locId) {
  S.mode = 'loading';
  $('#loading').hidden = false;
  $('#loading').dataset.view = LOADING_N;
  $('#hud').hidden = true;
  loadP = 0;
  setLoad(3);
  $('#ld-quote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  setWorld(worldFor(...LOADING_VIEW.at(locId)));
  if (S.me) S.me.group.visible = false;
}

// ───────── 법당 위치 들어가기 ─────────
async function enterLocation(locId) {
  S.loc = LOCATIONS.find((l) => l.id === locId) || LOCATIONS[0];
  showLoading(S.loc.id);
  for (const id of [...S.remotes.keys()]) removeRemote(id, false);
  const started = performance.now();
  await sleep(60);
  store.set('lastLoc', S.loc.id);
  setLoad(15);
  await sleep(30);
  const hall = worldFor(S.loc.id, 'in');
  setLoad(45);
  // 서버는 디자인과 상관없이 모두 '큰법당 서버 1~12' 하나로 모인다
  const netReady = net.joinLobby('hall', true);
  await Promise.race([loadBuddha(hall), sleep(8000)]);
  setLoad(75);
  await sleep(30);
  worldFor(S.loc.id, 'meal');
  worldFor(S.loc.id, 'room');
  setLoad(88);
  await Promise.race([netReady, sleep(4000)]);
  setLoad(100);
  const min = params.has('hold') ? 1e9 : 2200;
  await sleep(Math.max(0, min - (performance.now() - started)));
  await fade(true);
  S.enteredAt = Date.now();
  S.mode = 'world';
  S.server = 0;
  S.wishes = [];
  S.lanterns.clear();
  makeMe();
  $('#loading').hidden = true;
  await goScene('in', { instant: true });
  $('#hud').hidden = false;
  renderActions();
  renderSceneBar();
  syncActionButtons();
  S.enteredAt = Date.now();
  updateHud();
  fade(false);
  if (!store.get('welcomed', false)) $('#welcome').hidden = false;
  if (!net.online) { S.server = 1; updateHud(); toast('실시간 연결이 안 돼서 혼자 머무는 중이에요'); return; }
  if (net.mode === 'p2p') await sleep(1500);
  await switchServer(pickServer());
}

// 디자인(건물·배경·마당) 바꾸기: 서버와 함께 있는 사람은 그대로, 내 화면의 풍경만 바뀐다
async function changeDesign(locId) {
  if (S.mode !== 'world' || locId === S.loc?.id) return;
  await fade(true);
  S.loc = LOCATIONS.find((l) => l.id === locId) || LOCATIONS[0];
  store.set('lastLoc', S.loc.id);
  S.lanterns.clear();
  // 배경만 바꾸고 나는 그 자리 그대로: 서 있던 곳 · 앉은 방석 · 카메라를 기억했다가 되돌린다 (하던 동작도 그대로)
  const g = S.me.group, seat = S.seat;
  const keep = { pos: g.position.clone(), rot: g.rotation.y, cam: camera.position.clone(), at: controls.target.clone() };
  await goScene(S.scene, { instant: true });
  const sameSeat = seat != null && S.scene !== 'room' && S.active.seats?.find((x) => x.id === seat);
  if (sameSeat) {
    S.seat = seat; S.me.seated = true;
    g.position.set(sameSeat.pos.x, sameSeat.y ?? 0.12, sameSeat.pos.z);
    g.rotation.y = sameSeat.rot ?? Math.PI;
  } else if (S.scene !== 'room') {
    g.position.copy(keep.pos); g.rotation.y = keep.rot;
  }
  if (S.scene !== 'room') { camera.position.copy(keep.cam); controls.target.copy(keep.at); controls.update(); }
  S.me.petFresh = true;   // 친구도 바로 옆으로
  pushState(true);
  updateHud();
  fade(false);
  toast(`${S.loc.name} 디자인으로 바꿨어요`);
}

function showPlaces() {
  $('#places').hidden = false;
  // 아주 단순한 바탕: 하늘색 위 · 땅색 아래 두 칸 + 이름만 (설명 없음)
  const GROUND = { forest: '#6f9070', river: '#8a9cb0', sea: '#4f8db3' };
  $('#place-list').innerHTML = LOCATIONS.map((l) => {
    const cur = S.loc?.id === l.id;
    const art = `background:linear-gradient(to top, ${GROUND[l.id] || '#8f8878'} 0 32%, transparent 32%), linear-gradient(${l.sky[0]}, ${l.sky[1]})`;
    return `<button class="place${cur ? ' current' : ''}" data-place="${l.id}" aria-pressed="${cur}"><span class="place-art" style="${art}"></span><b>${l.name}</b><small>${l.place}</small></button>`;
  }).join('') + '<p class="fine credit">불상 자료 · 국가유산청 금동보살좌상(판불), 국립중앙박물관 3D 데이터 5점(덕수2116·덕수3310·본관5191·M번435·본관14752), 공공누리 제1유형</p>';
}

// ───────── 캐릭터 꾸미기 ─────────
let preview = null, draft = null;
function openCreator() {
  draft = structuredClone(S.profile);
  $('#creator').hidden = false;
  $('#nick').value = draft.name;
  renderCreatorOptions();
  if (!preview) initPreview();
  preview.avatar.setLook(draft.look, 'out');
}

function initPreview() {
  const c = $('#preview');
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#fff7e8', '#b59a7a', 1.6));
  const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(2, 4, 3); sc.add(d);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  cam.position.set(0, 1.4, 5.2);
  const ctl = new OrbitControls(cam, c);
  ctl.target.set(0, 0.85, 0); ctl.enablePan = false; ctl.enableZoom = false; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.6;
  const avatar = new Avatar(draft.look, '', {});
  avatar.tag.visible = false;
  sc.add(avatar.group);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ color: '#d9c4a0', transparent: true, opacity: 0.6 }));
  disc.rotation.x = -Math.PI / 2; sc.add(disc);
  preview = { r, sc, cam, ctl, avatar, t: 0 };
}

function renderPreview(dt) {
  if (!preview || $('#creator').hidden) return;
  const c = $('#preview');
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.floor(w * preview.r.getPixelRatio())) { preview.r.setSize(w, h, false); preview.cam.aspect = w / h; preview.cam.updateProjectionMatrix(); }
  preview.t += dt;
  if (!preview.avatar.action && preview.t > 3) { preview.t = 0; preview.avatar.play(['hapjang', 'wave', 'banbae'][Math.floor(Math.random() * 3)]); }
  preview.avatar.update(dt, ACTIONS);
  preview.ctl.update();
  preview.r.render(preview.sc, preview.cam);
}

function renderCreatorOptions() {
  const L = draft.look;
  $('#opt-body').innerHTML = BODIES.map((b) => `<button class="body-pick" data-body="${b.id}" aria-pressed="${(L.body || 'base') === b.id}" aria-label="${b.label}" title="${b.label}">${bodySvg(b)}</button>`).join('');
  $('#opt-gender').innerHTML = GENDERS.map((g) => `<button class="chip" data-gender="${g.id}" aria-pressed="${L.gender === g.id}"><span class="lbl">${g.name}</span><small class="cap">${g.cap}</small></button>`).join('');
  $('#opt-type').innerHTML = CHAR_TYPES.map((t) => `<button class="chip" data-type="${t.id}" aria-pressed="${L.type === t.id}"><span class="lbl">${hairName(t, L.gender)}</span><small class="cap">${t.color}</small></button>`).join('');
  $('#opt-skin').innerHTML = SKIN_TONES.map((s, i) => `<button class="swatch" data-skin="${s}" style="background:${s}" aria-pressed="${L.skin === s}" aria-label="${i + 1}번째 색" title="${['가장 밝은', '밝은', '중간', '짙은', '가장 짙은'][i]} 색"></button>`).join('');
  $('#opt-outfit').innerHTML = OUTFITS.filter((o) => !o.hidden && !o.preview).map((o) => `<button class="chip" data-outfit="${o.id}" aria-pressed="${L.outfit === o.id}"><span class="lbl">${o.name}</span><small class="cap">${o.cap}</small></button>`).join('');
  $('#opt-acc').innerHTML = ACCESSORIES.filter((a) => inSeason(a) && !a.preview && !a.hidden).map((a) => `<button class="chip" data-acc="${a.id}" aria-pressed="${L.acc === a.id}"><span class="lbl">${a.name}</span><small class="cap">${a.cap}</small></button>`).join('');
  $('#opt-pet').innerHTML = PETS.filter((p) => !p.hidden && !p.preview && inSeason(p)).sort((a, b) => petGroup(a) - petGroup(b)).map((p) => `<button class="chip" data-pet="${p.id}" aria-pressed="${(L.pet || 'none') === p.id}"><span class="lbl">${p.name}</span><small class="cap">${p.cap}</small></button>`).join('');
}

function finishCreator() {
  draft.name = $('#nick').value.trim().slice(0, 10) || randomName();
  S.profile = draft;
  store.set('profile', S.profile);
  $('#creator').hidden = true;
  S.me.setLook(S.profile.look, S.scene);
  S.me.setName(S.profile.name);
  pushState(true);
  toast(S.scene === 'in' ? '새 모습으로 바꿨어요. 법당 안에서는 회색 승복을 입어요' : '새 모습으로 바꿨어요');
}

// ───────── 입력 ─────────
const keys = new Set();
addEventListener('keydown', (e) => { if (!e.target.closest('input, textarea, select')) keys.add(e.code); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const joy = { x: 0, y: 0, id: null };
const joyEl = $('#joystick'), knob = joyEl.querySelector('.knob');
joyEl.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) moveJoy(e); });
const endJoy = () => { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', endJoy);
joyEl.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = y;
  knob.style.transform = `translate(${x * 35}px, ${y * 35}px)`;
}

// 화면 탭: 방석·자리 → 바로 앉기, 복전함 → 소원, 연등 → 소원 읽기, 바닥 → 걸어가기
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || S.mode !== 'world' || S.photo) return;   // 사진 찍는 중에는 구도만 잡고 걷지 않는다
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 8) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const w = S.active;
  for (const h of ray.intersectObjects(w.group.children, true)) {
    const o = h.object;
    if (o.userData.wish) { const wi = o.userData.wish; toast(wi.mine && wi.t ? `“${wi.t}” · 내 연등` : `${wi.n}님의 연등이에요`); return; }
    if (o.userData.seats) {
      let seat = w.seats[o.userData.seats === 'room' ? 0 : h.instanceId];
      if (o.userData.seats === 'chair') { let p = o; while (p && p.userData.seatId === undefined) p = p.parent; seat = w.seats.find((x) => x.mesh === p) || w.seats[p?.userData.seatId]; }
      if (seat) walkToSeat(seat);
      return;
    }
    if (o.userData.donation) return openWish();
    // 불상을 누르면 (휴대폰) ‹ › 버튼이 4초 동안 나온다
    // 불상이나 탑을 누르면 불상·탑 고르기 창
    for (const slot of [w.buddhaSlot, w.pagodaSlot]) if (slot) { let p = o; while (p && p !== slot) p = p.parent; if (p) return openRelics(); }
    if (o === w.floor) {
      if (S.me.action && !ACTIONS.find((a) => a.id === S.me.action)?.loop) return;
      stopWalk();
      standUp();
      // 마당에서 멀리 누르면 뛰어간다
      const far = S.scene === 'out' && h.point.distanceTo(S.me.group.position) > 8;
      S.target = { pos: h.point.clone().setY(0), run: far };
      return;
    }
    if (S.scene === 'out' && w.door && h.distance < 60 && Math.abs(h.point.x) < 12 && h.point.z < -1 && h.point.z > -20) {
      stopWalk();
      S.target = { pos: w.door.clone(), onArrive: () => goScene('in') };
      return;
    }
  }
});

// ───────── 이동 ─────────
const tmpV = new THREE.Vector3();
const SPEED = 2.7;        // 걷는 속도
const SEAT_SPEED = 1.8;   // 자리로 걸어갈 때는 더 천천히
const RUN_SPEED = 5.4;    // 뛰는 속도: 마당과 내 방에서만 (법당·공양간에서는 걷는다)
const canRun = () => S.scene === 'out' || S.scene === 'room';

// 점프: 스페이스 (휴대폰은 오른쪽 아래 ↑ 단추). 뛰기처럼 마당과 내 방에서만
const JUMP_V = 5.2, GRAVITY = 15;
let jumpV = 0, jumpY = 0;
const jumpArc = (t) => JUMP_V * t - 0.5 * GRAVITY * t * t;
function jump() {
  if (S.mode !== 'world' || !canRun() || S.seat != null || jumpY > 0) return;
  jumpV = JUMP_V;
  jumpY = 0.001;
  net.sendAct({ a: 'jump' });
}
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || S.mode !== 'world' || e.target.closest('input, textarea, select')) return;
  e.preventDefault(); // 눌러 둔 버튼이 다시 눌리거나 화면이 내려가지 않게
  if (!e.repeat) jump();
}, true);
$('#jump-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
function moveMe(dt) {
  const me = S.me, g = me.group;
  let dx = 0, dz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  dx += joy.x; dz += joy.y;
  let dir = null, speed = SPEED;
  if (Math.hypot(dx, dz) > 0.15) {
    stopWalk();
    S.target = null;
    if (S.seat != null) standUp();
    const yaw = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    dir = new THREE.Vector3(dx * cos + dz * sin, 0, -dx * sin + dz * cos);
    if (dir.length() > 1) dir.normalize();
    // Shift 를 누르거나 조이스틱을 끝까지 밀면 뛴다
    if (canRun() && (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(joy.x, joy.y) > 0.92)) speed = RUN_SPEED;
  } else if (S.walking && walkBowT > 0) {
    // 산보 · 탑돌이: 세 걸음마다 멈춰 서서 반배하는 동안은 걷지 않는다. 탑돌이는 절을 마치면 다시 합장한 채로
    walkBowT -= dt;
    if (walkBowT <= 0 && S.walkMode === 'tapdori') { S.me.action = 'tapdori'; S.me.actionT = 1; pushState(true); }
  } else if (S.target) {
    tmpV.copy(S.target.pos).sub(g.position).setY(0);
    if (tmpV.length() < 0.18) {
      const t = S.target; S.target = null;
      if (t.face != null) g.rotation.y = t.face;
      t.onArrive?.();
    } else { dir = tmpV.normalize(); speed = S.target.run && canRun() ? RUN_SPEED : S.target.speed || SPEED; }
  }
  if (dir && S.me.action && S.me.action !== 'meditate' && !(S.walking && S.me.action === 'tapdori')) { S.me.stop(); if (!S.stones) syncActionButtons(); }
  const before = g.position.clone();
  if (dir) {
    g.position.addScaledVector(dir, speed * dt);
    const want = Math.atan2(dir.x, dir.z);
    const diff = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y));
    g.rotation.y += diff * Math.min(1, dt * 10);
    collide(g.position);
    if (S.target && !S.walking && g.position.distanceTo(before) < speed * dt * 0.2) S.target = null;
  }
  me.speed = dir ? g.position.distanceTo(before) / Math.max(dt, 1e-4) : 0;
  // 산보: 세 걸음(한 걸음 약 0.75칸) 걸을 때마다 한 번 합장
  if (S.walking && S.walkMode === 'tapdori' && dir) {   // 캠핑장 산책은 절 없이 걷기만
    walkDist += g.position.distanceTo(before);
    if (walkDist >= WALK_STEP * 3) {
      // 세 걸음 걷고 한 번 반배 (합장하고 허리 숙이기). 걷던 속도를 0으로 해야 절이 바로 취소되지 않는다
      walkDist = 0;
      walkBowT = 2.7;
      me.speed = 0;
      S.me.action = 'banbae';
      S.me.actionT = 0;
      addRecord('bows', 1);
      pushState(true);
    }
  }
  const delta = g.position.clone().sub(before).setY(0);
  camera.position.add(delta);
  controls.target.add(delta);

  // 점프: 솟았다가 떨어진다 (카메라는 따라 출렁이지 않게 높이는 빼고 따라온다)
  if (S.seat != null) jumpY = 0;
  if (jumpY > 0) {
    jumpV -= GRAVITY * dt;
    jumpY = Math.max(0, jumpY + jumpV * dt);
    g.position.y = jumpY;
  }
  me.airborne = jumpY > 0;

  // 문으로 드나들기
  const w = S.active;
  if (w.exitZ && S.scene !== 'out' && dir && g.position.z > w.exitZ && Math.abs(g.position.x) < 2.6) goScene('out');
  else if (S.scene === 'out' && w.door && dir && !S.walking && g.position.distanceTo(w.door) < 1.3) goScene('in');
}

function collide(p) {
  const w = S.active;
  if (w.bounds) {
    p.x = Math.min(w.bounds.maxX, Math.max(w.bounds.minX, p.x));
    p.z = Math.min(w.bounds.maxZ, Math.max(w.bounds.minZ, p.z));
  }
  if (w.radius) {
    const d = Math.hypot(p.x, p.z);
    if (d > w.radius) { p.x *= w.radius / d; p.z *= w.radius / d; }
  }
  for (const b of w.blockers) {
    if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) {
      const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
      const m = Math.min(...pen);
      if (m === pen[0]) p.x = b.minX; else if (m === pen[1]) p.x = b.maxX; else if (m === pen[2]) p.z = b.minZ; else p.z = b.maxZ;
    }
  }
}

// ───────── 루프 ─────────
const clock = new THREE.Clock();
let elapsed = 0;
const galleryAvatars = [];
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  if (S.mode === 'loading') {
    LOADING_VIEW.cam(elapsed);
    S.active?.update?.(elapsed);
  } else if (S.mode === 'world') {
    moveMe(dt);
    stepCameraTurn(dt);
    controls.update();
    S.me.update(dt, ACTIONS);
    stepFireworks(dt);
    stepCatch();
    updateCounters();
    if (S.stones) stepStones();
    if (!S.me.action && document.querySelector('.act[aria-pressed="true"]')) syncActionButtons();
    soundFor(S.me, 1);
    // 이름표: 내 캐릭터까지 거리보다 먼 사람은 거리만큼 키워(최대 2배) 내 이름표보다 작아지지 않게, 화면이 낮으면 모두 조금 크게
    const tagNear = Math.max(5, camera.position.distanceTo(S.me.group.position));
    const tagH = Math.min(1.5, Math.max(1, 640 / innerHeight));
    for (const r of S.remotes.values()) {
      const g = r.av.group;
      const before = g.position.clone();
      const target = r.av.seated ? tmpV.copy(r.pos).setY(r.seatY) : r.pos;
      g.position.lerp(target, Math.min(1, dt * 8));
      if (g.position.distanceTo(target) > 6) g.position.copy(target);
      const diff = r.rot - g.rotation.y;
      g.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, dt * 8);
      r.av.speed = r.av.seated ? 0 : Math.hypot(g.position.x - before.x, g.position.z - before.z) / Math.max(dt, 1e-4);
      // 다른 분이 점프하면 같은 높이로 솟았다 떨어진다
      if (r.jumpT != null) {
        r.jumpT += dt;
        const jy = jumpArc(r.jumpT);
        if (jy <= 0 || r.av.seated) { r.jumpT = null; jy <= 0 && !r.av.seated && (g.position.y = 0); }
        else g.position.y = jy;
      }
      r.av.airborne = r.jumpT != null;
      // 다른 장소에 있는 분은 친구도 함께 숨긴다 (친구만 덩그러니 남지 않게)
      if (!g.visible) { if (r.av.pet) r.av.pet.visible = false; continue; }
      r.av.update(dt, ACTIONS);
      const far = g.position.distanceTo(camera.position);
      r.av.tag.visible = far < 13;
      // 멀리 있어도 이름표가 너무 작아지지 않게: 6m 넘으면 거리만큼 키우고(최대 2배), 화면이 낮으면 조금 더
      const tk = Math.min(2, Math.max(1, far / tagNear)) * tagH;
      r.av.tag.scale.set(1.35 * tk, 0.3 * tk, 1);
      r.av.tag.position.y = (r.av.tagY ?? 2.05) + (tk - 1) * 0.15;
      soundFor(r.av, Math.max(0, 1 - g.position.distanceTo(S.me.group.position) / 16));
    }
    const now = performance.now();
    // 서버가 끊긴 분 자리를 30초 남겨 두니, 그보다 조금 길게 기다린다
    for (const [id, r] of S.remotes) if (now - r.seen > 40000) removeRemote(id, false);
    S.me.tag.scale.set(1.35 * tagH, 0.3 * tagH, 1);
    pushState();
    updateContext();
    updateTimer(dt);
    S.active.update?.(elapsed);
    if (S.active.flames) for (const f of S.active.flames) f.scale.set(1, 1.8 + Math.sin(elapsed * 13 + f.id) * 0.25, 1);
    for (const l of S.lanterns.values()) {
      const rise = l.userData.rise;
      if (rise) {
        rise.t += dt / 2.6;
        const s = Math.min(1, rise.t), e = s * s * (3 - 2 * s);
        l.position.lerpVectors(rise.from, rise.to, e);
        if (s >= 1) delete l.userData.rise;
      } else l.rotation.y += dt * 0.15;
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt / f.dur;
      const s = Math.min(1, f.t);
      f.obj.position.lerpVectors(f.from, f.to, s);
      f.obj.position.y += Math.sin(s * Math.PI) * 0.8;
      f.obj.rotation.y += dt * 8;
      if (s >= 1) { flyers.splice(i, 1); f.done(); }
    }
  } else if (S.mode === 'gallery') {
    for (const av of galleryAvatars) av.update(dt, ACTIONS);
  }
  renderPreview(dt);
  renderer.render(scene, camera);
}

// 목탁 소리: 채가 내려칠 때마다
// 범종 소리: 당목이 앞으로 닿는 순간(6초마다 2.2초쯤)
function soundFor(av, vol) {
  if (vol <= 0 || !['moktak', 'bell', 'jukbi'].includes(av.action)) { av._hit = null; return; }
  if (av.action === 'jukbi') {   // 죽비가 손바닥에 닿는 순간 딱
    const n = Math.floor((av.actionT - 1.05) / 1.5);
    if (av._hit !== n) { if (n >= 0) moktak(vol * 0.8); av._hit = n; }
    return;
  }
  if (av.action === 'bell') {
    const n = Math.floor((av.actionT - 2.2) / 6);
    if (av._hit !== n) { if (n >= 0) bigBell(vol); av._hit = n; }
    return;
  }
  const n = Math.floor(av.actionT * 1.1 + 0.25);
  if (av._hit !== n) { if (av._hit != null) moktak(vol); av._hit = n; }
}

// ───────── 버튼 ─────────
const syncSoundBtn = () => {
  // 켜짐: 초록 바탕 + 소리 물결 / 꺼짐: 어두운 바탕 + 빨간 X
  const b = $('#btn-sound');
  b.setAttribute('aria-pressed', String(sound.on));
  b.setAttribute('aria-label', sound.on ? '소리 켜짐 · 눌러서 끄기' : '소리 꺼짐 · 눌러서 켜기');
  b.title = sound.on ? '소리 켜짐 (눌러서 끄기)' : '소리 꺼짐 (눌러서 켜기)';
  $('#btn-sound .cap').textContent = sound.on ? '소리 끄기' : '소리 켜기';
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (t?.id === 'online-pill') return toggleOnline();
  if (!$('#online-list').hidden && !e.target.closest('#online-list')) toggleOnline(false);
  if (!t) return;
  if (t.dataset.close) { $('#' + t.dataset.close).hidden = true; return; }
  if (t.dataset.act) return doAction(t.dataset.act);
  if (t.dataset.scene) { document.body.classList.remove('show-scenes'); stopWalk(); if (t.dataset.scene !== S.scene) goScene(t.dataset.scene); return; }
  if (t.dataset.place) { $('#places').hidden = true; return changeDesign(t.dataset.place); }
  if (t.dataset.server) { $('#server-modal').hidden = true; return switchServer(+t.dataset.server); }
  const pick = ['body', 'type', 'skin', 'outfit', 'acc', 'gender', 'pet'].find((k) => t.dataset[k] != null);
  if (pick && t.closest('#creator')) { draft.look[pick] = t.dataset[pick]; renderCreatorOptions(); preview.avatar.setLook(draft.look, 'out'); return; }
  if (t.dataset.c) { wishColor = t.dataset.c; return renderWishForm(); }
  if (t.dataset.music != null) return pickMusic(t.dataset.music);
  if (t.dataset.v != null && t.closest('#wish-amounts')) { wishAmount = +t.dataset.v; return renderWishForm(); }
  if (t.dataset.menu) {
    $('#menu').hidden = true;
    const m = t.dataset.menu;
    if (m === 'calm') startCalm();
    if (m === 'char') openCreator();
    if (m === 'record') openRecords();
    if (m === 'quiet') { const n = quietServer(); switchServer(n); }
    if (m === 'main') { if (S.server !== 1) switchServer(1); else toast('지금 본 서버(1번)에 있어요'); }
    if (m === 'dex') openDex();
    if (m === 'place') showPlaces();
    if (m === 'credit') { $('#credit-audio').innerHTML = TRACKS.filter((t) => t.by).map((t) => `<li>${t.name} · ${t.by}</li>`).join(''); $('#credit-modal').hidden = false; }
    if (m === 'music') { renderMusic(); $('#music-modal').hidden = false; }
    if (m === 'photo') startPhoto();
    if (m === 'mywish') {
      const list = store.get('mywishes', []);
      $('#mywish-list').innerHTML = list.length ? list.map((w) => `<li>${escapeHtml(w.t)}<small>${escapeHtml(w.place)} · ${new Date(w.at).toLocaleString('ko-KR')}</small></li>`).join('') : '<li>아직 올린 소원이 없어요. 법당 안 복전함 앞에서 올릴 수 있어요.</li>';
      $('#mywish-modal').hidden = false;
    }
  }
});

// 이름 저장: 쓴 이름을 바로 내 이름표에 (빈칸이면 무작위 캠퍼 이름)
$('#nick-save').onclick = () => {
  const name = $('#nick').value.trim().slice(0, 10) || randomName();
  $('#nick').value = name; draft.name = name;
  S.profile.name = name; store.set('profile', S.profile);
  S.me?.setName(name); pushState(true); toast(`캠퍼 이름을 '${name}'(으)로 저장했어요`);
};
$('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#nick-save').click(); } });
$('#creator-done').onclick = finishCreator;
$('#btn-menu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
$('#btn-stand').onclick = () => { stopWalk(); standUp(); };
$('#btn-sanbo').onclick = () => doAction('walk');   // 마당 자동 산보: 다시 누르면 멈춤
$('#btn-go').onclick = () => { stopWalk(); goScene(S.scene === 'in' ? 'room' : 'in'); };
$('#btn-yard').onclick = () => { stopWalk(); goScene('out'); };   // 내 자리: [캠프 마당으로] [물가로]
// 산보: 먼저 합장하고, 마당을 오른쪽(시계 방향, 법당을 오른쪽에 두고)으로 계속 돈다. 다시 누르면 멈춘다
$('#btn-wish').onclick = openWish;
$('#design-chip').onclick = showPlaces;
// 왼쪽 도형 단추
// 위치 단추: 바로 옆에 디자인 이름 3개와 서버 번호만 (설명 · 그림 없이). 고르거나 다른 곳을 누르면 닫혀요
function togglePick() {
  if (!document.body.classList.toggle('show-pick')) return;
  // 고르기 창은 디자인 단추 바로 옆, 단추 위쪽에 맞춘다 (단추 순서가 바뀌어도 따라감)
  const r = $('#side-place').getBoundingClientRect();
  $('#pick-pop').style.top = `${Math.max(8, Math.min(r.top, innerHeight - 260))}px`;
  $('#pick-design').innerHTML = LOCATIONS.map((l) => `<button data-place="${l.id}" aria-pressed="${S.loc?.id === l.id}">${l.name}</button>`).join('');
  $('#pick-server').innerHTML = Array.from({ length: SERVER_COUNT }, (_, i) => `<button data-server="${i + 1}" aria-pressed="${S.server === i + 1}">${i + 1}</button>`).join('');
}
$('#side-place').onclick = togglePick;
addEventListener('pointerdown', (e) => { if (!e.target.closest('#pick-pop, #side-place')) document.body.classList.remove('show-pick'); });
$('#pick-pop').addEventListener('click', (e) => { if (e.target.closest('button')) document.body.classList.remove('show-pick'); });
$('#side-char').onclick = openCreator;
$('#side-music').onclick = () => { renderMusic(); $('#music-modal').hidden = false; };
$('#side-photo').onclick = () => startPhoto();
// 표정: 말 대신 얼굴로. 누른 표정이 4초 동안 내 얼굴에, 같은 서버 모두에게 보여요
$('#face-pop').innerHTML = FACES.map((f) => `<button type="button" data-face="${f.id}" aria-label="${f.name}" title="${f.name}">${f.icon}</button>`).join('');
$('#side-face').onclick = () => { $('#face-pop').hidden = !$('#face-pop').hidden; };
$('#face-pop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-face]'); if (!b) return;
  S.me.setFace(b.dataset.face); S.faceAt = Date.now(); S.faceId = b.dataset.face;
  $('#face-pop').hidden = true; pushState(true);
});
// 숫자 키 1~8 = 아래 동작 칸 차례대로
addEventListener('keydown', (e) => {
  if (S.mode !== 'world' || e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const n = /^Digit([1-9])$/.exec(e.code)?.[1];
  const btn = n && document.querySelectorAll('#actions .act')[n - 1];
  if (btn) { e.preventDefault(); btn.click(); }
});
$('#server-chip').onclick = showPlaces;   // 위 왼쪽 칩 하나: 누르면 디자인 고르기 (서버는 메뉴에서)
$('#server-refresh').onclick = () => { net.refreshCounts(); renderServerGrid(); toast('인원을 새로 셌어요'); };
$('#btn-sound').onclick = () => { setSound(!sound.on); store.set('muted', !sound.on); syncSoundBtn(); };

// 법당 음악: 실제 녹음 다섯 곡 + 합성 세 곡 (끄기는 위쪽 소리 단추). 고른 곡은 이 기기에 남고, 소리를 켜야 들려요
// 처음 온 분(또는 예전에 끄기·지운 곡을 골랐던 분)은 1번 싱잉볼로 시작. 소리를 끄려면 위쪽 소리 단추
{ const m = store.get('music'); setMusic(TRACKS.some((t) => t.id === m) ? m : 'campfire'); }
// 체형 단추 그림: 글자 없이 실루엣만 (같은 바닥선, 같은 축척이라 키 차이가 보여요)
function bodySvg(B) {
  const u = 26, base = 58, leg = 0.46 * B.leg * B.k * u, th = 0.56 * B.th * B.k * u, hd = 0.52 * B.head * B.k * u, tw = 0.5 * B.tw * B.k * u;
  const lw = 0.2 * B.limb * B.k * u, aw = 0.15 * B.limb * B.k * u, cx = 24;
  const ty = base - leg - th, hy = ty - hd - 0.5;
  return `<svg viewBox="0 0 48 60" aria-hidden="true">
    <rect x="${cx - tw * 0.24 - lw / 2}" y="${base - leg}" width="${lw}" height="${leg}" rx="1"/><rect x="${cx + tw * 0.24 - lw / 2}" y="${base - leg}" width="${lw}" height="${leg}" rx="1"/>
    <rect x="${cx - tw / 2}" y="${ty}" width="${tw}" height="${th}" rx="1.5"/>
    <rect x="${cx - tw / 2 - aw - 0.4}" y="${ty + 0.5}" width="${aw}" height="${th * 0.82}" rx="1"/><rect x="${cx + tw / 2 + 0.4}" y="${ty + 0.5}" width="${aw}" height="${th * 0.82}" rx="1"/>
    <rect x="${cx - hd / 2}" y="${hy}" width="${hd}" height="${hd}" rx="2"/></svg>`;
}

// 내 옆 친구 순서: 동물 → AI → 사물 → 할로윈 → 없음
const PET_GROUP = { ai: 1, claude: 1, drone: 1, coffee: 2, icecoffee: 2, book: 2, laptop: 2, tablet: 2, none: 4 };
const petGroup = (p) => (p.season ? 3 : PET_GROUP[p.id] ?? 0);

function renderMusic() {
  // 카드: 왼쪽 동그란 그림 · 이름과 설명 · 오른쪽 위 '녹음/합성' 표시. 고른 곡은 소리 막대가 움직여요
  const ICON = {
    campfire: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/><path d="M5 21l14-3M5 18l14 3"/>',
    night: '<path d="M4 6h11M4 12h11M4 18h7"/><path d="M17 15l4 3-4 3z"/>',
    chip: '<path d="M4 6h11M4 12h11M4 18h7"/><path d="M17 15l4 3-4 3z"/>',
    guitar: '<path d="M14 4l6 6M17 7l-6 6"/><circle cx="9" cy="15" r="4.5"/><circle cx="9" cy="15" r="1"/>',
    harmonica: '<path d="M3 9h18v6H3z"/><path d="M6 12h1M9 12h1M12 12h1M15 12h1M18 12h1"/>',
    waves: '<path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 15c3-2 6 2 9 0s6-2 9 0"/>',
    rain: '<path d="M3 12l9-8 9 8z"/><path d="M8 16v2M12 15v4M16 16v2"/>',
    rec: '<path d="M4 12h2M8 8v8M12 5v14M16 9v6M20 11v2"/>',
  };
  $('#music-list').innerHTML = TRACKS.filter((t) => !t.hidden).map((t, i) => {
    const on = music() === t.id, kind = ICON[t.id] ? t.id : 'rec', rec = t.src || t.list;
    return `<button class="music-card" data-music="${t.id}" aria-pressed="${on}">
      <span class="mc-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[kind]}</svg></span>
      <span class="mc-text"><b>${i + 1}. ${t.name}</b><small>${t.cap}</small></span>
      <span class="mc-tag">${on ? '<i class="eq"><s></s><s></s><s></s></i>' : t.list ? '이어 듣기' : '녹음'}</span>
    </button>`;
  }).join('');
}
function pickMusic(id) {
  store.set('music', id);
  if (!sound.on) { setSound(true); store.set('muted', false); syncSoundBtn(); }
  setMusic(id);
  renderMusic();
}

// 사진 찍기: 버튼을 모두 숨기고, 화면을 끌어 구도를 잡은 뒤 셔터. 휴대폰은 공유 창(사진에 저장), 컴퓨터는 파일로 받기
function startPhoto() {
  if (S.mode !== 'world') return;
  stopCalm();
  S.photo = true;
  document.body.classList.add('photo');
}
function stopPhoto() {
  S.photo = false;
  document.body.classList.remove('photo');
}
async function takePhoto() {
  renderer.render(scene, camera); // 바로 그린 직후에 읽어야 빈 화면이 아니다
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0);
  const fs = Math.round(Math.max(c.width, c.height) / 48);
  g.font = `700 ${fs}px "Gowun Batang", serif`;
  g.textAlign = 'right';
  g.fillStyle = 'rgba(255, 255, 255, .9)';
  g.shadowColor = 'rgba(0, 0, 0, .45)'; g.shadowBlur = fs / 2;
  g.fillText('큰법당 템플스테이 · templestay.site', c.width - fs, c.height - fs);
  const flash = $('#photo-flash');
  flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const name = `templestay-${today()}-${Date.now().toString(36)}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('사진을 저장했어요');
}
$('#photo-shoot').onclick = takePhoto;
$('#photo-close').onclick = stopPhoto;
addEventListener('keydown', (e) => { if (S.photo && e.code === 'Escape') stopPhoto(); });

// 크게 보기 (화면보호기): 버튼을 모두 숨기고 전체 화면에서 카메라가 내 캐릭터 둘레를 천천히 돌아요.
// 화면을 누르거나 아무 키나 누르면 돌아와요. 5분 동안 손대지 않아도 저절로 켜져요.
const CALM_IDLE = 5 * 60 * 1000;
let lastInput = Date.now();
function startCalm() {
  if (S.calm || S.mode !== 'world' || S.photo) return;
  S.calm = true;
  document.body.classList.add('calm');
  $('#menu').hidden = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  document.documentElement.requestFullscreen?.().catch(() => {});
  toast('화면을 누르면 돌아와요');
}
function stopCalm() {
  if (!S.calm) return;
  S.calm = false;
  document.body.classList.remove('calm');
  controls.autoRotate = false;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
// 크게 보기 중의 첫 누름은 돌아오기만 하고, 걸어가기 같은 다른 일은 하지 않아요
const wake = (e) => {
  lastInput = Date.now();
  if (!S.calm) return;
  e.stopPropagation(); e.preventDefault();
  stopCalm();
};
addEventListener('pointerdown', wake, { capture: true });
addEventListener('keydown', wake, { capture: true });
addEventListener('pointermove', () => { lastInput = Date.now(); }, { passive: true });
addEventListener('wheel', () => { lastInput = Date.now(); }, { passive: true });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) stopCalm(); });
setInterval(() => {
  const busy = !$('#creator').hidden || document.querySelector('.modal:not([hidden])');
  if (!S.calm && S.mode === 'world' && !busy && Date.now() - lastInput > CALM_IDLE) startCalm();
}, 10000);
$('#welcome-char').onclick = () => { $('#welcome').hidden = true; store.set('welcomed', true); openCreator(); };
$('#welcome-close').onclick = () => { $('#welcome').hidden = true; store.set('welcomed', true); };
$('#wish-form').addEventListener('submit', submitWish);
// 소리는 처음 화면을 누를 때 켠다 (브라우저 규칙)
addEventListener('pointerdown', () => { if (!sound.on && !params.has('mute') && !store.get('muted', false)) { setSound(true); syncSoundBtn(); } }, { once: true });
syncSoundBtn();
renderWishForm();

// ───────── 시안용 화면 (?gallery=types|men|outfits|acc|pets, ?demo=in|out|meal|room&loc=..&bots=N) ─────────
function gallery(kind) {
  S.mode = 'gallery';
  $('#loading').hidden = true;
  scene.background = new THREE.Color('#efe6d6');
  scene.add(new THREE.HemisphereLight('#fff7e8', '#b59a7a', 1.5));
  const d = new THREE.DirectionalLight('#ffffff', 2.4); d.position.set(3, 6, 5); d.castShadow = true; scene.add(d);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshStandardMaterial({ color: '#e6d9c2' }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const items = kind === 'types' || kind === 'men' ? CHAR_TYPES.map((t, i) => ({ look: { ...defaultLook(), type: t.id, gender: kind === 'men' ? 'm' : 'f', skin: SKIN_TONES[i % 3], pet: 'none' } }))
    : kind === 'bodies' ? BODIES.flatMap((b) => ['f', 'm'].map((g) => ({ look: { ...defaultLook(), body: b.id, type: 'moral', gender: g, pet: 'none' } })))
    : kind === 'newoutfits' ? OUTFITS.filter((o) => o.preview).map((o, i) => ({ label: `${i + 1}. ${o.name}`, look: { ...defaultLook(), type: CHAR_TYPES[i % 8].id, gender: i % 2 ? 'm' : 'f', outfit: o.id, pet: 'none' } }))
    : kind === 'newacc' ? ACCESSORIES.filter((a) => a.preview).map((a, i) => ({ label: `${i + 1}. ${a.name}`, look: { ...defaultLook(), type: CHAR_TYPES[i % 8].id, gender: i % 2 ? 'm' : 'f', acc: a.id, pet: 'none' } }))
    : kind === 'outfits' ? OUTFITS.filter((o) => !o.hidden).map((o, i) => ({ look: { ...defaultLook(), type: CHAR_TYPES[i % 8].id, gender: i % 2 ? 'm' : 'f', outfit: o.id, pet: 'none' } }))
    : kind === 'monk' ? CHAR_TYPES.map((t, i) => ({ look: { ...defaultLook(), type: t.id, gender: i % 2 ? 'm' : 'f', pet: 'none' }, scene: 'in' }))
    : kind.startsWith('newpets') ? PETS.filter((p) => p.preview === ({ newpets: true, newpets2: 2, newpets3: 3 }[kind])).map((p, i) => ({ look: { ...defaultLook(), type: CHAR_TYPES[i % 8].id, gender: i % 2 ? 'm' : 'f', pet: p.id } }))
    : kind === 'pets' ? PETS.filter((p) => !p.hidden && !p.preview && inSeason(p) && p.id !== 'none').map((p, i) => ({ look: { ...defaultLook(), type: CHAR_TYPES[i % 8].id, gender: i % 2 ? 'm' : 'f', pet: p.id } }))
    : ACCESSORIES.map((a, i) => ({ look: { ...defaultLook(), type: CHAR_TYPES[i].id, gender: i % 2 ? 'm' : 'f', acc: a.id, pet: 'none' } }));
  const acts = (params.get('acts') || '').split(',');
  const isPets = kind === 'pets' || kind.startsWith('newpets');
  const gap = isPets ? 1.7 : 1.3;
  items.forEach((it, i) => {
    const av = new Avatar(it.look, it.label || hairName(CHAR_TYPES.find((t) => t.id === it.look.type) || CHAR_TYPES[0], it.look.gender));
    if (it.scene) av.dress(it.scene);
    av.group.position.set((i - (items.length - 1) / 2) * gap - (isPets ? 0.35 : 0), 0, 0);
    if (acts[i]) av.play(acts[i]);
    if (params.get('speed')) av.speed = +params.get('speed'); // 시안용: 걷기·뛰기 모습 보기
    scene.add(av.group);
    galleryAvatars.push(av);
  });
  camera.fov = 40; camera.updateProjectionMatrix();
  const np = kind.startsWith('newpets');
  camera.position.set(0, np ? 1.3 : 1.6, np ? 10.5 : isPets ? 15 : 9.6);
  camera.lookAt(0, np ? 0.6 : 0.85, 0);
  controls.enabled = false;
}

async function demo(which) {
  S.loc = LOCATIONS.find((l) => l.id === (params.get('loc') || 'forest'));
  S.enteredAt = Date.now() - 754000;
  S.mode = 'world';
  S.server = 6;
  if (params.get('type')) S.profile = { ...S.profile, look: { ...S.profile.look, type: params.get('type') } };
  makeMe();
  $('#loading').hidden = true;
  $('#hud').hidden = params.has('nohud');
  renderActions();
  renderSceneBar();
  await goScene(which, { instant: true });
  if (which === 'in') await loadBuddha(S.active);
  S.enteredAt = Date.now() - 754000;
  const n = +(params.get('bots') || 0);
  const types = CHAR_TYPES.map((t) => t.id);
  const rnd = (() => { let s = 9; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const world = S.active;
  const seats = world.seats ? [...world.seats].sort(() => rnd() - 0.5) : [];
  for (let i = 0; i < n; i++) {
    const look = { type: types[Math.floor(rnd() * types.length)], gender: rnd() < 0.5 ? 'f' : 'm', skin: SKIN_TONES[Math.floor(rnd() * 3)], outfit: rnd() < 0.5 ? 'own' : OUTFITS[1 + Math.floor(rnd() * 6)].id, acc: rnd() < 0.7 ? 'none' : ACCESSORIES[Math.floor(rnd() * ACCESSORIES.length)].id, pet: rnd() < 0.35 ? PETS[Math.floor(rnd() * 10)].id : 'none' };
    const seat = (which === 'in' && rnd() < 0.75) || which === 'meal' ? seats[i] : null;
    const walk = which === 'out' && world.walkPath ? world.walkPath[i % world.walkPath.length] : null;
    const pos = seat ? [seat.pos.x, seat.pos.z] : walk ? [walk.x + (rnd() - 0.5) * 2, walk.z + (rnd() - 0.5) * 2] : [(rnd() - 0.5) * 18, (rnd() - 0.3) * 18];
    const act = which === 'meal' ? 'eat' : seat ? ['hapjang', 'beads', 'meditate', 'moktak', null][Math.floor(rnd() * 5)] : null;
    handleRemoteState('bot' + i, { n: randomName(), l: look, s: which, p: pos, r: seat ? seat.rot : rnd() * 6, seat: seat ? seat.id : null, y: seat ? seat.y : 0, a: act, at: rnd() * 2 });
  }
  for (const r of S.remotes.values()) { r.seen = Infinity; r.av.group.position.copy(r.pos); if (r.av.seated) r.av.group.position.y = r.seatY; }
  if (params.get('seat') && world.seats) sitOn(world.seats[+params.get('seat')], { auto: true });
  if (which === 'meal' && !params.get('seat')) { sitOn(freeSeat(world.seats, false), { auto: true }); }
  const act = params.get('act') || (which === 'meal' ? 'eat' : which === 'room' ? 'read' : null);
  if (act) startLoop(act);
  if (which === 'out' && params.has('walk')) startWalk();
  const cam = params.get('cam');
  if (cam) {
    const [x, y, z, tx, ty, tz] = cam.split(',').map(Number);
    camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update();
    camTurn = null;   // 확인용 카메라: 앉으며 도는 카메라에 덮이지 않게
  }
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  if (params.get('toast')) toast(params.get('toast'));
  if (params.has('record')) openRecords();
  if (params.has('relic')) openRelics();
  if (params.get('act') === 'bae108') { $('#bae-counter').innerHTML = '<small>108배</small><b>12</b><small>/ 108</small>'; $('#bae-counter').hidden = false; }
  updateHud();
}

// ───────── 화면 확대 막기 ─────────
// 두 손가락은 3D 화면 확대·축소(카메라)에만 써요. 아이폰 사파리는 페이지 확대 금지를 무시해서
// 페이지 확대 몸짓을 막고, 그래도 커져 버리면(입력칸 확대 등) 1초 뒤 원래 크기로 되돌려요.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
const viewportMeta = document.querySelector('meta[name="viewport"]');
let zoomFix = null;
visualViewport?.addEventListener('resize', () => {
  if (visualViewport.scale <= 1.01 || zoomFix) return;
  zoomFix = setTimeout(() => {
    zoomFix = null;
    if (document.activeElement?.matches?.('input, textarea')) return;   // 글자를 쓰는 중에는 그대로
    const c = viewportMeta.content;
    viewportMeta.content = c + ', minimum-scale=1';   // 다시 써 넣으면 사파리가 1배로 돌아가요
    setTimeout(() => (viewportMeta.content = c), 50);
  }, 1000);
});
// 입력칸에서 나오면(법명 · 소원지 다 쓰고) 커진 화면이 있으면 되돌리기
document.addEventListener('focusout', () => setTimeout(() => { if (visualViewport?.scale > 1.01) visualViewport.dispatchEvent(new Event('resize')); }, 300));

// ───────── 시작 ─────────

(async () => {
  if (!params.has('demo') && !params.has('gallery')) preloadNet();
  try { await Promise.race([document.fonts.load('700 40px "Gowun Batang"'), sleep(2500)]); } catch {}
  loop();
  if (params.get('gallery')) return gallery(params.get('gallery'));
  if (params.get('demo')) return demo(params.get('demo'));
  const loc = params.get('loc') || store.get('lastLoc', 'forest');
  enterLocation(LOCATIONS.some((l) => l.id === loc) ? loc : 'forest');
})();
