// 앱 전체에서 쓰는 고정 데이터: 캠핑 사이트(디자인), 장소, 머리 · 옷 · 장신구, 동작, 캠퍼 이름

export const APP_ID = 'campingjang-v1';
// 방 중계 서버 주소 (server/ 폴더의 Cloudflare Worker). 비어 있으면 브라우저끼리 직접 연결한다
export const RELAY_URL = 'https://campingjang-rooms.bellachord.workers.dev';
// 관리자 구글 로그인 (Firebase Moon 프로젝트). apiKey 는 공개돼도 되는 값. 비어 있으면 구글 로그인 단추를 숨긴다
export const FIREBASE = { apiKey: 'AIzaSyA3CxawUPIfGeBWyffsNbCSM3ymjKHLH6o', authDomain: 'moon-d528d.firebaseapp.com', projectId: 'moon-d528d', appId: '1:126636401536:web:25b8a8296ec42b86f99765' };
export const SERVER_COUNT = 12;
export const SERVER_CAP = 100;

// 캠핑 사이트(디자인) 3곳. id 는 풍경 모양(world.js)을 고르는 이름이라 그대로 두고 이름만 캠핑으로
export const LOCATIONS = [
  {
    id: 'forest',
    name: '텐트 · 산속',
    place: '단풍 든 계곡 옆 솔숲',
    desc: '연못이 있는 산속 캠핑장. 돔 텐트와 타프 아래에서 모닥불',
    sky: ['#9cc6e8', '#e9efe6'],
    fog: '#dfe7dc',
    interior: { wall: '#e9e2cf', floor: '#4a3a2a', pillar: '#6b4a2e', beam: '#3f6b55', accent: '#d9622b', lamp: '#ffd9a0' },
  },
  {
    id: 'sea',
    name: '캠핑카 · 바닷가',
    place: '다도해가 내려다보이는 언덕',
    desc: '바다를 앞에 둔 캠핑카 사이트. 노을과 윤슬',
    sky: ['#7fb6e0', '#e6f1f6'],
    fog: '#d9e8ef',
    interior: { wall: '#eef0ea', floor: '#5a4a3a', pillar: '#2f7a96', beam: '#2f7a96', accent: '#e8b54a', lamp: '#fff0c8' },
  },
  {
    id: 'river',
    name: '카바나 · 별밤',
    place: '두 강이 만나는 언덕 위 초원',
    desc: '늘 밤인 카바나 사이트. 은하수와 전구 줄',
    sky: ['#0d1433', '#2b3570'],
    fog: '#1c2448',
    night: true,
    interior: { wall: '#f2ece0', floor: '#4a3a2c', pillar: '#8a6a4a', beam: '#2c3566', accent: '#ffd77a', lamp: '#ffd9a0' },
  },
];

// 큰법당의 불상 자리 (캠핑장에는 없어요)
export const BUDDHAS = {};

export const SKIN_TONES = ['#f4c9a6', '#e8b48c', '#d79b72', '#b97a55', '#8d5a3b'];

