// 장소 줄·동작 줄 버튼은 큰 글자만 보이고, 작은 설명은 커서를 올리거나(키보드로 고르면) 말풍선으로 뜬다.
// 동작 줄은 옆으로 밀리는 칸이라 버튼 안에 띄우면 잘려서, 화면 위에 말풍선 하나를 따로 둔다.
const tip = document.createElement('div');
tip.id = 'tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.appendChild(tip);

const SEL = '#actions .act, #scene-bar button, #side-btns button, #creator .chip';

function show(btn) {
  const cap = btn.querySelector('.cap');
  if (!cap || !cap.textContent.trim()) return hide();
  tip.textContent = cap.textContent;
  tip.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(8, r.top - h - 8)}px`;
}
function hide() { tip.hidden = true; }

document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const b = e.target.closest(SEL);
  if (b) show(b); else if (!e.target.closest('#tip')) hide();
});
document.addEventListener('focusin', (e) => { const b = e.target.closest(SEL); if (b && b.matches(':focus-visible')) show(b); });
document.addEventListener('focusout', hide);
document.addEventListener('pointerdown', hide);
addEventListener('scroll', hide, true);
