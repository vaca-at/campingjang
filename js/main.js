// 앱 흐름: 바로 캠프 마당으로 → 꾸미기는 들어간 다음에.
// 장소는 캠프 마당(in) · 물가(out) · 취사장(meal) · 내 자리(room).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  LOCATIONS, COMMON_ACTIONS, COMMON_SCENES, CHAR_TYPES, OUTFITS, ACCESSORIES, SKIN_TONES, ACTIONS, SERVER_COUNT, SERVER_CAP, GENDERS,
  SCENES, SCENE_ACTIONS, SCENE_ACTION_NAMES, BODIES, FACES, hairName, season, inSeason, randomName, defaultLook, isOldAutoName,
} from './data.js';
import { PETS } from './blocky.js';
import { Avatar } from './avatar.js';
import { buildBoriamView, setPanorama } from './world.js';
import { Net, preloadNet } from './net.js';
import { setSound, sound, sfx, startSfx, setAmbience, trackFolder, TRACKS, setMusic, music } from './audio.js';
import { buildCampsite, buildShore, buildShelterRoom, buildCampKitchen, yardBase, SHELTERS, shelterOf } from './camp.js';
import { addPhoto, listPhotos, removePhoto } from './album.js';
import { launchFirework, stepFireworks, addToDex, renderDex, loadDex } from './fun.js';
import { daylight, applyDaylight, glow, dayPart } from './daytime.js';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── 렌더러 ─────────
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.localClippingEnabled = true;   // 텐트 안: 앞쪽 천을 잘라 문 너머가 보이게
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
// 목록에서 없앤 옷(예: 단풍 두루마기)을 입고 있던 분은 기본 옷으로
if (!OUTFITS.some((o) => o.id === profile.look.outfit)) { profile.look.outfit = defaultLook().outfit; store.set('profile', profile); }

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
  onLeave: (peer) => removeRemote(peer, true),
  onReset: () => { for (const id of [...S.remotes.keys()]) removeRemote(id, false); },
  // 다시 붙었을 때: 서버가 알려 준 분들만 남기고 정리 (그대로 있는 분은 다시 '오셨어요' 하지 않게)
  onKeep: (ids) => { for (const id of [...S.remotes.keys()]) if (!ids.includes(id)) removeRemote(id, false); },
  onFull: (n) => { toast(`서버 ${n}이 가득 차서 다른 서버로 옮겨요`); switchServer(n % SERVER_COUNT + 1); },
  getWishes: () => [],
  peerCount: () => S.remotes.size,
});

// ───────── 월드 ─────────
const BUILDERS = { in: buildCampsite, out: buildShore, meal: buildCampKitchen, room: buildShelterRoom, boriam: buildBoriamView };
// 창밖 풍경: 바깥 3D 풍경을 마당 한가운데에서 네 방향으로 찍어 이어 붙인 사진을 창에 붙여요.
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
      const w = yardBase(loc);   // 바닷가는 해변 마당 풍경으로
      // 마당 위 물건은 숨기고 먼 풍경만 찍어요
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
    if (['in', 'room', 'meal'].includes(which)) capturePanorama(loc);
  }
  return w[which];
}

function setWorld(world) {
  if (S.active) scene.remove(S.active.group);
  S.active = world;
  scene.add(world.group);
  scene.fog = world.fog;
  scene.background = world.background;
  scene.environmentIntensity = ENV * applyDaylight(world, dayNow(), glowNow());
  world.campfire?.userData.setLit(dayNow() < 0.5);
  setAmbience(ambienceFor());
}
// 장소 바탕 소리: 물가는 물소리, 마당은 낮엔 새소리 · 밤엔 풀벌레 (바닷가는 늘 파도)
function ambienceFor() {
  const id = S.loc?.id, night = dayNow() < 0.5, A = (n) => `assets/audio/${n}.m4a`;
  if (S.scene === 'out') return A(id === 'sea' ? 'waves' : id === 'river' ? 'stream' : 'brook');
  if (id === 'sea') return A('gentle-waves');
  if (id === 'river') return A('crickets');
  return A(night ? 'summer-bugs' : 'forest-birds');
}
// 낮과 밤: 30초마다 한국의 해 뜨고 지는 시각에 맞춰 다시 칠한다
// 카바나 · 별밤은 늘 밤
const dayNow = () => (S.loc?.night ? 0 : daylight());
const glowNow = () => (S.loc?.night ? { morning: 0, evening: 0 } : glow());
setInterval(() => { if (S.active) { scene.environmentIntensity = ENV * applyDaylight(S.active, dayNow(), glowNow()); S.active.campfire?.userData.setLit(dayNow() < 0.5); setAmbience(ambienceFor()); } }, 30000);

// ───────── 내 캐릭터 ─────────
function makeMe() {
  if (S.me) { players.remove(S.me.group); S.me.dispose(); }
  S.me = new Avatar(S.profile.look, S.profile.name, { mine: true });
  players.add(S.me.group);
}

// ───────── 장소 옮기기 ─────────
const fade = (on) => new Promise((r) => { $('#fade').classList.toggle('on', on); setTimeout(r, on ? 460 : 10); });

async function goScene(which, { instant = false } = {}) {
  const from = S.scene;
  if (!instant) await fade(true);
  standUp(true);
  if (S.me?.action) { S.me.stop(); syncActionButtons(); }   // 장소를 옮기면 하던 동작은 멈춰요
  S.walking = false;
  S.target = null;
  S.scene = which;
  const world = worldFor(S.loc.id, which);
  setWorld(world);
  S.me.dress(which);
  const me = S.me.group;
  if (which === 'out' && world.door) {
    // 문이 있는 곳이면 문 앞에, 바깥을 바라보고 선다
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
    // 책상 건너편 위에서 내려다보게: 책상이 캐릭터를 가리지 않고 손(책·컵)과 얼굴이 함께 보여요.
    // 세로로 긴 휴대폰은 옆이 좁아서 그만큼 뒤로 물러나 가운데에 오게
    const back = Math.min(1.7, Math.max(1, 0.85 / (innerWidth / innerHeight)));
    controls.target.set(0, 0.72, -0.75);
    camera.position.set(1.1 * back, 0.72 + 1.3 * back, -0.75 - 1.95 * back);   // 책상 건너편 위에서 얼굴 쪽으로
    controls.update();
  }
  S.me.tag.visible = which !== 'room';
  S.me.propLift = which === 'room' ? 0.07 : 0;   // 내 자리: 손에 든 책이 조금 위로
  renderActions();   // 장소마다 동작 줄이 달라요
  refreshRemoteVisibility();
  updateHud();
  pushState(true);
  if (!instant) fade(false);
}

