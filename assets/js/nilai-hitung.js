/* =========================================================
   NILAI-HITUNG.JS — rumus rekap nilai, sama dengan Excel sekolah.
   Murni perhitungan (tanpa Firebase, tanpa DOM), jadi bisa dipakai
   oleh tabel di layar, unduhan Excel, dan pemeriksaan impor.
========================================================= */

/* Pembulatan seperti ROUND Excel (hindari galat desimal biner). */
export const bulat = (x, d = 0) => Number(Math.round(Number(x + 'e' + d)) + 'e-' + d);

/* Angka valid 0–100, selain itu null. Koma desimal diterima. */
export function angka(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/* Rata-rata dari sel yang terisi saja, 1 desimal (IF(COUNT=0,"",ROUND(AVERAGE,1))). */
export function rata(daftar) {
  const v = (daftar || []).map(angka).filter(n => n !== null);
  return v.length ? bulat(v.reduce((a, x) => a + x, 0) / v.length, 1) : null;
}

/* Pengaturan bawaan = file Excel sekolah. praktik hanya dipakai bila bobotnya > 0. */
export const BOBOT_BAWAAN = { tugas: 0.2, uh: 0.3, uts: 0.2, sas: 0.3, praktik: 0 };
export const PREDIKAT_BAWAAN = { A: 90, B: 80 };

/* Satu siswa -> semua angka yang tampil di tabel dan Excel.
   s: { tg:[6], uh:[3], uts, sas, praktik }
   Nilai akhir kosong sampai SEMUA komponen yang berbobot terisi. */
export function hitungSiswa(s, { kkm = 75, bobot = BOBOT_BAWAAN, predikat = PREDIKAT_BAWAAN } = {}) {
  const nilaiTugas = rata(s.tg);
  const nilaiUH = rata(s.uh);
  const uts = angka(s.uts);
  const sas = angka(s.sas);
  const praktik = angka(s.praktik);

  const komponen = { tugas: nilaiTugas, uh: nilaiUH, uts, sas, praktik };
  const aktif = Object.keys(bobot).filter(k => bobot[k] > 0);
  const lengkap = aktif.every(k => komponen[k] !== null);

  const akhir = lengkap
    ? bulat(aktif.reduce((jml, k) => jml + komponen[k] * bobot[k], 0), 0)
    : null;

  const huruf = akhir === null ? null
    : akhir >= predikat.A ? 'A'
    : akhir >= predikat.B ? 'B'
    : akhir >= kkm ? 'C' : 'D';

  return {
    nilaiTugas, nilaiUH, uts, sas, praktik, akhir,
    predikat: huruf,
    keterangan: akhir === null ? null : akhir >= kkm ? 'Tuntas' : 'Belum Tuntas',
    tugasTerisi: (s.tg || []).filter(v => angka(v) !== null).length,
    uhTerisi: (s.uh || []).filter(v => angka(v) !== null).length,
    lengkap
  };
}

/* Ringkasan ketuntasan satu kelas. */
export function ringkasan(hasilSiswa, kkm = 75) {
  const jumlah = hasilSiswa.length;
  const tuntas = hasilSiswa.filter(h => h.keterangan === 'Tuntas').length;
  const belum = hasilSiswa.filter(h => h.keterangan === 'Belum Tuntas').length;
  return {
    jumlah, tuntas, belum,
    belumLengkap: jumlah - tuntas - belum,
    persen: jumlah ? tuntas / jumlah : 0,
    kkm
  };
}

/* Pastikan total bobot 100% (toleransi galat desimal). */
export const bobotValid = b =>
  Math.abs(Object.values(b).reduce((a, x) => a + x, 0) - 1) < 1e-9;