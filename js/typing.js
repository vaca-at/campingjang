// 반야심경 타자 사경: 경전을 한 줄씩 보며 그대로 쳐서 옮겨 써요. 타자 속도(타/분) · 정확도 · 걸린 시간을 세고, 가장 빠른 기록은 이 기기에 남아요.
// 한글 타수는 자판을 누르는 횟수로 세요 (겹모음 · 겹받침은 두 번)
const $ = (s) => document.querySelector(s);
const KEY = 'maeum:typing';

// 반야심경 (한문 음독, 조계종 독송본). 경전 원문은 저작권이 없어요
const SUTRA = [
  '마하반야바라밀다심경',
  '관자재보살 행심반야바라밀다시',
  '조견오온개공 도일체고액',
  '사리자 색불이공 공불이색',
  '색즉시공 공즉시색',
  '수상행식 역부여시',
  '사리자 시제법공상',
  '불생불멸 불구부정 부증불감',
  '시고 공중무색 무수상행식',
  '무안이비설신의 무색성향미촉법',
  '무안계 내지 무의식계',
  '무무명 역무무명진',
  '내지 무노사 역무노사진',
  '무고집멸도 무지역무득',
  '이무소득고 보리살타',
  '의반야바라밀다고 심무가애',
  '무가애고 무유공포',
  '원리전도몽상 구경열반',
  '삼세제불 의반야바라밀다고',
  '득아뇩다라삼먁삼보리',
  '고지 반야바라밀다',
  '시대신주 시대명주',
  '시무상주 시무등등주',
  '능제일체고 진실불허',
  '고설 반야바라밀다주',
  '즉설주왈',
  '아제아제 바라아제',
  '바라승아제 모지 사바하',
];

// 자판 누르는 횟수: 초성 1 · 중성 1(겹모음 2) · 종성 0~2, 한글이 아니면 1
const DOUBLE_V = new Set([9, 10, 11, 14, 15, 16, 19]);          // ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ ㅢ
const DOUBLE_T = new Set([3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18]); // ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ
function strokes(str) {
  let n = 0;
  for (const ch of str) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { n += 1; continue; }
    const v = Math.floor((c % 588) / 28), t = c % 28;
    n += 1 + (DOUBLE_V.has(v) ? 2 : 1) + (t ? (DOUBLE_T.has(t) ? 2 : 1) : 0);
  }
  return n;
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

let line = 0, t0 = 0, done = 0, typedKeys = 0, errors = 0, timer = null, onStart = null;
const best = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };

function elapsed() { return t0 ? (Date.now() - t0) / 1000 : 0; }
function speed() { const m = elapsed() / 60; return m > 0.05 ? Math.round(done / m) : 0; }
function accuracy() { return typedKeys ? Math.max(0, Math.round((1 - errors / typedKeys) * 100)) : 100; }

function renderStats() {
  $('#ty-speed').textContent = speed();
  $('#ty-acc').textContent = accuracy();
  $('#ty-time').textContent = fmt(elapsed());
  $('#ty-prog').textContent = `${line} / ${SUTRA.length}`;
  $('#ty-bar').style.width = `${(line / SUTRA.length) * 100}%`;
}

// 지금 줄: 친 글자는 맞으면 먹색, 틀리면 붉게. 아직 조합 중인 마지막 글자는 틀린 것으로 보지 않아요
function renderLine() {
  const target = SUTRA[line] || '', typed = $('#ty-in').value;
  let h = '';
  for (let i = 0; i < target.length; i++) {
    const ch = target[i], tc = typed[i];
    const cls = tc == null ? '' : tc === ch ? 'ok' : i === typed.length - 1 ? 'cur' : 'bad';
    h += `<span class="${cls}${i === typed.length ? ' at' : ''}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`;
  }
  $('#ty-target').innerHTML = h;
  $('#ty-prev').textContent = SUTRA[line - 1] || '';
  $('#ty-next').textContent = SUTRA[line + 1] || '';
}

function finish() {
  clearInterval(timer); timer = null;
  const rec = { speed: speed(), acc: accuracy(), sec: Math.round(elapsed()), at: Date.now() };
  const b = best();
  const isBest = !b || rec.speed > b.speed;
  if (isBest) try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch {}
  $('#ty-play').hidden = true;
  $('#ty-done').hidden = false;
  $('#ty-done-text').innerHTML = `반야심경 한 편을 옮겨 썼어요<br><b>${rec.speed}</b>타/분 · 정확도 <b>${rec.acc}</b>% · ${fmt(rec.sec)}${isBest ? '<br><em>가장 빠른 기록이에요!</em>' : b ? `<br><small>가장 빠른 기록 ${b.speed}타/분</small>` : ''}`;
  document.dispatchEvent(new CustomEvent('typing-done', { detail: rec }));
}

function start() {
  line = 0; t0 = 0; done = 0; typedKeys = 0; errors = 0; checked = 0;
  $('#ty-in').value = '';
  $('#ty-play').hidden = false;
  $('#ty-done').hidden = true;
  const b = best();
  $('#ty-best').textContent = b ? `가장 빠른 기록 ${b.speed}타/분` : '';
  renderLine(); renderStats();
  clearInterval(timer);
  timer = setInterval(() => { if (t0) renderStats(); }, 500);
  setTimeout(() => $('#ty-in').focus(), 60);
}

export function openTyping() {
  $('#typing-modal').hidden = false;
  start();
  onStart?.();
}
export function onTypingOpen(fn) { onStart = fn; }

let checked = 0;   // 정확도를 이미 센 글자 수
$('#ty-in').addEventListener('input', (e) => {
  if (!t0) t0 = Date.now();
  const v = $('#ty-in').value, target = SUTRA[line];
  // 다 친 글자(조합 중인 마지막 글자 빼고)만 맞는지 세어 정확도에 반영. 지우면 그만큼 다시 셀 수 있게
  if (v.length < checked) checked = v.length;
  const upto = e.isComposing ? v.length - 1 : v.length;
  for (let i = checked; i < upto; i++) { typedKeys++; if (v[i] !== target[i]) errors++; }
  checked = Math.max(checked, upto);
  renderLine();
  if (norm(v) === norm(target)) {
    done += strokes(target);
    line++;
    $('#ty-in').value = ''; checked = 0;
    if (line >= SUTRA.length) return finish();
    renderLine(); renderStats();
  }
});
$('#ty-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
$('#ty-again').addEventListener('click', start);
$('#typing-modal').addEventListener('click', (e) => {
  if (e.target.closest('[data-close="typing-modal"]')) { clearInterval(timer); timer = null; }
});