function placeCameraBehind(dist) {
  const me = S.me.group;
  const back = new THREE.Vector3(Math.sin(me.rotation.y), 0, Math.cos(me.rotation.y)).multiplyScalar(-dist);
  // 아이패드 세로처럼 큰 세로 화면은 하늘이 반이라, 시선을 조금 내려 마당·사람이 크게 보이게
  // (시선이 높은 마당만 많이 내리고, 실내처럼 원래 낮은 곳은 조금만)
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
    // 가까이(15m 안)에서 누가 손을 흔들면 알려 줘요
    if (d.a === 'wave' && S.mode === 'world' && d.s === S.scene && S.scene !== 'room' && S.me && Math.hypot(d.p[0] - S.me.group.position.x, d.p[1] - S.me.group.position.z) < 15) toast(d.wt ? `👋 ${d.n}님이 ${d.wt === S.profile.name ? '나' : `${d.wt}님`}에게 손을 흔들었어요` : `👋 ${d.n}님이 손을 흔들었어요`);
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
  if (announce && S.mode === 'world') toast(`${r.st.n}님이 캠핑장을 떠났어요`);
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
    wt: S.me.action === 'wave' ? S.waveTo || null : null,   // 손 흔든 상대 이름
  };
  const key = JSON.stringify({ ...st, at: 0 });
  const now = performance.now();
  // 서버 부르기 줄이기: 다른 탭을 보고 있으면 안 보내요. 움직였을 때만 보내고(함께 있는 분이 있으면 0.25초, 혼자면 5초마다),
  // 가만히 있으면 함께 있는 분이 있을 때만 1분에 한 번 '여기 있어요'
  if (document.hidden && !force) return;
  const alone = S.remotes.size === 0;
  if (force || (key !== lastSent && now - lastSentAt > (alone ? 5000 : 250)) || (!alone && now - lastSentAt > 60000)) {
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
function turnCameraToFace(dist, { high = false } = {}) {
  const g = S.me.group;
  const off = camera.position.clone().sub(controls.target);
  camTurn = {
    t: 0,
    from: { yaw: Math.atan2(off.x, off.z), r: Math.hypot(off.x, off.z), y: off.y, at: controls.target.clone() },
    to: { yaw: g.rotation.y + (S.active.faceYaw ?? 0.4), r: Math.min(S.active.faceR ?? 99, dist * (high ? 0.6 : 0.8)), y: S.active.faceY ?? dist * (high ? 0.75 : 0.2), at: g.position.clone().add(new THREE.Vector3(0, 0.95, 0)) },
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
  hammock: '<path d="M3 6v14M21 6v14" stroke="currentColor" stroke-width="1.8"/><path d="M3 9c5 7 13 7 18 0v2c-5 7-13 7-18 0z"/>',
  badminton: '<circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 11l7 7" stroke="currentColor" stroke-width="2"/><path d="M17 4l2 4-3 1z"/>',
  catchball: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 7c3 3 3 7 0 10M17 7c-3 3-3 7 0 10" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  bubbles: '<circle cx="9" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="7" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="15" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  stargaze: '<path d="M12 3l1.8 4.2 4.5.4-3.4 3 1 4.4L12 12.8 8.1 15l1-4.4-3.4-3 4.5-.4z"/><path d="M4 20h16" stroke="currentColor" stroke-width="1.8"/>',
  diary: '<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 13h7M9 17h4" stroke="#fff" stroke-width="1.4"/>',
  hapjang: '<path d="M12 3c-1 2-2 5-2 9v6h4v-6c0-4-1-7-2-9z M9 18h6v2H9z"/>',
  banbae: '<circle cx="12" cy="5" r="2.2"/><path d="M12 8c-3 1-5 4-5 7h3l2-3 2 3h3c0-3-2-6-5-7z"/>',
  keunjeol: '<circle cx="6" cy="15" r="2.2"/><path d="M8 16h9c2 0 3 1 3 3H6z"/>',
  beads: '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="1.5 2.2"/><circle cx="12" cy="19.5" r="1.6"/>',
  jukbi: '<path d="M5 19L17 5l2 2L7 21z"/>',
  meditate: '<path d="M12 6c2 2 3 5 0 9-3-4-2-7 0-9zM4 12c3 0 6 2 8 5-4 1-7-1-8-5zM20 12c-3 0-6 2-8 5 4 1 7-1 8-5z"/>',
  wave: '<path d="M8 21v-7l-2-3 1-1 3 3V5a1 1 0 012 0v6h1V4a1 1 0 012 0v7h1V6a1 1 0 012 0v9c0 3-2 6-5 6z"/>',
};

// 아래 동작 줄: 장소마다 다른 다섯 가지 (js/data.js 의 SCENE_ACTIONS)
function renderActions() {
  const ids = SCENE_ACTIONS[S.scene] || SCENE_ACTIONS.in, names = { ...(SCENE_ACTION_NAMES[S.scene] || {}), ...(S.scene === 'out' && S.loc?.id !== 'sea' ? { shells: '예쁜 돌 줍기' } : {}) };
  $('#side-acts').innerHTML = COMMON_SCENES.includes(S.scene) ? COMMON_ACTIONS[S.scene].map((id) => ACTIONS.find((a) => a.id === id)).map((a) => `<button class="glass ctx act" data-act="${a.id}" aria-pressed="false"><span class="lbl">${a.name}</span><small class="cap">${a.cap}</small></button>`).join('') : '';
  const onlySea = ['sandcastle'], notSea = ['stepstones'];   // 바닷가엔 징검다리 없이, 모래성은 바닷가에서만
  $('#actions').innerHTML = ids.filter((id) => (S.loc?.id === 'sea' || !onlySea.includes(id)) && (S.loc?.id !== 'sea' || !notSea.includes(id))).map((id) => ACTIONS.find((a) => a.id === id)).map((a) =>
    `<button class="act" data-act="${a.id}" aria-pressed="false"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[a.id] || ''}</svg>${names[a.id] || a.name}<small class="cap">${a.cap}</small></button>`).join('');
  syncActionButtons();
}

let spotArrived = null;
const MOVING_ACTS = new Set(['bugs', 'bubbles', 'kite', 'bike', 'kayak', 'stepstones', 'wavedodge', 'shells']);   // 움직이며 하는 동작
function doAction(id) {
  // 산책: 길을 따라 걷는 동작이라 따로 (다시 누르면 멈춤)
  if (id === 'walk') {
    const on = S.walking && S.walkMode === id;
    stopWalk();
    S.target = null;
    if (!on) { startSfx(id); startSanbo(); }
    net.sendAct({ a: id, on: !on });
    syncActionButtons();
    return;
  }
  // 캠핑장: 그 동작을 하는 자리(개수대 · 버너 · 장작더미 · 물가 · 이불 …)까지 걸어가서 시작해요
  let spot = S.active.spots?.[id];
  // 자리가 여럿이면(코트 양쪽) 다른 사람이 덜 가까운 쪽으로
  if (Array.isArray(spot)) {
    const others = [...S.remotes.values()].filter((r) => r.st.s === S.scene).map((r) => r.av.group.position);
    const me = S.me.group.position;
    spot = spot.nearest ? [...spot].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]   // 불꽃놀이: 가장 가까운 자리
      : spot.map((p) => [p, Math.min(99, ...others.map((o) => Math.hypot(o.x - p.x, o.z - p.z)))]).sort((a, b) => b[1] - a[1])[0][0];
  }
  // 연날리기는 앉아 있으면 그 자리에 앉은 채로 날려요 (걸어가지 않아요)
  if (id === 'kite' && S.seat != null) spot = null;
  if (spot && S.me.action !== id && spotArrived !== id) {
    const to = new THREE.Vector3(spot.x + (Math.random() - 0.5) * (spot.jx || 0), 0, spot.z);
    S.spotY = spot.y; S.curSpot = spot;
    if (to.distanceTo(S.me.group.position.clone().setY(0)) > 0.35) {
      standUp(); if (S.me.action) S.me.stop();
      S.target = { pos: to, speed: SPEED, face: spot.rot, onArrive: () => { spotArrived = id; doAction(id); spotArrived = null; } };
      syncActionButtons();
      return;
    }
  }
  // 앉아서 하는 동작(라면 먹기 · 책 읽기 · 낚시)은 서 있으면 먼저 빈자리에 앉는다
  if (ACTIONS.find((a) => a.id === id)?.seat && S.seat == null && S.active.seats?.length && S.me.action !== id) {
    const seat = S.scene === 'room' ? S.active.seats[0] : freeSeat(S.active.seats, false);
    if (!sitOn(seat, { auto: true })) return;
  }
  S.target = null;
  S.walking = false;
  // 손 흔들기: 4m 안에 사람이 있으면 그쪽을 바라보고 인사해요 (콕 찌른 사람이 있으면 그 사람에게)
  if (id === 'wave' && S.me.action !== 'wave') {
    const me = S.me.group.position, cand = S.pokeTo || [...S.remotes.values()].filter((r) => r.st.s === S.scene && r.av.group.visible).map((r) => [r, r.av.group.position.distanceTo(me)]).filter(([, d]) => d < 4).sort((a, b) => a[1] - b[1])[0]?.[0];
    S.pokeTo = null;
    S.waveTo = cand ? cand.st.n : null;
    if (cand) { const p = cand.av.group.position; S.me.group.rotation.y = Math.atan2(p.x - me.x, p.z - me.z); }
  }
  const on = S.me.play(id);
  if (on && id === 'wave' && S.waveTo) toast(`👋 ${S.waveTo}님에게 손을 흔들었어요`);
  if (on) startSfx(id);   // 시작할 때만 짧게 한 번
  // 내 자리 낮잠: 침대 · 침낭 위로 옮겨 눕고, 다른 동작을 하면 다시 자리에 앉아요
  if (S.scene === 'room' && S.active.napSpot) {
    if (on && id === 'nap') { S.seat = null; S.me.seated = false; const n = S.active.napSpot; S.me.group.position.copy(n.pos); S.me.group.rotation.y = n.rot; }   // 이불 위로 (이불은 아래 그리기에서 펴져요)
    else if (S.me.group.position.y > 0.01 && !S.me.seated) { S.me.group.position.y = 0; sitOn(S.active.seats[0], { auto: true }); }
  } else if (on && spotArrived === id && S.spotY != null) { S.seat = null; S.me.seated = false; S.me.group.position.y = S.spotY; }   // 해먹 · 매트 위로
  else if (!on || !['hammock', 'stargaze'].includes(id)) { if (S.me.group.position.y > 0.01 && !S.me.seated && S.scene !== 'room') S.me.group.position.y = 0; }
  // 제자리 동작을 시작하면 카메라가 앞쪽(살짝 옆)으로 천천히 돌아와 얼굴과 손이 보이게. 누운 동작은 조금 위에서
  // (걸어 다니는 동작 · 산책 · 조리대 앞 동작은 그대로)
  if (on && !MOVING_ACTS.has(id) && !S.active.spots?.[id]?.sideCam) {
    const dist = S.scene === 'room' ? (S.active.maxDist || 3) * 1.05 : Math.min(S.active.camDist || 5, 6);   // 텐트 안은 좁아서 끝까지 물러나서
    turnCameraToFace(dist, { high: ['nap', 'hammock', 'stargaze'].includes(id) });
  }
  // 조리대 앞 동작(요리 · 고기 굽기 · 설거지): 등만 보이지 않게 카메라를 옆으로 돌려 손과 냄비가 보이게
  if (on && spotArrived === id && S.active.spots?.[id]?.sideCam) {
    const g = S.me.group, f = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y)), side = new THREE.Vector3(f.z, 0, -f.x);
    controls.target.copy(g.position).add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(f, 0.4);
    camera.position.copy(g.position).addScaledVector(side, 2.3).addScaledVector(f, -0.6).add(new THREE.Vector3(0, 1.8, 0));
    controls.update();
  }   // 내 자리: 눕거나 자리를 옮겨도 카메라가 나를 다시 비추게
  if (on && id === 'stargaze' && dayNow() > 0.5) toast('별은 해가 진 뒤에 잘 보여요. 낮에는 구름 구경!');
  if (on && id === 'fireworks') { launchFirework(scene, S.me.group.position); addRecord('fireworks', 1); }
  net.sendAct({ a: id, on });
  pushState(true);
  syncActionButtons();
}

