// 링크 복사와 홈 화면에 추가.
// 홈 화면 추가는 브라우저가 설치 창을 줄 수 있으면(안드로이드·컴퓨터 크롬/엣지) 바로 띄우고,
// 못 주면(아이폰 사파리 등) 어떻게 추가하는지 안내 창을 보여 준다.
const $ = (s) => document.querySelector(s);
const SITE = 'https://templestay.site/';

function note(text) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3000);
}

async function copyLink() {
  const url = location.hostname.endsWith('templestay.site') ? location.origin + '/' : SITE;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // 클립보드를 못 쓰는 브라우저: 숨긴 칸에 넣고 골라서 복사
    const t = document.createElement('textarea');
    t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    t.remove();
    if (!ok) { note(`이 주소를 복사해 주세요: ${url}`); return; }
  }
  note('링크를 복사했어요');
}

let deferred = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
addEventListener('appinstalled', () => { deferred = null; note('홈 화면에 추가했어요'); });

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function addHome() {
  if (standalone()) return note('이미 홈 화면 앱으로 열려 있어요');
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferred = null;
    if (outcome !== 'accepted') note('나중에 메뉴에서 다시 추가할 수 있어요');
    return;
  }
  // 설치 창을 띄울 수 없는 브라우저: 안내 창
  $('#install-ios').hidden = !isIOS();
  $('#install-other').hidden = isIOS();
  $('#install-modal').hidden = false;
}

for (const id of ['#btn-copy', '#menu-copy']) $(id)?.addEventListener('click', copyLink);
for (const id of ['#btn-home', '#menu-home']) $(id)?.addEventListener('click', () => { $('#menu') && ($('#menu').hidden = true); addHome(); });
$('#menu-copy')?.addEventListener('click', () => { $('#menu') && ($('#menu').hidden = true); });
