/* =========================================================
   CONFIG.JS — PENGATURAN APLIKASI KW LEARNING
========================================================= */

/* =========================================================
   NAMA KOLEKSI FIRESTORE
========================================================= */

export const KOLEKSI_TOKEN = 'tokens';
export const KOLEKSI_PAKET = 'paket_soal';
export const KOLEKSI_HASIL = 'hasil';

/* =========================================================
   PAKET BAWAAN (opsional)
   Paket dari Firestore ditambahkan otomatis oleh halaman admin.
   Isi contoh: { id, nama, kelas, sumber: 'drive', file: 'ID_FILE' }
========================================================= */

export const PAKET = [];

/* =========================================================
   FIREBASE SDK
========================================================= */

export const FB =
  'https://www.gstatic.com/firebasejs/10.12.2/';

/* =========================================================
   MEMBACA KONFIGURASI FIREBASE
   Lokasi: js/firebaseConfig.js
   Naikkan angka VERSI_CONFIG bila isi firebaseConfig.js diubah.
========================================================= */

const VERSI_CONFIG = 1;

export async function bacaConfig() {
  try {
    const module = await import(
      './firebaseConfig.js?v=' + VERSI_CONFIG
    );

    // Mendukung:
    // export const firebaseConfig = {...}
    // export default {...}
    // export const config = {...}
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