// 저절로 이어지는 반복 동작 (라면 먹기 · 책 읽기)
function startLoop(id) {
  S.me.action = id;
  S.me.actionT = 0;
  pushState(true);
  syncActionButtons();
}

function syncActionButtons() {
  const on = (id) => id === 'walk' ? (S.walking && S.walkMode === 'walk') || walkStarting : S.me?.action === id;
  document.querySelectorAll('.act').forEach((b) => b.setAttribute('aria-pressed', String(on(b.dataset.act))));
  const sanbo = on('walk');
  $('#btn-sanbo').setAttribute('aria-pressed', String(sanbo));
  $('#btn-sanbo .lbl').textContent = sanbo ? '산보 멈추기' : '산보하기';
  if (!CATCH[S.me?.action]) { $('#bae-counter').hidden = true; catchMsg = ''; }   // 위쪽 안내 칸은 잡기 · 요리할 때만
}

let walkStarting = false;
// 직접 움직이면(장소 옮기기 · 앉기 · 일어서기 · 동작) 하던 산책을 멈춘다
function stopWalk() {
  S.walking = false;
  S.walkMode = null;
  walkStarting = false;
}

// 산책: 장소마다 정해진 둘레길을 따라 걸어요
let walkDist = 0;
// 산책 시작
async function startSanbo() {
  if (!S.active.walkPath) return;   // 마당 · 물가 둘레길
  standUp(true);
  startWalk();   // 캠핑장 산책: 바로 걷기
}


function startWalk(path = S.active.walkPath, mode = 'walk') {
  if (!path) return;
  standUp(true);
  walkDist = 0;
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

const CATCH = {
  fish: { period: 14, chance: 0.5, kind: 'fish', label: '낚시', find: '입질을 기다리고 있어요…', near: '찌가 움직여요!', miss: '아깝다, 놓쳤어요' },
  bugs: { period: 12, chance: 0.45, kind: 'bug', label: '곤충 잡기', find: '곤충을 찾고 있어요…', near: '앗, 저기 있다!', miss: '놓쳤어요… 다시 찾아볼게요' },
  cook: { period: 16, chance: 1, kind: 'food', label: '요리', find: '보글보글 끓이는 중…', near: '거의 다 됐어요' },
  grill: { period: 14, chance: 1, kind: 'food', label: '고기 굽기', find: '지글지글 굽는 중…', near: '뒤집을 때가 됐어요' },
};
let catchKey = null, catchMsg = '', catchHold = 0, wander = null;
function catchStatus(c, text) {
  if (text === catchMsg) return;
  catchMsg = text;
  $('#bae-counter').innerHTML = `<small>${c.label}</small><b class="catch-msg">${text}</b>`;
  $('#bae-counter').hidden = false;
}
function stepCatch(dt = 0.016) {
  const a = S.me?.action, c = CATCH[a];
  if (!c) {
    if (catchMsg) { $('#bae-counter').hidden = true; catchMsg = ''; }
    catchKey = null; wander = null; return;
  }
  const t = S.me.actionT, n = Math.floor(t / c.period), u = t - n * c.period;
  if (n >= 1 && catchKey !== `${a}:${n}`) {
    catchKey = `${a}:${n}`;
    if (Math.random() < c.chance) {
      const [name, first] = addToDex(c.kind, { night: dayNow() < 0.3, haveFish: !!Object.keys(loadDex().fish || {}).length });
      sfx('catch');
      toast(`${c.kind === 'fish' ? '🐟' : c.kind === 'bug' ? '🦋' : '🍳'} ${name}${c.kind === 'food' ? '을(를) 만들었어요' : '을(를) 잡았어요'}${first ? ' · 도감에 새로 올렸어요!' : ''}`);
      catchStatus(c, c.kind === 'food' ? '완성!' : '잡았다!');
    } else catchStatus(c, c.miss);
    catchHold = 2.5;
  }
  if (catchHold > 0) { catchHold -= dt; return; }
  catchStatus(c, u > c.period - 3 ? c.near : c.find);
}
// 돌아다니며 하는 동작(곤충 잡기 · 비눗방울): 처음 선 자리 둘레 5m 안에서 여기저기 걸어가고, 가서는 잠깐 멈춰요
let wanderAt = null, wanderTo = null, wanderWait = 0;
function stepWander(dt) {
  const a = S.me?.action;
  const conf = S.active?.wanders?.[a] || (['bugs', 'bubbles'].includes(a) ? { r: 5, speed: a === 'bugs' ? 1.6 : 0.9, wait: 1.2 } : null);
  if (!conf || S.seat != null || S.target || S.walking) { wanderAt = wanderTo = null; return; }
  const g = S.me.group;
  wanderAt ||= (conf.center || g.position).clone();
  if (wanderWait > 0) { wanderWait -= dt; S.me.speed = 0; return; }
  if (!wanderTo) {
    const ang = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * (conf.r - 1.2);
    wanderTo = wanderAt.clone().add(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r)); collide(wanderTo);
    if (S.active.dryZ != null) wanderTo.z = Math.min(wanderTo.z, S.active.dryZ);   // 물에는 들어가지 않아요
  }
  const d = wanderTo.clone().sub(g.position).setY(0), len = d.length(), sp = conf.speed;
  if (len < 0.15) { wanderTo = null; wanderWait = conf.wait * (0.6 + Math.random() * 0.8); if (a === 'shells') { S.me.actionT = 0; wanderWait = 4.2; setTimeout(pickShell, 1300); } return; }   // 숙여 줍고(0~1.3초) 짝! 들어 보이기
  const step = Math.min(len, sp * dt), before = g.position.clone();
  g.position.addScaledVector(d.normalize(), step); collide(g.position);
  followCam(before);
  const want = Math.atan2(d.x, d.z), diff = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y));
  g.rotation.y += diff * Math.min(1, dt * 6);
  S.me.speed = sp;
}