// 캐릭터 유형: head 모양과 장식(머리카락, 귀, 꼬리)이 다르다
// block: true 는 네모난 블록 사람(우리 캐릭터). 'own' 옷을 고르면 캐릭터 고유 차림을 입는다
// 머리 스타일 (예전 '캐릭터'). id 는 저장된 값과 맞추려고 그대로 두고, 여자 · 남자 머리 이름을 따로 보여 줘요.
// name · desc 는 예전 차림 이름 (이제 옷 목록의 '…' 옷으로 옮겨 갔어요)
export const CHAR_TYPES = [
  { id: 'moral', hairF: '단발', hairM: '옆 가르마', color: '까만 머리', name: '남색 카디건', desc: '흰 깃이 보이는 단정한 차림', block: true },
  { id: 'appteacher', hairF: '낮은 묶음', hairM: '스포츠', color: '까만 머리', name: '안경과 초록 셔츠', desc: '동그란 안경, 초록 셔츠', block: true },
  { id: 'tycoon', hairF: '올림머리', hairM: '올백', color: '까만 머리', name: '검은 정장', desc: '빨간 넥타이를 맨 정장', block: true },
  { id: 'trainee', hairF: '땋은 머리', hairM: '바가지', color: '밤색 머리', name: '파란 모자', desc: '흰 셔츠에 목걸이 명찰', block: true },
  { id: 'planner', hairF: '웨이브', hairM: '가운데 가르마', color: '갈색 머리', name: '베레모와 분홍 니트', desc: '빨간 베레모, 연분홍 니트', block: true },
  { id: 'knitdev', hairF: '양갈래', hairM: '곱슬', color: '까만 머리', name: '초록 줄무늬 니트', desc: '포근한 줄무늬 스웨터', block: true },
  { id: 'hoodie', hairF: '숏컷', hairM: '투블럭', color: '짙은 갈색', name: '초록 후드티', desc: '모자 달린 후드와 끈', block: true },
  { id: 'beige', hairF: '긴 생머리', hairM: '묶은 머리', color: '갈색 머리', name: '베이지 재킷', desc: '검은 상의와 바지', block: true },
];
export const hairName = (t, gender) => (gender === 'm' ? t.hairM : t.hairF);
// 예전에 저장된 둥근 캐릭터(동자, 보살 등)도 계속 그려지도록 avatar.js 에 남겨 둔다

// 옷: top 상의, bottom 하의, sash 가사·띠, style 별 세부 장식
export const OUTFITS = [
  // 'own' 은 예전 값: 머리 스타일(type)에 딸린 차림. 지금은 아래 '…' 옷들로 따로 골라요
  { id: 'own', name: '캐릭터 기본 옷', cap: '블록 캐릭터 고유 차림', top: '#2f8a8c', bottom: '#2c3450', sash: '#3d8fc4', style: 'own', hidden: true },
  { id: 'wear_beige', name: '베이지 재킷', cap: '검은 상의와 바지', style: 'own', preset: 'beige' },
  { id: 'wear_moral', name: '남색 카디건', cap: '흰 깃이 보이는 단정한 차림', style: 'own', preset: 'moral' },
  { id: 'wear_tycoon', name: '검은 정장', cap: '빨간 넥타이', style: 'own', preset: 'tycoon' },
  { id: 'wear_appteacher', name: '초록 셔츠와 안경', cap: '동그란 안경', style: 'own', preset: 'appteacher' },
  { id: 'wear_trainee', name: '파란 모자와 명찰', cap: '흰 셔츠에 목걸이 명찰', style: 'own', preset: 'trainee' },
  { id: 'wear_planner', name: '베레모와 분홍 니트', cap: '빨간 베레모', style: 'own', preset: 'planner' },
  { id: 'wear_knitdev', name: '초록 줄무늬 니트', cap: '포근한 스웨터', style: 'own', preset: 'knitdev' },
  { id: 'wear_hoodie', name: '초록 후드티', cap: '모자 달린 후드와 끈', style: 'own', preset: 'hoodie' },
  { id: 'windbreaker', name: '바람막이', cap: '주황 바람막이에 검은 바지', top: '#e2603d', bottom: '#2f3540', deco: 'track', decoC: '#2f3540', style: 'plain' },
  { id: 'fleece', name: '플리스', cap: '복슬복슬 크림 플리스', top: '#efe6d2', bottom: '#5a6b52', deco: 'puffer', decoC: '#e2d8c0', style: 'plain' },
  { id: 'seungbok', name: '승복', cap: '회색 승복에 노란 띠', top: '#c9ccc8', bottom: '#b9bcb8', sash: '#e9d27a', style: 'robe', hidden: true },
  { id: 'gasa', name: '가사장삼', cap: '갈색 장삼에 붉은 가사', top: '#8a6a4f', bottom: '#7a5c44', sash: '#c4532f', style: 'kasaya', hidden: true }, // 고르는 목록에서는 뺌 (예전에 고른 사람은 그대로 보임)
  { id: 'hanbok', name: '생활한복', cap: '쪽빛 저고리와 고름', top: '#4f5f8f', bottom: '#d9d2c0', sash: '#e8a3a3', style: 'hanbok' },
  { id: 'lotus', name: '연꽃 법회복', cap: '하얀 옷에 연분홍 띠', top: '#f6f2ea', bottom: '#efe7d8', sash: '#e58fa6', style: 'robe', hidden: true },
  { id: 'hiking', name: '등산복', cap: '산길 오르는 차림과 배낭', top: '#e2603d', bottom: '#3c4552', sash: '#2b7a6a', style: 'hiking' },
  { id: 'durumagi', name: '단풍 두루마기', cap: '가을빛 긴 두루마기', top: '#b5502e', bottom: '#d8c7a6', sash: '#f0c05a', style: 'coat' },
  { id: 'saehanbok', name: '연두 개량한복', cap: '연두 저고리에 흰 바지', top: '#a8c97a', bottom: '#f2ede2', sash: '#d96a6a', style: 'hanbok' },
  { id: 'suhaeng', name: '갈색 수행복', cap: '편안한 갈색 수행복', top: '#8a6a4a', bottom: '#7a5c3e', sash: '#c9a24a', style: 'robe', hidden: true },
  { id: 'overalls', name: '청 멜빵바지', cap: '흰 티에 청 멜빵', top: '#f4f4f2', bottom: '#4a6fa5', deco: 'overalls', decoC: '#4a6fa5', style: 'plain' },
  { id: 'puffer', name: '패딩 점퍼', cap: '밤 캠핑 패딩', top: '#2f3e66', bottom: '#2a2a2c', deco: 'puffer', decoC: '#26345a', style: 'plain' },
  { id: 'track', name: '트레이닝복', cap: '흰 줄 세 개 운동복', top: '#2f6f62', bottom: '#2f6f62', deco: 'track', decoC: '#f4f4f2', style: 'plain' },
  { id: 'wizard', name: '보라 마법사 옷', cap: '별무늬 긴 옷과 망토 · 남녀 공용', top: '#5b3f94', bottom: '#4a3279', sash: '#f2c94c', style: 'wizard' },
  // 법당 안에서는 누구나 이 옷으로 갈아입는다 (고르는 목록에는 안 나옴)
  { id: 'monkgray', name: '스님 회색 옷', cap: '법당 안 차림', top: '#9b9e9b', bottom: '#8e918e', sash: '#7f827f', style: 'robe', hidden: true },
];

