// 신고하기: 글 + 사진 한 장(지금 3D 화면을 찍거나, 휴대폰 캡처를 골라서) + 지금 상황(서버·장소·근처에 보이는 분 법명).
// 서버(방 중계 Worker)의 /report 로 보내고, 관리자는 admin.html 에서 보고 지운다.
import { RELAY_URL } from './data.js';

const $ = (s) => document.querySelector(s);
let img = null;   // 담을 사진 (data URL)
let ctx = {};     // 신고를 연 순간의 상황

function note(text) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
}

function setImg(url) {
  img = url;
  $('#report-preview').hidden = !url;
  if (url) $('#report-preview img').src = url;
}

function open() {
  $('#menu').hidden = true;
  ctx = window.temple?.context?.() || {};
  const who = ctx.people?.length ? ` · 근처에 보인 분: ${ctx.people.slice(0, 8).join(', ')}${ctx.people.length > 8 ? ' 외' : ''}` : '';
  $('#report-ctx').textContent = `함께 보내는 정보: 큰법당 서버 ${ctx.server || '-'} · ${ctx.scene || ''} · ${new Date().toLocaleString('ko-KR')}${who}`;
  $('#report-err').textContent = '';
  setImg(null);
  $('#report-modal').hidden = false;
  setTimeout(() => $('#report-text').focus(), 50);
}

// 사진 줄이기: 긴 쪽 1280px, JPEG
function shrink(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1280 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      im.onerror = reject;
      im.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

document.addEventListener('click', (e) => { if (e.target.closest('[data-menu="report"]')) open(); });
$('#report-shot').addEventListener('click', () => {
  // 신고 창을 잠깐 내리고 법당 화면만 찍는다
  $('#report-modal').hidden = true;
  requestAnimationFrame(() => {
    try { setImg(window.temple.capture()); } catch { note('화면을 찍지 못했어요. 사진 고르기를 써 주세요'); }
    $('#report-modal').hidden = false;
  });
});
$('#report-file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try { setImg(await shrink(f)); } catch { $('#report-err').textContent = '사진을 읽지 못했어요. 다른 사진을 골라 주세요'; }
});
$('#report-clear').addEventListener('click', () => setImg(null));
$('#report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#report-text').value.trim();
  if (!text && !img) { $('#report-err').textContent = '내용을 쓰거나 사진을 담아 주세요'; return; }
  $('#report-err').textContent = '';
  const btn = e.submitter || $('#report-form button[type="submit"]');
  btn.disabled = true;
  try {
    const r = await fetch(`${RELAY_URL}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, img, ctx }) });
    if (r.status === 429) throw new Error('잠시 뒤에 다시 보내 주세요 (한 시간에 5번까지)');
    if (!r.ok) throw new Error('보내지 못했어요. 잠시 뒤 다시 해 주세요');
    $('#report-modal').hidden = true;
    $('#report-text').value = '';
    setImg(null);
    note('신고를 보냈어요. 관리자가 확인할게요');
  } catch (err) {
    $('#report-err').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