// 길 따라 하는 동작: 자전거(마당 한 바퀴) · 카약(물 위 한 바퀴) · 징검다리(돌 위를 폴짝, 갔다가 돌아오기) · 파도 피하기(물가 ↔ 뒤로)
let route = null;
function stepRoute(dt) {
  const a = S.me?.action, conf = S.active?.routes?.[a], g = S.me?.group;
  if (!conf || S.target || S.seat != null) {
    if (route) {   // 끝나면 물 밖 · 땅 위로
      g.position.y = 0; collide(g.position); route = null;
    }
    return;
  }
  if (!route || route.a !== a) {
    // 가장 가까운 점부터 출발
    let best = 0, bd = Infinity; conf.pts.forEach((p, i) => { const d = p.distanceTo(g.position.clone().setY(p.y)); if (d < bd) { bd = d; best = i; } });
    route = { a, i: best, dir: 1, u: 0, wait: 0 };
  }
  if (route.wait > 0) { route.wait -= dt; S.me.speed = 0; return; }
  const n = conf.pts.length;
  let j = route.i + route.dir;
  if (conf.loop) j = (j + n) % n;
  else if (j < 0 || j >= n) { route.dir *= -1; route.wait = conf.pause || 0.3; return; }
  const A = conf.pts[route.i], B = conf.pts[j], L = Math.max(0.01, A.distanceTo(B));
  route.u += (conf.speed * dt) / L;
  if (route.u >= 1) { route.u = 0; route.i = j; if (a === 'wavedodge' && conf.pts.length === 2) route.wait = route.dir > 0 ? 1.2 : 0.4; return; }
  const before = g.position.clone();
  g.position.lerpVectors(A, B, route.u);
  if (conf.hop) g.position.y += Math.sin(Math.PI * route.u) * conf.hop;
  if (conf.onWater != null) g.position.y = conf.onWater;
  const want = Math.atan2(B.x - A.x, B.z - A.z), diff = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y));
  g.rotation.y += diff * Math.min(1, dt * 8);
  S.me.speed = a === 'kayak' ? 0 : conf.speed;
  followCam(before);
}
// 저절로 움직일 때(돌아다니기 · 자전거 · 카약 …) 카메라도 같은 만큼 따라가요
function followCam(before) { const d = S.me.group.position.clone().sub(before).setY(0); camera.position.add(d); controls.target.add(d); }
let shellN = 0;
function pickShell() {
  shellN++;
  const sea = S.loc?.id === 'sea';
  const names = sea ? ['가리비 껍데기', '소라 껍데기', '하얀 조개', '분홍 조개', '반질반질한 몽돌'] : ['동글동글 조약돌', '줄무늬 돌', '하트 모양 돌', '반짝이는 차돌', '납작한 물수제비 돌'];
  if (S.me?.action === 'shells') toast(`${sea ? '🐚' : '🪨'} 짝! ${names[Math.floor(Math.random() * names.length)]} 한 개 · 오늘 ${shellN}개`);
}

// 연날리기 연 · 프리스비 원반 · 모래성: 누가 하든 둘레에 보여요
const kites = new Map(), discs = new Map();
function stepToys(list, dt) {
  const seenK = new Set(), seenD = new Set();
  for (const [, av] of list) {
    const g = av.group, back = new THREE.Vector3(-Math.sin(g.rotation.y), 0, -Math.cos(g.rotation.y));
    if (av.action === 'kite') {
      let k = kites.get(av);
      if (!k) {
        const kite = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4, 1), new THREE.MeshStandardMaterial({ color: ['#e2603d', '#2f7a96', '#e8b54a'][kites.size % 3], side: THREE.DoubleSide }));
        kite.scale.z = 0.08; const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.02), new THREE.MeshStandardMaterial({ color: '#f4f1ea' })); tail.position.y = -1.2; kite.add(tail);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f1ea' }));
        scene.add(kite, line); k = { kite, line, h: 2 }; kites.set(av, k);
      }
      seenK.add(av);
      // 달릴수록 높이, 멈추면 천천히 내려와요
      k.h += ((av.speed > 0.5 ? 9 : 5) - k.h) * Math.min(1, dt * 0.6);
      const t = performance.now() / 1000;
      k.kite.position.copy(g.position).addScaledVector(back, 3 + k.h * 0.6).add(new THREE.Vector3(Math.sin(t * 0.9) * 1.2, 1.5 + k.h, 0));
      k.kite.rotation.set(0, g.rotation.y, Math.sin(t * 1.7) * 0.3);
      const hand = g.position.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(back, -0.3);
      k.line.geometry.setFromPoints([hand, k.kite.position]);
    }
    if (av.action === 'frisbee') {
      let d = discs.get(av);
      if (!d) { d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), new THREE.MeshStandardMaterial({ color: '#e2603d' })); scene.add(d); discs.set(av, d); }
      seenD.add(av);
      // 던지는 순간(0.75초)부터 2.6초 동안 앞으로 크게 돌아 다시 손으로
      const u = (av.actionT % 3 - 0.75) / 1.85, f = back.clone().negate();
      d.visible = u > 0 && u < 1;
      if (d.visible) {
        const side = new THREE.Vector3(f.z, 0, -f.x), r = Math.sin(Math.PI * u);
        d.position.copy(g.position).add(new THREE.Vector3(0, 1.3 + r * 1.2, 0)).addScaledVector(f, r * 7).addScaledVector(side, Math.sin(Math.PI * 2 * u) * 2.2);
        d.rotation.y += dt * 25; d.rotation.z = 0.25;
      }
    }
  }
  for (const [av, k] of kites) if (!seenK.has(av)) { k.kite.removeFromParent(); k.line.removeFromParent(); kites.delete(av); }
  for (const [av, d] of discs) if (!seenD.has(av)) { d.removeFromParent(); discs.delete(av); }
  // 모래성 · 돌탑: 쌓는 동안 하나씩 올라가고, 다 쌓으면 그대로 남아요
  const c = S.active?.castle;
  if (c && S.me?.action === 'sandcastle' && S.me.group.position.distanceTo(c.position) < 2) {
    const n = Math.min(c.children.length, Math.floor(S.me.actionT / 1.6) + 1);
    c.children.forEach((m, i) => { if (i < n && !m.visible) { m.visible = true; m.scale.setScalar(0.01); } });
  }
  if (c) c.children.forEach((m) => { if (m.visible && m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 2.5)); });
}

