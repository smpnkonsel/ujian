/* =========================================================
   MAIN.JS — INISIALISASI ADMIN KW LEARNING

   Fitur:
   - Memuat konfigurasi Firebase
   - Memuat paket bawaan
   - Memuat paket tambahan dari Firestore (realtime)
   - Menghindari paket duplikat
   - Memantau token secara realtime
   - Memantau hasil ujian secara realtime
   - Memperbarui dashboard, daftar paket, dan nilai
========================================================= */

import {
  FB,
  KOLEKSI_HASIL,
  KOLEKSI_TOKEN,
  KOLEKSI_PAKET,
  PAKET,
  bacaConfig
} from './config.js';

import { $, esc, S } from './util.js';
import { initNav } from './nav.js';
import { drawPakets } from './soal.js';
import { initToken, openModal, drawTok } from './token.js';
import { initPaket } from './paket.js';
import { initNilai, drawNilai, norm } from './nilai.js';
import { drawDash } from './dasbor.js';

/* =========================================================
   STATUS AWAL
========================================================= */

S.PAKET = [...(PAKET || [])];
S.TOK = [];
S.HAS = [];

S.cfg = null;
S.db = null;
S.F = null;
S.ok = false;

/* =========================================================
   PESAN PERINGATAN
========================================================= */

function peringatan(teks) {
  const w = $('cfgwarn');

  if (!w) {
    console.warn(teks);
    return;
  }

  w.classList.remove('hidden');

  const pesan = document.createElement('div');

  pesan.className = 'cfg-error';
  pesan.textContent = teks;

  w.appendChild(pesan);
}

/* =========================================================
   STATUS KONEKSI FIREBASE
========================================================= */

function setStatus(terhubung, teks) {
  const dot = $('dot');
  const cs = $('cs');

  if (dot) {
    dot.classList.toggle('on', !!terhubung);
  }

  if (cs) {
    cs.textContent = teks;
  }
}

/* =========================================================
   GAMBAR ULANG DAFTAR PAKET
========================================================= */

function refreshPakets() {
  drawPakets(openModal);
}

/* =========================================================
   GABUNGKAN PAKET BAWAAN DAN FIRESTORE
========================================================= */

function gabungkanPaket(paketBawaan, paketFirestore) {
  const hasil = new Map();

  // Masukkan paket bawaan terlebih dahulu.
  (paketBawaan || []).forEach(paket => {
    if (!paket || !paket.id) return;

    hasil.set(String(paket.id), {
      ...paket
    });
  });

  // Paket Firestore dengan ID sama akan memperbarui
  // data paket bawaan tersebut.
  (paketFirestore || []).forEach(paket => {
    if (!paket || !paket.id) return;

    hasil.set(String(paket.id), {
      ...paket,
      id: String(paket.id)
    });
  });

  return [...hasil.values()];
}

/* =========================================================
   KONVERSI FIELD WAKTU KE MILIDETIK
   (mendukung Timestamp Firestore, angka, dan kosong)
========================================================= */

function waktuDok(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}

/* =========================================================
   MEMUAT PAKET TAMBAHAN DARI FIRESTORE

   Catatan: tanpa orderBy('dibuat'), karena query dengan
   orderBy hanya mengembalikan dokumen yang punya field
   "dibuat". Pengurutan dilakukan di sisi klien.
========================================================= */

function initPaketFirestore(F, db) {
  const ref = F.collection(db, KOLEKSI_PAKET);

  F.onSnapshot(
    ref,

    snapshot => {
      const paketFirestore = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort((a, b) => waktuDok(b.dibuat) - waktuDok(a.dibuat));

      S.PAKET = gabungkanPaket(
        PAKET,
        paketFirestore
      );

      refreshPakets();
      drawDash();
    },

    error => {
      console.error(
        'Gagal memuat paket soal:',
        error
      );

      peringatan(
        'Gagal memuat paket tambahan: ' +
        (error.message || error.code || 'Kesalahan Firestore')
      );

      // Paket bawaan tetap dapat digunakan.
      S.PAKET = [...(PAKET || [])];

      refreshPakets();
      drawDash();
    }
  );
}

/* =========================================================
   MEMUAT TOKEN REALTIME
========================================================= */

