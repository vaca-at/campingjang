// 내 방 족자: 여러 문구 가운데 무작위로 하나를 건다.
// 방에 들어갈 때마다, 그리고 머무는 동안 3분마다 바뀐다. 문구는 각자 고르고 더할 수 있다 (이 기기에 저장).
const $ = (s) => document.querySelector(s);
const KEY = 'maeum:scrolls';

export const PRESET_SCROLLS = [
  { t: '일체유심조', s: '모든 것은 마음이 짓는다' },
  { t: '무소유', s: '가진 것을 내려놓아요' },
  { t: '인연생기', s: '모든 것은 인연 따라 일어나요' },
  { t: '자비', s: '모든 생명을 아끼는 마음' },
  { t: '마음 속 부처 찾기', s: '내 안의 부처를 찾아요' },
];

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Array.isArray(v.list) && v.list.length) return v;
  } catch {}
  return { list: PRESET_SCROLLS.map((p) => ({ ...p, on: true })) };
}
function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }

let saved = load();  // 저장된 문구 (족자에 거는 것)
let state = saved;   // 고르기 창에서 고치는 중인 문구
let room = null; // 지금 걸어 둘 내 방
let lastT = null;
let timer = null;

function pick() {
  const on = saved.list.filter((x) => x.on && x.t.trim());
  const pool = on.length ? on : PRESET_SCROLLS;
  // 바로 전 문구는 되도록 피한다
  const choices = pool.length > 1 ? pool.filter((x) => x.t !== lastT) : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

// 내 방에 들어갈 때 부른다. 다른 장소로 가면 stopScrolls()
export function hangScroll(roomWorld) {
  room = roomWorld;
  const p = pick();
  lastT = p.t;
  room.setScroll(p.t, p.s);
  clearInterval(timer);
  timer = setInterval(() => { if (room && !document.hidden) hangScroll(room); }, 3 * 60 * 1000);
}

export function stopScrolls() {
  clearInterval(timer);
  timer = null;
  room = null;
}

// ───────── 고르기 창 ─────────
function render() {
  $('#scroll-rows').innerHTML = state.list.map((x, i) => `
    <div class="scroll-row" data-i="${i}">
      <input type="checkbox" data-k="on" ${x.on ? 'checked' : ''} aria-label="걸기">
      <input type="text" data-k="t" value="${esc(x.t)}" maxlength="10" placeholder="문구" aria-label="문구">
      <input type="text" data-k="s" value="${esc(x.s || '')}" maxlength="16" placeholder="풀이 (없어도 돼요)" aria-label="풀이">
      <button type="button" class="icon-btn" data-sdel="${i}" aria-label="지우기"><span class="lbl">✕</span><small class="cap">지우기</small></button>
    </div>`).join('');
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function openScrolls() {
  state = structuredClone(saved);
  render();
  $('#scroll-modal').hidden = false;
}

$('#scroll-rows').addEventListener('input', (e) => {
  const row = e.target.closest('.scroll-row');
  if (!row) return;
  const x = state.list[+row.dataset.i];
  const k = e.target.dataset.k;
  x[k] = k === 'on' ? e.target.checked : e.target.value;
});
$('#scroll-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sdel]');
  if (!b) return;
  state.list.splice(+b.dataset.sdel, 1);
  render();
});
$('#scroll-add').addEventListener('click', () => { state.list.push({ t: '', s: '', on: true }); render(); $('#scroll-rows .scroll-row:last-child input[data-k="t"]').focus(); });
$('#scroll-reset').addEventListener('click', () => { state = { list: PRESET_SCROLLS.map((p) => ({ ...p, on: true })) }; render(); });
$('#scroll-save').addEventListener('click', () => {
  state.list = state.list.filter((x) => x.t.trim()).map((x) => ({ t: x.t.trim().slice(0, 10), s: (x.s || '').trim().slice(0, 16), on: !!x.on }));
  if (!state.list.length) state = { list: PRESET_SCROLLS.map((p) => ({ ...p, on: true })) };
  saved = state;
  save(saved);
  $('#scroll-modal').hidden = true;
  if (room) hangScroll(room);
});