// 배드민턴 · 캐치볼 · 비눗방울: 누가 하든 둘레에 보여요.
// 배드민턴 · 캐치볼은 10m 안에 같은 걸 하는 사람이 있으면 둘이 주고받고, 혼자면 제자리에서 위로 띄워요 (요청 없이 같은 단추를 누르면 짝이 돼요)
const flying = new Map();   // 아바타 → 콕/공 메시
const bubbles = [];
let bubbleTex = null;
function playersHere() { const list = S.me ? [[net.selfId || 'me', S.me]] : []; for (const [id, r] of S.remotes) if (r.st.s === S.scene && r.av.group.visible) list.push([id, r.av]); return list; }
function stepPlay(dt) {
  const list = playersHere(), seen = new Set();
  stepToys(list, dt);
  for (const [id, av] of list) {
    if (av.action === 'bubbles' && Math.random() < dt * 2.2) spawnBubble(av);
    if (av.action !== 'badminton' && av.action !== 'catchball') continue;
    const mates = list.filter(([oid, o]) => oid !== id && o.action === av.action && o.group.position.distanceTo(av.group.position) < 10).sort((a, b) => a[1].group.position.distanceTo(av.group.position) - b[1].group.position.distanceTo(av.group.position));
    const mate = mates[0];
    let m = flying.get(av);
    if (!m) {
      m = new THREE.Mesh(av.action === 'badminton' ? new THREE.ConeGeometry(0.05, 0.12, 10) : new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: av.action === 'badminton' ? '#f4f4f4' : '#e8e2d6' }));
      scene.add(m); flying.set(av, m);
    }
    seen.add(av);
    const hand = av.group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    if (mate && String(id) < String(mate[0])) {
      // 짝: 두 사람 사이를 포물선으로 오가요 (한 번 가는 데 1.2초)
      const other = mate[1].group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
      const t = (performance.now() / 1200) % 2, u = t < 1 ? t : 2 - t;
      m.position.lerpVectors(hand, other, u); m.position.y += Math.sin(Math.PI * u) * 2.2;
      // 서로 바라보기
      av.group.rotation.y = Math.atan2(other.x - hand.x, other.z - hand.z);
      mate[1].group.rotation.y = Math.atan2(hand.x - other.x, hand.z - other.z);
      m.visible = true;
    } else if (mate) { m.visible = false; }
    else {
      // 혼자: 제자리에서 톡톡 위로 띄우기
      const t = (performance.now() / 1200) % 1;
      m.position.copy(hand).add(new THREE.Vector3(Math.sin(av.group.rotation.y) * 0.35, Math.sin(Math.PI * t) * 1.8, Math.cos(av.group.rotation.y) * 0.35));
      m.visible = true;
    }
  }
  // 물수제비: 던지는 순간(0.95초) 돌이 손을 떠나 수면 위를 통통 튀어요. 물장구: 손끝에서 물방울이 튀어요
  const wy = S.active?.waterY;
  if (wy != null) for (const [, av] of list) {
    if (av.action === 'skip' && av.actionT > 0.95 && !av._skipped) { av._skipped = true; throwStone(av, wy); }
    if (av.action !== 'skip') av._skipped = false;
    if (av.action === 'splash') for (let k = 0; k < 3; k++) if (Math.random() < dt * 16) splashDrop(av, wy);
  }
  stepWater(dt);
  for (const [av, m] of flying) if (!seen.has(av)) { m.removeFromParent(); m.geometry.dispose(); flying.delete(av); }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.t += dt;
    b.s.position.addScaledVector(b.v, dt); b.v.y += dt * 0.05; b.s.position.x += Math.sin(b.t * 2 + b.ph) * dt * 0.3;
    b.s.material.opacity = Math.min(0.7, b.t * 2) * Math.max(0, 1 - b.t / 6);
    if (b.t > 6) { b.s.removeFromParent(); b.s.material.dispose(); bubbles.splice(i, 1); }
  }
}
const stones = [], drops = [], ripples = [];
function throwStone(av, wy) {
  const f = new THREE.Vector3(Math.sin(av.group.rotation.y), 0, Math.cos(av.group.rotation.y));
  const from = av.group.position.clone().add(new THREE.Vector3(0, 0.9, 0)).addScaledVector(f, 0.4);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 10), new THREE.MeshStandardMaterial({ color: '#8f877a' })); st.position.copy(from); scene.add(st);
  // 튀는 자리: 점점 짧고 낮게 (처음 한 번은 손에서 수면까지)
  const hops = [], lens = [2.6, 3.0, 2.3, 1.7, 1.2, 0.8], hs = [0.4, 0.7, 0.45, 0.3, 0.18, 0.1];
  let p = from.clone();
  lens.forEach((L, i) => { const q = p.clone().addScaledVector(f, L); q.y = wy + 0.02; hops.push({ a: p.clone(), b: q, h: hs[i], d: 0.18 + L * 0.09 }); p = q; });
  stones.push({ st, hops, i: 0, t: 0 });
}
function ripple(pos) {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.22, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  r.rotation.x = -Math.PI / 2; r.position.copy(pos).setY(pos.y + 0.01); scene.add(r); ripples.push({ r, t: 0 });
}
function splashDrop(av, wy) {
  const f = new THREE.Vector3(Math.sin(av.group.rotation.y), 0, Math.cos(av.group.rotation.y));
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 6, 4), new THREE.MeshStandardMaterial({ color: '#5fb0d8', emissive: '#bfe8ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }));
  d.position.copy(av.group.position).addScaledVector(f, 0.7 + Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.5, 0)); scene.add(d);
  drops.push({ d, v: f.clone().multiplyScalar(0.8 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 2 + Math.random() * 1.6, 0)), wy });
  if (Math.random() < 0.3) ripple(av.group.position.clone().addScaledVector(f, 1.2).setY(wy));
}
function stepWater(dt) {
  for (let i = stones.length - 1; i >= 0; i--) {
    const s = stones[i], h = s.hops[s.i]; s.t += dt;
    const u = Math.min(1, s.t / h.d);
    s.st.position.lerpVectors(h.a, h.b, u); s.st.position.y += Math.sin(Math.PI * u) * h.h; s.st.rotation.y += dt * 20;
    if (u >= 1) { ripple(h.b); sfx('plink', 0.7, s.i); s.i++; s.t = 0; if (s.i >= s.hops.length) { s.st.removeFromParent(); stones.splice(i, 1); } }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const p = drops[i]; p.v.y -= 9 * dt; p.d.position.addScaledVector(p.v, dt);
    if (p.d.position.y < p.wy) { p.d.removeFromParent(); drops.splice(i, 1); }
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]; r.t += dt; r.r.scale.setScalar(1 + r.t * 5); r.r.material.opacity = 0.8 * (1 - r.t / 1.4);
    if (r.t > 1.4) { r.r.removeFromParent(); r.r.material.dispose(); ripples.splice(i, 1); }
  }
}
function spawnBubble(av) {
  if (bubbles.length > 80) return;
  if (!bubbleTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const rg = g.createRadialGradient(26, 24, 2, 32, 32, 30); rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(0.25, 'rgba(255,255,255,.08)'); rg.addColorStop(0.8, 'rgba(180,220,255,.25)'); rg.addColorStop(0.95, 'rgba(255,190,240,.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); bubbleTex = new THREE.CanvasTexture(c); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, opacity: 0 }));
  const k = 0.12 + Math.random() * 0.22; s.scale.setScalar(k);
  const f = new THREE.Vector3(Math.sin(av.group.rotation.y), 0, Math.cos(av.group.rotation.y));
  s.position.copy(av.group.position).addScaledVector(f, 0.5).add(new THREE.Vector3(0, 1.5, 0));
  scene.add(s);
  bubbles.push({ s, t: 0, ph: Math.random() * 6, v: f.multiplyScalar(0.4 + Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3)) });
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
  const dex = loadDex(), got = Object.values(dex).reduce((n, k) => n + Object.keys(k || {}).length, 0);
  const tiles = [['마당', m(t.in)], ['물가', m(t.out)], ['내 텐트', m(t.room)], ['취사장', m(t.meal)], ['불꽃놀이', `${t.fireworks || 0}번`], ['도감', `${got}가지`]];
  $('#record-today').innerHTML = `<p class="muted small">오늘 ${today()}</p>` + tiles.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');
  const days = store.get('recdays', []).slice(-14).reverse();
  const mm = (s) => Math.round((s || 0) / 60);
  $('#record-table').innerHTML = `<thead><tr><th>날짜</th><th>마당</th><th>물가</th><th>취사장</th><th>내 텐트</th><th>불꽃</th></tr></thead><tbody>` +
    (days.length ? days.map((d) => { const r = store.get(`rec:${d}`, {}); return `<tr><td>${d.slice(5)}</td><td>${mm(r.in)}분</td><td>${mm(r.out)}분</td><td>${mm(r.meal)}분</td><td>${mm(r.room)}분</td><td>${r.fireworks || 0}</td></tr>`; }).join('')
      : '<tr><td colspan="6">아직 기록이 없어요. 머무는 동안 10초마다 쌓여요.</td></tr>') + '</tbody>';
  renderGrass($('#record-grass'), (d) => { const r = store.get(`rec:${d}`, {}); return ((r.out || 0) + (r.in || 0) + (r.meal || 0) + (r.room || 0)) / 60; }, '머문 시간');
}

// 잔디: 최근 20주, 하루 머문 시간만큼 진하게 (깃허브 잔디처럼). 칸에 손을 올리면 날짜와 분
function renderGrass(el, minutesOf, unit) {
  const W = 20, end = new Date(), start = new Date(end); start.setDate(end.getDate() - end.getDay() - (W - 1) * 7);
  let cells = '', total = 0, days = 0, best = 0;
  for (let i = 0; i < W * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d > end) { cells += '<i class="g-empty"></i>'; continue; }
    const mins = minutesOf(today(d)), lv = mins <= 0 ? 0 : mins < 10 ? 1 : mins < 30 ? 2 : mins < 60 ? 3 : 4;
    total += mins; if (mins > 0) days++; best = Math.max(best, mins);
    cells += `<i class="g${lv}" title="${today(d)} · ${Math.round(mins)}분"></i>`;
  }
  el.innerHTML = `<div class="grass-head"><b>최근 20주</b><small>${days}일 · 모두 ${Math.round(total / 6) / 10}시간 · 가장 오래 ${Math.round(best)}분</small></div>
    <div class="grass-grid">${cells}</div>
    <div class="grass-legend"><small>${unit}</small><i class="g0"></i><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i><small>오래</small></div>`;
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
  $('#hud-place').textContent = `캠핑장 · ${S.loc.name}`;
  $('#design-name').textContent = S.loc.name;
  $('#hud-server').textContent = S.server ? `· 서버 ${S.server}` : '· 서버 찾는 중';
  const here = S.scene === 'room' ? 1 : [...S.remotes.values()].filter((r) => r.st.s === S.scene).length + 1;
  $('#hud-people').textContent = `함께 ${S.remotes.size + 1}명 · ${SCENES[S.scene].name} ${here}명`;
  // 동시접속자: 지금 이 서버에 함께 있는 분 (모두에게 보임)
  $('#online-n').textContent = S.remotes.size + 1;
  $('#online-pill').title = `눌러서 서버 ${S.server || '-'}에 함께 접속한 분 보기`;
  if (!$('#online-list').hidden) renderOnline();
  // 오른쪽 상황 단추 (장소 이동 단추는 숨겨 두고 왼쪽 위 장소 줄로 옮겨요)
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
}