// 장소(scene)별로 입는 옷: 캠핑장에서는 어디서나 고른 옷 그대로
export function dressFor(look) { return look; }

// 하루 활동. scene: 그 활동을 하러 가는 곳
// 장소 줄 순서: 법당 → 내 방 → 마당 → 공양간
export const SCENES = {
  in: { name: '캠프 마당', cap: '모닥불 둘레에 모두 모여요' },
  room: { name: '내 자리', cap: '텐트 · 캠핑카 · 카바나 안' },
  out: { name: '물가', cap: '낚시 · 곤충 잡기' },
  meal: { name: '취사장', cap: '요리 · 설거지 · 화장실' },
};

// 절기 행사: 한국 날짜로 기간 안이면 그 행사 이름 (확인용: 주소 끝 ?season=halloween 또는 ?season=none)
// 할로윈은 10월 24일 ~ 10월 31일. 11월 1일 0시가 되면 저절로 사라져요 (이미 고른 친구 · 장신구 모습은 남아요)
const SEASONS = [{ id: 'halloween', from: '10-24', to: '10-31' }];
export function season() {
  const q = new URLSearchParams(location.search).get('season');
  if (q) return q === 'none' ? null : q;
  const md = new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 10);
  return SEASONS.find((s) => s.from <= md && md <= s.to)?.id || null;
}
// 기간 한정 항목(season 이 붙은 것)은 그 행사 때만 고르는 목록에 보여요
export const inSeason = (item) => !item.season || item.season === season();

