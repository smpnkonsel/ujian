
/* =========================================================
   CONFIG.JS — PENGATURAN APLIKASI KW LEARNING
========================================================= */

/* =========================================================
   NAMA KOLEKSI FIRESTORE
========================================================= */

export const KOLEKSI_HASIL = 'hasil';
export const KOLEKSI_TOKEN = 'tokens';
export const KOLEKSI_PAKET = 'paket_soal';

/* =========================================================
   PAKET SOAL BAWAAN
========================================================= */

export const PAKET = [
  {
    id: 'info8',
    nama: 'Informatika Kelas 8 — PAS Semester 1',
    sumber: 'lokal',
    file: 'soal2/SOAL PAS INFO KLS 8 S1.docx',
    menit: 90
  },
  {
    id: 'ipa7',
    nama: 'IPA Kelas 7 — PAS Semester 1',
    sumber: 'lokal',
    file: 'soal2/SOAL PAS ipa  KLS 7 S1.docx',
    menit: 90
  },
  {
    id: 'pjok8',
    nama: 'PJOK Kelas 8',
    sumber: 'lokal',
    file: 'soal2/PJOK KELAS 8.docx',
    menit: 90
  }
];

/* =========================================================
   FIREBASE SDK
========================================================= */

export const FB =
  'https://www.gstatic.com/firebasejs/10.12.2/';

/* =========================================================
   MEMBACA KONFIGURASI FIREBASE
   Lokasi: js/firebaseConfig.js
========================================================= */

export async function bacaConfig() {
  try {
    const module = await import(
      './firebaseConfig.js?v=' + Date.now()
    );

    // Mendukung:
    // export const firebaseConfig = {...}
    // export default {...}
    // export const firebaseConfig = {...}
    const cfg =
      module.firebaseConfig ||
      module.default ||
      module.config ||
      null;

    if (!cfg || typeof cfg !== 'object') {
      throw new Error(
        'Objek konfigurasi Firebase tidak ditemukan. Periksa export firebaseConfig.js.'
      );
    }

    if (!cfg.apiKey || !cfg.projectId) {
      throw new Error(
        'apiKey atau projectId Firebase belum tersedia.'
      );
    }

    if (/^ISI/i.test(cfg.apiKey)) {
      throw new Error(
        'API Key Firebase masih berupa teks placeholder.'
      );
    }

    return {
      cfg,
      err: ''
    };

  } catch (error) {
    console.error(
      'Gagal membaca konfigurasi Firebase:',
      error
    );

    return {
      cfg: {},
      err: error.message || 'Konfigurasi Firebase gagal dibaca.'
    };
  }
}
