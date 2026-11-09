/* =========================================================
   DATA.JS — pembacaan data gabungan dari tiga Firebase tingkat
   (VII, VIII, IX). Dipakai halaman monitoring dan hasil.
========================================================= */
import { F, TINGKAT, dbTingkat, dbBankSoal, KOLEKSI } from './firebase-pusat.js';
import { ambilCache } from './cache.js';
import { dalamRentang } from './periode.js';

export const urutAlfa = (a, b) =>
  String(a).localeCompare(String(b), 'id', { numeric: true });

/* Membaca satu koleksi dari semua tingkat.
   Opsi: batas (per tingkat), urut (nama field, menurun), tingkat (array).
   Mengembalikan { rows, gagal } — satu tingkat yang gagal tidak
   membatalkan tingkat lain. */
export async function ambilTingkat(koleksi, { batas = 500, urut = '', tingkat = TINGKAT, sejak = null, rentang = null } = {}) {
  /* rentang = { field: 'waktu', dari: Date|null, sampai: Date|null (eksklusif) } dari periode.js:
     hanya dokumen pada periode itu yang dibaca dari server (terbaru dulu). Hasil juga
     disaring ulang di sisi klien sebagai pengaman. Tingkat yang jumlahnya mencapai
     batas dicatat di `terpotong` agar halaman bisa meminta periode lebih sempit. */
  const terpotong = [];
  /* sejak = { field: 'mulai', date: Date }: hanya dokumen dengan field >= tanggal itu,
     diurutkan terbaru dulu. Jauh lebih hemat daripada membaca semua dokumen lama. */
  const hasil = await Promise.allSettled(tingkat.map(async t => {
    const ref = F.collection(dbTingkat(t), koleksi);
    let snap;
    if (rentang && rentang.field && (rentang.dari || rentang.sampai)) {
      try {
        const w = [];
        if (rentang.dari) w.push(F.where(rentang.field, '>=', F.Timestamp.fromDate(rentang.dari)));
        if (rentang.sampai) w.push(F.where(rentang.field, '<', F.Timestamp.fromDate(rentang.sampai)));
        snap = await F.getDocs(F.query(ref, ...w, F.orderBy(rentang.field, 'desc'), F.limit(batas)));
      } catch (e) {
        console.warn(koleksi + ': filter periode ' + rentang.field + ' gagal, pakai tanpa filter.', e);
      }
    }
    if (!snap && sejak && sejak.field && sejak.date) {
      try {
        snap = await F.getDocs(F.query(ref,
          F.where(sejak.field, '>=', F.Timestamp.fromDate(sejak.date)),
          F.orderBy(sejak.field, 'desc'), F.limit(batas)));
      } catch (e) {
        console.warn(koleksi + ': filter ' + sejak.field + ' gagal, pakai tanpa filter.', e);
      }
    }
    if (!snap && urut) {
      try {
        snap = await F.getDocs(F.query(ref, F.orderBy(urut, 'desc'), F.limit(batas)));
      } catch (e) {
        console.warn(koleksi + ': urutan ' + urut + ' gagal, pakai tanpa urutan.', e);
      }
    }
    if (!snap) snap = await F.getDocs(F.query(ref, F.limit(batas)));
    if (snap.size >= batas) terpotong.push(t);
    let daftar = snap.docs.map(d => ({ id: d.id, ...d.data(), tingkat: t }));
    if (rentang && rentang.field && (rentang.dari || rentang.sampai)) {
      daftar = daftar.filter(x => dalamRentang(x[rentang.field], rentang));
    }
    return daftar;
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
  return { rows, gagal, terpotong };
}

/* Jenis lama disamakan dengan yang baru: UTS -> PTS, "Ulangan Harian" -> UH. */
export function normJenis(j) {
  const t = String(j || '').trim().toUpperCase();
  if (t === 'UTS') return 'PTS';
  if (t === 'ULANGAN HARIAN') return 'UH';
  return t;
}

/* Peta paketId -> jenis ujian (SAS/PTS/dst.), dari cache paket bersama (cache.js).
   Gagal membaca tidak fatal: filter jenis saja yang kosong. */
export async function petaJenisPaket() {
  try {
    const daftar = await ambilCache('paket', 15, async () =>
      (await F.getDocs(F.collection(dbBankSoal, KOLEKSI.paket))).docs.map(d => ({ id: d.id, ...d.data() })));
    return new Map(daftar.map(p => [p.id, normJenis(p.jenis)]));
  } catch (e) {
    console.warn('Jenis paket tidak terbaca:', e);
    return new Map();
  }
}