export const ACCESSORIES = [
  { id: 'none', name: '없음', cap: '장신구 빼기' },
  { id: 'headlamp', name: '헤드랜턴', cap: '이마에 켜는 작은 등' },
  { id: 'buckethat', name: '버킷햇', cap: '캠핑 버킷햇' },
  { id: 'beads', name: '염주 목걸이', cap: '목에 거는 염주', hidden: true },
  { id: 'bracelet', name: '염주 팔찌', cap: '왼쪽 손목에 두른 염주', hidden: true },
  { id: 'satgat', name: '밀짚 삿갓', cap: '넓은 밀짚 모자' },
  { id: 'lotuspin', name: '꽃 핀', cap: '머리에 꽂는 분홍 꽃' },
  { id: 'backpack', name: '배낭', cap: '등에 메는 회색 가방' },
  { id: 'witchhat', name: '보라 고깔모자', cap: '할로윈 한정 · 10/31까지', season: 'halloween' },
  { id: 'roundglasses', name: '동그란 안경', cap: '얇은 금테 안경' },
  { id: 'sunglasses', name: '선글라스', cap: '까만 네모 선글라스' },
  { id: 'scarf', name: '목도리', cap: '포근한 체크 목도리' },
  { id: 'ribbon', name: '리본 핀', cap: '커다란 빨간 리본' },
  { id: 'headphones', name: '헤드폰', cap: '음악 듣는 헤드폰' },
  { id: 'bowtie', name: '나비넥타이', cap: '빨간 나비넥타이' },
];

// 동작. seatedOk: 앉은 채로 할 수 있는지. loop: 다시 누를 때까지 계속
export const ACTIONS = [
  // 캠프 마당
  { id: 'warm', name: '불 쬐기', cap: '모닥불에 손 녹이기', verb: '모닥불에 손을 녹여요', loop: true },
  { id: 'roast', name: '마시멜로', cap: '꼬치에 꽂아 노릇하게 굽기', verb: '마시멜로를 굽기 시작했어요', loop: true },
  { id: 'chop', name: '장작 패기', cap: '도끼로 장작을 쪼개요', verb: '장작을 패기 시작했어요', loop: true },
  { id: 'fireworks', name: '불꽃놀이', cap: '밤하늘에 불꽃 쏘기 · 모두에게 보여요', verb: '불꽃을 쏘아 올렸어요', dur: 2.6 },
  { id: 'wave', name: '손 흔들기', cap: '반갑게 손 흔들기', verb: '손을 흔들었어요', dur: 2.0 },
  // 물가
  { id: 'fish', name: '낚시', cap: '낚싯대를 드리우고 기다리기', verb: '낚시를 시작했어요', loop: true },
  { id: 'bugs', name: '곤충 잡기', cap: '잠자리채를 휘둘러요', verb: '곤충을 잡으러 나섰어요', loop: true },
  { id: 'skip', name: '물수제비', cap: '납작한 돌을 던져요', verb: '물수제비를 떴어요', dur: 2.2 },
  { id: 'walk', name: '산책', cap: '마당 둘레를 천천히 걷기', verb: '산책을 시작했어요' },
  { id: 'splash', name: '물놀이', cap: '물 튀기며 놀기', verb: '물놀이를 시작했어요', loop: true },
  // 취사장
  { id: 'cook', name: '요리하기', cap: '코펠에 휘휘 저어요', verb: '요리를 시작했어요', loop: true },
  { id: 'grill', name: '고기 굽기', cap: '집게로 뒤집기', verb: '고기를 굽기 시작했어요', loop: true },
  { id: 'eat', name: '라면 먹기', cap: '앉아서 호로록', verb: '라면을 먹기 시작했어요', loop: true, seat: true },
  { id: 'wash', name: '설거지', cap: '코펠 닦기', verb: '설거지를 시작했어요', loop: true, seat: true },
  { id: 'sweep', name: '청소', cap: '쓰레기 줍고 분리수거', verb: '청소를 시작했어요', loop: true },
  // 내 자리
  { id: 'nap', name: '낮잠', cap: '스르르 눈 감기', verb: '낮잠을 자요', loop: true },
  { id: 'read', name: '책 읽기', cap: '랜턴 아래에서 책 펼치기', verb: '책을 펼쳤어요', loop: true, seat: true },
  { id: 'guitar', name: '기타 치기', cap: '통기타 둥가둥가', verb: '기타를 치기 시작했어요', loop: true },
  { id: 'stars', name: '별 보기', cap: '고개 들어 밤하늘 보기', verb: '별을 보기 시작했어요', loop: true },
  { id: 'tea', name: '코코아', cap: '따뜻한 코코아 한 잔', verb: '코코아를 마시기 시작했어요', loop: true },
];

