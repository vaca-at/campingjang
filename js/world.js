// 법당 내부와 외부 풍경. 텍스처는 모두 캔버스로 그려서 외부 이미지 없이 동작한다.
// 좌표: 법당 안에서 불상은 -z 쪽, 입구는 +z 쪽. 밖에서는 법당 건물이 -z 쪽, 경치가 +z 쪽.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mat } from './avatar.js';
import { season } from './data.js';

const FONT_TITLE = '"Gowun Batang", "Nanum Myeongjo", serif';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// 간단한 결정적 난수와 노이즈
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function noise(x, z) {
  return Math.sin(x * 0.05) * Math.cos(z * 0.045) + 0.5 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.13 + 0.7)
    + 0.25 * Math.sin(x * 0.23 + z * 0.17) + 0.12 * Math.cos(x * 0.41 - z * 0.37);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ───────── 텍스처 ─────────
const TEX = {};
function woodFloor(base) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = rng(7);
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      const y = (i * h) / rows;
      const c = new THREE.Color(base).offsetHSL(0, 0, (r() - 0.5) * 0.06);
      g.fillStyle = c.getStyle();
      g.fillRect(0, y, w, h / rows);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 14; k++) {
        g.beginPath();
        const yy = y + r() * (h / rows);
        g.moveTo(0, yy);
        g.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 6, w * 0.6, yy + (r() - 0.5) * 6, w, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, y, w, 2);
      const cut = r() * w;
      g.fillRect(cut, y, 2, h / rows);
    }
  }, [6, 8]);
}

function dancheong(beam = '#2f7d6d', accent = '#c8443a') {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = beam; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#f2e7c9'; g.fillRect(0, 10, w, 4); g.fillRect(0, h - 14, w, 4);
    const cols = ['#c8443a', '#f0c05a', '#3b5aa8', '#f2e7c9', '#2a2a2a'];
    for (let i = 0; i < 4; i++) {
      const cx = 64 + i * 128, cy = h / 2;
      for (let ring = 5; ring > 0; ring--) {
        g.fillStyle = cols[ring % cols.length];
        g.beginPath();
        for (let p = 0; p < 16; p++) {
          const a = (p / 16) * Math.PI * 2;
          const rr = ring * 8 + (p % 2 ? 0 : 5);
          g.lineTo(cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr * 0.9);
        }
        g.closePath(); g.fill();
      }
      g.strokeStyle = '#f2e7c9'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx + 54, 18); g.lineTo(cx + 64, cy); g.lineTo(cx + 54, h - 18); g.stroke();
    }
  }, [1, 1]);
}

function roofTiles() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4d52'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const grd = g.createLinearGradient(x, 0, x + 32, 0);
      grd.addColorStop(0, '#2f3236'); grd.addColorStop(0.5, '#5e6268'); grd.addColorStop(1, '#2f3236');
      g.fillStyle = grd; g.fillRect(x, 0, 32, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
  }, [1, 1]);
}

function lattice(frame = '#7a2e22', paper = '#efe3c4', flower = true) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8d5a33'; g.lineWidth = 6;
    const s = 32;
    for (let x = 0; x <= w; x += s) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += s) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    if (flower) {
      // 꽃살: 격자 교차점마다 작은 꽃
      for (let x = s; x < w; x += s) for (let y = s; y < h * 0.62; y += s) {
        g.fillStyle = '#b8783e';
        for (let p = 0; p < 4; p++) {
          const a = (p / 4) * Math.PI * 2 + Math.PI / 4;
          g.beginPath(); g.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 7, 4, a, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#e6b04a'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#6b4a2e'; g.fillRect(0, h * 0.64, w, h * 0.36);
    g.strokeStyle = frame; g.lineWidth = 18; g.strokeRect(0, 0, w, h);
    g.lineWidth = 10; g.beginPath(); g.moveTo(0, h * 0.64); g.lineTo(w, h * 0.64); g.stroke();
  });
}

// 탱화: 붉은 바탕, 가운데 커다란 광배, 둘레의 보살과 구름 무늬
function taenghwa() {
  // 탱화 뒤 바탕: 짙은 비단에 은은한 구름무늬와 금빛 단청 테두리
  return canvasTex(1536, 586, (g, w, h) => {
    const r = rng(42);
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#4a1a14'); bg.addColorStop(1, '#2f120e');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(201,162,74,0.16)'; g.lineWidth = 3;
    for (let i = 0; i < 46; i++) { const x = r() * w, y = r() * h, s = 14 + r() * 18; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + k * s * 1.3, y, s * 0.6, Math.PI, 0); g.stroke(); } }
    g.lineWidth = 18; g.strokeStyle = '#2f7d6d'; g.strokeRect(9, 9, w - 18, h - 18);
    g.lineWidth = 6; g.strokeStyle = '#c9a24a'; g.strokeRect(24, 24, w - 48, h - 48);
  });
}

// 방석: 도톰하게 부푼 사각 방석. 겉감은 직물 결, 테두리 선단(가장자리 띠)과 바느질 땀, 가운데 연꽃 수
const CUSHION_TEX = {};
function cushionMat(cloth = '#7a2f2a', band = '#c9a24a', lotus = '#e8b8a0') {
  const key = cloth + band + lotus;
  if (CUSHION_TEX[key]) return CUSHION_TEX[key];
  const map = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = cloth; g.fillRect(0, 0, w, h);
    // 직물 결: 가는 가로·세로 줄
    for (let i = 0; i < w; i += 3) { g.fillStyle = `rgba(0,0,0,${0.05 + (i % 9 === 0 ? 0.05 : 0)})`; g.fillRect(i, 0, 1, h); g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, i, w, 1); }
    // 선단 띠와 바느질 땀
    g.strokeStyle = band; g.lineWidth = 26; g.strokeRect(34, 34, w - 68, h - 68);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40); g.strokeRect(48, 48, w - 96, h - 96);
    g.setLineDash([7, 6]); g.strokeStyle = 'rgba(255,240,210,0.55)'; g.lineWidth = 2; g.strokeRect(62, 62, w - 124, h - 124); g.setLineDash([]);
    // 가운데 연꽃 수: 위에서 본 연꽃. 끝이 뾰족한 꽃잎 두 겹(바깥 연하게 · 안쪽 진하게), 잎맥, 노란 연밥
    const petal = (len, wid, fill, vein) => {
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid, -len * 0.3, wid * 0.8, -len * 0.8, 0, -len); g.bezierCurveTo(-wid * 0.8, -len * 0.8, -wid, -len * 0.3, 0, 0); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, -len); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]); g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(120,40,30,0.4)'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = vein; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -len * 0.12); g.lineTo(0, -len * 0.82); g.stroke();
    };
    g.save(); g.translate(w / 2, h / 2);
    for (let i = 0; i < 8; i++) { g.save(); g.rotate((i / 8) * Math.PI * 2 + Math.PI / 8); petal(92, 30, ['#f6d6c4', lotus], 'rgba(200,110,100,0.45)'); g.restore(); }
    for (let i = 0; i < 8; i++) { g.save(); g.rotate((i / 8) * Math.PI * 2); petal(68, 24, ['#f2c2ae', '#e89a92'], 'rgba(170,70,70,0.5)'); g.restore(); }
    g.fillStyle = '#e9c45a'; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(140,100,30,0.6)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(120,90,30,0.75)'; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 10, Math.sin(a) * 10, 2.6, 0, Math.PI * 2); g.fill(); } g.beginPath(); g.arc(0, 0, 2.6, 0, Math.PI * 2); g.fill();
    g.restore();
    // 오래 앉은 자리처럼 가운데가 살짝 어둡게
    const rg = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.6); rg.addColorStop(0, 'rgba(0,0,0,0.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  return (CUSHION_TEX[key] = new THREE.MeshStandardMaterial({ map, roughness: 0.92 }));
}
const cushionGeo = (wd, h) => new RoundedBoxGeometry(wd, h, wd, 3, Math.min(0.05, h * 0.45));