function initTokenFirestore(F, db) {
  F.onSnapshot(
    F.query(
      F.collection(db, KOLEKSI_TOKEN),
      F.orderBy('dibuat', 'desc')
    ),

    snapshot => {
      S.TOK = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      drawTok();
      drawDash();
    },

    error => {
      console.error(
        'Gagal memuat token:',
        error
      );

      const tb = $('tb');

      if (tb) {
        tb.innerHTML = `
          <tr>
            <td colspan="6" class="empty">
              Gagal memuat token:
              ${esc(error.message || error.code || 'Kesalahan Firestore')}
            </td>
          </tr>
        `;
      }
    }
  );
}

/* =========================================================
   MEMUAT HASIL UJIAN REALTIME
========================================================= */

function initHasilFirestore(F, db) {
  F.onSnapshot(
    F.collection(db, KOLEKSI_HASIL),

    snapshot => {
      S.HAS = snapshot.docs
        .map(norm)
        .sort((a, b) => {
          return (b.waktu || 0) - (a.waktu || 0);
        });

      drawNilai();
      drawDash();
    },

    error => {
      console.error(
        'Gagal memuat hasil ujian:',
        error
      );

      const nb = $('nb');

      if (nb) {
        nb.innerHTML = `
          <tr>
            <td colspan="9" class="empty">
              Gagal memuat nilai dari koleksi
              "${esc(KOLEKSI_HASIL)}".
              <br>
              ${esc(error.message || error.code || 'Kesalahan Firestore')}
              <br>
              Periksa aturan keamanan Firestore.
            </td>
          </tr>
        `;
      }
    }
  );
}

/* =========================================================
   INISIALISASI KOMPONEN ADMIN
========================================================= */

function initKomponen() {
  initNav();
  initToken();
  initPaket();
  initNilai();

  // Tampilkan paket bawaan sebelum Firestore selesai dimuat.
  refreshPakets();

  drawDash();
}

/* =========================================================
   INISIALISASI APLIKASI
========================================================= */

async function mulaiAdmin() {

  // Inisialisasi tampilan terlebih dahulu.
  initKomponen();

  // Baca konfigurasi Firebase.
  let hasilConfig;

  try {
    hasilConfig = await bacaConfig();

  } catch (error) {
    console.error(
      'Gagal membaca konfigurasi:',
      error
    );

    setStatus(
      false,
      'Konfigurasi Firebase gagal dibaca'
    );

    peringatan(error.message);

    return;
  }

  const {
    cfg,
    err
  } = hasilConfig;

  S.cfg = cfg;

  S.ok =
    !!cfg?.apiKey &&
    !/^ISI/.test(cfg.apiKey);

  // Periksa konfigurasi.
  if (!S.ok) {
    setStatus(
      false,
      'Firebase belum terhubung'
    );

    peringatan(
      'Penyebab: ' +
      (err || 'apiKey Firebase kosong atau belum diisi.')
    );

    const tb = $('tb');

    if (tb) {
      tb.innerHTML = `
        <tr>
          <td colspan="6" class="empty">
            Belum terhubung ke Firebase.
          </td>
        </tr>
      `;
    }

    drawDash();

    return;
  }

  /* =====================================================
     MEMUAT FIREBASE SDK
  ===================================================== */

  try {
    const [
      appModule,
      firestoreModule
    ] = await Promise.all([
      import(FB + 'firebase-app.js'),
      import(FB + 'firebase-firestore.js')
    ]);

    const F = S.F = firestoreModule;

    // Inisialisasi aplikasi Firebase.
    const app = appModule.initializeApp(cfg);

    const db = S.db = F.getFirestore(app);

    /* ===================================================
       STATUS KONEKSI
    =================================================== */

    setStatus(
      true,
      'Terhubung: ' + (cfg.projectId || 'Firebase')
    );

    /* ===================================================
       PANTAU DATA FIRESTORE
    =================================================== */

    initPaketFirestore(F, db);

    initTokenFirestore(F, db);

    initHasilFirestore(F, db);

    console.log(
      'KW Learning Admin berhasil diinisialisasi.'
    );

  } catch (error) {
    console.error(
      'Inisialisasi Firebase gagal:',
      error
    );

    S.ok = false;

    setStatus(
      false,
      'Koneksi Firebase gagal'
    );

    peringatan(
      error.message ||
      'Tidak dapat menghubungkan Firebase.'
    );

    drawDash();
  }
}

/* =========================================================
   JALANKAN APLIKASI
========================================================= */

mulaiAdmin();