// 장소마다 아래 동작 줄에 나오는 다섯 가지 (숫자 키 1~5 순서). seat: 앉아야 하는 동작이라 자동으로 앉아요
export const SCENE_ACTIONS = {
  in: ['warm', 'roast', 'chop', 'fireworks', 'wave'],
  room: ['nap', 'read', 'guitar', 'stars', 'tea'],
  out: ['fish', 'bugs', 'skip', 'walk', 'splash'],
  meal: ['cook', 'grill', 'eat', 'wash', 'sweep'],
};
// 장소에 따라 이름만 다르게 보이는 동작
export const SCENE_ACTION_NAMES = {};

// 표정: 말 대신 얼굴로. 누르면 4초 동안 그 얼굴이 되고 같은 서버 모두에게 보여요
export const FACES = [
  { id: 'smile', name: '웃음', icon: '😊' },
  { id: 'laugh', name: '크게 웃기', icon: '😆' },
  { id: 'wow', name: '놀람', icon: '😮' },
  { id: 'sad', name: '시무룩', icon: '😢' },
  { id: 'sleepy', name: '졸림', icon: '😴' },
  { id: 'love', name: '좋아요', icon: '😍' },
];

// 캠퍼 이름: 꾸밈말 + 캠핑 낱말 (16 × 28 = 448가지)
const ADJ = ['느긋한', '졸린', '배고픈', '신난', '포근한', '반짝이는', '부지런한', '용감한', '꾸벅이는', '수줍은', '든든한', '말랑한', '따끈한', '행복한', '씩씩한', '노릇한'];
const NOUN = [
  '반딧불', '도토리', '마시멜로', '솔방울', '다람쥐', '너구리', '부엉이', '개구리', '송사리', '잠자리',
  '모닥불', '장작불', '랜턴불', '은하수', '별똥별', '초승달',
  '텐트집', '침낭속', '해먹', '코펠', '버너', '타프',
  '코코아', '군고구마', '라면', '꼬치', '감자', '옥수수',
];
export const randomName = () =>
  ADJ[Math.floor(Math.random() * ADJ.length)] + ' ' + NOUN[Math.floor(Math.random() * NOUN.length)];
export function isOldAutoName() { return false; }

export const GENDERS = [{ id: 'f', name: '여자', cap: '여자 머리 스타일 8가지' }, { id: 'm', name: '남자', cap: '남자 머리 스타일 8가지' }];

// 체형: 얼굴은 같고 키·등신·체격만 달라요. k 전체 크기 · leg 다리 길이 · th 몸통 높이 · tw 어깨 너비 · head 머리 크기 · limb 팔다리 굵기
export const BODIES = [
  { id: 'base', label: '보통', k: 1, leg: 1, th: 1, tw: 1, head: 1, limb: 1 },
  { id: 'sturdy', label: '듬직한 체격', k: 1, leg: 1, th: 1, tw: 1.28, head: 1, limb: 1.25 },
  { id: 'petite', label: '아담한 키', k: 0.95, leg: 0.76, th: 0.92, tw: 1, head: 1, limb: 1 },
  { id: 'teen', label: '조금 작은 키', k: 0.9, leg: 0.9, th: 0.9, tw: 0.92, head: 1.03, limb: 0.92 },
  { id: 'child', label: '작은 키', k: 0.82, leg: 0.62, th: 0.72, tw: 0.86, head: 1.12, limb: 0.86 },
  { id: 'tiny', label: '아주 작은 키', k: 0.72, leg: 0.48, th: 0.58, tw: 0.82, head: 1.16, limb: 0.82 },
];
export const bodyOf = (look) => BODIES.find((b) => b.id === look?.body) || BODIES[0];

export const defaultLook = () => ({
  body: 'base',
  type: 'beige',
  gender: 'f',
  pet: 'claude',
  skin: SKIN_TONES[0],
  outfit: 'wear_beige',
  acc: 'none',
});
