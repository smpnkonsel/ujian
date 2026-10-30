/* =========================================================
   HALAMAN.JS
   Penyambung Firebase untuk halaman terpisah (token.html,
   nilai.html). Isinya sama dengan bagian Firebase di main.js,
   tetapi hanya memantau koleksi yang diminta halaman.

   Pemakaian:
     await sambungFirebase({
       paket: true,  onPaket: () => ...,
       token: true,  onToken: () => ...,
       hasil: true,  onHasil: () => ..., norm,
       onGagal: (pesan, jenis) => ...   // jenis: semua | token | hasil
     });
========================================================= */

import {
  FB,
  KOLEKSI_HASIL,
  KOLEKSI_TOKEN,
  KOLEKSI_PAKET,
  PAKET,
  bacaConfig
} from './config.js';

import { $, S } from './util.js';

/* ---------- Pesan dan status ---------- */

function peringatan(teks) {
  const w = $('cfgwarn');

  if (!w) {
    console.warn(teks);
    return;
  }

  w.classList.remove('hidden');

  const d = document.createElement('div');
  d.textContent = teks;
  w.appendChild(d);
}

function setStatus(terhubung, teks) {
  const dot = $('dot');
  const cs = $('cs');

  if (dot) dot.classList.toggle('on', !!terhubung);
  if (cs) cs.textContent = teks;
}

/* ---------- Paket bawaan + Firestore ---------- */

function gabungkanPaket(bawaan, firestore) {
  const hasil = new Map();

  (bawaan || []).forEach(p => {
    if (p && p.id) hasil.set(String(p.id), { ...p });
  });

  (firestore || []).forEach(p => {
    if (p && p.id) hasil.set(String(p.id), { ...p, id: String(p.id) });
  });

  return [...hasil.values()];
}

function waktuDok(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}

const pesanGalat = e => e.message || e.code || 'Kesalahan Firestore';

/* ---------- Sambungan utama ---------- */

export async function sambungFirebase(o = {}) {
  // jenis: 'semua' (sambungan gagal), 'token', atau 'hasil'.
  const gagal = (pesan, jenis = 'semua') => {
    if (typeof o.onGagal === 'function') o.onGagal(pesan, jenis);
  };

  let hasilConfig;

  try {
    hasilConfig = await bacaConfig();

  } catch (error) {
    console.error('Gagal membaca konfigurasi:', error);
    setStatus(false, 'Konfigurasi Firebase gagal dibaca');
    peringatan(error.message);
    gagal('Konfigurasi Firebase gagal dibaca.');
    return false;
  }

  const { cfg, err } = hasilConfig;

  S.cfg = cfg;
  S.ok = !!cfg?.apiKey && !/^ISI/.test(cfg.apiKey);

  if (!S.ok) {
    setStatus(false, 'Firebase belum terhubung');
    peringatan('Penyebab: ' + (err || 'apiKey Firebase kosong atau belum diisi.'));
    gagal('Belum terhubung ke Firebase.');
    return false;
  }

  try {
    const [appModule, firestoreModule] = await Promise.all([
      import(FB + 'firebase-app.js'),
      import(FB + 'firebase-firestore.js')
    ]);

    const F = S.F = firestoreModule;
    const app = appModule.initializeApp(cfg);
    const db = S.db = F.getFirestore(app);

    setStatus(true, 'Terhubung: ' + (cfg.projectId || 'Firebase'));

    if (o.paket) {
      F.onSnapshot(
        F.collection(db, KOLEKSI_PAKET),

        snap => {
          const dariFirestore = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => waktuDok(b.dibuat) - waktuDok(a.dibuat));

          S.PAKET = gabungkanPaket(PAKET, dariFirestore);

          if (o.onPaket) o.onPaket();
        },

        error => {
          console.error('Gagal memuat paket soal:', error);
          peringatan('Gagal memuat paket tambahan: ' + pesanGalat(error));

          S.PAKET = [...(PAKET || [])];

          if (o.onPaket) o.onPaket();
        }
      );
    }

    if (o.token) {
      F.onSnapshot(
        F.query(
          F.collection(db, KOLEKSI_TOKEN),
          F.orderBy('dibuat', 'desc')
        ),

        snap => {
          S.TOK = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          if (o.onToken) o.onToken();
        },

        error => {
          console.error('Gagal memuat token:', error);
          gagal('Gagal memuat token: ' + pesanGalat(error), 'token');
        }
      );
    }

    if (o.hasil) {
      F.onSnapshot(
        F.collection(db, KOLEKSI_HASIL),

        snap => {
          S.HAS = snap.docs
            .map(o.norm)
            .sort((a, b) => (b.waktu || 0) - (a.waktu || 0));

          if (o.onHasil) o.onHasil();
        },

        error => {
          console.error('Gagal memuat hasil ujian:', error);
          gagal(
            'Gagal memuat nilai dari koleksi "' + KOLEKSI_HASIL + '". ' +
            pesanGalat(error) + ' Periksa aturan keamanan Firestore.',
            'hasil'
          );
        }
      );
    }

    return true;

  } catch (error) {
    console.error('Inisialisasi Firebase gagal:', error);

    S.ok = false;

    setStatus(false, 'Koneksi Firebase gagal');
    peringatan(error.message || 'Tidak dapat menghubungkan Firebase.');
    gagal('Koneksi Firebase gagal.');

    return false;
  }
}