let timerTick = 1;
function updateTimer(dt) {
  if (S.mode !== 'world') return;
  timerTick += dt;
  if (timerTick < 1) return;
  timerTick = 0;
  const now = new Date();
  $('#hud-timer').innerHTML = `<b>${S.loc?.night ? '별밤' : dayPart()} ${pad(now.getHours())}:${pad(now.getMinutes())}</b><small>머문 시간 ${fmtTime((Date.now() - S.enteredAt) / 1000)}</small>`;
  // 누적 시간은 관리자에게만
  $('#hud-timer').title = document.body.classList.contains('admin') ? `${S.loc.name}에 머문 시간 모두 ${fmtLong(store.get(`stay:${S.loc.id}`, 0))}` : '머문 시간';
}

// ───────── 서버 ─────────
function renderServerGrid() {
  if (!S.loc) return;
  const counts = net.counts();
  $('#server-title').textContent = '캠핑장 서버';
  $('#server-now').textContent = S.server ? `지금 내 자리 · 캠핑장 서버 ${S.server} · ${SCENES[S.scene]?.name || ''} (${S.loc?.name || ''})` : '서버를 찾는 중이에요';
  let html = '';
  for (let i = 1; i <= SERVER_COUNT; i++) {
    const c = counts[i] || 0;
    const cur = i === S.server, full = c >= SERVER_CAP && !cur;
    html += `<button class="server${cur ? ' current' : ''}${full ? ' full' : ''}" data-server="${i}" ${full ? 'disabled' : ''}>
      <b>캠핑장 서버 ${i}</b><span>${c} / ${SERVER_CAP}명${cur ? ' · 이용 중' : full ? ' · 만석' : ''}</span>
      <small class="cap">${cur ? '지금 머무는 서버' : full ? '자리가 없어 들어갈 수 없어요' : '눌러서 이 서버로 옮기기'}</small></button>`;
  }
  $('#server-grid').innerHTML = html;
}

async function switchServer(n) {
  if (n === S.server) return;
  S.server = n;
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

// ───────── 디자인(텐트 · 캠핑카 · 카바나) 들어가기 ─────────
async function enterLocation(locId) {
  // 다른 동네로 가면 하던 동작 · 산보는 멈춰요
  if (S.me) { stopWalk(); if (S.me.action) { S.me.stop(); syncActionButtons(); } }
  S.loc = LOCATIONS.find((l) => l.id === locId) || LOCATIONS[0];
  document.body.dataset.site = S.loc.id;   // 단추 색이 디자인을 따라가요
  showLoading(S.loc.id);
  for (const id of [...S.remotes.keys()]) removeRemote(id, false);
  const started = performance.now();
  await sleep(60);
  store.set('lastLoc', S.loc.id);
  setLoad(15);
  await sleep(30);
  const hall = worldFor(S.loc.id, 'in');
  setLoad(45);
  // 서버는 디자인과 상관없이 모두 '캠핑장 서버 1~12' 하나로 모인다
  const netReady = net.joinLobby('hall', true);
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
  }).join('');
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
  toast('새 모습으로 바꿨어요');
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

// 화면 탭: 의자 · 자리 → 걸어가서 앉기, 바닥 → 걸어가기
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
  // 다른 사람을 콕 누르면 그 사람 앞까지 가서 손을 흔들어요
  const hitP = ray.intersectObjects(players.children, true)[0];
  if (hitP && S.scene !== 'room') {
    let g = hitP.object; while (g && g.parent !== players) g = g.parent;
    const r = [...S.remotes.values()].find((x) => x.av.group === g);
    if (r) {
      stopWalk(); standUp();
      const p = r.av.group.position, me = S.me.group.position, d = p.distanceTo(me);
      const go = () => { S.pokeTo = r; if (S.me.action === 'wave') S.me.stop(); doAction('wave'); };
      if (d > 2.2) S.target = { pos: p.clone().add(me.clone().sub(p).setY(0).normalize().multiplyScalar(1.6)), onArrive: go };
      else go();
      return;
    }
  }
  for (const h of ray.intersectObjects(w.group.children, true)) {
    const o = h.object;
    if (o.userData.seats) {
      let seat = w.seats[o.userData.seats === 'room' ? 0 : h.instanceId];
      if (o.userData.seats === 'chair') { let p = o; while (p && p.userData.seatId === undefined) p = p.parent; seat = w.seats.find((x) => x.mesh === p) || w.seats[p?.userData.seatId]; }
      if (seat) walkToSeat(seat);
      return;
    }
    if (o === w.floor) {
      // 의자 바로 옆 바닥을 눌러도 그 의자에 앉아요 (의자 다리가 가늘어서 바닥이 먼저 눌릴 때가 많아요)
      const near = w.seats?.filter((x) => x.mesh).map((x) => [x, Math.hypot(x.pos.x - h.point.x, x.pos.z - h.point.z)]).sort((a, b) => a[1] - b[1])[0];
      if (near && near[1] < 1.1) return walkToSeat(near[0]);
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
const RUN_SPEED = 5.4;    // 뛰는 속도
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
  } else if (S.target) {
    tmpV.copy(S.target.pos).sub(g.position).setY(0);
    if (tmpV.length() < 0.18) {
      const t = S.target; S.target = null;
      if (t.face != null) g.rotation.y = t.face;
      t.onArrive?.();
    } else { dir = tmpV.normalize(); speed = S.target.run && canRun() ? RUN_SPEED : S.target.speed || SPEED; }
  }
  if (dir && S.me.action && !MOVING_ACTS.has(S.me.action)) { S.me.stop(); pushState(true); syncActionButtons(); }   // 다른 사람 화면에서도 바로 멈추게
  const before = g.position.clone();
  if (dir) {
    g.position.addScaledVector(dir, speed * dt);
    const want = Math.atan2(dir.x, dir.z);
    const diff = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y));
    g.rotation.y += diff * Math.min(1, dt * 10);
    collide(g.position);
    if (S.target && !S.walking && g.position.distanceTo(before) < speed * dt * 0.2) {
      // 탁자 · 모닥불에 막혀 못 가도 의자 가까이면 그냥 앉아요
      const t = S.target; S.target = null;
      if (t.onArrive && t.pos.distanceTo(g.position) < 1.6) t.onArrive();
    }
  }
  me.speed = dir ? g.position.distanceTo(before) / Math.max(dt, 1e-4) : 0;
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
    stepWander(dt);
    stepRoute(dt);
    stepCameraTurn(dt);
    controls.update();
    S.me.update(dt, ACTIONS);
    stepFireworks(dt);
    stepCatch(dt);
    // 낮잠 이불: 낮잠을 자는 동안만 스르르 펴지고, 일어나면 개어요
    for (const [act, beds] of Object.entries(S.active?.beddings || {})) for (const bed of [beds].flat()) { const want = S.me.action === act && (!Array.isArray(beds) || S.curSpot?.bed === bed) ? 1 : 0.01; bed.scale.z += (want - bed.scale.z) * Math.min(1, dt * 5); bed.visible = bed.scale.z > 0.05; }
    stepPlay(dt);
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
  } else if (S.mode === 'gallery') {
    for (const av of galleryAvatars) av.update(dt, ACTIONS);
  }
  renderPreview(dt);
  renderer.render(scene, camera);
}

