// 관리자: 화면 아래 흐린 '관리자' 링크 → /admin 현황판을 새 창으로 (로그인 · 숫자는 그 페이지에서).
// 현황판에서 로그인하면 같은 입장권이 이 기기에 남아서, 법당 화면에도 body.admin 이 붙어 숨겨 둔 숫자가 보여요.
// 방문은 기기마다 하루 한 번 숫자만 센다 (누가 왔는지는 남기지 않음).
import { RELAY_URL } from './data.js';

const $ = (s) => document.querySelector(s);
const KEY = 'maeum:adminToken';
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
// 입장권: "만료시각.서명". 만료가 지났으면 없는 것으로 본다
const getPw = () => {
  try {
    const t = localStorage.getItem(KEY) || '';
    if (t && +t.split('.')[0] < Date.now()) { localStorage.removeItem(KEY); return ''; }
    return t;
  } catch { return ''; }
};
try { sessionStorage.removeItem('maeum:admin'); } catch {} // 예전 방식(비밀번호를 탭에 저장)은 지운다

// 방문 세기
if (RELAY_URL && !new URLSearchParams(location.search).has('demo')) {
  let seen = null;
  try { seen = localStorage.getItem('maeum:visited'); } catch {}
  if (seen !== today()) {
    fetch(`${RELAY_URL}/visit`, { method: 'POST' }).then(() => { try { localStorage.setItem('maeum:visited', today()); } catch {} }).catch(() => {});
  }
}

function setAdmin(on) {
  document.body.classList.toggle('admin', on);
}

// 새로고침: 브라우저가 기억해 둔 예전 파일(사이트가 10분 동안 기억하게 함)까지 새로 받아 와서 다시 연다
const FILES = ['index.html', 'style.css', 'js/main.js', 'js/data.js', 'js/avatar.js', 'js/blocky.js', 'js/world.js', 'js/net.js',
  'js/audio.js', 'js/scrolls.js', 'js/tip.js', 'js/admin.js', 'js/share.js', 'js/typing.js', 'js/daytime.js', 'js/report.js'];
$('#btn-reload')?.addEventListener('click', async () => {
  await Promise.all(FILES.map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
  location.reload();
});

// 이 기기에 입장권이 있으면 열 때부터 관리자로 (30일 동안, "나가기"를 누르기 전까지)
if (getPw()) setAdmin(true);