function signboard(text) {
  return canvasTex(768, 256, (g, w, h) => {
    g.fillStyle = '#2a1d16'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2f7d6d'; g.lineWidth = 22; g.strokeRect(11, 11, w - 22, h - 22);
    g.strokeStyle = '#c8443a'; g.lineWidth = 6; g.strokeRect(30, 30, w - 60, h - 60);
    g.fillStyle = '#e8c35a';
    g.font = `700 120px ${FONT_TITLE}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  });
}

export function paintView(loc, g, w, h) {
  {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, loc.sky[0]); sky.addColorStop(1, loc.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const r = rng(loc.id.length * 13);
    const layers = loc.id === 'forest' ? ['#9fb59a', '#6f9070', '#486b4c'] : ['#b9c3cf', '#8a9cb0', '#5f7690'];
    layers.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.45 + i * 0.12) - Math.sin(x * 0.02 + i * 2 + r()) * 30 - r() * 12);
      g.lineTo(w, h); g.fill();
    });
    if (loc.id === 'river') {
      g.strokeStyle = '#d7e7f0'; g.lineWidth = 18;
      g.beginPath(); g.moveTo(0, h * 0.86); g.quadraticCurveTo(w * 0.4, h * 0.8, w * 0.5, h * 0.9); g.stroke();
      g.beginPath(); g.moveTo(w, h * 0.84); g.quadraticCurveTo(w * 0.6, h * 0.8, w * 0.5, h * 0.9); g.stroke();
    }
    if (loc.id === 'sea') {
      g.fillStyle = '#4f8db3'; g.fillRect(0, h * 0.7, w, h * 0.3);
      g.fillStyle = '#3d6b55';
      for (let i = 0; i < 5; i++) { const x = r() * w; g.beginPath(); g.ellipse(x, h * 0.71, 30 + r() * 50, 14 + r() * 10, 0, Math.PI, 0); g.fill(); }
    }
    if (loc.id === 'forest') {
      for (let i = 0; i < 60; i++) {
        g.fillStyle = ['#c0552f', '#e0a03a', '#7a8a3a', '#a33b2a'][i % 4];
        g.beginPath(); g.arc(r() * w, h * 0.7 + r() * h * 0.3, 14 + r() * 16, 0, Math.PI * 2); g.fill();
      }
    }
  }
}

// 창 밖 파노라마: 양쪽 벽 창들을 따라 이어지는 긴 풍경 한 장 (왼쪽 벽 절반 · 오른쪽 벽 절반).
// 디자인마다 확 다르게: 숲은 침엽수와 단풍, 두물머리는 산 아래 두 강이 만나는 들판, 남해는 수평선 · 섬 · 절벽 바위
const panoCache = {};
// 바깥 3D 풍경을 실제로 찍은 사진(main.js capturePanorama)이 오면 그림을 바꿔 끼워요. 창마다 복제한 그림도 같은 원본을 써서 함께 바뀌어요
const panoClones = {};
const panoClone = (loc) => { const t = panoramaTex(loc).clone(); (panoClones[loc.id] ||= []).push(t); return t; };
export function setPanorama(loc, canvas) {
  const t = panoramaTex(loc);
  t.image = canvas; t.needsUpdate = true;
  for (const c of panoClones[loc.id] || []) c.needsUpdate = true;
}
function panoramaTex(loc) {
  return panoCache[loc.id] ||= canvasTex(4096, 512, (g, w, h) => {
    const r = rng(loc.id.length * 31 + 7);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, loc.sky[0]); sky.addColorStop(0.75, loc.sky[1]); sky.addColorStop(1, loc.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = h * (0.06 + r() * 0.2), s = 20 + r() * 40;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + k * s * 0.8, y + Math.sin(k) * 6, s, s * 0.45, 0, 0, Math.PI * 2); g.fill(); }
    }
    const ridge = (base, amp, freq, color, seed) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, h * base - (Math.sin(x * freq + seed) * 0.6 + Math.sin(x * freq * 2.3 + seed * 1.7) * 0.3 + Math.sin(x * freq * 5.1 + seed) * 0.1) * amp);
      g.lineTo(w, h); g.fill();
    };
    if (loc.id === 'forest') {
      ridge(0.42, 60, 0.004, '#a9c2b2', 1); ridge(0.52, 50, 0.006, '#7fa384', 2); ridge(0.62, 30, 0.01, '#5b8461', 3);
      for (let x = -20; x < w + 20; x += 14 + r() * 18) {
        const base = h * (0.8 + r() * 0.14), th = 80 + r() * 100;
        if (r() < 0.6) {
          g.fillStyle = ['#2f5a3c', '#3c6b45', '#264d33'][Math.floor(r() * 3)];
          for (let k = 0; k < 3; k++) { const y = base - th * (0.25 + k * 0.28), ww = th * (0.3 - k * 0.07); g.beginPath(); g.moveTo(x, y - th * 0.32); g.lineTo(x + ww, y + th * 0.1); g.lineTo(x - ww, y + th * 0.1); g.fill(); }
        } else {
          g.fillStyle = ['#c0552f', '#e0a03a', '#d47a35', '#a33b2a', '#b8b23a'][Math.floor(r() * 5)];
          g.beginPath(); g.ellipse(x, base - th * 0.45, th * 0.3, th * 0.4, 0, 0, Math.PI * 2); g.fill();
        }
      }
      g.fillStyle = '#3e5b36'; g.fillRect(0, h * 0.94, w, h * 0.06);
    } else if (loc.id === 'river') {
      ridge(0.3, 50, 0.003, '#c9b8b6', 1); ridge(0.38, 55, 0.005, '#a99aa6', 2); ridge(0.46, 45, 0.007, '#8a8597', 3);
      g.fillStyle = 'rgba(255,240,228,.45)'; g.fillRect(0, h * 0.44, w, h * 0.06);
      g.fillStyle = '#9aa77a'; g.fillRect(0, h * 0.52, w, h * 0.48);
      for (let i = 0; i < 60; i++) { g.fillStyle = ['#a9b47f', '#8c9a6a', '#b8ae78'][i % 3]; g.fillRect(r() * w, h * (0.55 + r() * 0.4), 60 + r() * 120, 14 + r() * 20); }
      g.strokeStyle = '#e7eff3'; g.lineCap = 'round';
      for (const cx of [w * 0.25, w * 0.75]) {   // 양쪽 벽마다 두 강이 하나로 만나는 곳
        g.lineWidth = 46;
        g.beginPath(); g.moveTo(cx - 900, h * 0.62); g.bezierCurveTo(cx - 500, h * 0.6, cx - 250, h * 0.9, cx, h * 0.8); g.stroke();
        g.beginPath(); g.moveTo(cx + 900, h * 0.6); g.bezierCurveTo(cx + 500, h * 0.66, cx + 250, h * 0.92, cx, h * 0.8); g.stroke();
        g.lineWidth = 80; g.beginPath(); g.moveTo(cx, h * 0.8); g.quadraticCurveTo(cx + 40, h * 0.95, cx - 60, h * 1.05); g.stroke();
      }
      ridge(0.98, 30, 0.012, '#5d6b4a', 5);
    } else if (loc.id === 'sea') {
      const hz = h * 0.5;
      const sea = g.createLinearGradient(0, hz, 0, h); sea.addColorStop(0, '#6aa3c8'); sea.addColorStop(1, '#2b5f86');
      g.fillStyle = sea; g.fillRect(0, hz, w, h - hz);
      for (let i = 0; i < 22; i++) {
        const x = r() * w, s = 40 + r() * 160, far = r();
        g.fillStyle = far < 0.5 ? '#8fa7b3' : '#5f7d70';
        g.beginPath(); g.ellipse(x, hz + 2 + far * 14, s, s * (0.18 + r() * 0.15), 0, Math.PI, 0); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
      for (let i = 0; i < 160; i++) { const x = r() * w, y = hz + 20 + r() * (h - hz - 30), l = 8 + r() * 26; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke(); }
      for (let i = 0; i < 9; i++) {   // 절벽 바위와 소나무
        const x = r() * w, s = 120 + r() * 220;
        g.fillStyle = '#6d5a4b'; g.beginPath(); g.moveTo(x - s, h); g.lineTo(x - s * 0.6, h * 0.82); g.lineTo(x - s * 0.1, h * 0.76); g.lineTo(x + s * 0.4, h * 0.8); g.lineTo(x + s, h); g.fill();
        g.fillStyle = '#2f4a32'; g.beginPath(); g.ellipse(x - s * 0.1, h * 0.72, 36, 16, 0, 0, Math.PI * 2); g.fill(); g.fillRect(x - s * 0.1 - 3, h * 0.72, 6, h * 0.05);
      }
    } else paintView(loc, g, w, h);
  });
}

// 창 밖 풍경 그림: 빛을 받지 않는 그림이라 낮밤(js/daytime.js)이 이 표시를 보고 저녁 · 밤 색을 입혀요
function viewMat(map) {
  const m = new THREE.MeshBasicMaterial({ map });
  m.userData.view = true;
  return m;
}

// 성긴 창살: 테두리 + 세로 살 둘 + 위 칸 잔살만 (바깥이 넓게 보이게)
function openLattice(frame) {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = frame;
    g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16); g.fillRect(0, 0, 16, h); g.fillRect(w - 16, 0, 16, h);
    g.fillRect(0, h * 0.24, w, 9);
    for (const f of [1 / 3, 2 / 3]) g.fillRect(w * f - 5, 0, 10, h);
    for (let x = 32; x < w; x += 32) g.fillRect(x - 2, 0, 4, h * 0.24);
  });
}

function stoneTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = '#9a958c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? -32 : 0; x < w; x += 64) {
      g.fillStyle = new THREE.Color('#a8a296').offsetHSL(0, 0, (r() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 2, y + 2, 60, 60);
    }
  }, [8, 8]);
}

// ───────── 공용 소품 ─────────
const gold = () => new THREE.MeshStandardMaterial({ color: '#d6a447', metalness: 0.9, roughness: 0.3 });

export function buildBuddha() {
  const g = new THREE.Group();
  const m = gold();
  const add = (geo, sx, sy, sz, x, y, z, material = m) => {
    const o = new THREE.Mesh(geo, material); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o;
  };
  const S = new THREE.SphereGeometry(1, 40, 28);
  // 연화대좌
  add(new THREE.CylinderGeometry(1.3, 1.45, 0.35, 8), 1, 1, 1, 0, 0.17, 0);
  for (let ring = 0; ring < 2; ring++) {
    const n = 16 - ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.2;
      const p = add(S, 0.22, 0.32, 0.12, Math.sin(a) * (1.15 - ring * 0.18), 0.55 + ring * 0.12, Math.cos(a) * (1.15 - ring * 0.18));
      p.rotation.y = a; p.rotation.x = 0.5 - ring * 0.3;
    }
  }
  add(new THREE.CylinderGeometry(1.15, 1.0, 0.25, 32), 1, 1, 1, 0, 0.72, 0);
  // 결가부좌한 다리, 몸, 어깨
  add(S, 1.05, 0.34, 0.68, 0, 1.0, 0.12);
  add(S, 0.62, 0.86, 0.46, 0, 1.75, 0);
  add(S, 0.7, 0.3, 0.42, 0, 2.3, -0.02);
  // 팔: 왼손은 무릎 위, 오른손은 무릎 아래로 (항마촉지인)
  const arm = (side, reach) => {
    const a = add(new THREE.CapsuleGeometry(0.17, 0.62, 6, 12), 1, 1, 1, 0.62 * side, 1.8, 0.05);
    a.rotation.z = 0.28 * side; a.rotation.x = -0.3;
    const f = add(new THREE.CapsuleGeometry(0.14, 0.5, 6, 12), 1, 1, 1, 0.5 * side, 1.25, 0.42 + reach);
    f.rotation.x = -1.2; f.rotation.z = -0.2 * side;
    add(S, 0.14, 0.09, 0.2, 0.22 * side + (reach ? 0.35 * side : 0), 1.1 - reach * 0.8, 0.62 + reach * 0.3);
  };
  arm(1, 0);
  arm(-1, 0.18);
  // 목, 머리, 육계, 귀
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 20), 1, 1, 1, 0, 2.55, 0);
  add(S, 0.43, 0.5, 0.44, 0, 2.95, 0.02);
  const curls = new THREE.MeshStandardMaterial({ color: '#3b3a6a', metalness: 0.5, roughness: 0.5 });
  add(S, 0.44, 0.38, 0.44, 0, 3.12, -0.03, curls);
  add(S, 0.22, 0.22, 0.22, 0, 3.48, -0.02, curls);
  add(S, 0.07, 0.24, 0.08, 0.43, 2.82, 0.0);
  add(S, 0.07, 0.24, 0.08, -0.43, 2.82, 0.0);
  const line = new THREE.MeshStandardMaterial({ color: '#7a5420', metalness: 0.6, roughness: 0.5 });
  add(S, 0.09, 0.015, 0.02, 0.15, 2.98, 0.43, line);
  add(S, 0.09, 0.015, 0.02, -0.15, 2.98, 0.43, line);
  add(S, 0.03, 0.03, 0.02, 0, 3.08, 0.44, new THREE.MeshStandardMaterial({ color: '#f5f0e0', emissive: '#ffe8a0', emissiveIntensity: 0.6 }));
  // 가사 주름 띠
  const fold = add(new THREE.TorusGeometry(0.5, 0.035, 8, 32, Math.PI), 1, 1.3, 1, 0.05, 1.95, 0.3);
  fold.rotation.z = -0.6;
  return g;
}

function mandorla(color = '#d6a447') {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-2.6, 0.4, -2.8, 4.2, 0, 6.2);
  shape.bezierCurveTo(2.8, 4.2, 2.6, 0.4, 0, 0);
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }));
  g.add(outer);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.95, 48), new THREE.MeshStandardMaterial({ color: '#b5392e', metalness: 0.3, roughness: 0.5 }));
  inner.position.set(0, 4.25, 0.02);
  g.add(inner);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 48), outer.material);
  ring.position.copy(inner.position);
  g.add(ring);
  return g;
}

export function buildLantern(color = '#f08aa0', glow = 1) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55 * glow, roughness: 0.6 });
  const petal = new THREE.SphereGeometry(1, 10, 8);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), m);
  core.scale.y = 0.85;
  g.add(core);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = new THREE.Mesh(petal, m);
    p.scale.set(0.09, 0.2, 0.06);
    p.position.set(Math.sin(a) * 0.24, 0.02, Math.cos(a) * 0.24);
    p.rotation.y = a; p.rotation.x = -0.5;
    g.add(p);
  }
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.6, 4), mat('#3a2a20'));
  string.position.y = 1.0;
  g.add(string);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.4), mat('#f7f0dc', { side: THREE.DoubleSide }));
  tag.position.y = -0.48;
  g.add(tag);
  return g;
}

function stoneLantern() {
  const g = new THREE.Group();
  const s = mat('#9b958a');
  const add = (geo, y) => { const o = new THREE.Mesh(geo, s); o.position.y = y; o.castShadow = o.receiveShadow = true; g.add(o); };
  add(new THREE.CylinderGeometry(0.6, 0.7, 0.3, 8), 0.15);
  add(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 8), 1.0);
  add(new THREE.CylinderGeometry(0.55, 0.4, 0.25, 8), 1.8);
  const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#8e897f', emissive: '#ffb860', emissiveIntensity: 0.25 }));
  fire.position.y = 2.2; g.add(fire);
  add(new THREE.ConeGeometry(0.75, 0.45, 8), 2.72);
  add(new THREE.SphereGeometry(0.14, 10, 8), 3.0);
  return g;
}

// ───────── 마당 탑 다섯 가지 (실제 탑의 모양만 따서 만든 모형) ─────────
// 쌓아 올리기 도우미: add() 는 지금 높이 y 위에 상자를 올리고 y 를 올린다
function stacker(color) {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.92 });
  const dark = mat('#2a2420');
  let y = 0;
  const put = (geo, h, material = m, lift = 0) => {
    const o = new THREE.Mesh(geo, material); o.position.y = y + h / 2 + lift; o.castShadow = o.receiveShadow = true; g.add(o); return o;
  };
  const S = {
    g, m, dark,
    get y() { return y; },
    add(w, h, d = w) { put(new THREE.BoxGeometry(w, h, d), h); y += h; },
    // 亞자 모양: 네모 둘을 열십자로 겹친다
    cross(w, h, inner) { put(new THREE.BoxGeometry(w, h, inner), h); put(new THREE.BoxGeometry(inner, h, w), h); y += h; },
    // 지붕돌: 아래 받침 계단 + 넓은 지붕돌 + 귀가 살짝 들린 네 모서리
    roof(w, h, steps = 2, lift = 0.06) {
      for (let i = 0; i < steps; i++) { const sw = w * (0.62 + 0.08 * i); put(new THREE.BoxGeometry(sw, 0.06, sw), 0.06); y += 0.06; }
      put(new THREE.BoxGeometry(w, h, w), h);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 0.7, w * 0.16), m);
        c.position.set(sx * w * 0.44, y + h + lift * 0.5, sz * w * 0.44); c.castShadow = true; g.add(c);
      }
      y += h;
      put(new THREE.BoxGeometry(w * 0.55, h * 0.6, w * 0.55), h * 0.6); y += h * 0.6;
    },
    // 상륜부: 노반, 복발, 보주를 꿴 쇠꼬챙이
    finial(h = 1) {
      put(new THREE.BoxGeometry(0.3, 0.14, 0.3), 0.14); y += 0.14;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 8), mat('#6f6a62')); rod.position.y = y + h / 2; g.add(rod);
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.11 - i * 0.02, 10, 8), m); b.position.y = y + 0.2 + i * h * 0.28; g.add(b); }
      y += h;
    },
    door(w, h, faces = 4, at = y) {
      for (let k = 0; k < faces; k++) {
        const a = (k / 4) * Math.PI * 2;
        const d = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, h * 0.62, 0.05), dark);
        d.position.set(Math.sin(a) * (w / 2 + 0.01), at - h / 2 - h * 0.05, Math.cos(a) * (w / 2 + 0.01)); d.rotation.y = a; g.add(d);
      }
    },
  };
  return S;
}

export const PAGODAS = [
  { id: 'gahangsa', name: '갈항사지 삼층석탑', from: '통일신라 · 국보', note: '두 단 기단 위 3층, 신라 석탑의 표준형' },
  { id: 'gyeongcheon', name: '경천사지 십층석탑', from: '고려 · 국보', note: '하얀 대리석, 아래 3층은 亞자 모양' },
  { id: 'namgyewon', name: '남계원 칠층석탑', from: '고려 · 국보', note: '날씬하게 높이 솟은 7층' },
  { id: 'yeomgeo', name: '염거화상탑', from: '통일신라 · 국보', note: '팔각 승탑, 연꽃 받침과 기와집 모양 지붕' },
  { id: 'mireuksa', name: '익산 미륵사지 석탑', from: '백제 · 국보', note: '나무탑을 돌로 옮긴 모양, 1층 가운데 통로' },
];

export function buildPagoda(id) {
  if (id === 'gyeongcheon') {
    const S = stacker('#e9e6df');
    S.cross(4.0, 0.45, 2.6); S.cross(3.4, 0.5, 2.2); S.cross(2.9, 0.45, 1.9);
    for (let i = 0; i < 3; i++) { const w = 2.3 - i * 0.12; S.cross(w, 0.62, w * 0.66); S.cross(w + 0.55, 0.16, (w + 0.55) * 0.66); S.add(w * 0.7, 0.08); }
    for (let i = 0; i < 7; i++) { const w = 1.45 - i * 0.08; S.add(w, 0.5 - i * 0.015); S.roof(w + 0.7, 0.14, 1, 0.05); }
    S.finial(1.1);
    return S.g;
  }
  if (id === 'namgyewon') {
    const S = stacker('#b7b1a6');
    S.add(3.0, 0.45); S.add(3.2, 0.12); S.add(2.3, 0.75); S.add(2.6, 0.14);
    for (let i = 0; i < 7; i++) { const w = 1.25 - i * 0.07; S.add(w, i === 0 ? 0.85 : 0.42); S.roof(w + 0.9, 0.16, 2, 0.08); }
    S.finial(1.0);
    return S.g;
  }
  if (id === 'yeomgeo') {
    // 팔각 승탑: 팔각 바닥돌 → 연꽃 받침 → 문짝 새긴 탑몸 → 기와집 지붕 → 연꽃 봉오리
    const S = stacker('#c9c3b7');
    const oct = (r1, r2, h) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 8), S.m); o.position.y = S.y + h / 2; o.rotation.y = Math.PI / 8; o.castShadow = o.receiveShadow = true; S.g.add(o); return h; };
    const petals = (r, y, up) => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), S.m);
        p.scale.set(0.2, 0.28, 0.12); p.position.set(Math.sin(a) * r, y, Math.cos(a) * r); p.rotation.y = a; p.rotation.x = up ? -0.5 : 0.5; p.castShadow = true; S.g.add(p);
      }
    };
    let h = oct(1.9, 2.0, 0.3); S.add(0.01, h - 0.01);
    h = oct(1.3, 1.5, 0.45); S.add(0.01, h - 0.01);
    petals(1.2, S.y + 0.1, false); h = oct(1.15, 1.2, 0.3); S.add(0.01, h - 0.01);
    h = oct(0.8, 0.8, 0.45); S.add(0.01, h - 0.01);
    petals(1.0, S.y + 0.05, true); h = oct(1.05, 0.95, 0.22); S.add(0.01, h - 0.01);
    const bodyY = S.y; h = oct(0.75, 0.75, 1.1); S.add(0.01, h - 0.01);
    S.door(1.5, 1.1, 4, S.y);
    // 기와집 지붕: 팔각 처마 + 기와골 여덟 줄
    h = oct(1.55, 1.6, 0.12); S.add(0.01, h - 0.01);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 1.5, 0.7, 8), S.m); roof.position.y = S.y + 0.35; roof.rotation.y = Math.PI / 8; roof.castShadow = true; S.g.add(roof);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.5), S.m);
      r.position.set(Math.sin(a) * 0.82, S.y + 0.42, Math.cos(a) * 0.82); r.rotation.y = a; r.rotation.x = 0.44; S.g.add(r);
    }
    S.add(0.01, 0.7);
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), S.m); bud.scale.y = 1.2; bud.position.y = S.y + 0.25; S.g.add(bud);
    petals(0.32, S.y + 0.1, true);
    void bodyY;
    return S.g;
  }
  if (id === 'mireuksa') {
    // 넓고 얕은 지붕돌, 1층 네 면 가운데로 통로
    const S = stacker('#c2bbae');
    S.add(5.0, 0.35); S.add(4.4, 0.3);
    for (let i = 0; i < 6; i++) {
      const w = 3.3 - i * 0.18;
      S.add(w, i === 0 ? 1.0 : 0.42);
      if (i === 0) S.door(w * 1.4, 1.0, 4, S.y);
      S.roof(w + 1.3, 0.12, 3, 0.07);
    }
    return S.g;
  }
  // 갈항사지 삼층석탑 (기본)
  const S = stacker('#b9b3a8');
  S.add(3.1, 0.5); S.add(3.3, 0.14); S.add(2.4, 0.75); S.add(2.6, 0.14);
  const ws = [1.55, 1.15, 0.95], hs = [1.15, 0.5, 0.42];
  for (let i = 0; i < 3; i++) { S.add(ws[i], hs[i]); S.roof(ws[i] + 1.15, 0.22, 3, 0.09); }
  S.finial(1.0);
  return S.g;
}

// ───────── 한옥 지붕 ─────────
// 우진각+팔작 느낌: 용마루가 있는 사면 지붕, 처마 곡선과 귀솟음
function roofGeometry(W, D, H, ridge = 0.45, n = 44) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = (i / n) * 2 - 1, v = (j / n) * 2 - 1;
    const x = u * W, z = v * D;
    const a = Math.max(0, (Math.abs(u) - ridge) / (1 - ridge));
    const m = Math.max(a, Math.abs(v));
    let y = H * Math.pow(1 - m, 1.5);
    y += 0.35 * Math.pow(Math.abs(u), 4) * m;                 // 처마 양끝이 살짝 들림 (앙곡)
    y += 0.6 * Math.pow(Math.abs(u) * Math.abs(v), 6);         // 추녀 끝 귀솟음
    pos.push(x, y, z);
    uv.push(x * 0.5, z * 0.35 + y * 0.2);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// 법당 건물 (밖에서 보는 모습). 앞면이 +z
export function buildHallBuilding(loc) {
  const c = loc.interior;
  const g = new THREE.Group();
  const W = 14, D = 8, colH = 4.2;
  const stone = mat('#a39d92');
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 1.0, D + 2.4), stone);
  base.position.y = 0.5; base.receiveShadow = base.castShadow = true; g.add(base);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(4, 0.33, 0.7), stone);
    step.position.set(0, 0.17 + i * 0.33, D / 2 + 1.2 + 0.7 * (2 - i) + 0.35);
    step.position.y = 1.0 - 0.33 * (i + 0.5);
    step.position.z = D / 2 + 1.2 + 0.35 + i * 0.7;
    step.castShadow = step.receiveShadow = true;
    g.add(step);
  }
  const pillarMat = mat(c.pillar);
  const xs = [-W / 2, -W / 6, W / 6, W / 2];
  for (const z of [-D / 2, D / 2]) for (const x of xs) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, colH, 16), pillarMat);
    p.position.set(x, 1 + colH / 2, z); p.castShadow = true; g.add(p);
  }
  // 벽과 꽃살문
  const doorTex = lattice(c.pillar);
  const wallMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.8 });
  for (let k = 0; k < 3; k++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(W / 3 - 0.6, colH - 0.4), wallMat);
    d.position.set(-W / 3 + k * (W / 3), 1 + colH / 2 - 0.1, D / 2 - 0.05);
    g.add(d);
  }
  const plaster = mat('#e9dfc8');
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, colH, 0.3), plaster); back.position.set(0, 1 + colH / 2, -D / 2); g.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, colH, D), plaster); side.position.set(s * W / 2, 1 + colH / 2, 0); side.castShadow = true; g.add(side);
  }
  // 단청 들보
  const dc = dancheong(c.beam, c.accent);
  dc.wrapS = THREE.RepeatWrapping; dc.repeat.set(4, 1);
  const beamMat = new THREE.MeshStandardMaterial({ map: dc, roughness: 0.7 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.8, D + 0.8), beamMat);
  beam.position.y = 1 + colH + 0.4; g.add(beam);
  // 지붕
  const roofGeo = roofGeometry(W / 2 + 2.6, D / 2 + 2.4, 3.4);
  const tiles = roofTiles(); tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.85 }));
  roof.position.y = 1 + colH + 0.75; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  const under = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: c.beam, side: THREE.BackSide, roughness: 0.9 }));
  under.position.y = roof.position.y - 0.06; g.add(under);
  const ridgeLen = (W / 2 + 2.6) * 2 * 0.45;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(ridgeLen, 0.45, 0.5), mat('#3a3d42'));
  ridge.position.y = roof.position.y + 3.4 + 0.15; ridge.castShadow = true; g.add(ridge);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.5), mat('#3a3d42'));
    end.position.set(s * ridgeLen / 2, ridge.position.y + 0.2, 0); end.rotation.z = -0.3 * s; g.add(end);
  }
  // 현판
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.07), new THREE.MeshStandardMaterial({ map: signboard('큰법당'), roughness: 0.6 })); // 현판은 디자인과 상관없이 모두 큰법당
  sign.position.set(0, 1 + colH + 0.45, D / 2 + 0.42); g.add(sign);
  // 입구 앞 등
  const l1 = stoneLantern(); l1.position.set(-3.5, 0, D / 2 + 4.6); g.add(l1);
  const l2 = stoneLantern(); l2.position.set(3.5, 0, D / 2 + 4.6); g.add(l2);
  // 할로윈(10/31까지): 석등 옆과 계단 양쪽에 호박 등불. 얼굴이 스스로 빛나서 밤에 더 잘 보여요
  if (season() === 'halloween') for (const [x, z, s] of [[-4.3, 4.9, 1], [-3.0, 5.3, 0.8], [4.3, 4.9, 1], [3.0, 5.3, 0.8], [-1.9, 2.9, 0.9], [1.9, 2.9, 0.9]]) {
    const p = jackOLantern(); p.position.set(x, 0, D / 2 + z); p.scale.setScalar(s); p.rotation.y = (x < 0 ? 0.3 : -0.3); g.add(p);
  }
  g.userData.door = new THREE.Vector3(0, 0, D / 2 + 3.6);
  g.userData.footprint = { w: W / 2 + 1.6, d: D / 2 + 1.3 };
  return g;
}

// 호박 등불 (할로윈 장식)
function jackOLantern() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat('#e8873a', { roughness: 0.6 }));
  body.scale.set(1.15, 0.85, 1); body.position.y = 0.36; body.castShadow = true; g.add(body);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.08), mat('#4f7a3a')); stem.position.y = 0.78; g.add(stem);
  const glow = new THREE.MeshStandardMaterial({ color: '#ffd36a', emissive: '#ffb030', emissiveIntensity: 1.4 });
  for (const x of [-0.15, 0.15]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.05), glow); e.position.set(x, 0.46, 0.41); e.rotation.z = 0.785; g.add(e); }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), glow); mouth.position.set(0, 0.28, 0.4); g.add(mouth);
  return g;
}

function skyDome(top, bottom) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, h)), 1.0); }',
  });
  return new THREE.Mesh(geo, m);
}

// 바깥 하늘: 위·아래 색 사이에 지평선 빛, 흘러가는 구름, 해(낮) · 달과 별(밤).
// top/bottom 은 daytime.js 가 낮밤에 맞춰 바꾸고, day(0 밤~1 낮)·time 도 넣어 줘요
const SUN_DIR = new THREE.Vector3(0.42, 0.36, 0.83).normalize();
function skyDomeHQ(top, bottom, { clouds = 0.55, cloudTint = '#ffffff', milky = 0 } = {}) {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) }, day: { value: 1 }, time: { value: 0 },
      sunDir: { value: SUN_DIR.clone() }, cover: { value: clouds }, cloudTint: { value: new THREE.Color(cloudTint) }, milky: { value: milky } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform float day; uniform float time; uniform vec3 sunDir; uniform float cover; uniform vec3 cloudTint; uniform float milky;
      varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        // 하늘 바탕: 지평선 쪽은 밝고 부드럽게
        vec3 col = mix(bottom, top, smoothstep(-0.02, 0.62, h));
        col = mix(col, bottom * 1.06, exp(-max(h, 0.0) * 14.0) * 0.55);
        // 해: 둥근 해 + 넓은 빛무리 (낮에만)
        float sd = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.86, 0.62) * (pow(sd, 24.0) * 0.16 + pow(sd, 400.0) * 0.5) * day;
        col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.9994, 0.9997, sd) * day);
        // 밤: 별과 달
        float night = 1.0 - smoothstep(0.15, 0.55, day);
        if (night > 0.0 && h > 0.02) {
          vec2 g = vec2(atan(d.z, d.x) * 120.0, h * 240.0);
          vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
          float r = hash(cell);
          float star = step(0.985, r) * smoothstep(0.18, 0.0, length(f)) * (0.6 + 0.4 * sin(time * 2.0 + r * 60.0));
          col += vec3(0.95, 0.96, 1.0) * star * night * smoothstep(0.02, 0.2, h);
          vec3 moonDir = normalize(vec3(-sunDir.x, sunDir.y + 0.08, sunDir.z));
          float md = dot(d, moonDir);
          col = mix(col, vec3(0.96, 0.94, 0.86), smoothstep(0.99955, 0.9998, md) * night);
          col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 90.0) * 0.18 * night;
        }
        // 은하수 (연천 당포성 밤하늘처럼): 나홀로 나무 오른쪽 지평선에서 밝은 중심이 솟아 하늘을 비스듬히 가로질러요.
        // 지평선은 남보라 → 먼 마을 불빛의 주황으로 번지고, 띠 안쪽엔 잔별이 촘촘
        if (milky > 0.0 && h > -0.05) {
          vec3 gc = normalize(vec3(0.42, 0.04, -1.0));
          vec3 n = normalize(cross(gc, normalize(vec3(-0.55, 1.0, 0.1))));
          vec3 ax = normalize(cross(n, gc));
          float b = dot(d, n), along = dot(d, ax);
          vec2 p = vec2(along * 5.0, b * 11.0);
          float cloud = fbm(p * 1.3 + 3.0) * 0.6 + fbm(p * 4.0) * 0.4;
          float band = exp(-pow(b / (0.16 + 0.06 * cloud), 2.0));
          float core = exp(-pow(b / 0.075, 2.0)) * pow(max(dot(d, gc), 0.0), 4.0);
          float dust = smoothstep(0.42, 0.72, fbm(p * vec2(1.6, 3.2) + 9.0)) * exp(-pow((b - 0.012) / 0.035, 2.0));
          vec3 mwc = mix(vec3(0.55, 0.62, 0.95), vec3(1.0, 0.84, 0.66), clamp(core * 1.6, 0.0, 1.0));
          float fadeH = smoothstep(-0.02, 0.12, h);
          col += mwc * (band * (0.12 + 0.24 * cloud) + core * 0.85 * cloud) * (1.0 - dust * 0.8) * milky * fadeH;
          // 잔별: 띠 안에서 훨씬 많이
          vec2 g2 = vec2(atan(d.z, d.x) * 300.0, h * 600.0);
          float r2 = hash(floor(g2) + 7.0);
          float th = mix(0.992, 0.93, band);
          col += vec3(0.9, 0.93, 1.0) * step(th, r2) * smoothstep(0.32, 0.0, length(fract(g2) - 0.5)) * (0.35 + 0.65 * fract(r2 * 91.0)) * milky * fadeH;
          // 지평선 빛: 남보라 띠 + 앞쪽 아래 주황빛
          float lowH = exp(-max(h, 0.0) * 9.0);
          col += vec3(0.22, 0.12, 0.34) * lowH * 0.55 * milky;
          col += vec3(1.0, 0.5, 0.22) * exp(-max(h, 0.0) * 22.0) * (0.25 + 0.35 * max(dot(normalize(d.xz), normalize(vec2(0.35, -1.0))), 0.0)) * milky;
        }
        // 구름: 하늘을 평면에 펼쳐 겹겹이 흘러가게
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.012, time * 0.004);
          float n = fbm(uv) * 0.75 + fbm(uv * 2.6 + 4.0) * 0.25;
          float c = smoothstep(1.0 - cover * 0.82, 1.08 - cover * 0.55, n) * smoothstep(0.0, 0.16, h);
          float shade = fbm(uv + sunDir.xz * 0.35);
          vec3 lit = mix(cloudTint, top, 0.18) * (0.55 + 0.45 * day) + vec3(1.0, 0.8, 0.6) * pow(sd, 6.0) * 0.25 * day;
          vec3 cc = mix(lit, mix(bottom, top, 0.4) * 0.82, smoothstep(0.35, 0.8, shade) * 0.55);
          col = mix(col, cc, c * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = -10;
  return mesh;
}

// 먼 산줄기: 산수화처럼 겹겹이. 가까운 줄은 진하고, 멀수록 하늘빛에 묻히고, 아랫자락엔 운해(구름 바다)
// top = 산색, bottom = 안개색 (daytime.js 가 밤에 함께 어둡게 해요)
function ridgeRing(radius, base, amp, color, haze, seed, { from = 0, to = Math.PI * 2, sharp = 1.6, seg = 360 } = {}) {
  const r = rng(seed), ph = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  const pos = [], idx = [], vy = [];
  for (let i = 0; i <= seg; i++) {
    const a = from + (to - from) * (i / seg);
    // 뾰족한 봉우리: 여러 겹 사인을 접어서(ridged)
    let n = 0, w = 1, f = 3;
    for (let k = 0; k < 5; k++) { n += w * (1 - Math.abs(Math.sin(a * f + ph[k]))) ** sharp; w *= 0.5; f *= 2.1; }
    const y = base + amp * n * (0.75 + 0.25 * Math.sin(a * 2 + ph[5]));
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    pos.push(x, -120, z, x, y, z);
    vy.push(0, 1);
    if (i < seg) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('ty', new THREE.Float32BufferAttribute(vy, 1));
  geo.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, depthWrite: true,
    uniforms: { top: { value: new THREE.Color(color) }, bottom: { value: new THREE.Color(haze) } },
    vertexShader: 'attribute float ty; varying float vT; varying float vY; void main(){ vT = ty; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying float vT; varying float vY;
      void main(){ float mist = 1.0 - smoothstep(-40.0, ${(base + amp * 0.35).toFixed(1)}, vY);
        vec3 c = mix(top, bottom, clamp(mist * 0.95, 0.0, 1.0));
        c = mix(c, bottom, (1.0 - vT) * 0.15);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = -5;
  return mesh;
}
function mountainLayers(loc) {
  const g = new THREE.Group();
  const sky = new THREE.Color(loc.sky[1]), hazeC = new THREE.Color(loc.fog);
  // 장소마다 산색: 숲(가을 단풍 · 짙은 녹청), 강(쪽빛), 바다(뒤쪽만 산, 앞은 수평선과 먼 섬)
  const near = loc.id === 'forest' ? '#5f6e55' : loc.id === 'river' ? '#5a6d70' : '#66767c';
  // 가까운 줄은 낮게, 먼 줄일수록 높게 솟아 겹겹이 보이도록 [반지름, 바닥, 높이, 하늘빛에 묻히는 정도]
  const layers = [[470, 18, 55, 0.12], [560, 28, 85, 0.32], [650, 40, 115, 0.5], [740, 52, 140, 0.66], [830, 60, 165, 0.8]];
  layers.forEach(([rad, base, amp, fade], i) => {
    if (loc.night) { base -= 34; amp *= 0.22; }
    const col = new THREE.Color(near).lerp(sky, fade).getStyle();
    const haze = hazeC.clone().lerp(sky, 0.3 + fade * 0.4).getStyle();
    if (loc.id === 'sea') {
      // 바다 쪽(앞, +z)은 비우고 뒤와 옆만
      g.add(ridgeRing(rad, base, amp * 0.9, col, haze, 31 + i, { from: Math.PI * 1.02, to: Math.PI * 1.98, seg: 200 }));
      if (i >= 2) g.add(ridgeRing(rad + 40, -46, 22 + i * 4, col, haze, 51 + i, { from: Math.PI * 0.12, to: Math.PI * 0.88, seg: 220, sharp: 0.8 }));
    } else g.add(ridgeRing(rad, base, amp, col, haze, 11 + i * 7));
  });
  return g;
}

// 나무 모양 두 가지 (여러 덩어리를 하나로 붙여서 그림자·빛이 풍성하게)
let TREE_GEO = null;
function treeGeos() {
  if (TREE_GEO) return TREE_GEO;
  const paint = (geo, c) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
  const T = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => geo.scale(sx, sy, sz).translate(x, y, z);
  // 소나무: 세 층 원뿔(위로 갈수록 밝게) + 줄기
  const pine = mergeGeometries([
    paint(T(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 6), 0, 1.3, 0), '#4a3424'),
    paint(T(new THREE.ConeGeometry(2.0, 3.2, 8), 0, 3.2, 0), '#c9d6c4'),
    paint(T(new THREE.ConeGeometry(1.6, 2.8, 8), 0, 4.6, 0), '#dfe8da'),
    paint(T(new THREE.ConeGeometry(1.05, 2.3, 8), 0, 5.9, 0), '#f2f6ee'),
  ].map((x) => x.toNonIndexed()));
  // 활엽수: 줄기 + 동글동글 잎 덩어리 넷
  const leaf = mergeGeometries([
    paint(T(new THREE.CylinderGeometry(0.22, 0.34, 2.8, 6), 0, 1.4, 0), '#5a3d2a'),
    paint(T(new THREE.IcosahedronGeometry(1.9, 1), 0, 3.7, 0), '#ffffff'),
    paint(T(new THREE.IcosahedronGeometry(1.4, 1), 1.2, 3.2, 0.4), '#e6e6e6'),
    paint(T(new THREE.IcosahedronGeometry(1.35, 1), -1.1, 3.4, -0.5), '#ececec'),
    paint(T(new THREE.IcosahedronGeometry(1.2, 1), 0.2, 4.9, -0.3), '#ffffff'),
  ].map((x) => x.toNonIndexed()));
  TREE_GEO = { pine, leaf };
  return TREE_GEO;
}

// ───────── 실사풍 풍경 조각 ─────────
// 누각: 연못 건너편 2층 누각 (붉은 기둥, 난간, 단청, 기와 팔작지붕). 앞면이 -z(마당 쪽)
function pavilion(scale = 1) {
  const g = new THREE.Group();
  const W = 9, D = 5, H1 = 2.6, H2 = 2.4;
  const red = mat('#9c2f24', { roughness: 0.6 }), stone = mat('#b9b2a4');
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.8, D + 1.2), stone); base.position.y = 0.4; base.castShadow = base.receiveShadow = true; g.add(base);
  const xs = [-W / 2, -W / 6, W / 6, W / 2];
  for (const z of [-D / 2, D / 2]) for (const x of xs) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, H1 + H2, 12), red); p.position.set(x, 0.8 + (H1 + H2) / 2, z); p.castShadow = true; g.add(p);
  }
  // 2층 마루와 난간
  const floor2 = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.25, D + 0.8), mat('#5a3826')); floor2.position.y = 0.8 + H1; g.add(floor2);
  for (const z of [-D / 2 - 0.4, D / 2 + 0.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.08, 0.08), red); rail.position.set(0, 0.8 + H1 + 0.7, z); g.add(rail);
    for (let i = 0; i <= 18; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), red); b.position.set(-W / 2 - 0.4 + (i / 18) * (W + 0.8), 0.8 + H1 + 0.4, z); g.add(b); }
  }
  // 2층 창살 벽 (안쪽, 밝은 창호지)
  const lat = lattice('#9c2f24'); lat.wrapS = THREE.RepeatWrapping; lat.repeat.set(3, 1);
  const win = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, H2 - 0.5, D - 0.6), new THREE.MeshStandardMaterial({ map: lat, roughness: 0.8 })); win.position.y = 0.8 + H1 + 0.25 + (H2 - 0.5) / 2; g.add(win);
  // 단청 들보
  const dc = dancheong('#2f7d6d', '#c8443a'); dc.wrapS = THREE.RepeatWrapping; dc.repeat.set(3, 1);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.6, D + 0.6), new THREE.MeshStandardMaterial({ map: dc, roughness: 0.7 })); beam.position.y = 0.8 + H1 + H2 + 0.3; g.add(beam);
  // 지붕
  const roofGeo = roofGeometry(W / 2 + 2.2, D / 2 + 2.0, 2.6, 0.5);
  const tiles = roofTiles(); tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ map: tiles, color: '#8a8f96', roughness: 0.8 })); roof.position.y = 0.8 + H1 + H2 + 0.6; roof.castShadow = true; g.add(roof);
  const under = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#2f7d6d', side: THREE.BackSide })); under.position.y = roof.position.y - 0.05; g.add(under);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry((W / 2 + 2.2) * 2 * 0.5, 0.35, 0.4), mat('#3a3d42')); ridge.position.y = roof.position.y + 2.7; g.add(ridge);
  g.scale.setScalar(scale);
  return g;
}

// 햇빛 받은 화강암 바위산 (백암산·금산 같은): 울퉁불퉁 봉우리, 위쪽은 노을빛, 아래는 숲에 묻혀요
function granitePeak(seed, height, width, { warm = '#e6bf83', rock = '#a99c88', shade = '#5f5850', forest = '#56602f' } = {}) {
  // 땅처럼 높이를 깎아 만든 바위 산덩이: 가파른 곳은 바위(해 드는 쪽은 금빛), 완만한 곳은 단풍 숲
  const seg = 140, geo = new THREE.PlaneGeometry(width * 2, width * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, r = rng(seed), ox = r() * 300, oz = r() * 300;
  const ridged = (x, z) => { let v = 0, w = 1, f = 1; for (let k = 0; k < 5; k++) { v += w * (1 - Math.abs(noise((x + ox) * f, (z + oz) * f) / 1.9)) ** 2; w *= 0.5; f *= 2.05; } return v / 1.94; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x / width, z / (width * 0.8));
    const core = Math.max(0, 1 - d) ** 1.3;
    let y = height * core * (0.55 + 0.65 * ridged(x * 0.9, z * 0.9));
    y += 2.5 * Math.sin(y * 0.35 + noise(x * 2, z * 2) * 2) * smooth(0.4, 0.9, core);   // 바위 결 (위쪽만)
    p.setY(i, y - 4);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, cols = [];
  const cW = new THREE.Color(warm), cR = new THREE.Color(rock), cS = new THREE.Color(shade), cF = new THREE.Color(forest), cA = new THREE.Color('#a8552a'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), steep = 1 - nrm.getY(i);
    const sun = Math.max(0, nrm.getX(i) * 0.5 + nrm.getY(i) * 0.3 - nrm.getZ(i) * 0.6);
    // 아래쪽 2/3은 단풍 숲(노랑·주황·초록 얼룩), 위쪽과 아주 가파른 곳만 바위
    const fall = ['#c98a2e', '#a8552a', '#7d8a3a', '#d9a640', '#8f3a22'];
    c.copy(cF).lerp(new THREE.Color(fall[Math.floor((noise(x * 4 + 3, z * 4) + 2) * 1.24) % 5]), 0.4).lerp(new THREE.Color('#7a7350'), 0.25);
    c.lerp(cR, Math.max(smooth(0.36, 0.52, y / height + noise(x * 2, z * 2) * 0.08), smooth(0.8, 0.95, steep)));
    c.lerp(cW, sun * smooth(0.3, 0.9, y / height) * 0.9).lerp(cS, smooth(0.65, 0.95, steep) * 0.6);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  return m;
}

// 금산 같은 둥근 화강암 바위: 매끈한 덩어리에 세로로 흘러내린 검은 물때 자국
function boulder(seed, size) {
  const r = rng(seed), geo = new THREE.IcosahedronGeometry(1, 3), p = geo.attributes.position, cols = [];
  const ph = [r() * 9, r() * 9, r() * 9], base = new THREE.Color('#bdb3a2'), dark = new THREE.Color('#5c574f'), lichen = new THREE.Color('#8f9470'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 2.1 + ph[0]) * Math.sin(z * 1.7 + ph[1]) + 0.1 * Math.sin(y * 3 + ph[2]);
    x *= k * (1 + r() * 0.03); z *= k; y = y * k * 0.85;
    p.setXYZ(i, x * size, y * size, z * size);
    const streak = Math.max(0, Math.sin(Math.atan2(z, x) * 11 + ph[0])) ** 6 * smooth(0.6, -0.4, y);
    c.copy(base).offsetHSL(0, 0, (r() - 0.5) * 0.05).lerp(dark, streak * 0.7).lerp(lichen, smooth(-0.2, -0.8, y) * 0.5);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  m.castShadow = true; m.receiveShadow = true; m.rotation.y = r() * 6;
  return m;
}

// 해수관음상: 연꽃 받침 위에 선 하얀 관음보살 (보관 · 두광 · 정병)
function gwaneum() {
  const g = new THREE.Group(), w = mat('#e8e4da', { roughness: 0.7 }), sh = mat('#cfc9bc', { roughness: 0.8 });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1.2, 16), sh); ped.position.y = 0.6; g.add(ped);
  for (let i = 0; i < 12; i++) { const pt = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), w); const a = i / 12 * Math.PI * 2; pt.position.set(Math.cos(a) * 1.25, 1.2, Math.sin(a) * 1.25); pt.scale.set(0.7, 0.9, 1.2); pt.lookAt(0, 1.2, 0); g.add(pt); }
  const robe = new THREE.Mesh(new THREE.LatheGeometry([[0.9, 0], [0.85, 0.6], [0.7, 2.2], [0.6, 3.4], [0.72, 4.2], [0.5, 4.6], [0.25, 4.75]].map(([x, y]) => new THREE.Vector2(x, y)), 20), w);
  robe.position.y = 1.3; g.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), w); head.position.y = 6.45; head.scale.set(0.9, 1.1, 0.95); g.add(head);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.55, 10), sh); crown.position.y = 6.95; g.add(crown);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 32), sh); halo.position.set(0, 6.5, -0.45); g.add(halo);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.4, 4, 8), w); arm.position.set(s * 0.62, 4.9, 0.25); arm.rotation.set(0.6, 0, s * 0.15); g.add(arm); }
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 0.5, 10), sh); bottle.position.set(0.7, 4.3, 0.75); g.add(bottle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(1.1);
  return g;
}

// 단풍나무 한 그루를 크게: 작은 잎 덩어리 수십 개를 겹쳐 붉은·주황·노랑이 섞이게 (화면 가까이 액자처럼 두는 나무)
function heroMaple(seed, size = 1, palette = ['#b8261c', '#d8432a', '#e8762e', '#f2a83a', '#c9381f', '#9c2a1e']) {
  const r = rng(seed), g = new THREE.Group();
  const trunkM = mat('#3e2c22');
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 5, 7), trunkM); trunk.position.y = 2.5; trunk.rotation.z = (r() - 0.5) * 0.3; g.add(trunk);
  const clumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), 70);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 4.2, y = 5 + r() * 3.2 - rad * 0.35;
    v.set(Math.cos(a) * rad, y, Math.sin(a) * rad * 0.8);
    e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e);
    const k = 0.7 + r() * 0.9; sc.set(k, k * 0.75, k);
    M.compose(v, q, sc); clumps.setMatrixAt(i, M);
    c.set(palette[Math.floor(r() * palette.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.08);
    clumps.setColorAt(i, c);
  }
  clumps.castShadow = true;
  g.add(clumps);
  // 가지 몇 개
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 3, 5), trunkM); b.position.set(0, 4.6, 0); b.rotation.set((r() - 0.5) * 1.6, r() * 3, (r() - 0.5) * 1.6); b.translateY(1.2); g.add(b); }
  g.scale.setScalar(size);
  return g;
}

// 당포성 팽나무: 짧고 굵은 줄기가 서너 갈래로 벌어지고, 납작하게 넓게 퍼진 우산 모양 잎
function loneTree() {
  const r = rng(404), g = new THREE.Group(), bark = mat('#2e2620');
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 4.2, 9), bark); trunk.position.y = 2.1; trunk.castShadow = true; g.add(trunk);
  const tips = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.6, lean = 0.55 + r() * 0.35, len = 5 + r() * 2.5;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.55, len, 7), bark);
    limb.position.set(0, 3.8, 0); limb.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean); limb.translateY(len / 2); limb.castShadow = true; g.add(limb);
    const tip = new THREE.Vector3(0, len, 0).applyEuler(limb.rotation).add(new THREE.Vector3(0, 3.8, 0)); tips.push(tip);
  }
  const n = 420, leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), n);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const pal = ['#2f4a2c', '#3a5733', '#28402a', '#456337', '#34502f'];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 9.5, y = 8.6 + (1 - (rad / 9.5) ** 2) * 2.6 + (r() - 0.5) * 1.6;
    v.set(Math.cos(a) * rad, y, Math.sin(a) * rad * 0.85);
    e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e);
    const k = 0.8 + r() * 0.9; sc.set(k * 1.3, k * 0.75, k * 1.3);
    M.compose(v, q, sc); leaves.setMatrixAt(i, M);
    c.set(pal[Math.floor(r() * pal.length)]); leaves.setColorAt(i, c);
  }
  leaves.castShadow = true; g.add(leaves);
  return g;
}
// 비치는 물: 거울(Reflector) 위에 얇은 물빛을 한 겹 덮어 너무 거울 같지 않게
function mirrorWater(geo, tint = '#5d7464', opacity = 0.35) {
  const g = new THREE.Group();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const mirror = new Reflector(geo, { textureWidth: Math.round(innerWidth * dpr * 0.6), textureHeight: Math.round(innerHeight * dpr * 0.6), color: '#9aa39a', clipBias: 0.003 });
  mirror.rotation.x = -Math.PI / 2; g.add(mirror);
  const film = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity, roughness: 0.2, metalness: 0.1, depthWrite: false }));
  film.rotation.x = -Math.PI / 2; film.position.y = 0.02; g.add(film);
  return g;
}

// ───────── 내부 ─────────
export function buildInterior(loc) {
  const c = loc.interior;
  const g = new THREE.Group();
  // 불상 쪽(뒤) 16, 입구 쪽(앞) 20. 방석 100개가 들어가도록 앞으로 길게 늘였다
  const HW = 13, HD = 16, HF = 20, CEIL = 9;
  const L = HD + HF, ZC = (HF - HD) / 2;

  const floorTex = woodFloor(c.floor);
  floorTex.repeat.set(6, 9);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, L), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = ZC; floor.receiveShadow = true; g.add(floor);

  // 벽: 아래는 나무 판벽, 위는 회벽. 양옆 벽에는 창호
  const plaster = new THREE.MeshStandardMaterial({ color: c.wall, roughness: 0.95 });
  const wood = mat('#5a3826');
  const wall = (w, h, x, y, z, ry, material = plaster) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m;
  };
  wall(HW * 2, CEIL, 0, CEIL / 2, -HD, 0);
  wall(HW * 2, CEIL, 0, CEIL / 2, HF, Math.PI);
  wall(L, CEIL, -HW, CEIL / 2, ZC, Math.PI / 2);
  wall(L, CEIL, HW, CEIL / 2, ZC, -Math.PI / 2);
  wall(L, 1.2, -HW + 0.02, 0.6, ZC, Math.PI / 2, wood);
  wall(L, 1.2, HW - 0.02, 0.6, ZC, -Math.PI / 2, wood);
  wall(HW * 2, 1.2, 0, 0.6, HF - 0.02, Math.PI, wood);

  // 창: 기둥 사이를 거의 다 쓰는 큰 창(판벽 위 ~ 들보 아래). 긴 파노라마 한 장이 창을 따라 이어져요
  const pano = panoramaTex(loc);
  const frameMat = new THREE.MeshStandardMaterial({ map: openLattice(c.pillar), transparent: true, alphaTest: 0.4 });
  const BAYS = [[-14, 3.2], [-7.5, 8], [1.5, 8], [10.5, 8], [17.5, 4]];   // [가운데 z, 너비]
  const WY = 4.55, WH = 6.1;
  for (const s of [-1, 1]) for (const [z, w] of BAYS) {
    // 불상 바로 옆 칸은 창 대신 비천 벽화 (양쪽이 마주 보며 날아요)
    const t = panoClone(loc);
    // 안에서 보면 왼쪽 벽은 -z 쪽으로, 오른쪽 벽은 +z 쪽으로 그림이 이어져요. 왼쪽 벽은 그림 앞 절반, 오른쪽 벽은 뒤 절반
    const u = s < 0 ? (HF - (z + w / 2)) / L : (z - w / 2 + HD) / L;
    t.repeat.set(w / L / 2, 1); t.offset.set((s < 0 ? 0 : 0.5) + u / 2, 0); t.needsUpdate = true;
    const v = wall(w, WH, s * (HW - 0.03), WY, z, -s * Math.PI / 2, viewMat(t));
    const f = wall(w, WH, s * (HW - 0.06), WY, z, -s * Math.PI / 2, frameMat);
    v.receiveShadow = f.receiveShadow = false;
  }
  // 입구 문 (밖으로 나가는 곳)
  const doorTex = lattice(c.pillar);
  const exitDoor = wall(5, 5, 0, 2.5, HF - 0.05, Math.PI, new THREE.MeshStandardMaterial({ map: doorTex, emissive: '#ffe9c0', emissiveIntensity: 0.15 }));

  // 기둥과 들보
  const pillarMat = mat(c.pillar);
  const dc = dancheong(c.beam, c.accent); dc.wrapS = THREE.RepeatWrapping; dc.repeat.set(5, 1);
  const beamMat = new THREE.MeshStandardMaterial({ map: dc, roughness: 0.7 });
  const PZ = [-12, -3, 6, 15];
  for (const x of [-11.7, 11.7]) for (const z of PZ) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, CEIL, 18), pillarMat);
    p.position.set(x, CEIL / 2, z); p.castShadow = true; g.add(p);
  }
  for (const z of PZ) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.9, 0.7), beamMat); b.position.set(0, CEIL - 0.6, z); g.add(b);
  }
  for (const x of [-11.7, 11.7]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, L), beamMat); b.position.set(x, CEIL - 0.6, ZC); g.add(b);
  }
  // 우물천장
  const ceilTex = canvasTex(256, 256, (cg, w, h) => {
    cg.fillStyle = c.beam; cg.fillRect(0, 0, w, h);
    cg.fillStyle = '#f2e7c9'; cg.fillRect(10, 10, w - 20, h - 20);
    cg.fillStyle = c.beam; cg.fillRect(18, 18, w - 36, h - 36);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cg.fillStyle = i % 2 ? c.accent : '#f0c05a';
      cg.beginPath(); cg.ellipse(128 + Math.cos(a) * 42, 128 + Math.sin(a) * 42, 36, 16, a, 0, Math.PI * 2); cg.fill();
    }
    cg.fillStyle = '#f2e7c9'; cg.beginPath(); cg.arc(128, 128, 22, 0, Math.PI * 2); cg.fill();
  }, [9, 12]);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, L), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CEIL, ZC); g.add(ceil);

  // 수미단과 불상, 탱화
  const altar = new THREE.Group();
  altar.position.set(0, 0, -12.8);
  const altarMat = new THREE.MeshStandardMaterial({ map: dancheong('#5a2a1e', c.accent), roughness: 0.6 });
  const sumi = new THREE.Mesh(new THREE.BoxGeometry(9, 1.3, 3.6), altarMat);
  sumi.position.y = 0.65; sumi.castShadow = sumi.receiveShadow = true; altar.add(sumi);
  const top = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.15, 3.9), mat('#3b1f16')); top.position.y = 1.35; altar.add(top);
  // 불상은 어느 것을 모셔도 1.3배 크게 (자리 전체를 키운다), 광배도 함께 키워 천장 아래에 맞춘다
  const buddhaSlot = new THREE.Group();
  buddhaSlot.position.set(0, 1.42, -0.2);
  buddhaSlot.scale.setScalar(1.3);
  const buddha = buildBuddha();
  buddha.scale.setScalar(1.15);
  buddhaSlot.add(buddha);
  altar.add(buddhaSlot);
  const halo = mandorla(); halo.position.set(0, 1.5, -1.5); halo.scale.setScalar(1.15); altar.add(halo);
  // 촛대, 꽃병, 향로
  const candle = (x) => {
    const cg = new THREE.Group();
    cg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 12), gold()));
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 12), mat('#f6efe0')); wax.position.y = 0.55; cg.add(wax);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
    flame.scale.y = 1.8; flame.position.y = 0.86; cg.add(flame);
    cg.userData.flame = flame;
    cg.position.set(x, 1.78, 1.35);
    altar.add(cg);
    const light = new THREE.PointLight(c.lamp, 2.2, 8, 1.6);
    light.position.set(x, 2.9, 1.6); altar.add(light);
    return flame;
  };
  const flames = [candle(-2.6), candle(2.6)];
  for (const x of [-3.6, 3.6]) {
    const vase = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat('#6f9a8c', { roughness: 0.3 }));
    vase.scale.y = 1.3; vase.position.set(x, 1.8, 1.0); altar.add(vase);
    for (let i = 0; i < 5; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(['#f2f0ea', '#f3b6c4', '#f2d27a'][i % 3]));
      fl.position.set(x + Math.sin(i * 1.3) * 0.25, 2.35 + (i % 2) * 0.2, 1.0 + Math.cos(i * 1.3) * 0.15); altar.add(fl);
    }
  }
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.35, 16), gold());
  burner.position.set(0, 1.62, 1.5); altar.add(burner);
  g.add(altar);

  // 뒷벽: 차분한 비단 바탕에 단청 테두리. 불화 출처: 아미타팔대보살도 F1906.269 · 수월관음도 F1904.13 (스미소니언 국립아시아미술관, CC0)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(22, 8.4), new THREE.MeshStandardMaterial({ map: taenghwa(), roughness: 0.9 }));
  back.position.set(0, 4.6, -HD + 0.04); g.add(back);
  // 불상 양옆 뒷벽에 고려 불화 두 점: 왼쪽 「아미타팔대보살도」, 오른쪽 「수월관음도」(관음이 불상 쪽을 바라봐요)
  const hangPainting = (file, aspect, x) => {
    const t = new THREE.TextureLoader().load(file); t.colorSpace = THREE.SRGBColorSpace;
    const PH = 7.4, PW = PH * aspect, y = 4.7;
    const f1 = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.6, PH + 0.5), mat('#2f7d6d')); f1.position.set(x, y, -HD + 0.06); g.add(f1);
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.3, PH + 0.22), mat('#c9a24a')); f2.position.set(x, y, -HD + 0.07); g.add(f2);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })); p.position.set(x, y, -HD + 0.08); g.add(p);
  };
  hangPainting('assets/amita-palbosal.jpg', 821 / 1540, -7.4);
  hangPainting('assets/suwol-gwaneum.jpg', 540 / 1080, 7.4);

  // 부처님 비추는 조명
  const spot = new THREE.SpotLight('#fff1d6', 120, 30, 0.5, 0.6, 1.5);
  spot.position.set(0, 8.5, -4);
  spot.target.position.set(0, 3, -13);
  g.add(spot, spot.target);

  // 방석 100개 (10줄 × 가운데 통로 양쪽 5개씩). 한 번에 그리도록 InstancedMesh
  const cushions = [];
  const cols = [-9.9, -7.85, -5.8, -3.75, -1.7, 1.7, 3.75, 5.8, 7.85, 9.9];
  const cushionMesh = new THREE.InstancedMesh(cushionGeo(1.15, 0.13), cushionMat('#6e2c27', '#c9a24a', '#e8b8a0'), cols.length * 10);
  const M = new THREE.Matrix4();
  for (let r = 0; r < 10; r++) for (const x of cols) {
    const z = -5.6 + r * 2.0;
    const id = cushions.length;
    M.makeTranslation(x, 0.065, z);
    cushionMesh.setMatrixAt(id, M);
    cushions.push({ id, pos: new THREE.Vector3(x, 0, z), rot: Math.PI, y: 0.12 });
  }
  cushionMesh.receiveShadow = true;
  cushionMesh.userData.seats = 'cushion';
  g.add(cushionMesh);

  // 복전함 (불전함)
  const box = new THREE.Group();
  box.position.set(0, 0, -8.4);
  const boxBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 0.9), new THREE.MeshStandardMaterial({ map: dancheong('#6b2c22', '#f0c05a'), roughness: 0.6 }));
  boxBody.position.y = 0.55; boxBody.castShadow = true; box.add(boxBody);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.0), mat('#3b1f16')); lid.position.y = 1.15; box.add(lid);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.1), mat('#0d0806')); slot.position.y = 1.21; box.add(slot);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.36), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 100, (cg, w, h) => {
      cg.fillStyle = '#f3e6c3'; cg.fillRect(0, 0, w, h);
      cg.fillStyle = '#5a1a14'; cg.font = `700 56px ${FONT_TITLE}`; cg.textAlign = 'center'; cg.textBaseline = 'middle';
      cg.fillText('복전함', w / 2, h / 2 + 4);
    }),
  }));
  label.position.set(0, 0.62, 0.46); box.add(label);
  box.userData.donation = true;
  box.traverse((o) => { o.userData.donation = true; });
  g.add(box);

  // 연등: 천장 아래 줄지어 매달기
  const lanternRoot = new THREE.Group();
  g.add(lanternRoot);
  const lanternSlots = [];
  for (let r = 0; r < 7; r++) for (let k = 0; k < 10; k++) {
    lanternSlots.push(new THREE.Vector3(-9 + k * 2, 6.6 + ((k + r) % 2) * 0.25, -9 + r * 3.6));
  }
  const decoColors = ['#f08aa0', '#f2c45a', '#f6f2e8', '#9ad0a8', '#f2a05a'];
  const rr = rng(11);
  for (let i = 0; i < 26; i++) {
    const idx = Math.floor(rr() * lanternSlots.length);
    const l = buildLantern(decoColors[i % decoColors.length], 0.7);
    l.position.copy(lanternSlots[idx]);
    lanternRoot.add(l);
  }

  const hemi = new THREE.HemisphereLight('#fff4e2', '#3a2a20', 0.9);
  g.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d8', 1.4);
  sun.position.set(8, 14, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  sun.target.position.set(0, 0, ZC);
  g.add(sun, sun.target);

  return {
    group: g,
    floor,
    cushions,
    donationBox: box,
    lanternRoot,
    lanternSlots,
    flames,
    buddhaSlot,
    exitDoor,
    spawn: new THREE.Vector3(0, 0, 15),
    spawnRot: Math.PI,
    exitZ: HF - 1.4,
    camDist: 4.2,
    camLookY: 1.8, // 불상이 커서 카메라 높이는 그대로 두고 시선만 조금 위로
    seats: cushions,
    bounds: { minX: -HW + 0.8, maxX: HW - 0.8, minZ: -HD + 0.8, maxZ: HF - 0.8 },
    blockers: [{ minX: -5, maxX: 5, minZ: -16, maxZ: -10.6 }, { minX: -0.95, maxX: 0.95, minZ: -8.95, maxZ: -7.85 }],
    fog: null,
    background: new THREE.Color('#1c1410'),
  };
}

// ───────── 외부 ─────────
const R0 = 22;

const RW = -34;   // 두물머리 강물 높이 (마당에서 내려다보이게)
function heightFn(id) {
  if (id === 'forest') {
    return (x, z) => {
      const d = Math.hypot(x, z);
      let h = -24 * smooth(R0, R0 + 70, d) + noise(x, z) * 5 * smooth(R0, R0 + 20, d);
      h += 70 * smooth(160, 320, d) * (0.6 + 0.4 * noise(x * 0.5, z * 0.5));
      if (z < -10) h += Math.max(0, -z - 30) * 0.45;
      // 앞쪽 골짜기: 단풍 연못과 누각이 있는 평평한 터 (백양사 쌍계루처럼)
      const pe = Math.hypot(x / 34, (z - 66) / 26);
      if (pe < 1.6) h = h + (-2.6 - h) * smooth(1.6, 1.0, pe);
      return h;
    };
  }
  if (id === 'river') {
    // 수종사(운길산 중턱)에서 내려다보는 두물머리: 앞쪽으로 숲 비탈이 내려가고, 아래로 넓은 두 강이 만나 흘러가요.
    // 강 건너는 둥글고 낮은 산이 겹겹이
    const arms = riverPaths();
    return (x, z) => {
      const d = Math.hypot(x, z);
      let h = RW * Math.pow(smooth(R0 - 2, R0 + 140, d), 0.5) + noise(x, z) * 5 * smooth(R0, R0 + 30, d);
      // 마당 뒤: 풀밭 너머로 당포성 흙 성벽이 길게 솟고, 그 뒤는 임진강 벼랑이라 하늘만 트여요
      if (z < 0) {
        const zr = rampartZ(x), dz = z - zr;
        const meadow = (-1.2 + noise(x, z) * 1.4) * smooth(R0, R0 + 16, d);
        const crest = 8 * Math.exp(-(dz * dz) / (2 * 12 * 12)) * smooth(200, 130, Math.abs(x - 10));
        const fall = RW * 0.6 * smooth(-18, -70, dz);
        h = h + (meadow + crest + fall - h) * smooth(-2, -14, z);
      }
      if (d > 120) {
        const rd = distToPaths(x, z, arms);
        // 강에서 멀어질수록 둥근 산 (높이는 낮게)
        const hill = RW + smooth(50, 160, rd) * (12 + 26 * (0.5 + 0.5 * noise(x * 0.35, z * 0.35)));
        h = h + (hill - h) * smooth(110, 200, d);
        if (rd < 48) h = Math.min(h, RW - 0.5);
        else if (rd < 70) h = Math.min(h, RW + (rd - 48) * 0.3);
        // 두 물이 만나는 곳의 작은 섬
        const ci = Math.exp(-((x + 20) ** 2 + (z - 200) ** 2) / 260);
        h = Math.max(h, RW + ci * 5);
      }
      if (z < -20 && z - rampartZ(x) < -14) h = Math.min(h, -6 - (rampartZ(x) - z - 14) * 0.3);
      return h;
    };
  }
  // sea
  // 보리암(금산)처럼: 절은 산꼭대기, 숲 덮인 산줄기 두 갈래가 바다로 흘러내리고 그 사이 만에 초승달 모래사장, 앞바다엔 섬들
  const islands = [[120, 330, 30], [-150, 360, 42], [250, 420, 52], [-40, 470, 34], [40, 400, 16], [-300, 300, 36], [330, 300, 30], [130, 560, 60], [-230, 520, 48]];
  return (x, z) => {
    const d = Math.hypot(x, z);
    // 앞쪽은 가파른 절벽 대신 숲 비탈이 길게 내려가요
    let h = -60 * Math.pow(smooth(R0 - 1, R0 + 150, d), 0.45) + noise(x * 1.6, z * 1.6) * 6 * smooth(R0, R0 + 12, d);
    // 양쪽 산줄기: 늘 마당보다 낮게, 바다 쪽으로 갈수록 내려가요
    if (z > 0 && d > R0) for (const sx of [-1, 1]) {
      const off = x * sx - (55 + z * 0.5), gk = Math.exp(-(off * off) / (2 * 28 * 28));
      const crest = -8 - (d - R0) * 0.3 + noise(x * 2, z * 2) * 3;
      h = Math.max(h, crest - (1 - gk) * 60);
    }
    // 만: 가운데 아래쪽은 바다까지 오목하게
    if (z > 120) h = Math.min(h, -62 + Math.abs(x + 10) * 0.12 + Math.max(0, 200 - z) * 0.3);
    if (z < -26) h += 60 * smooth(-26, -110, z) + noise(x, z) * 8 * smooth(-26, -50, z);
    for (const [ix, iz, r] of islands) {
      const k = Math.exp(-((x - ix) ** 2 + (z - iz) ** 2) / (2 * r * r));
      h = Math.max(h, -60 + k * (r * 0.9) + noise(x, z) * 3 * k);
    }
    return h;
  };
}

// 당포성 성벽 마루선: 양 끝이 마당 쪽으로 살짝 휘어 감싸요
export const rampartZ = (x) => -84 + x * x * 0.0024;

function riverPaths() {
  // 북한강(왼쪽)과 남한강(오른쪽)이 앞쪽 아래에서 만나 한강이 되어 멀리 흘러가요
  const left = [], right = [], main = [];
  for (let t = 0; t <= 1; t += 0.05) {
    left.push([-600 + t * 590 + Math.sin(t * 4) * 30, 120 + t * 60]);
    right.push([600 - t * 610 + Math.sin(t * 3 + 1) * 30, 260 - t * 80]);
    main.push([-10 + Math.sin(t * 2.4) * 80, 180 + t * 700]);
  }
  return [left, right, main];
}
function distToPaths(x, z, paths) {
  let best = Infinity;
  for (const p of paths) for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

function terrain(id) {
  const size = 900, seg = 180;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const h = heightFn(id);
  const p = geo.attributes.position;
  const colors = [];
  const grass = new THREE.Color(id === 'forest' ? '#7a8f4a' : id === 'river' ? '#6f8a52' : '#3f6237');   // 남해 섬은 상록수 숲이라 짙게
  const rock = new THREE.Color('#8b8378');
  const sand = new THREE.Color('#cdbb94');
  const autumn = new THREE.Color('#b4703a');
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = h(x, z);
    p.setY(i, y);
    const d = Math.hypot(x, z);
    tmp.copy(grass);
    if (id === 'forest') tmp.lerp(autumn, 0.35 + 0.3 * noise(x * 0.7, z * 0.7));
    if (d > R0 && d < R0 + 30 && id !== 'forest') tmp.lerp(rock, 0.6);
    if (id === 'sea' && y < -56) tmp.copy(sand);
    if (id === 'river' && y < RW + 3) tmp.copy(sand);
    if (d < R0 - 1) tmp.set('#b3a88f');
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.computeVertexNormals();
  // 비탈이 가파른 곳은 바위색, 골짜기는 조금 짙게, 군데군데 얼룩
  const nrm = geo.attributes.normal, shadeC = new THREE.Color('#3e4a32');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z);
    if (d < R0 - 1) continue;
    tmp.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    const steep = 1 - nrm.getY(i);
    if (!(id !== 'forest' && p.getY(i) < -55)) tmp.lerp(rock, smooth(0.18, 0.5, steep) * 0.75);
    tmp.lerp(shadeC, 0.12 + 0.12 * noise(x * 1.9 + 7, z * 1.9 - 3));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  return { mesh: m, h };
}

function scatterTrees(h, count, seed, { minD = R0 + 3, maxD = 260, autumn = true, skip } = {}) {
  const r = rng(seed), G = treeGeos();
  const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  const pine = new THREE.InstancedMesh(G.pine, tm, count), leaf = new THREE.InstancedMesh(G.leaf, tm, count);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
  const greens = ['#2f5a3c', '#3a6644', '#28503a', '#46704a', '#355e3e'];
  const palette = autumn ? ['#c0552f', '#e0a03a', '#a33b2a', '#d8b14a', '#c7792f', '#e07a3a', '#8f9a3e', '#b8452c'] : ['#4f7a45', '#5f8a4a', '#3f6a3f', '#6b9152', '#486f43'];
  const c = new THREE.Color();
  let np = 0, nl = 0;
  for (let i = 0; i < count * 3 && (np < count || nl < count); i++) {
    // 가까운 곳은 드문드문, 먼 산비탈은 빽빽하게 (무리 지어)
    const a = r() * Math.PI * 2, d = minD + Math.pow(r(), 0.7) * (maxD - minD);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (skip && skip(x, z)) continue;
    if (noise(x * 0.6, z * 0.6) < -0.7 && r() < 0.6) continue;   // 숲 사이 빈터
    const y = h(x, z);
    const sc = (0.75 + r() * 0.85) * (1 + Math.min(1, d / 300) * 0.35);
    e.set((r() - 0.5) * 0.08, r() * Math.PI * 2, (r() - 0.5) * 0.08); q.setFromEuler(e);
    const isPine = r() < (autumn ? 0.4 : 0.55);
    s.set(sc, sc * (isPine ? 0.9 + r() * 0.5 : 0.85 + r() * 0.3), sc);
    v.set(x, y - 0.2, z); M.compose(v, q, s);
    // 멀리 있을수록 색이 하늘빛에 살짝 묻히도록 조금 흐리게
    const far = Math.min(1, d / 320) * 0.25;
    if (isPine) { if (np >= count) continue; c.set(greens[Math.floor(r() * greens.length)]).lerp(new THREE.Color('#8fa59a'), far); pine.setMatrixAt(np, M); pine.setColorAt(np++, c); }
    else { if (nl >= count) continue; c.set(palette[Math.floor(r() * palette.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.06).lerp(new THREE.Color('#c9b9a0'), far); leaf.setMatrixAt(nl, M); leaf.setColorAt(nl++, c); }
  }
  pine.count = np; leaf.count = nl;
  for (const m of [pine, leaf]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  const g = new THREE.Group(); g.add(pine, leaf);
  return g;
}

export function buildExterior(loc) {
  const g = new THREE.Group();
  const sky = skyDomeHQ(loc.sky[0], loc.sky[1], { clouds: loc.night ? 0.12 : loc.id === 'sea' ? 0.45 : 0.6, milky: loc.night ? 1 : 0 });
  g.add(sky, mountainLayers(loc));
  const { mesh: ground, h } = terrain(loc.id);
  g.add(ground);

  // 마당: 돌판 원
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(R0 - 1, 48), new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true; g.add(plaza);

  const hall = buildHallBuilding(loc);
  hall.position.set(0, 0, -9);
  g.add(hall);
  const door = hall.userData.door.clone().add(hall.position);

  const animated = [];
  const pagodaPos = new THREE.Vector3(-12, 0, 6); // 디자인마다 아래에서 자리를 정한다
  const isSky = (x, z) => Math.hypot(x, z) < R0 + 2;
  if (loc.id === 'forest') {
    // 연못 둘레와 마당에서 연못까지 가는 길에는 나무를 두지 않아요 (연못·누각이 보이게)
    const pondGap = (x, z) => Math.hypot(x / 40, (z - 62) / 34) < 1 || (z > 18 && z < 50 && Math.abs(x) < 20);
    g.add(scatterTrees(h, 1100, 5, { maxD: 330, skip: pondGap }));
    // 단풍 연못 · 누각 · 바위산 (백양사 쌍계루 풍경처럼)
    const pondGeo = new THREE.CircleGeometry(1, 64); pondGeo.scale(30, 18, 1);
    const pond = mirrorWater(pondGeo, '#4e6656', 0.3); pond.position.set(0, -2.25, 64); g.add(pond);
    // 연못가 돌
    const rr = rng(13), pondStone = mat('#8f877a');
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rr() * 0.6, 0), rr() < 0.5 ? pondStone : mat('#a39b8c'));
      st.position.set(Math.cos(a) * 30.5, -2.4 + rr() * 0.3, 64 + Math.sin(a) * 18.5); st.rotation.set(rr() * 3, rr() * 3, rr() * 3); st.scale.y = 0.5; st.receiveShadow = true; g.add(st);
    }
    const pav = pavilion(1.35); pav.position.set(0, -2.6, 86); pav.rotation.y = Math.PI; g.add(pav);
    // 누각 옆 단풍 (붉은 · 노랑 · 연두가 섞이게)
    const autumnMix = [['#b8261c', '#d8432a', '#c9381f', '#e8762e'], ['#f2c23a', '#e8a82e', '#d9b44a', '#c7d06a'], ['#d8432a', '#f2a83a', '#9c2a1e', '#e8762e'], ['#8fae4a', '#b8c45a', '#e0b53a', '#6f9a3e']];
    [[-24, 80, 1.5, 0], [22, 82, 1.4, 1], [-36, 62, 1.3, 2], [36, 60, 1.4, 3], [-14, 92, 1.2, 1], [14, 94, 1.25, 2], [-30, 44, 1.2, 0], [30, 46, 1.1, 1]].forEach(([x, z, k, p], i) => {
      const t = heroMaple(30 + i, k, autumnMix[p]); t.position.set(x, h(x, z) - 0.3, z); t.rotation.y = i; g.add(t);
    });
    // 마당 양쪽 가까이 액자처럼 늘어진 붉은 단풍
    for (const [x, z, k] of [[-19, 26, 1.25], [19, 27, 1.15]]) { const t = heroMaple(70 + x, k); t.position.set(x, h(x, z), z); g.add(t); }
    // 뒤쪽 햇빛 받은 바위 봉우리
    const peak = granitePeak(8, 120, 90); peak.position.set(10, h(10, 280) - 6, 280); peak.rotation.y = Math.PI; g.add(peak);
    const peak2 = granitePeak(9, 75, 70, { warm: '#d9b98a' }); peak2.position.set(-110, h(-110, 240) - 6, 240); peak2.rotation.y = Math.PI; g.add(peak2);
    // 수목원 온실
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#cfe7ee', transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2 }));
    dome.position.set(55, h(55, 70), 70); g.add(dome);
    const ribs = new THREE.Mesh(new THREE.SphereGeometry(9.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2f2ee', wireframe: true }));
    ribs.position.copy(dome.position); g.add(ribs);
    pagodaPos.set(-12, 0, 6);
  }
  if (loc.id === 'river') {
    g.add(scatterTrees(h, 1500, 9, { minD: R0 + 4, maxD: 640, autumn: true, skip: (x, z) => h(x, z) < RW + 4 || (z > 0 && Math.hypot(x, z) < R0 + 34 && Math.abs(x) < z * 0.8) || (loc.night && z < 0 && Math.abs(x) < 170) }));
    const paths = riverPaths();
    // 강물: 하늘을 비추는 잔잔한 물 (가까운 곳은 조금 짙게)
    const rGeo = new THREE.PlaneGeometry(2400, 2400, 40, 40); rGeo.rotateX(-Math.PI / 2);
    const rp = rGeo.attributes.position, rc = [], cN = new THREE.Color('#6f93a3'), cF = new THREE.Color('#c9d8dc'), tc = new THREE.Color();
    for (let i = 0; i < rp.count; i++) { tc.copy(cN).lerp(cF, smooth(150, 900, Math.hypot(rp.getX(i), rp.getZ(i)))); rc.push(tc.r, tc.g, tc.b); }
    rGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    const river = new THREE.Mesh(rGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.3 }));
    river.position.y = RW + 0.4; g.add(river);
    // 두물머리 400년 느티나무 (물 만나는 곳)
    const [mx, mz] = paths[2][0];
    const zel = heroMaple(55, 2.4, ['#b8862f', '#c99a3a', '#a7762a', '#d4ab4a']); zel.position.set(mx + 30, h(mx + 30, mz - 30) + 0.2, mz - 30); g.add(zel);
    // 수종사 은행나무: 마당 가장자리에 금빛으로 크게
    const ginkgo = ['#f2c94c', '#f6d65a', '#e8b83a', '#f9e27a', '#d9a62e'];
    if (!loc.night) {
      const gk = heroMaple(77, 1.9, ginkgo); gk.position.set(-25, h(-25, 10), 10); g.add(gk);
      const gk2 = heroMaple(78, 1.4, ginkgo); gk2.position.set(26, h(26, -2), -2); g.add(gk2);
    } else {
      // 당포성 나홀로 팽나무: 성벽 마루에 혼자, 아래에서 은은한 불빛이 올려 비춰요
      const tx = 14, tz = rampartZ(tx);
      const lone = loneTree(); lone.scale.setScalar(1.45); lone.position.set(tx, h(tx, tz) - 0.5, tz); g.add(lone);
      const up = new THREE.PointLight('#ffb36a', 90, 34, 1.4); up.position.set(tx + 1.5, h(tx, tz) + 2.5, tz + 4); g.add(up);
    }
    // 물안개: 강 위로 낮게 여러 겹, 천천히 흘러요
    const mistTex = canvasTex(256, 128, (cg, w, hh) => { const rg = cg.createRadialGradient(w / 2, hh / 2, 4, w / 2, hh / 2, w / 2); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = rg; cg.fillRect(0, 0, w, hh); });
    const mr = rng(31);
    for (let i = 0; i < 26; i++) {
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(220 + mr() * 200, 70 + mr() * 50), new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
      const p = paths[i % 3][Math.floor(mr() * 20)];
      mist.rotation.x = -Math.PI / 2; mist.position.set(p[0], RW + 2 + mr() * 6, p[1]);
      const x0 = p[0], ph = mr() * 6;
      g.add(mist); animated.push((t) => { mist.position.x = x0 + Math.sin(t * 0.04 + ph) * 25; });
    }
    pagodaPos.set(12, 0, 4);
    addRailing(g, R0 - 1.5, -0.25 * Math.PI, 1.25 * Math.PI);
  }
  if (loc.id === 'sea') {
    g.add(scatterTrees(h, 1400, 21, { minD: R0 + 3, maxD: 520, autumn: false, skip: (x, z) => h(x, z) < -50 || Math.hypot(x, z) > 170 || (z > 0 && Math.hypot(x, z) < R0 + 40 && Math.abs(x) < z * 0.9) }));   // 섬에는 나무 없이 (가까운 산비탈만)
    // 바다: 가까운 쪽 쪽빛 → 먼 쪽 하늘빛
    const seaGeo = new THREE.PlaneGeometry(2400, 2400, 60, 60); seaGeo.rotateX(-Math.PI / 2);
    const sp = seaGeo.attributes.position, seaCols = [], cNear = new THREE.Color('#2f6f8f'), cFar = new THREE.Color('#9cc2d6'), cShal = new THREE.Color('#5fa9a8'), tc = new THREE.Color();
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i); tc.copy(cNear).lerp(cFar, smooth(150, 900, Math.hypot(x, z))); if (h(x, z) > -66) tc.lerp(cShal, 0.6); seaCols.push(tc.r, tc.g, tc.b); }
    seaGeo.setAttribute('color', new THREE.Float32BufferAttribute(seaCols, 3));
    const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.2 }));
    sea.position.y = -55; g.add(sea);
    // 상주 은모래 해변: 만 안쪽 초승달
    const beach = new THREE.Mesh(new THREE.RingGeometry(70, 82, 64, 1, Math.PI * 0.18, Math.PI * 0.64), mat('#e9dcb8'));
    beach.rotation.x = -Math.PI / 2; beach.position.set(-10, -54.7, 150); beach.scale.set(1.3, 1, 1); g.add(beach);
    // 윤슬: 해가 있는 쪽으로 반짝이는 빛의 길. 두 무리가 번갈아 반짝여요
    const sunXZ = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
    const glintMat = () => new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const glintSets = [0, 1].map((k) => {
      const n = 900, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glintMat(), n);
      const r = rng(77 + k), M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), v = new THREE.Vector3(), sc = new THREE.Vector3();
      let c = 0;
      for (let i = 0; i < n * 3 && c < n; i++) {
        const t = 140 + Math.pow(r(), 0.8) * 900, lat = (r() - 0.5) * (20 + t * 0.32) * (r() < 0.75 ? 0.5 : 1.4);
        const x = sunXZ.x * t - sunXZ.y * lat, z = sunXZ.y * t + sunXZ.x * lat;
        if (h(x, z) > -55.5) continue;
        const w = (1 + r() * 3) * (1 + t / 300);
        v.set(x, -54.85, z); sc.set(w, w * 0.18, 1); M.compose(v, q, sc); im.setMatrixAt(c++, M);
      }
      im.count = c; g.add(im); return im;
    });
    animated.push((t) => { glintSets[0].material.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.3)); glintSets[1].material.opacity = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.3 + Math.PI)); });
    // 금산 화강암: 둥글고 커다란 바위가 숲 위로 불쑥 (마당 가장자리와 두 산줄기 위)
    const rr = rng(5);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, d = R0 + 2 + rr() * 5;
      if (Math.abs(Math.atan2(Math.cos(a), Math.sin(a))) < 0.9) continue;   // 앞(바다 쪽)은 비워 두기
      const rock = boulder(31 + i, 1.5 + rr() * 2.5); rock.position.set(Math.cos(a) * d, h(Math.cos(a) * d, Math.sin(a) * d) - 1, Math.sin(a) * d); g.add(rock);
    }
    for (const [x, z, k] of [[-80, 70, 12], [-70, 50, 7], [92, 80, 13], [80, 58, 8], [-120, 150, 16], [130, 165, 15], [-150, 100, 11], [158, 115, 12]]) {
      const b = boulder(Math.round(x * 3 + z), k); b.position.set(x, h(x, z) - k * 0.3, z); g.add(b);
    }
    // 해수관음상: 마당 끝에서 바다를 바라보며 서 있어요
    const gw = gwaneum(); gw.position.set(-14, 0, 13); gw.rotation.y = 0.15; g.add(gw);
    // 절벽 끝 석탑
    pagodaPos.set(9, 0, 10);
    addRailing(g, R0 - 1.5, -0.15 * Math.PI, 1.15 * Math.PI);
  }

  // 마당 탑 자리: 어떤 탑을 세울지는 main.js 가 고른다 (setPagoda)
  const pagodaSlot = new THREE.Group();
  pagodaSlot.position.copy(pagodaPos);
  pagodaSlot.add(buildPagoda('gahangsa'));
  g.add(pagodaSlot);

  const hemi = new THREE.HemisphereLight(loc.sky[0], '#6b5a44', 1.1);
  g.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(70).add(new THREE.Vector3(0, 12, 0));   // 하늘에 그린 해 쪽에서 비추게
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
  sun.shadow.bias = -0.0006;
  g.add(sun, sun.target);

  return {
    group: g,
    floor: plaza,
    door,
    spawn: new THREE.Vector3(0, 0, 12),
    spawnRot: Math.PI,
    // 마당은 바닥보다 산·강·바다가 보이게: 조금 멀리, 덜 내려다보고, 시선은 지평선 쪽
    camDist: 9,
    // 남해(보리암)는 산꼭대기에서 바다를 내려다보는 풍경이라 조금 더 높이서 아래로
    camRise: loc.id === 'forest' ? 0.3 : 0.36,
    camLookY: loc.id === 'forest' ? 2.8 : 1.4,
    // 산보 길: 법당 건물을 오른쪽에 두고 시계 방향으로 도는 둥근 길 (건물 가운데 0,-9 / 석등·계단 앞을 지나게 넉넉히)
    // 앞(남쪽)에서 서쪽(-x)으로 출발 → 뒤 → 동쪽 → 다시 앞
    walkPath: Array.from({ length: 28 }, (_, k) => {
      const a = (-2 * Math.PI * k) / 28;
      return new THREE.Vector3(11.5 * Math.sin(a), 0, -8 + 10.5 * Math.cos(a));
    }),
    radius: R0 - 2.2,
    blockers: [
      { minX: -hall.userData.footprint.w, maxX: hall.userData.footprint.w, minZ: -9 - hall.userData.footprint.d, maxZ: -9 + hall.userData.footprint.d },
      { minX: pagodaPos.x - 1.8, maxX: pagodaPos.x + 1.8, minZ: pagodaPos.z - 1.8, maxZ: pagodaPos.z + 1.8 },
    ],
    pagodaSlot,
    hall,
    setPagoda(id) { pagodaSlot.clear(); pagodaSlot.add(buildPagoda(id)); pagodaSlot.userData.id = id; },
    fog: loc.id === 'forest' ? new THREE.Fog(loc.fog, 120, 700) : new THREE.Fog(loc.fog, 260, 1500),
    background: new THREE.Color(loc.sky[1]),
    update: (t) => { sky.material.uniforms.time.value = t; animated.forEach((f) => f(t)); },
  };
}

// ───────── 방 공통 ─────────
function roomShell(g, loc, { HW, HD, CEIL, floorMap, windows = [], doorW = 3 }) {
  const c = loc.interior;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const plaster = new THREE.MeshStandardMaterial({ color: c.wall, roughness: 0.95 });
  const wood = mat('#5a3826');
  const wall = (w, h, x, y, z, ry, material = plaster) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m;
  };
  wall(HW * 2, CEIL, 0, CEIL / 2, -HD, 0);
  wall(HW * 2, CEIL, 0, CEIL / 2, HD, Math.PI);
  wall(HD * 2, CEIL, -HW, CEIL / 2, 0, Math.PI / 2);
  wall(HD * 2, CEIL, HW, CEIL / 2, 0, -Math.PI / 2);
  for (const [w, x, z, ry] of [[HW * 2, 0, -HD + 0.02, 0], [HW * 2, 0, HD - 0.02, Math.PI], [HD * 2, -HW + 0.02, 0, Math.PI / 2], [HD * 2, HW - 0.02, 0, -Math.PI / 2]]) wall(w, 0.6, x, 0.3, z, ry, wood);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), mat('#6b4a33'));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL; g.add(ceil);
  for (let x = -HW + 1; x < HW; x += 1.6) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, HD * 2), mat('#4a2f22')); r.position.set(x, CEIL - 0.1, 0); g.add(r);
  }
  // 창: 법당과 같은 파노라마에서 창마다 다른 부분을 잘라 보여 주고, 창살은 성기게
  const pano = panoramaTex(loc);
  const frameMat = new THREE.MeshStandardMaterial({ map: openLattice(c.pillar), transparent: true, alphaTest: 0.4 });
  windows.forEach(([x, z, ry, w, h], i) => {
    const t = panoClone(loc);
    t.repeat.set(Math.min(1, (w / h) / 8 * 1.5), 1);
    t.offset.set((0.07 + i * 0.29) % (1 - t.repeat.x), 0); t.needsUpdate = true;
    wall(w, h, x, CEIL * 0.55, z, ry, viewMat(t));
    wall(w, h, x + Math.sin(ry) * 0.03, CEIL * 0.55, z + Math.cos(ry) * 0.03, ry, frameMat);
  });
  const door = wall(doorW, Math.min(CEIL - 0.4, 2.8), 0, Math.min(CEIL - 0.4, 2.8) / 2, HD - 0.04, Math.PI, new THREE.MeshStandardMaterial({ map: lattice(c.pillar), emissive: '#ffe9c0', emissiveIntensity: 0.12 }));
  return { floor, door };
}

function roomLights(g, warm, { size = 12, at = [6, 10, 8] } = {}) {
  g.add(new THREE.HemisphereLight('#fff4e2', '#3a2a20', 1.0));
  const sun = new THREE.DirectionalLight('#fff0d8', 1.3);
  sun.position.set(...at);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.5, far: 40 });
  sun.shadow.bias = -0.0008;
  g.add(sun);
  const p = new THREE.PointLight(warm, 3, 14, 1.5); p.position.set(0, 3, 0); g.add(p);
}

function scroll(text, sub) {
  return canvasTex(256, 640, (cg, w, h) => {
    cg.fillStyle = '#efe4c8'; cg.fillRect(0, 0, w, h);
    cg.fillStyle = '#6b4a33'; cg.fillRect(0, 0, w, 24); cg.fillRect(0, h - 24, w, 24);
    // 세로 글씨. 글자가 많으면 크기를 줄여 족자 안에 맞추고, 띄어쓰기는 반 칸만 띈다
    const chars = [...String(text).trim()];
    const units = chars.reduce((n, ch) => n + (ch === ' ' ? 0.45 : 1), 0) || 1;
    const step = Math.min(78, (h - 210) / units);
    cg.fillStyle = '#2b2220'; cg.font = `700 ${Math.round(step * 0.82)}px ${FONT_TITLE}`; cg.textAlign = 'center'; cg.textBaseline = 'middle';
    let y = 70 + step / 2;
    for (const ch of chars) { if (ch === ' ') { y += step * 0.45; continue; } cg.fillText(ch, w / 2 - (sub ? 10 : 0), y); y += step; }
    if (sub) {
      const sc = [...String(sub).replace(/\s+/g, '')];
      const sstep = Math.min(28, (h - 200) / sc.length);
      cg.font = `400 ${Math.round(sstep * 0.8)}px ${FONT_TITLE}`; cg.fillStyle = '#7a5a40';
      sc.forEach((ch, i) => cg.fillText(ch, w - 36, 90 + i * sstep));
    }
    cg.fillStyle = '#b8463f'; cg.fillRect(w / 2 - 18, h - 90, 36, 36);
  });
}

// ───────── 공양간 (발우공양) ─────────
// 두 줄씩 마주 보고 앉는 자리 4줄 × 15 = 60자리. 자리마다 앞에 발우 네 그릇
export function buildMealHall(loc) {
  const g = new THREE.Group();
  const HW = 12, HD = 9, CEIL = 5.5;
  const { floor, door } = roomShell(g, loc, {
    HW, HD, CEIL, floorMap: woodFloor('#6a4a34'),
    // 양쪽 벽에 큰 창 세 칸씩 (판벽 위 ~ 천장 아래)
    windows: [-6, 0, 6].flatMap((z) => [[-HW + 0.03, z, Math.PI / 2, 5, 3.6], [HW - 0.03, z, -Math.PI / 2, 5, 3.6]]),
  });
  const seats = [];
  const rows = [[-6.4, 0], [-2.4, Math.PI], [2.0, 0], [6.0, Math.PI]];
  const xs = []; for (let x = -10.5; x <= 10.51; x += 1.5) xs.push(x);
  const n = rows.length * xs.length;
  const cushion = new THREE.InstancedMesh(cushionGeo(1.0, 0.11), cushionMat('#4f5a4a', '#b89a5a', '#d8c8a0'), n);
  const bowl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.1, 0.11, 16), mat('#4a2418', { roughness: 0.3 }), n * 4);
  // 발우 네 그릇: 쌀밥 · 맑은 국 · 시금치나물 · 도라지무침 (빨간 반찬은 없음)
  // 밥: 소복한 흰 밥에 밥알 결 그림
  const riceTex = canvasTex(128, 128, (cg, w, h) => {
    cg.fillStyle = '#f4efe2'; cg.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let k = 0; k < 260; k++) { cg.fillStyle = r() < 0.5 ? '#fffdf6' : '#e6dfcc'; cg.beginPath(); cg.ellipse(r() * w, r() * h, 3.2, 1.6, r() * Math.PI, 0, Math.PI * 2); cg.fill(); }
  });
  const rice = new THREE.InstancedMesh(new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: riceTex, roughness: 0.85 }), n);
  // 맑은 국: 옅은 맑은 국물 + 두부 · 파 · 미역 건더기
  const soup = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.135, 0.135, 0.01, 18), new THREE.MeshStandardMaterial({ color: '#f3e9c8', emissive: '#4a3e22', roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.88 }), n);
  const tofu = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.03, 0.045), mat('#f7f3e8'), n * 3);
  const scallion = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 8), mat('#7cc04f'), n * 5);
  const seaweed = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.004, 0.035), mat('#2f4a2c', { roughness: 0.4 }), n * 2);
  // 나물 · 도라지: 낮은 무더기 위에 길쭉한 가닥을 엇갈려 쌓는다
  const heap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n * 2);
  const NAMUL = 9, DORAJI = 9;
  const namul = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.014, 0.02), mat('#4f8a3a', { roughness: 0.6 }), n * NAMUL);
  const doraji = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.016, 0.024), mat('#e8dcc0', { roughness: 0.7 }), n * DORAJI);
  const sesame = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.004, 0.012), mat('#f6ecc8'), n * 6);
  const M = new THREE.Matrix4(), S = new THREE.Vector3(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), E = new THREE.Euler(), col = new THREE.Color();
  const one = new THREE.Vector3(1, 1, 1);
  const put = (im, i, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)); im.setMatrixAt(i, M); };
  const r = rng(29);
  let bi = 0, hi = 0, ni = 0, di = 0, ti = 0, ci = 0, wi = 0, ei = 0;
  for (const [z, rot] of rows) for (const x of xs) {
    const id = seats.length;
    M.makeTranslation(x, 0.05, z); cushion.setMatrixAt(id, M);
    seats.push({ id, pos: new THREE.Vector3(x, 0, z), rot, y: 0.1 });
    const dir = rot === 0 ? 1 : -1;
    [[-0.18, 0.62], [0.18, 0.62], [-0.18, 0.95], [0.18, 0.95]].forEach(([dx, dz], k) => {
      const bx = x + dx, bz = z + dz * dir;
      M.makeTranslation(bx, 0.07, bz); bowl.setMatrixAt(bi++, M);
      if (k === 0) put(rice, id, bx, 0.11, bz, r() * 6, 0, 0, 1, 0.6, 1);
      if (k === 1) {
        put(soup, id, bx, 0.128, bz);   // 그릇은 막힌 원통이라 국물은 테두리 높이에
        for (let t = 0; t < 3; t++) { const a = r() * 6.28, d = 0.03 + r() * 0.06; put(tofu, ti++, bx + Math.cos(a) * d, 0.136, bz + Math.sin(a) * d, r() * 3); }
        for (let t = 0; t < 5; t++) { const a = r() * 6.28, d = r() * 0.1; put(scallion, ci++, bx + Math.cos(a) * d, 0.135, bz + Math.sin(a) * d); }
        for (let t = 0; t < 2; t++) { const a = r() * 6.28, d = 0.02 + r() * 0.07; put(seaweed, wi++, bx + Math.cos(a) * d, 0.134, bz + Math.sin(a) * d, r() * 3, 0, 0.1); }
      }
      if (k >= 2) {
        const greens = k === 2;
        put(heap, hi, bx, 0.105, bz, 0, 0, 0, 0.95, 0.32, 0.95); heap.setColorAt(hi++, col.set(greens ? '#3f7330' : '#d9cba8'));
        const im = greens ? namul : doraji, cnt = greens ? NAMUL : DORAJI;
        for (let t = 0; t < cnt; t++) {
          const a = r() * 6.28, d = r() * 0.04, y = 0.13 + (t / cnt) * 0.03;
          put(im, greens ? ni++ : di++, bx + Math.cos(a) * d, y, bz + Math.sin(a) * d, r() * Math.PI, (r() - 0.5) * 0.4, (r() - 0.5) * 0.5, 0.8 + r() * 0.35);
        }
        if (greens) for (let t = 0; t < 3; t++) put(sesame, ei++, bx + (r() - 0.5) * 0.1, 0.165, bz + (r() - 0.5) * 0.1, r() * 3);
        else for (let t = 0; t < 3; t++) put(sesame, ei++, bx + (r() - 0.5) * 0.1, 0.165, bz + (r() - 0.5) * 0.1, r() * 3);
      }
    });
  }
  for (const im of [namul, doraji, rice, tofu]) im.castShadow = true;
  cushion.userData.seats = 'meal';
  cushion.receiveShadow = true;
  bowl.castShadow = true;
  g.add(cushion, bowl, rice, soup, tofu, scallion, seaweed, heap, namul, doraji, sesame);
  // 마주 보는 두 줄 사이에 흰 천
  for (const z of [-4.4, 4.0]) {
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(23, 0.02, 1.0), mat('#f3efe6'));
    cloth.position.set(0, 0.012, z); cloth.receiveShadow = true; g.add(cloth);
  }
  // 앞쪽 벽: 작은 불단과 오관게 족자
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.8), new THREE.MeshStandardMaterial({ map: dancheong('#5a2a1e', loc.interior.accent) }));
  shelf.position.set(-HW + 0.6, 0.55, 0); shelf.rotation.y = Math.PI / 2; g.add(shelf);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.5), new THREE.MeshStandardMaterial({ map: scroll('오관게', '이음식이어디서왔는가') }));
  sc.position.set(0, 3.0, -HD + 0.06); g.add(sc);
  // 밥솥과 국통
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.7, 20), mat('#2f2b28', { metalness: 0.4, roughness: 0.5 }));
  pot.position.set(HW - 1.4, 0.35, -HD + 1.4); pot.castShadow = true; g.add(pot);
  const pot2 = pot.clone(); pot2.position.x -= 1.6; pot2.scale.setScalar(0.75); g.add(pot2);
  roomLights(g, loc.interior.lamp, { size: 14 });
  return {
    group: g, floor, seats, exitDoor: door,
    // 족자: 내 방처럼 각자 고른 문구를 걸어요 (scrolls.js)
    setScroll(text, sub) { sc.material.map.dispose(); sc.material.map = scroll(text, sub); sc.material.needsUpdate = true; },
    spawn: new THREE.Vector3(0, 0, HD - 1.6), spawnRot: Math.PI,
    exitZ: HD - 0.9, camDist: 5,
    bounds: { minX: -HW + 0.6, maxX: HW - 0.6, minZ: -HD + 0.6, maxZ: HD - 0.6 },
    blockers: [], fog: null, background: new THREE.Color('#1c1410'),
  };
}

// ───────── 내 방 (혼자 책 읽는 요사채 방) ─────────
export function buildRoom(loc) {
  const g = new THREE.Group();
  const HW = 3.2, HD = 3.2, CEIL = 3.2;
  const jangpan = canvasTex(256, 256, (cg, w, h) => {
    cg.fillStyle = '#d9b46a'; cg.fillRect(0, 0, w, h);
    cg.strokeStyle = 'rgba(120, 80, 30, 0.35)'; cg.lineWidth = 3;
    for (let i = 0; i <= w; i += 64) { cg.beginPath(); cg.moveTo(i, 0); cg.lineTo(i, h); cg.stroke(); cg.beginPath(); cg.moveTo(0, i); cg.lineTo(w, i); cg.stroke(); }
  }, [4, 4]);
  const { floor, door } = roomShell(g, loc, { HW, HD, CEIL, floorMap: jangpan, windows: [[-HW + 0.03, -0.4, Math.PI / 2, 3.2, 1.9], [HW - 0.03, 1.2, -Math.PI / 2, 2.6, 1.7]], doorW: 1.8 });
  // 경상(낮은 책상), 책, 등, 찻잔
  const desk = new THREE.Group();
  desk.position.set(0, -0.1, -1.3);   // 앉은 자리 바로 앞, 낮게: 책·사경 종이·찻잔이 책상 위에 놓여 보이게
  const woodM = mat('#7a4a2c', { roughness: 0.5 });
  const topM = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.7), woodM); topM.position.y = 0.42; desk.add(topM);
  for (const [x, z] of [[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), woodM); l.position.set(x, 0.2, z); desk.add(l); }
  const colors = ['#2f5d50', '#8a3a2c', '#c9a86a', '#3b4a6b'];
  colors.forEach((c, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.24), mat(c)); b.position.set(-0.5, 0.49 + i * 0.06, -0.1); b.rotation.y = i * 0.15; desk.add(b); });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 12), mat('#e9e2d2')); cup.position.set(0.52, 0.5, 0.05); desk.add(cup);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.18), new THREE.MeshStandardMaterial({ color: '#f3e6c3', emissive: '#ffcf7a', emissiveIntensity: 0.9 }));
  lamp.position.set(0.55, 0.6, -0.2); desk.add(lamp);
  desk.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(desk);
  const lampLight = new THREE.PointLight('#ffcf8a', 2.5, 6, 1.5); lampLight.position.set(0.55, 0.75, -1.5); g.add(lampLight);
  // 책장, 개어 둔 이불, 족자
  const shelf = new THREE.Group();
  shelf.position.set(HW - 0.3, 0, -1.9);   // 오른쪽 벽 창 옆 안쪽으로
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 1.6), mat('#6b4128')); frame.position.y = 0.9; shelf.add(frame);
  const rr = rng(4);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32 + rr() * 0.1, 0.16), mat(['#2f5d50', '#8a3a2c', '#c9a86a', '#3b4a6b', '#d9d2c0'][Math.floor(rr() * 5)]));
    b.position.set(-0.12, 0.3 + r * 0.55, -0.6 + i * 0.19); shelf.add(b);
  }
  g.add(shelf);
  const quilt = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.8), mat('#c97a7a')); quilt.position.set(-HW + 0.8, 0.2, HD - 0.8); quilt.castShadow = true; g.add(quilt);
  const quilt2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.8), mat('#f2ead8')); quilt2.position.set(-HW + 0.8, 0.52, HD - 0.8); g.add(quilt2);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.5), new THREE.MeshStandardMaterial({ map: scroll('일체유심조', '모든것은마음이짓는다') }));
  sc.position.set(0, 2.0, -HD + 0.05); g.add(sc);
  sc.userData.scroll = true;
  const cushion = new THREE.Mesh(cushionGeo(0.9, 0.11), cushionMat('#3f4f6b', '#c9a24a', '#e6dcc6')); cushion.position.set(0, 0.055, -0.65); cushion.receiveShadow = true; g.add(cushion);
  cushion.userData.seats = 'room';
  roomLights(g, '#ffd9a0', { size: 5, at: [-4, 6, 2] });
  const seat = { id: 0, pos: new THREE.Vector3(0, 0, -0.65), rot: Math.PI, y: 0.1 };
  // 절하는 방석: 책상에서 조금 물러난 자리 (108배 · 큰절 · 반배는 여기서)
  const bowSpot = new THREE.Vector3(0, 0, 0.55);
  const bowMat = new THREE.Mesh(cushionGeo(1.0, 0.09), cushionMat('#6e2c27', '#c9a24a', '#e8b8a0')); bowMat.position.set(0, 0.045, 0.55); bowMat.receiveShadow = true; g.add(bowMat);
  return {
    group: g, floor, seats: [seat], exitDoor: door,
    // 족자 문구 바꿔 걸기
    setScroll(text, sub) {
      sc.material.map.dispose();
      sc.material.map = scroll(text, sub);
      sc.material.needsUpdate = true;
    },
    bowSpot,
    spawn: seat.pos.clone(), spawnRot: Math.PI,
    exitZ: HD - 0.5, camDist: 2.8, minDist: 1.4, maxDist: 4.6,
    bounds: { minX: -HW + 0.4, maxX: HW - 0.4, minZ: -HD + 0.4, maxZ: HD - 0.4 },
    blockers: [{ minX: -0.8, maxX: 0.8, minZ: -1.7, maxZ: -0.92 }], fog: null, background: new THREE.Color('#1c1410'),
  };
}

function addRailing(g, r, a0, a1) {
  const wood = mat('#6b4a33');
  const n = 46;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), wood);
    post.position.set(Math.cos(a) * r, 0.55, Math.sin(a) * r); post.castShadow = true; g.add(post);
    if (i < n) {
      const b = a0 + (a1 - a0) * ((i + 1) / n);
      const x1 = Math.cos(a) * r, z1 = Math.sin(a) * r, x2 = Math.cos(b) * r, z2 = Math.sin(b) * r;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.1), wood);
      rail.position.set((x1 + x2) / 2, 1.0, (z1 + z2) / 2);
      rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      g.add(rail);
    }
  }
}

// ───────── 보리암에서 본 남해 (로딩 풍경 전용) ─────────
// 금산 꼭대기 바위 위에서 해가 걸린 바다 쪽을 본다. 역광이라 겹겹이 놓인 섬이 까맣게 보이고,
// 멀어질수록 물안개에 묻혀 옅어진다. 앞에는 화강암 바위, 오른쪽 벼랑에 암자 지붕
export function buildBoriamView(loc) {
  const g = new THREE.Group();
  const SEA = -230, haze = '#eadcc2';
  const sky = skyDome('#9db6d0', '#f6dcaa');
  sky.scale.setScalar(2); sky.renderOrder = -1; g.add(sky);

  // 해와 바다 위 햇길
  const sunTex = canvasTex(256, 256, (cg, w) => {
    const gr = cg.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,245,1)'); gr.addColorStop(0.12, 'rgba(255,246,214,1)');
    gr.addColorStop(0.3, 'rgba(255,214,150,.45)'); gr.addColorStop(1, 'rgba(255,200,140,0)');
    cg.fillStyle = gr; cg.fillRect(0, 0, w, w);
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.position.set(0, 150, 1550); sun.scale.setScalar(420); g.add(sun);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ color: '#97a3a8' }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA; g.add(sea);
  const pathTex = canvasTex(128, 512, (cg, w, h) => {
    const gr = cg.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,236,200,0)'); gr.addColorStop(0.5, 'rgba(255,240,210,.9)'); gr.addColorStop(1, 'rgba(255,236,200,0)');
    cg.fillStyle = gr; cg.fillRect(0, 0, w, h);
    const fade = cg.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    cg.globalCompositeOperation = 'destination-in'; cg.fillStyle = fade; cg.fillRect(0, 0, w, h);
  });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(700, 1500), new THREE.MeshBasicMaterial({ map: pathTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.75 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, SEA + 0.3, 820); g.add(path);
  const glints = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.5), new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 500);
  const r = rng(91), M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  for (let i = 0; i < 500; i++) {
    const z = 180 + r() * 1300, spread = 40 + z * 0.12;
    M.compose(new THREE.Vector3((r() - 0.5) * spread * 2 * r(), SEA + 0.5, z), q, new THREE.Vector3(1 + r() * 3, 1, 1));
    glints.setMatrixAt(i, M);
  }
  g.add(glints);

  // 섬: 역광이라 거의 검은 실루엣. 겹겹이 멀어질수록 물안개 빛으로 옅어진다 (안개 대신 거리로 직접 칠한다)
  const near = new THREE.Color('#0d1216'), far = new THREE.Color('#b3ada2');
  const island = (x, z, rx, rz, hgt, seed) => {
    const geo = new THREE.SphereGeometry(1, 48, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = geo.attributes.position, rr = rng(seed);
    const k1 = 1 + Math.floor(rr() * 3), k2 = rr() * 6, k3 = 3 + Math.floor(rr() * 3), k4 = rr() * 6;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
      // 봉우리가 두세 개 있는 능선 모양 (정수 배라 이음매가 갈라지지 않는다)
      p.setY(i, y * Math.max(0.25, 0.7 + 0.35 * Math.sin(a * k1 + k2) + 0.18 * Math.sin(a * k3 + k4)));
    }
    geo.computeVertexNormals();
    const col = near.clone().lerp(far, Math.pow(smooth(250, 2000, z), 1.5));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, fog: false }));
    m.scale.set(rx, hgt, rz); m.position.set(x, SEA - 2, z); m.renderOrder = -Math.round(z); g.add(m);
  };
  [
    [-560, 330, 280, 90, 105], [520, 380, 250, 80, 90], [-170, 520, 90, 50, 46], [150, 610, 70, 40, 40],
    [-760, 700, 300, 120, 115], [720, 760, 280, 100, 100], [-40, 820, 26, 20, 32], [-380, 920, 180, 70, 72],
    [330, 980, 170, 60, 64], [60, 1150, 130, 50, 52], [-620, 1200, 260, 80, 86], [620, 1260, 240, 80, 76],
    [-200, 1380, 150, 50, 46], [280, 1460, 120, 40, 40], [-900, 1520, 320, 80, 72], [900, 1540, 280, 70, 62],
  ].forEach(([x, z, rx, rz, h], i) => island(x, z, rx, rz, h, 300 + i));

  // 금산 비탈: 발밑에서 바다까지 떨어지는 능선 (역광이라 어두운 초록)
  const h = (x, z) => {
    const t = smooth(-10, 340, z + noise(x * 0.3, z * 0.3) * 30);
    const spur = 70 * Math.max(0, Math.cos(x * 0.011 + 0.6)) * smooth(60, 260, z) * (1 - smooth(260, 420, z));
    return -t * 270 + spur + noise(x * 0.5, z * 0.5) * 10 * (1 - t * 0.6) + (Math.abs(x) > 260 ? (Math.abs(x) - 260) * 0.25 * (1 - t) : 0);
  };
  const geo = new THREE.PlaneGeometry(1800, 700, 150, 70);
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 240);
  const p = geo.attributes.position, colors = [], c = new THREE.Color(), dark = new THREE.Color('#1f2d1b'), mid = new THREE.Color('#38502a');
  for (let i = 0; i < p.count; i++) {
    const y = h(p.getX(i), p.getZ(i));
    p.setY(i, y);
    c.copy(dark).lerp(mid, 0.5 + 0.5 * noise(p.getX(i), p.getZ(i)) * 0.5);
    if (y < SEA + 6) c.set('#8f8670');
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; g.add(ground);
  g.add(scatterTrees(h, 420, 57, { minD: 40, maxD: 420, autumn: false, skip: (x, z) => z < 40 || h(x, z) < SEA + 8 }));

  // 화강암 바위: 둥글둥글한 금산 바위. 위치로 정한 울퉁불퉁이라 면이 갈라지지 않는다
  const granite = new THREE.MeshStandardMaterial({ color: '#a8a093', roughness: 0.95 });
  const rock = (x, y, z, s, sy = 1, seed = 1) => {
    const geoR = new THREE.SphereGeometry(1, 22, 16);
    const pr = geoR.attributes.position;
    for (let i = 0; i < pr.count; i++) {
      const vx = pr.getX(i), vy = pr.getY(i), vz = pr.getZ(i);
      const k = 1 + 0.12 * Math.sin(vx * 3.1 + seed) * Math.cos(vz * 2.7 - seed) + 0.08 * Math.sin(vy * 4.3 + seed * 2);
      pr.setXYZ(i, vx * k, vy * k * (vy < 0 ? 0.6 : 1), vz * k);
    }
    geoR.computeVertexNormals();
    const m = new THREE.Mesh(geoR, granite);
    m.scale.set(s, s * sy, s * 0.9); m.position.set(x, y, z); m.rotation.y = seed;
    m.castShadow = m.receiveShadow = true; g.add(m);
  };
  // 오른쪽(화면) 암자 옆 바위 무리, 왼쪽 아래는 낮게만
  [[-46, 0, 52, 7, 1.3], [-54, 5, 60, 6, 1.6], [-38, -4, 60, 5, 1], [-58, -2, 46, 8, 0.9], [-50, 10, 66, 4.5, 1.4],
    [-20, -4, 26, 4, 0.7], [18, -9, 16, 6, 0.6], [30, -12, 30, 7, 0.6]].forEach((a, i) => rock(...a, i * 1.7 + 0.4));

  // 오른쪽 벼랑 끝 암자 (바다 쪽으로 처마를 내민 모습)
  const hall = buildHallBuilding(loc);
  hall.position.set(-66, -4, 74); hall.rotation.y = 0.95;
  g.add(hall);
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 14), granite);
  ledge.position.set(-66, -9.5, 74); ledge.rotation.y = 0.95; g.add(ledge);

  // 빛: 해가 바다 쪽(앞)에 있어 바위와 지붕은 뒤에서 빛을 받는다
  g.add(new THREE.HemisphereLight('#f6e6c8', '#2a3426', 0.85));
  const back = new THREE.DirectionalLight('#ffe2b0', 2.0);
  back.position.set(0, 160, 900); back.castShadow = true;
  back.shadow.mapSize.set(1024, 1024);
  Object.assign(back.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 700, far: 1000 });
  g.add(back, back.target);
  const fill = new THREE.DirectionalLight('#dfe6f0', 0.7);
  fill.position.set(-40, 60, -80); g.add(fill);

  return {
    timeless: true, // 노을 풍경 그대로 (낮밤을 입히지 않음)
    group: g,
    fog: new THREE.Fog(haze, 320, 2300),
    background: new THREE.Color(haze),
    update: (t) => { glints.material.opacity = 0.45 + Math.sin(t * 2.1) * 0.3; },
  };
}

// ───────── 캠핑장 물가: 마당 앞으로 내려가면 나오는 물가 (산 · 계곡 / 바다 · 해수욕장 / 별밤 · 강가) ─────────
// 걷는 곳은 y=0 평평한 물가(bounds 안), 앞(+z)으로 물, 둘레는 산 · 숲 · 모래언덕
const SHORE_Z = { forest: 7, sea: 11, river: 7 };   // 걸을 수 있는 물가 끝
function shoreHeight(id) {
  if (id === 'forest') {
    // 편백 숲 계곡: 앞으로 시냇물이 가로질러 흐르고, 건너편은 가파른 숲 비탈, 뒤와 옆도 산이 감싸요
    return (x, z) => {
      const c = 13 + Math.sin(x / 11) * 2.5, dz = z - c;
      let h = noise(x * 2, z * 2) * 0.15 * smooth(6, 10, Math.abs(x));
      if (Math.abs(dz) < 5.5) h = Math.min(h, -1.3 * (1 - (dz / 5.5) ** 2));
      if (dz > 5.5) h += (dz - 5.5) * 0.85 + noise(x, z) * 6 * smooth(5, 30, dz) + 50 * smooth(30, 200, dz);
      if (z < -8) h += (-z - 8) * 0.5 + noise(x * 1.3, z) * 4 * smooth(-8, -30, z);
      h += Math.max(0, Math.abs(x) - 26) * 0.5 * smooth(-10, 5, -dz);
      return h;
    };
  }
  if (id === 'sea') {
    // 해수욕장: 넓은 모래사장이 바다로 완만하게, 뒤엔 해송 숲 모래언덕, 오른쪽 끝은 바위 곶과 방파제
    return (x, z) => {
      let h = 0;
      if (z > 8) h = -(z - 8) * 0.14 - Math.max(0, z - 30) * 0.4;
      if (z < -10) h += (-z - 10) * 0.35 + noise(x, z) * 3 * smooth(-10, -40, z) + 30 * smooth(-60, -200, z);
      const head = Math.exp(-(((x - 70) / 30) ** 2) - (((z - 30) / 50) ** 2)); h = Math.max(h, head * 26 - 4 + noise(x * 2, z * 2) * 2 * head);
      const head2 = Math.exp(-(((x + 90) / 40) ** 2) - (((z - 10) / 60) ** 2)); h = Math.max(h, head2 * 32 - 4);
      return h;
    };
  }
  // 강가 (밤): 풀밭 물가에서 넓고 잔잔한 강, 건너편은 낮은 산 그림자
  return (x, z) => {
    let h = noise(x * 2, z * 2) * 0.1;
    if (z > 7) h = -(z - 7) * 0.12;
    if (z > 12) h = -0.8;
    if (z > 120) h = -0.8 + (z - 120) * 0.35 + noise(x, z) * 6 + 20 * smooth(140, 260, z);
    if (z < -10) h += (-z - 10) * 0.3 + noise(x, z) * 3;
    return h;
  };
}
function stripeTex(colors, n = 12) { return canvasTex(256, 64, (g, w, hh) => { for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect((i * w) / n, 0, w / n + 1, hh); } }); }
function parasol(colors) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), mat('#e8e2d6')); pole.position.y = 1.2; pole.rotation.z = 0.08; g.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 12, 1, true), new THREE.MeshStandardMaterial({ map: stripeTex(colors), side: THREE.DoubleSide, roughness: 0.8 }));
  top.position.set(0.18, 2.4, 0); top.rotation.z = 0.08; top.castShadow = true; g.add(top);
  return g;
}
function lighthouse() {
  const g = new THREE.Group(), red = mat('#c9372c'), white = mat('#f4f1ea');
  for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.15 - (i + 1) * 0.12, 1.15 - i * 0.12, 2, 16), i % 2 ? white : red); seg.position.y = 1 + i * 2; seg.castShadow = true; g.add(seg); }
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.15, 16), mat('#2a2a2a')); deck.position.y = 8.1; g.add(deck);
  const lampM = new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffd77a', emissiveIntensity: 1.5 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 12), lampM); lamp.position.y = 8.65; g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.7, 12), red); cap.position.y = 9.45; g.add(cap);
  const pl = new THREE.PointLight('#ffd77a', 8, 40, 1.5); pl.position.y = 8.7; g.add(pl);
  return g;
}
function reeds(r, n, place) {
  const geo = new THREE.ConeGeometry(0.04, 1.6, 4); geo.translate(0, 0.8, 0);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [x, y, z] = place(r);
    e.set((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4); q.setFromEuler(e); const k = 0.7 + r() * 0.8; s.set(1, k, 1); v.set(x, y, z);
    M.compose(v, q, s); im.setMatrixAt(i, M); c.set(['#b59a5a', '#a08848', '#c9ad6a', '#7d8a4a'][Math.floor(r() * 4)]); im.setColorAt(i, c);
  }
  return im;
}
export function buildWaterside(loc) {
  const id = loc.id, g = new THREE.Group(), animated = [], r = rng(id.length * 97);
  const sky = skyDomeHQ(loc.sky[0], loc.sky[1], { clouds: loc.night ? 0.12 : id === 'sea' ? 0.4 : 0.55, milky: loc.night ? 1 : 0 });
  g.add(sky, mountainLayers(loc));
  const h = shoreHeight(id);

  // 땅: 가까운 곳은 촘촘하게 (물가 · 바위가 또렷하게)
  const geo = new THREE.PlaneGeometry(700, 700, 260, 260); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, cols = [], tmp = new THREE.Color();
  const grass = new THREE.Color(id === 'sea' ? '#e6d6ad' : id === 'river' ? '#5f7a4a' : '#6f8f4e'), wetSand = new THREE.Color('#c9b68a'), pebble = new THREE.Color('#9d968a'), forestC = new THREE.Color('#3f6237'), rock = new THREE.Color('#8b8378');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = h(x, z); p.setY(i, y);
    tmp.copy(grass);
    if (id === 'sea') { if (z > 8) tmp.copy(wetSand); if (z < -12 || y > 2) tmp.lerp(forestC, smooth(-12, -22, z) + smooth(2, 6, y)); }
    else {
      if (y < 0.05 && z > 4) tmp.copy(pebble);
      if (y > 3) tmp.lerp(forestC, 0.6);
    }
    tmp.offsetHSL(0, 0, noise(x * 3, z * 3) * 0.025);
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) { if (1 - nrm.getY(i) > 0.35) { tmp.setRGB(cols[i * 3], cols[i * 3 + 1], cols[i * 3 + 2]).lerp(rock, 0.6); cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b; } }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const detail = canvasTex(256, 256, (cg, w, hh) => { cg.fillStyle = '#fff'; cg.fillRect(0, 0, w, hh); for (let i = 0; i < 5000; i++) { const k = 200 + Math.random() * 55; cg.fillStyle = `rgb(${k},${k},${k})`; cg.fillRect(Math.random() * w, Math.random() * hh, 2, id === 'sea' ? 2 : 4); } }, [140, 140]);
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 })); ground.receiveShadow = true; g.add(ground);

  if (id === 'forest') {
    // 시냇물: 물결 무늬가 오른쪽으로 흘러가요
    const flow = canvasTex(256, 128, (cg, w, hh) => { cg.fillStyle = '#ffffff'; cg.fillRect(0, 0, w, hh); for (let i = 0; i < 70; i++) { cg.fillStyle = `rgba(200,230,235,${0.3 + Math.random() * 0.5})`; cg.fillRect(Math.random() * w, Math.random() * hh, 20 + Math.random() * 50, 2); } }, [12, 2]);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 14), new THREE.MeshStandardMaterial({ color: '#5f9a95', map: flow, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -0.32, 13); g.add(water);
    animated.push((t) => { flow.offset.x = -t * 0.12; });
    // 시냇가 바위 · 징검다리
    for (let i = 0; i < 26; i++) { const x = -40 + i * 3.2 + r() * 2, c = 13 + Math.sin(x / 11) * 2.5, side = r() < 0.5 ? -1 : 1; const b = boulder(300 + i, 0.5 + r() * 1.3); b.position.set(x, -0.5, c + side * (4.5 + r() * 2)); g.add(b); }
    for (let i = 0; i < 6; i++) { const z = 8.5 + i * 1.6, x = 6 + Math.sin(i) * 0.4; const st = boulder(400 + i, 0.45); st.scale.y = 0.35; st.position.set(x, -0.2, z); g.add(st); }
    for (const [x, z, k] of [[-12, 19, 2.8], [15, 18, 2.2], [-22, 9, 1.8]]) { const b = boulder(500 + x, k); b.position.set(x, h(x, z) - k * 0.3, z); g.add(b); }
    g.add(scatterTrees(h, 1600, 41, { minD: 14, maxD: 330, autumn: false, skip: (x, z) => h(x, z) < 1 || (z > -6 && z < 19 && Math.abs(x) < 24) }));
  }
  if (id === 'sea') {
    const seaGeo = new THREE.PlaneGeometry(2400, 2400, 40, 40); seaGeo.rotateX(-Math.PI / 2);
    const sp = seaGeo.attributes.position, sc = [], cN = new THREE.Color('#3fa0b0'), cF = new THREE.Color('#9cc2d6'), c = new THREE.Color();
    for (let i = 0; i < sp.count; i++) { c.copy(cN).lerp(cF, smooth(30, 900, sp.getZ(i))); sc.push(c.r, c.g, c.b); }
    seaGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.92 }));
    sea.position.set(0, -0.35, 1200); g.add(sea);
    // 밀려왔다 빠지는 하얀 물거품 두 줄
    const foamTex = canvasTex(512, 64, (cg, w, hh) => { const gr = cg.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, w, hh); cg.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 160; i++) { cg.beginPath(); cg.arc(Math.random() * w, hh * (0.4 + Math.random() * 0.4), 2 + Math.random() * 5, 0, 7); cg.fill(); } }, [6, 1]);
    [0, 1].forEach((k) => {
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(160, 2.2), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false }));
      foam.rotation.x = -Math.PI / 2; g.add(foam);
      animated.push((t) => { const u = ((t / 7 + k * 0.5) % 1), z = 14 - Math.sin(u * Math.PI) * 4; foam.position.set(0, h(0, z) + 0.06 > -0.3 ? h(0, z) + 0.06 : -0.29, z); foam.material.opacity = Math.sin(u * Math.PI) * 0.85; });
    });
    // 방파제 끝 빨간 등대, 파라솔과 해송 숲, 감시탑
    const bw = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 70), mat('#a7a39a')); bw.position.set(46, 0.3, 55); bw.rotation.y = -0.35; bw.castShadow = true; g.add(bw);
    const lh = lighthouse(); lh.position.set(46 + Math.sin(-0.35) * 34, 1.5, 55 + Math.cos(-0.35) * 34); g.add(lh);
    [[-7, 8, ['#e2603d', '#f4f1ea']], [8, 8.5, ['#2f7a96', '#f4f1ea']], [-17, 7, ['#e8b54a', '#f4f1ea']], [18, 7.5, ['#3f9a6a', '#f4f1ea']]].forEach(([x, z, c]) => { const ps = parasol(c); ps.position.set(x, 0, z); ps.rotation.y = r() * 6; g.add(ps); });
    const tower = new THREE.Group(); for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), mat('#e8e2d6')); l.position.set(x, 1.3, z); tower.add(l); }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.6), mat('#c9372c')); cab.position.y = 3.05; tower.add(cab); const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 4), mat('#f4f1ea')); roof.position.y = 3.8; roof.rotation.y = Math.PI / 4; tower.add(roof);
    tower.position.set(-28, 0, 0); g.add(tower);
    g.add(scatterTrees(h, 1300, 51, { minD: 20, maxD: 300, autumn: false, skip: (x, z) => h(x, z) < 1.5 || z > 40 }));
  }
  if (id === 'river') {
    // 잔잔한 강: 별과 은하수가 비쳐요
    const rv = mirrorWater(new THREE.PlaneGeometry(900, 140), '#1c2850', 0.45); rv.position.set(0, -0.45, 80); g.add(rv);
    g.add(reeds(r, 900, (rr) => { const x = -60 + rr() * 120, z = 5.5 + rr() * 6; return Math.abs(x) < 7 && z < 9 ? [x + 20, h(x + 20, z), z] : [x, h(x, z), z]; }));
    g.add(scatterTrees(h, 900, 61, { minD: 20, maxD: 330, autumn: false, skip: (x, z) => h(x, z) < 1 || (z > 0 && z < 125) }));
    // 반딧불이: 갈대 위로 천천히 떠다니며 깜빡여요
    const n = 70, pos = new Float32Array(n * 3), base = [];
    for (let i = 0; i < n; i++) { base.push([-25 + r() * 50, 0.4 + r() * 2, 2 + r() * 10, r() * 9]); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const glow = canvasTex(64, 64, (cg) => { const rg = cg.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = rg; cg.fillRect(0, 0, 64, 64); });
    const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#d9ff7a', size: 0.35, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    g.add(flies);
    animated.push((t) => { for (let i = 0; i < n; i++) { const [x, y, z, ph] = base[i]; pos[i * 3] = x + Math.sin(t * 0.3 + ph) * 1.5; pos[i * 3 + 1] = y + Math.sin(t * 0.7 + ph * 2) * 0.4; pos[i * 3 + 2] = z + Math.cos(t * 0.25 + ph) * 1.2; } fg.attributes.position.needsUpdate = true; flies.material.opacity = 0.6 + 0.4 * Math.sin(t * 2.1); });
  }

  const hemi = new THREE.HemisphereLight(loc.sky[0], '#6b5a44', 1.1); g.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(70).add(new THREE.Vector3(0, 12, 0)); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 }); sun.shadow.bias = -0.0006;
  g.add(sun, sun.target);
  const sz = SHORE_Z[id];
  return {
    group: g, floor: ground, door: null, h,
    spawn: new THREE.Vector3(0, 0, sz - 5), spawnRot: 0,
    camDist: 7, camRise: 0.3, camLookY: 1.2,
    bounds: { minX: -22, maxX: 22, minZ: -8, maxZ: sz },
    blockers: [],
    fog: id === 'forest' ? new THREE.Fog(loc.fog, 90, 600) : new THREE.Fog(loc.fog, 200, 1500),
    background: new THREE.Color(loc.sky[1]),
    update: (t) => { sky.material.uniforms.time.value = t; animated.forEach((f) => f(t)); },
  };
}

// ───────── 캠핑장 내 자리: 텐트 · 캠핑카 · 카바나 안 ─────────
// kind: 'dome' | 'teepee' (텐트), 'minivan' | 'motorhome' (캠핑카), 'cabana'
// 앉은 자리에서 앞(+z)을 보면 문 · 큰 창 너머로 바깥 풍경(마당에서 찍은 파노라마)이 보여요
function campView(loc, w, h, part = 0) {
  const t = panoClone(loc);
  t.repeat.set(Math.min(1, (w / h) / 8 * 1.6), 0.62);
  t.offset.set(part * 0.25 + (0.125 - t.repeat.x / 2 + 1) % 1, 0.12); t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), viewMat(t));
}
function plank(c1, c2, n = 8) { return canvasTex(256, 256, (cg, w, h) => { for (let i = 0; i < n; i++) { cg.fillStyle = i % 2 ? c1 : c2; cg.fillRect(0, (i * h) / n, w, h / n); cg.fillStyle = 'rgba(0,0,0,.18)'; cg.fillRect(0, ((i + 1) * h) / n - 2, w, 2); } for (let i = 0; i < 300; i++) { cg.fillStyle = `rgba(60,35,15,${Math.random() * 0.12})`; cg.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 1); } }, [3, 3]); }
function fairyLights(g, from, to, n = 12, sag = 0.25) {
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff1c0', emissive: '#ffcf6a', emissiveIntensity: 1.6 });
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, p = from.clone().lerp(to, t); p.y -= Math.sin(Math.PI * t) * sag; pts.push(p); const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bulb); b.position.copy(p).y -= 0.04; g.add(b); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#3a2a20' })));
}
function sleepingBag(color, lining) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.16, 2.0, 3, 0.07), mat(color, { roughness: 0.7 })); body.position.y = 0.08; g.add(body);
  const flap = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.06, 0.7, 2, 0.03), mat(lining)); flap.position.set(0, 0.19, 0.55); flap.rotation.x = -0.05; g.add(flap);
  const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.12, 0.32, 3, 0.05), mat('#f2ece0')); pillow.position.set(0, 0.2, -0.8); g.add(pillow);
  for (let i = 0; i < 5; i++) { const q = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.012, 0.02), mat(lining)); q.position.set(0, 0.165, -0.6 + i * 0.3); g.add(q); }
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = o.castShadow = true; });
  return g;
}
function hangLamp(g, x, y, z, k = 1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 12), new THREE.MeshStandardMaterial({ color: '#ffe3a8', emissive: '#ffb04a', emissiveIntensity: 1.8 })); m.position.set(x, y, z); g.add(m);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.1, 12), mat('#2a2a2a')); cap.position.set(x, y + 0.15, z); g.add(cap);
  const l = new THREE.PointLight('#ffb866', 4 * k, 7, 1.4); l.position.set(x, y - 0.1, z); l.castShadow = false; g.add(l);
}
export function buildCampRoom(loc, kind) {
  const g = new THREE.Group();
  let seat, floor, bounds, napSpot, blockers = [], camDist = 2.4, maxDist = 3.6, exitZ = null, camLookY = 1.0, camRise = 0.18;
  g.add(new THREE.HemisphereLight('#fff1dc', '#3a2a20', 0.7));
  if (kind === 'dome' || kind === 'teepee') {
    const R = 3.0, tee = kind === 'teepee';
    // 텐트 바닥 깔개
    floor = new THREE.Mesh(new THREE.CircleGeometry(R, 40), mat('#4a5560', { roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (cg, w, h) => { for (let i = 8; i > 0; i--) { cg.fillStyle = ['#c9572a', '#e8b54a', '#f2ece0', '#2f7a96'][i % 4]; cg.beginPath(); cg.arc(w / 2, h / 2, (i / 8) * w / 2, 0, 7); cg.fill(); } }) })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); g.add(rug);
    // 천: 안쪽에서 보이는 돔(또는 원뿔), 안감은 따뜻한 색
    // 앞쪽은 문 자리(z = DZ)에서 천을 잘라 내고, 그 단면 모양 그대로 문 있는 앞판을 세워요
    const DZ = tee ? 1.2 : 2.0, TH = 4.6;
    const clip = [new THREE.Plane(new THREE.Vector3(0, 0, -1), DZ)];
    const fabric = new THREE.MeshStandardMaterial({ color: tee ? '#efe2c6' : '#f0a060', side: THREE.BackSide, roughness: 0.95, emissive: tee ? '#5a4a30' : '#6a3010', emissiveIntensity: 0.25, clippingPlanes: clip });
    const shell = tee ? new THREE.Mesh(new THREE.ConeGeometry(R, TH, 10, 1, true), fabric) : new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), fabric);
    if (tee) shell.position.y = TH / 2; else shell.scale.y = 0.85;
    g.add(shell);
    if (!tee) for (const r of [0.6, -0.6]) { const pole = new THREE.Mesh(new THREE.TorusGeometry(R - 0.02, 0.025, 6, 48, Math.PI), new THREE.MeshStandardMaterial({ color: '#2a2a2a', clippingPlanes: clip })); pole.rotation.y = r; pole.scale.y = 0.85; g.add(pole); }
    else for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 5.4, 6), new THREE.MeshStandardMaterial({ color: '#8a6a4a', clippingPlanes: clip })); p.position.set(Math.sin(a) * 1.45, 2.4, Math.cos(a) * 1.45); p.rotation.set(Math.cos(a) * -0.56, 0, Math.sin(a) * 0.56); g.add(p); }
    const prof = (x) => tee ? TH * (1 - Math.hypot(x, DZ) / R) : 0.85 * Math.sqrt(Math.max(0, R * R - x * x - DZ * DZ));
    const half = tee ? Math.sqrt(R * R - DZ * DZ) : Math.sqrt(R * R - DZ * DZ);
    const dw = 1.5, dh = Math.min(1.75, prof(0) - 0.25);
    const front = new THREE.Shape(); front.moveTo(-half, 0);
    for (let i = 0; i <= 40; i++) { const x = -half + (2 * half * i) / 40; front.lineTo(x, prof(x)); }
    front.lineTo(half, 0); front.closePath();
    const hole = new THREE.Path(); hole.moveTo(-dw / 2, 0); hole.lineTo(-dw / 2, dh * 0.55); hole.quadraticCurveTo(-dw / 2, dh, 0, dh); hole.quadraticCurveTo(dw / 2, dh, dw / 2, dh * 0.55); hole.lineTo(dw / 2, 0); hole.closePath();
    front.holes.push(hole);
    const panel = new THREE.Mesh(new THREE.ShapeGeometry(front), new THREE.MeshStandardMaterial({ color: tee ? '#e3d4b4' : '#e8945a', side: THREE.DoubleSide, roughness: 0.95 }));
    panel.position.z = DZ; g.add(panel);
    const dz = DZ;
    // 문 너머 바깥 풍경
    const view = campView(loc, 9, 5.5, 0); view.position.set(0, 1.6, DZ + 2.6); view.rotation.y = Math.PI; g.add(view);
    // 위로 말아 묶은 문 천 + 모기장 끈
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, dw + 0.1, 12), mat(tee ? '#d9c8a4' : '#c9662a')); roll.rotation.z = Math.PI / 2; roll.position.set(0, dh + 0.06, dz - 0.05); g.add(roll);
    // 침낭 둘, 배낭, 보온병, 책, 그물 주머니
    const b1 = sleepingBag('#2f6f8f', '#e8b54a'); b1.position.set(-0.75, 0, -0.9); b1.rotation.y = 0.05; g.add(b1);
    const b2 = sleepingBag('#a33b2a', '#f2ece0'); b2.position.set(0.8, 0, -0.9); b2.rotation.y = -0.08; g.add(b2);
    const pack = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.6, 0.3, 3, 0.08), mat('#3f6b55')); pack.position.set(-1.9, 0.3, 0.6); pack.rotation.y = 0.6; pack.castShadow = true; g.add(pack);
    const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12), mat('#c9372c', { metalness: 0.4, roughness: 0.3 })); flask.position.set(1.7, 0.15, 0.7); g.add(flask);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.2), mat('#2f5d50')); book.position.set(0.35, 0.03, 0.35); book.rotation.y = 0.4; g.add(book);
    hangLamp(g, 0, tee ? 3.0 : 2.15, -0.2, 1.1);
    fairyLights(g, new THREE.Vector3(-1.9, 1.6, -0.6), new THREE.Vector3(1.9, 1.6, -0.6), 14, 0.2);
    seat = { id: 0, pos: new THREE.Vector3(0, 0, -0.3), rot: 0, y: 0.12 };
    napSpot = { pos: new THREE.Vector3(-0.75, 0.12, 0.05), rot: 0 };   // 파란 침낭 위
    bounds = { minX: -1.8, maxX: 1.8, minZ: -1.7, maxZ: dz - 0.4 };
    camDist = 2.0; maxDist = 2.6;
  } else if (kind === 'minivan' || kind === 'motorhome') {
    const L = kind === 'motorhome' ? 3.6 : 2.8, W = 1.5, H = 2.1;
    const woodF = plank('#b98a5a', '#a87a4c');
    floor = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, W * 2), new THREE.MeshStandardMaterial({ map: woodF, roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const wallM = new THREE.MeshStandardMaterial({ color: '#f2ece0', roughness: 0.9 }), woodM = new THREE.MeshStandardMaterial({ map: plank('#d9b88a', '#cfae80', 10), roughness: 0.7 });
    const plane = (w, h, x, y, z, ry, m) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; p.receiveShadow = true; g.add(p); return p; };
    plane(W * 2, H, -L, H / 2, 0, Math.PI / 2, woodM); plane(W * 2, H, L, H / 2, 0, -Math.PI / 2, woodM);
    plane(L * 2, H, 0, H / 2, -W, 0, woodM);
    // 앞(+z) 벽: 큰 창 하나 + 아래 · 위 벽
    const winW = L * 1.3, winH = 1.05, winY = 1.25;
    plane(L * 2, winY - winH / 2, 0, (winY - winH / 2) / 2, W, Math.PI, wallM);
    plane(L * 2, H - (winY + winH / 2), 0, (H + winY + winH / 2) / 2, W, Math.PI, wallM);
    plane(L - winW / 2, winH, -(L + winW / 2) / 2, winY, W, Math.PI, wallM); plane(L - winW / 2, winH, (L + winW / 2) / 2, winY, W, Math.PI, wallM);
    const view = campView(loc, winW * 2.2, winH * 2.6, 1); view.position.set(0, winY, W + 1.6); view.rotation.y = Math.PI; g.add(view);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.1, 0.06, 0.08), mat('#3a3f45')); frame.position.set(0, winY - winH / 2, W - 0.02); g.add(frame); const f2 = frame.clone(); f2.position.y = winY + winH / 2; g.add(f2);
    // 커튼 (양옆으로 걷어 둔)
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.25, winH + 0.2, 0.05), mat('#e8b54a')); c.position.set(s * (winW / 2 + 0.1), winY, W - 0.08); g.add(c); }
    // 둥근 천장
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(W * 1.05, W * 1.05, L * 2, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: '#f6f1e6', side: THREE.BackSide })); roof.rotation.z = Math.PI / 2; roof.position.y = H - 0.05; roof.scale.set(0.35, 1, 1); g.add(roof);
    // 뒤쪽(-x): 매트리스 침대, 앞쪽(+x): 작은 부엌
    const bed = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.3, W * 2 - 0.1, 3, 0.08), mat('#f2ece0')); bed.position.set(-L + 0.78, 0.55, 0); g.add(bed);
    const quilt = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.08, W * 2 - 0.3, 2, 0.04), mat('#2f7a96')); quilt.position.set(-L + 0.9, 0.73, 0); g.add(quilt);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, W * 2 - 0.1), woodM); base.position.set(-L + 0.78, 0.2, 0); g.add(base);
    for (const z of [-0.6, 0.6]) { const p = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.12, 0.5, 3, 0.05), mat(z < 0 ? '#e8b54a' : '#f2ece0')); p.position.set(-L + 0.3, 0.78, z); g.add(p); }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, W * 2 - 0.1), woodM); counter.position.set(L - 0.56, 0.45, 0); g.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, W * 2 - 0.05), mat('#3a3f45')); top.position.set(L - 0.56, 0.92, 0); g.add(top);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.4), mat('#c9ced3', { metalness: 0.7, roughness: 0.25 })); sink.position.set(L - 0.56, 0.95, -0.5); g.add(sink);
    for (const z of [0.25, 0.75]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), mat('#2a2a2a')); b.position.set(L - 0.56, 0.96, z); g.add(b); }
    const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat('#c9572a', { metalness: 0.3 })); kettle.position.set(L - 0.56, 1.06, 0.25); g.add(kettle);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, W * 2 - 0.2), woodM); shelf.position.set(L - 0.2, 1.5, 0); g.add(shelf);
    for (let i = 0; i < 5; i++) { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), mat(['#e8b54a', '#a33b2a', '#3f6b55', '#f2ece0', '#2f7a96'][i])); j.position.set(L - 0.2, 1.59, -1 + i * 0.5); g.add(j); }
    // 창 앞 접이식 탁자 + 앉은 자리 (등받이 쿠션)
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), woodM); table.position.set(0, 0.72, W - 0.55); g.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), mat('#3a3f45')); leg.position.set(0, 0.36, W - 0.55); g.add(leg);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 12), mat('#f2ece0')); mug.position.set(0.3, 0.8, W - 0.5); g.add(mug);
    const bench = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.42, 0.6, 3, 0.06), mat('#3f6b55')); bench.position.set(0, 0.21, -0.2); g.add(bench);
    hangLamp(g, -0.6, 1.75, 0, 0.8); hangLamp(g, 0.8, 1.75, 0.2, 0.6);
    fairyLights(g, new THREE.Vector3(-L + 0.2, 1.9, W - 0.1), new THREE.Vector3(L - 0.2, 1.9, W - 0.1), 18, 0.12);
    seat = { id: 0, pos: new THREE.Vector3(0, 0, -0.2), rot: 0, y: 0.42 };
    napSpot = { pos: new THREE.Vector3(-L + 0.85, 0.74, 1.05), rot: 0 };   // 뒤쪽 침대 위
    bounds = { minX: -L + 1.6, maxX: L - 1.2, minZ: -W + 0.3, maxZ: W - 0.9 };
    camDist = 1.6; maxDist = 2.2;
  } else {
    // 카바나: 나무 A자 오두막. 앞 박공 전체가 큰 유리창, 옆에 벽난로와 책장
    const W = 3.2, D = 3.6, RIDGE = 4.6;
    floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), new THREE.MeshStandardMaterial({ map: plank('#8a5a34', '#7a4e2c'), roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const woodM = new THREE.MeshStandardMaterial({ map: plank('#b07a48', '#a06c3e', 14), side: THREE.DoubleSide, roughness: 0.75 });
    const slope = Math.hypot(W, RIDGE);
    for (const s of [-1, 1]) { const geo = new THREE.PlaneGeometry(slope, D * 2); geo.rotateX(Math.PI / 2); geo.rotateZ(Math.atan2(RIDGE, -s * W)); const r = new THREE.Mesh(geo, woodM); r.position.set(s * W / 2, RIDGE / 2, 0); r.receiveShadow = true; g.add(r); }
    // 서까래
    for (let z = -D + 0.4; z < D; z += 1.2) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, slope, 0.14), mat('#6b4128')); b.position.set(s * W / 2 * 0.97, RIDGE / 2, z); b.rotation.z = s * Math.atan2(W, RIDGE); g.add(b); }
    // 뒤 박공 벽 (나무)
    const tri = (w, h) => { const sh = new THREE.Shape(); sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(0, h); sh.closePath(); return new THREE.ShapeGeometry(sh); };
    const back = new THREE.Mesh(tri(W, RIDGE), woodM); back.position.z = -D; g.add(back);
    // 앞 박공: 통유리 + 창틀, 너머로 바깥 풍경
    const view = campView(loc, W * 4.2, RIDGE * 1.9, 2); view.position.set(0, RIDGE * 0.45, D + 2.4); view.rotation.y = Math.PI; g.add(view);
    const glass = new THREE.Mesh(tri(W, RIDGE), new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.08, roughness: 0.05 })); glass.position.z = D; g.add(glass);
    const fm = mat('#2a1d16');
    for (const x of [-W * 0.5, 0, W * 0.5]) { const h = RIDGE * (1 - Math.abs(x) / W); const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.1), fm); m.position.set(x, h / 2, D); g.add(m); }
    for (const y of [1.2, 2.6]) { const w = W * (1 - y / RIDGE) * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.1), fm); m.position.set(0, y, D); g.add(m); }
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, slope, 0.12), fm); m.position.set(s * W / 2, RIDGE / 2, D); m.rotation.z = s * Math.atan2(W, RIDGE); g.add(m); }
    // 왼쪽: 돌 벽난로 (불빛이 일렁여요)
    const stoneM = mat('#8a8478', { roughness: 0.95 });
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.7), stoneM); hearth.position.set(-1.7, 0.55, -2.4); g.add(hearth);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 0.5), stoneM); chimney.position.set(-1.7, 2.3, -2.55); g.add(chimney);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshBasicMaterial({ color: '#1a0e08' })); mouth.position.set(-1.7, 0.45, -2.04); g.add(mouth);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 8), new THREE.MeshBasicMaterial({ color: '#ffb04a' })); flame.position.set(-1.7, 0.38, -2.15); g.add(flame);
    const fireL = new THREE.PointLight('#ff8a3a', 5, 8, 1.4); fireL.position.set(-1.7, 0.6, -1.7); g.add(fireL);
    g.userData.tick = (t) => { fireL.intensity = 4.5 + Math.sin(t * 9) * 0.8 + Math.sin(t * 13.3) * 0.5; flame.scale.y = 1 + Math.sin(t * 11) * 0.15; };
    // 오른쪽: 책장
    const shelf = new THREE.Group(); shelf.position.set(1.75, 0, -2.6); g.add(shelf);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 0.35), mat('#6b4128')); fr.position.y = 0.8; shelf.add(fr);
    const rr = rng(9);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3 + rr() * 0.12, 0.25), mat(['#2f5d50', '#8a3a2c', '#c9a86a', '#3b4a6b', '#d9d2c0'][Math.floor(rr() * 5)])); b.position.set(-0.52 + i * 0.145, 0.32 + r * 0.5, 0.06); shelf.add(b); }
    // 러그 · 안락의자(앉는 자리) · 작은 탁자 · 담요 · 스탠드
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), new THREE.MeshStandardMaterial({ map: canvasTex(128, 96, (cg, w, h) => { cg.fillStyle = '#8a3a2c'; cg.fillRect(0, 0, w, h); cg.strokeStyle = '#e8b54a'; cg.lineWidth = 4; cg.strokeRect(8, 8, w - 16, h - 16); for (let i = 0; i < 6; i++) { cg.fillStyle = '#e8d8b8'; cg.fillRect(20 + i * 16, h / 2 - 3, 8, 6); } }) })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.3); g.add(rug);
    const chair = new THREE.Group(); chair.position.set(0, 0, -0.2); g.add(chair);
    const cm = mat('#3f6b55', { roughness: 0.8 });
    const cs = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.35, 0.8, 3, 0.08), cm); cs.position.y = 0.3; chair.add(cs);
    const cb = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.8, 0.22, 3, 0.08), cm); cb.position.set(0, 0.75, -0.38); chair.add(cb);
    for (const s of [-1, 1]) { const a = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.5, 0.8, 3, 0.06), cm); a.position.set(s * 0.52, 0.45, 0); chair.add(a); }
    const throwB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), mat('#e8b54a')); throwB.position.set(0.2, 0.75, -0.25); throwB.rotation.set(-0.2, 0, 0.1); chair.add(throwB);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), mat('#6b4128')); side.position.set(0.9, 0.55, 0.3); g.add(side);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), mat('#3a2a20')); sl.position.set(0.9, 0.27, 0.3); g.add(sl);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 12), mat('#f2ece0')); mug.position.set(0.95, 0.63, 0.3); g.add(mug);
    hangLamp(g, -0.9, 0.9 + 0.55, 0.9, 0.5);
    fairyLights(g, new THREE.Vector3(-W * 0.6, 3.0, D - 0.3), new THREE.Vector3(W * 0.6, 3.0, D - 0.3), 16, 0.3);
    hangLamp(g, 0, RIDGE - 0.9, 0, 1.0);
    // 창가 요: 누워서 창밖 보며 낮잠
    const futon = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.14, 0.95, 3, 0.05), mat('#e8dcc4')); futon.position.set(1.15, 0.07, 1.7); g.add(futon);
    const fp = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.12, 0.6, 3, 0.05), mat('#f2ece0')); fp.position.set(1.95, 0.2, 1.7); g.add(fp);
    const blanket = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.05, 0.97, 2, 0.02), mat('#3f6b55')); blanket.position.set(0.7, 0.16, 1.7); g.add(blanket);
    seat = { id: 0, pos: new THREE.Vector3(0, 0, -0.2), rot: 0, y: 0.4 };
    napSpot = { pos: new THREE.Vector3(0.25, 0.14, 1.7), rot: -Math.PI / 2 };
    camLookY = 1.35; camRise = 0.3;
    bounds = { minX: -W + 1.0, maxX: W - 1.0, minZ: -D + 1.4, maxZ: D - 0.6 };
    camDist = 2.4; maxDist = 3.4;
  }
  return {
    group: g, floor, seats: [seat], exitDoor: null,
    spawn: seat.pos.clone(), spawnRot: 0, camRise, camLookY, napSpot,
    exitZ, camDist, minDist: 1.0, maxDist,
    bounds, blockers, fog: null, background: new THREE.Color('#1c1410'),
    update: (t) => g.userData.tick?.(t),
  };
}
