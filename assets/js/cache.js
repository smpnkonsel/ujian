/* =========================================================
   CACHE.JS — cache data master di browser (hemat Firestore)

   Data yang jarang berubah (siswa, jadwal, paket, guru) cukup dibaca
   sekali lalu dipakai ulang oleh SEMUA halaman selama masa berlaku
   cache. Tanpa ini, setiap halaman membaca ulang seluruh koleksi
   (mis. 900 siswa x 10 halaman = 9.000 pembacaan).

   - Disimpan di localStorage (dipakai bersama antar tab), kunci "kwc:".
   - Timestamp Firestore diubah jadi { __ts: milidetik } lalu dipulihkan
     sebagai objek yang punya toDate() / toMillis().
   - Dihapus otomatis saat keluar (lihat auth.js) dan oleh hapusCache()
     setelah halaman admin mengubah data.
========================================================= */

const AWAL = 'kwc:';

class TsCache {
  constructor(ms) {
    this._ms = ms;
    this.seconds = Math.floor(ms / 1000);
    this.nanoseconds = (ms % 1000) * 1e6;
  }
  toMillis() { return this._ms; }
  toDate() { return new Date(this._ms); }
  valueOf() { return this._ms; }
}

const kePolos = (k, v) =>
  v && typeof v === 'object' && typeof v.toMillis === 'function' && 'seconds' in v
    ? { __ts: v.toMillis() }
    : v;

const dariPolos = (k, v) =>
  v && typeof v === 'object' && typeof v.__ts === 'number' ? new TsCache(v.__ts) : v;

/* Membaca cache. Mengembalikan null bila tidak ada atau kedaluwarsa. */
export function bacaCache(kunci, menit = 15) {
  try {
    const mentah = localStorage.getItem(AWAL + kunci);
    if (!mentah) return null;
    const o = JSON.parse(mentah, dariPolos);
    if (!o || Date.now() - o.t > menit * 60000) return null;
    return o.d;
  } catch (_) { return null; }
}

export function tulisCache(kunci, data) {
  try {
    localStorage.setItem(AWAL + kunci, JSON.stringify({ t: Date.now(), d: data }, kePolos));
  } catch (_) { /* penyimpanan penuh: abaikan, data tetap dipakai dari memori */ }
}

/* Hapus satu atau beberapa kunci (tanpa argumen = semua cache). */
export function hapusCache(...kunci) {
  try {
    if (!kunci.length) {
      Object.keys(localStorage).filter(k => k.startsWith(AWAL)).forEach(k => localStorage.removeItem(k));
      return;
    }
    kunci.forEach(k => localStorage.removeItem(AWAL + k));
  } catch (_) { /* abaikan */ }
}

/* Cache lama milik halaman tertentu (token.js memakai "tok:", jadwal.html "jdw:").
   Dipanggil setelah data berubah supaya halaman lain tidak menampilkan data basi. */
export function hapusCacheHalaman(...nama) {
  try {
    nama.forEach(n => {
      sessionStorage.removeItem('tok:' + n);
      sessionStorage.removeItem('jdw:' + n);
    });
  } catch (_) { /* abaikan */ }
}

/* Baca dari cache; bila kosong, jalankan pengambil() lalu simpan.
   pengambil harus mengembalikan data yang aman di-JSON-kan. */
export async function ambilCache(kunci, menit, pengambil, { paksa = false } = {}) {
  if (!paksa) {
    const c = bacaCache(kunci, menit);
    if (c) return c;
  }
  const data = await pengambil();
  tulisCache(kunci, data);
  return data;
}

/* Daftar dokumen -> [{ id, ...data }]. */
export const keDaftar = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
