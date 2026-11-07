/* =========================================================
   DATA.JS — pembacaan data gabungan dari tiga Firebase tingkat
   (VII, VIII, IX). Dipakai halaman monitoring dan hasil.
========================================================= */
import { F, TINGKAT, dbTingkat } from './firebase-pusat.js';

export const urutAlfa = (a, b) =>
  String(a).localeCompare(String(b), 'id', { numeric: true });

/* Membaca satu koleksi dari semua tingkat.
   Opsi: batas (per tingkat), urut (nama field, menurun), tingkat (array).
   Mengembalikan { rows, gagal } — satu tingkat yang gagal tidak
   membatalkan tingkat lain. */
export async function ambilTingkat(koleksi, { batas = 500, urut = '', tingkat = TINGKAT } = {}) {
  const hasil = await Promise.allSettled(tingkat.map(async t => {
    const ref = F.collection(dbTingkat(t), koleksi);
    let snap;
    if (urut) {
      try {
        snap = await F.getDocs(F.query(ref, F.orderBy(urut, 'desc'), F.limit(batas)));
      } catch (e) {
        console.warn(koleksi + ': urutan ' + urut + ' gagal, pakai tanpa urutan.', e);
      }
    }
    if (!snap) snap = await F.getDocs(F.query(ref, F.limit(batas)));
    return snap.docs.map(d => ({ id: d.id, ...d.data(), tingkat: t }));
  }));

  const rows = [];
  const gagal = [];
  hasil.forEach((r, i) => {
    if (r.status === 'fulfilled') rows.push(...r.value);
    else gagal.push({ tingkat: tingkat[i], pesan: r.reason?.code || r.reason?.message || 'gagal' });
  });

  if (!rows.length && gagal.length === tingkat.length) {
    throw new Error('Semua Firebase tingkat gagal dibaca (' + gagal[0].pesan + ').');
  }
  return { rows, gagal };
}
