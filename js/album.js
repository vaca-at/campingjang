// 내 사진: 찍은 사진을 이 기기 브라우저 안(IndexedDB)에만 모아 둬요. 서버로 보내지 않고, 따로 열어 줄 저장소도 필요 없어요.
// 브라우저 방문 기록 · 사이트 데이터를 지우면 함께 지워져요
const DB = 'campingjang-album', STORE = 'photos', MAX = 60;

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  }));
}

export async function addPhoto(blob, place) {
  try {
    const id = `${Date.now()}`;
    await tx('readwrite', (st) => st.put({ id, at: Date.now(), place, blob }));
    // 너무 많으면 오래된 것부터 정리
    const all = await listPhotos();
    if (all.length > MAX) await Promise.all(all.slice(MAX).map((p) => removePhoto(p.id)));
    return true;
  } catch { return false; }
}
export async function listPhotos() {
  try { const all = await tx('readonly', (st) => st.getAll()); return (all || []).sort((a, b) => b.at - a.at); } catch { return []; }
}
export function removePhoto(id) { return tx('readwrite', (st) => st.delete(id)).catch(() => {}); }