// 캠핑 동작 소리: 동작 그림에서 손이 닿는 순간에 맞춰 [주기(초), 처음 순간, 소리]
// 다른 사람 소리는 멀수록 작게 (16m 밖이면 안 들려요)
const ACT_SFX = {
  chop: [2, 1.1, 'chop'], fish: [7, 5.8, 'cast'], bugs: [Math.PI / 3.2, 0.2, 'swish'], splash: [Math.PI / 4, 0.3, 'splash'],
  grill: [2.5, 1.75, 'sizzle'], cook: [1.4, 0.6, 'bubble'], roast: [0.9, 0.3, 'crackle'], warm: [1.1, 0.5, 'crackle'],
  guitar: [(2 * Math.PI) / 9, 0.1, 'strum'], fireworks: [999, 0.3, 'firework'],
};
function soundFor(av, vol) {
  const c = ACT_SFX[av.action];
  if (vol <= 0 || !c) { av._hit = null; return; }
  const [period, at, kind] = c, n = Math.floor((av.actionT - at) / period);
  if (av._hit === n) return;
  av._hit = n;
  if (n < 0) return;
  // 장작 소리는 불이 켜졌을 때만, 기타는 네 번 쓸 때마다 코드가 바뀌어요
  if ((kind === 'crackle') && !S.active?.campfire?.userData.lit) return;
  sfx(kind, kind === 'firework' ? Math.max(vol, 0.5) : vol, Math.floor(n / 4));
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
  if (t.dataset.shelter) {
    try { localStorage.setItem(`campingjang:shelter:${S.loc.id}`, t.dataset.shelter); } catch {}
    S.worlds[S.loc.id]?.in?.setShelter?.(t.dataset.shelter);
    if (S.worlds[S.loc.id]?.room && S.scene !== 'room') delete S.worlds[S.loc.id].room;   // 내 자리 안도 새 쉼터 모양으로
    document.querySelectorAll('[data-shelter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shelter === t.dataset.shelter)));
    return;
  }
  if (t.dataset.place) { $('#places').hidden = true; return changeDesign(t.dataset.place); }
  if (t.dataset.server) { $('#server-modal').hidden = true; return switchServer(+t.dataset.server); }
  const pick = ['body', 'type', 'skin', 'outfit', 'acc', 'gender', 'pet'].find((k) => t.dataset[k] != null);
  if (pick && t.closest('#creator')) { draft.look[pick] = t.dataset[pick]; renderCreatorOptions(); preview.avatar.setLook(draft.look, 'out'); return; }
  if (t.dataset.music != null) return pickMusic(t.dataset.music);
  if (t.dataset.menu) {
    $('#menu').hidden = true; document.body.classList.remove('menu-open');
    const m = t.dataset.menu;
    if (m === 'guide') window.open('guide.html', '_blank', 'noopener');
    if (m === 'server') { net.refreshCounts(); renderServerGrid(); $('#server-modal').hidden = false; }
    if (m === 'settings') openSettings('account');
    if (m === 'album') openSettings('photo');
    if (m === 'char') openCreator();
    if (m === 'dex') openDex();
    if (m === 'place') showPlaces();
    if (m === 'credit') { $('#credit-audio').innerHTML = TRACKS.filter((t) => t.by).map((t) => `<li>${t.name} · ${t.by}</li>`).join(''); $('#credit-modal').hidden = false; }
    if (m === 'music') { renderMusic(); $('#music-modal').hidden = false; }
    if (m === 'photo') startPhoto();
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
$('#btn-menu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; document.body.classList.toggle('menu-open', !$('#menu').hidden); };
$('#btn-calm').onclick = () => startCalm();

// ───────── 내 기록 · 설정: 내 기록 · 사진 · 이름 · 환경 ─────────
function openSettings(tab) {
  openRecords();
  $('#set-name').value = S.profile.name;
  syncSettings();
  showTab(tab);
  $('#settings-modal').hidden = false;
}
function syncSettings() { $('#set-sound').textContent = sound.on ? '켜짐 · 끄기' : '꺼짐 · 켜기'; }
function showTab(tab) {
  document.querySelectorAll('#settings-modal [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('#settings-modal [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  if (tab === 'photo') renderAlbum();
}
const albumUrls = [];
async function renderAlbum() {
  albumUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const photos = await listPhotos();
  $('#album').innerHTML = photos.length ? photos.map((p) => { const u = URL.createObjectURL(p.blob); albumUrls.push(u);
    return `<figure><img src="${u}" alt="${escapeHtml(p.place)}에서 찍은 사진"><figcaption>${new Date(p.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<span><button type="button" data-psave="${p.id}">저장</button><button type="button" data-pdel="${p.id}">지우기</button></span></figcaption></figure>`; }).join('')
    : '<p class="muted">아직 찍은 사진이 없어요. 왼쪽 카메라 단추로 찍어 보세요.</p>';
}
$('#settings-modal').addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]'); if (tab) return showTab(tab.dataset.tab);
  const del = e.target.closest('[data-pdel]'); if (del) { await removePhoto(del.dataset.pdel); return renderAlbum(); }
  const sv = e.target.closest('[data-psave]');
  if (sv) {
    const p = (await listPhotos()).find((x) => x.id === sv.dataset.psave); if (!p) return;
    const file = new File([p.blob], `campingjang-${p.id}.png`, { type: p.blob.type || 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (err) { if (err.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(p.blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
});
$('#set-name-save').onclick = () => {
  const name = $('#set-name').value.trim().slice(0, 10) || randomName();
  $('#set-name').value = name; S.profile.name = name; store.set('profile', S.profile);
  S.me?.setName(name); pushState(true); toast(`이름을 '${name}'(으)로 저장했어요`);
};
$('#set-char').onclick = () => { $('#settings-modal').hidden = true; openCreator(); };
$('#set-sound').onclick = () => { setSound(!sound.on); store.set('muted', !sound.on); syncSoundBtn(); syncSettings(); };
$('#set-music').onclick = () => { renderMusic(); $('#music-modal').hidden = false; };
$('#set-calm').onclick = () => { $('#settings-modal').hidden = true; startCalm(); };
$('#btn-stand').onclick = () => { stopWalk(); standUp(); };
$('#btn-sanbo').onclick = () => doAction('walk');   // 마당 자동 산보: 다시 누르면 멈춤
$('#btn-go').onclick = () => { stopWalk(); goScene(S.scene === 'in' ? 'room' : 'in'); };
$('#btn-yard').onclick = () => { stopWalk(); goScene('out'); };   // 내 자리: [캠프 마당으로] [물가로]
// 산책: 둘레길을 계속 돈다. 다시 누르면 멈춘다
$('#design-chip').onclick = showPlaces;
// 왼쪽 도형 단추
// 위치 단추: 바로 옆에 디자인 이름 3개와 서버 번호만 (설명 · 그림 없이). 고르거나 다른 곳을 누르면 닫혀요
function togglePick() {
  if (!document.body.classList.toggle('show-pick')) return;
  // 고르기 창은 디자인 단추 바로 옆, 단추 위쪽에 맞춘다 (단추 순서가 바뀌어도 따라감)
  const r = $('#side-place').getBoundingClientRect();
  $('#pick-pop').style.top = `${Math.max(8, Math.min(r.top, innerHeight - 260))}px`;
  $('#pick-design').innerHTML = LOCATIONS.map((l) => `<button data-place="${l.id}" aria-pressed="${S.loc?.id === l.id}">${l.name}</button>`).join('');
  // 쉼터 모양 고르기 (텐트: 돔 · 티피, 캠핑카: 미니밴 · 모터홈)
  const sh = S.loc && SHELTERS[S.loc.id];
  $('#pick-shelter').innerHTML = sh && sh.length > 1 ? sh.map(([id, nm]) => `<button data-shelter="${id}" aria-pressed="${shelterOf(S.loc.id) === id}">${nm}</button>`).join('') : '';
  $('#pick-shelter-h').hidden = !(sh && sh.length > 1);
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

// 캠핑 음악: 공유마당 · Freesound 녹음 (끄기는 위쪽 소리 단추). 고른 곡은 이 기기에 남고, 소리를 켜야 들려요
// 처음 온 분(또는 예전에 끄기·지운 곡을 골랐던 분)은 1번 싱잉볼로 시작. 소리를 끄려면 위쪽 소리 단추
// 들어오면 먼저 들리는 곡: 6번 Sunrise (통기타). 저장 이름을 바꿔서 예전에 고른 곡 대신 한 번은 이 곡부터
{ const m = store.get('music2'); setMusic(TRACKS.some((t) => t.id === m) ? m : 'sunrise'); }
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

let musicFolder = null;   // 처음 열면 지금 듣는 곡이 있는 폴더
function renderMusic() {
  musicFolder ||= trackFolder(music() || 'sunrise');
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
  const FOLDERS = [['music', '음악', '연주곡 · 8비트'], ['nature', '자연 소리', '모닥불 · 풀벌레 · 새 · 물 · 파도 · 비']];
  const count = (f) => TRACKS.filter((t) => !t.hidden && trackFolder(t.id) === f).length;
  $('#music-folders').innerHTML = FOLDERS.map(([f, name, cap]) => `<button type="button" data-folder="${f}" aria-selected="${musicFolder === f}"><b>${name}</b><small>${cap} · ${count(f)}곡</small>${trackFolder(music() || '') === f && music() ? '<i class="eq"><s></s><s></s><s></s></i>' : ''}</button>`).join('');
  $('#music-list').innerHTML = TRACKS.filter((t) => !t.hidden && trackFolder(t.id) === musicFolder).map((t, i) => {
    const on = music() === t.id, kind = ICON[t.id] ? t.id : 'rec', rec = t.src || t.list;
    return `<button class="music-card" data-music="${t.id}" aria-pressed="${on}">
      <span class="mc-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[kind]}</svg></span>
      <span class="mc-text"><b>${i + 1}. ${t.name}</b><small>${t.cap}</small></span>
      <span class="mc-tag">${on ? '<i class="eq"><s></s><s></s><s></s></i>' : t.list ? '이어 듣기' : '녹음'}</span>
    </button>`;
  }).join('');
}
$('#music-folders').addEventListener('click', (e) => { const b = e.target.closest('[data-folder]'); if (b) { musicFolder = b.dataset.folder; renderMusic(); } });
function pickMusic(id) {
  store.set('music2', id);
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
  g.font = `400 ${fs}px "Ownglyph_UNZ-Rg", sans-serif`;
  g.textAlign = 'right';
  g.fillStyle = 'rgba(255, 255, 255, .9)';
  g.shadowColor = 'rgba(0, 0, 0, .45)'; g.shadowBlur = fs / 2;
  g.fillText('캠핑장 · campingjang.site', c.width - fs, c.height - fs);
  const flash = $('#photo-flash');
  flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  addPhoto(blob, `${S.loc?.name || ''} · ${SCENES[S.scene]?.name || ''}`);   // 내 기록 · 설정 > 사진에 모아 둬요
  const name = `campingjang-${today()}-${Date.now().toString(36)}.png`;
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
  tickCalmClock(); clearInterval(calmClock); calmClock = setInterval(tickCalmClock, 1000);
}
// 크게 보기 시계 (소호랩 바탕화면과 같은 코드): 시각 + 날짜 · 함께 있는 사람 수
let calmClock = 0;
function tickCalmClock() {
  const d = new Date();
  $('#cc-time').textContent = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#cc-sub').textContent = `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} · ${S.remotes.size + 1}명`;
}
function stopCalm() {
  if (!S.calm) return;
  S.calm = false;
  clearInterval(calmClock);
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
// 소리는 처음 화면을 누를 때 켠다 (브라우저 규칙)
addEventListener('pointerdown', () => { if (!sound.on && !params.has('mute') && !store.get('muted', false)) { setSound(true); syncSoundBtn(); } }, { once: true });
syncSoundBtn();

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
  S.enteredAt = Date.now() - 754000;
  const n = +(params.get('bots') || 0);
  const types = CHAR_TYPES.map((t) => t.id);
  const rnd = (() => { let s = 9; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const world = S.active;
  const seats = world.seats ? [...world.seats].sort(() => rnd() - 0.5) : [];
  for (let i = 0; i < n; i++) {
    const look = { type: types[Math.floor(rnd() * types.length)], gender: rnd() < 0.5 ? 'f' : 'm', skin: SKIN_TONES[Math.floor(rnd() * 3)], outfit: (() => { const o = OUTFITS.filter((x) => !x.hidden); return o[Math.floor(rnd() * o.length)].id; })(), acc: rnd() < 0.7 ? 'none' : ACCESSORIES[Math.floor(rnd() * ACCESSORIES.length)].id, pet: rnd() < 0.35 ? PETS[Math.floor(rnd() * 10)].id : 'none' };
    const seat = (which === 'in' && rnd() < 0.75) || which === 'meal' ? seats[i] : null;
    const walk = which === 'out' && world.walkPath ? world.walkPath[i % world.walkPath.length] : null;
    const pos = seat ? [seat.pos.x, seat.pos.z] : walk ? [walk.x + (rnd() - 0.5) * 2, walk.z + (rnd() - 0.5) * 2] : [(rnd() - 0.5) * 18, (rnd() - 0.3) * 18];
    const act = which === 'meal' ? 'eat' : seat ? ['warm', 'roast', 'guitar', 'tea', null][Math.floor(rnd() * 5)] : null;
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
// 입력칸에서 나오면(이름 다 쓰고) 커진 화면이 있으면 되돌리기
document.addEventListener('focusout', () => setTimeout(() => { if (visualViewport?.scale > 1.01) visualViewport.dispatchEvent(new Event('resize')); }, 300));

// ───────── 시작 ─────────

(async () => {
  if (!params.has('demo') && !params.has('gallery')) preloadNet();
  try { await Promise.race([document.fonts.load('400 40px "Ownglyph_UNZ-Rg"'), sleep(2500)]); } catch {}
  loop();
  if (params.get('gallery')) return gallery(params.get('gallery'));
  if (params.get('demo')) return demo(params.get('demo'));
  const loc = params.get('loc') || store.get('lastLoc', 'forest');
  enterLocation(LOCATIONS.some((l) => l.id === loc) ? loc : 'forest');
})();

// 팝업 바깥(어두운 배경)이나 메뉴 바깥을 누르면 닫혀요
addEventListener('click', (e) => { if (e.target.classList?.contains('modal')) e.target.hidden = true; });
addEventListener('pointerdown', (e) => {
  const menu = document.getElementById('menu');
  if (menu && !menu.hidden && !e.target.closest('#menu, #btn-menu')) { menu.hidden = true; document.body.classList.remove('menu-open'); }
});
