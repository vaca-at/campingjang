# 캠핑장 · 남은 일

2026-10-31 정리. 사이트: https://campingjang.site · 관리자 현황판: https://campingjang.site/admin.html
큰법당 템플스테이(templestay.site)의 뼈대를 가져와 만들었어요. 템플스테이 쪽 남은 일은 그 저장소의 `TODO.md` 에 있어요.

## 정해 주셔야 하는 것 (정하면 바로 만들기)
- **이름**: 후보 `캠핑장 별밤스테이`(추천) · `캠핑장 모닥불스테이` · `캠핑장 불멍스테이` · `캠핑장 반딧불스테이` · `캠핑장 도란스테이`. 정하면 `<title>`, `og:title`, `manifest.webmanifest` 의 `name` · `short_name` 을 함께 바꾸기
- **OG 이미지 · 아이콘**: 가로 OG 시안 A · B(3D 별밤 마당) · C(그림체), 아이콘 시안 1(팽나무) · 2(모닥불) · 3(첫 글자). 고르면 `og.png`, `icon-512.png`, `icon-192.png`, `icon-180.png`, `icon-32.png` 바꾸기
- **제목 글씨체**: 온글잎 언즈체(손글씨, 큰 제목용) 또는 다른 둥근 글씨체. 본문은 지금처럼 읽기 쉬운 글씨체 그대로

## 확인하고 정리할 것
- **관리자 로그인은 구글로만**: 템플스테이처럼 `admin.html` 의 비밀번호 칸과 `server/worker.js` 의 `/admin/login` · 비밀번호를 바로 보내도 통과되는 줄을 빼고 `cd server && npx wrangler deploy`
- **`ADMIN_PASSWORD` 바꾸기**: 템플스테이와 같은 값이면 노출된 값이라 `npx wrangler secret put ADMIN_PASSWORD` 로 길고 무작위한 값으로
- **템플스테이에서 남은 화면 조각**: `index.html` 의 발우공양 10분 시계(`#meal-timer`)와 "공양을 마쳤어요" 창(`#meal-done`)은 캠핑장에서 쓰지 않으면 지우기

## 일하는 법
- **사이트 올리기**: `main` 에 push 하면 GitHub Pages(campingjang.site)로 1분쯤 뒤 반영
- **방 중계 서버**(`server/`, Cloudflare Worker `campingjang-rooms`): `cd server && npx wrangler deploy` (처음 한 번 `npx wrangler login`, 계정 bellachord). Node.js 가 있는 PC에서
- **로컬로 보기**: 저장소 폴더에서 정적 서버 (`npx serve .` 또는 `python3 -m http.server 8765`). 서버(Worker)는 `127.0.0.1:8765`, `localhost:8765` 에서 오는 요청만 받아요 — 실시간 접속을 시험하려면 8765 포트로
- **확인용 주소** (index.html 뒤에 붙이기)
  - `?demo=in|out|meal|room&loc=forest|sea|river&bots=6` 장소 바로 열기 + 가짜 캠퍼 (in 캠프 마당 · out 물가 · meal 취사장 · room 내 자리 / forest 텐트·산속 · sea 캠핑카·바닷가 · river 카바나·별밤)
  - `&cam=x,y,z,tx,ty,tz` 카메라 자리와 보는 곳 (보는 곳까지 13 넘게 떨어지면 카메라가 앞으로 끌려와요)
  - `&shot` 화면을 이미지로 읽을 수 있게 (OG 찍기용) · `?debug` 이면 콘솔에서 `__S` 로 상태 보기
- 여러 창(세션)이 같은 저장소를 고침: 고치기 전에 `git pull`, 시안은 확정된 것만 올리기
