/* =========================================================
   HALAMAN.JS  (versi hemat baca Firestore)
   Penyambung Firebase untuk semua halaman admin.

   Penghematan:
   - Baca SEKALI (getDocs), bukan onSnapshot.
   - Hasil bacaan disimpan di localStorage (cache) sehingga
     pindah halaman / refresh tidak membaca ulang.
   - Semua query memakai limit().
   - Mode pantau langsung hanya bila langsung: true
     (listener dilepas saat halaman ditutup).

   Pemakaian:
     await sambungFirebase({
       paket: true,  onPaket: () => ...,
       token: true,  onToken: () => ...,
       hasil: true,  onHasil: () => ..., norm,
       urutHasil: 'selesai',     // opsional, nama field waktu
       batasHasil: 200,          // opsional
       langsung: false,          // opsional
       onGagal: (pesan, jenis) => ...
     });

   Setelah tersambung tersedia:
     S.muat('semua' | 'paket' | 'token' | 'hasil', paksa)
       paksa = true mengabaikan cache (tombol Muat ulang)
     S.simpanCache('token')
       menyimpan S.TOK ke cache setelah diubah lokal
========================================================= */

import {
  FB,
  KOLEKSI_HASIL,
  KOLEKSI_TOKEN,
  KOLEKSI_PAKET,
  PAKET,
  bacaConfig
} from './config.js?v=6';

import { $, S } from './util.js';

/* ---------- Pengaturan cache (milidetik) ---------- */

const TTL = {
  paket: 30 * 60 * 1000,
  token: 10 * 60 * 1000,
  hasil: 3 * 60 * 1000
};

const BATAS_TOKEN = 100;
const BATAS_HASIL = 200;

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

/* ---------- Cache localStorage ---------- */

const kunciCache = nama => 'kw:' + (S.cfg?.projectId || 'x') + ':' + nama;

function tulisCache(nama, raw) {
  try {
    const teks = JSON.stringify({ t: Date.now(), d: raw }, function (k, v) {
      const asli = this[k];

      if (asli && typeof asli.toMillis === 'function') {
        return { __ms: asli.toMillis() };
      }

      return v;
    });

    localStorage.setItem(kunciCache(nama), teks);

  } catch (e) {
    // Penyimpanan penuh / dinonaktifkan: abaikan, aplikasi tetap jalan.
    console.warn('Cache tidak tersimpan:', e);
  }
}

function bacaCache(nama, F) {
  try {
    const teks = localStorage.getItem(kunciCache(nama));
    if (!teks) return null;

    const o = JSON.parse(teks, (k, v) =>
      v && typeof v === 'object' && '__ms' in v
        ? F.Timestamp.fromMillis(v.__ms)
        : v
    );

    if (!o || !Array.isArray(o.d)) return null;
    if (Date.now() - o.t > TTL[nama]) return null;

    return o.d;

  } catch (e) {
    return null;
  }
}

/* ---------- Sambungan utama ---------- */

export async function sambungFirebase(o = {}) {
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

    const stop = [];
    const aktifLangsung = new Set();

    /* ---------- Pengolah data per jenis ----------
       raw = [{ id, data }]  (bentuk yang disimpan di cache) */

    const olah = {
      paket(raw) {
        const dariFirestore = raw
          .map(r => ({ id: r.id, ...r.data }))
          .sort((a, b) => waktuDok(b.dibuat) - waktuDok(a.dibuat));

        S.PAKET = gabungkanPaket(PAKET, dariFirestore);
        if (o.onPaket) o.onPaket();
      },

      token(raw) {
        S.TOK = raw.map(r => ({ id: r.id, ...r.data }));
        if (o.onToken) o.onToken();
      },

      hasil(raw) {
        S.HAS = raw
          .map(r => o.norm({ id: r.id, data: () => r.data }))
          .sort((a, b) => (b.waktu || 0) - (a.waktu || 0));

        if (o.onHasil) o.onHasil();
      }
    };

    const galat = {
      paket(error) {
        console.error('Gagal memuat paket soal:', error);
        peringatan('Gagal memuat paket tambahan: ' + pesanGalat(error));

        S.PAKET = [...(PAKET || [])];
        if (o.onPaket) o.onPaket();
      },

      token(error) {
        console.error('Gagal memuat token:', error);
        gagal('Gagal memuat token: ' + pesanGalat(error), 'token');
      },

      hasil(error) {
        console.error('Gagal memuat hasil ujian:', error);
        gagal(
          'Gagal memuat nilai dari koleksi "' + KOLEKSI_HASIL + '". ' +
          pesanGalat(error) + ' Periksa aturan keamanan Firestore.',
          'hasil'
        );
      }
    };

    /* ---------- Query per jenis (selalu dibatasi) ---------- */

    const query = {
      paket: () => F.collection(db, KOLEKSI_PAKET),

      token: () => F.query(
        F.collection(db, KOLEKSI_TOKEN),
        F.orderBy('dibuat', 'desc'),
        F.limit(BATAS_TOKEN)
      ),

      hasil: () => {
        const dasar = F.collection(db, KOLEKSI_HASIL);
        const batas = F.limit(o.batasHasil || BATAS_HASIL);

        return o.urutHasil
          ? F.query(dasar, F.orderBy(o.urutHasil, 'desc'), batas)
          : F.query(dasar, batas);
      }
    };

    const keRaw = snap => snap.docs.map(d => ({ id: d.id, data: d.data() }));

    /* ---------- Muat satu jenis ---------- */

    async function muatSatu(nama, paksa) {
      if (!o[nama]) return;

      // 1) Cache masih segar: tidak ada bacaan sama sekali.
      if (!paksa && !o.langsung) {
        const raw = bacaCache(nama, F);

        if (raw) {
          olah[nama](raw);
          return;
        }
      }

      // 2) Mode pantau langsung (opsional).
      if (o.langsung) {
        if (aktifLangsung.has(nama)) return;
        aktifLangsung.add(nama);

        stop.push(F.onSnapshot(
          query[nama](),
          snap => {
            const raw = keRaw(snap);
            tulisCache(nama, raw);
            olah[nama](raw);
          },
          galat[nama]
        ));

        return;
      }

      // 3) Baca sekali dari server, lalu simpan ke cache.
      try {
        const raw = keRaw(await F.getDocs(query[nama]()));
        tulisCache(nama, raw);
        olah[nama](raw);

      } catch (error) {
        galat[nama](error);
      }
    }

    // Tombol "Muat ulang": S.muat('semua', true)
    S.muat = async (jenis = 'semua', paksa = false) => {
      const daftar = jenis === 'semua' ? ['paket', 'token', 'hasil'] : [jenis];
      await Promise.all(daftar.map(j => muatSatu(j, paksa)));
    };

    // Simpan perubahan lokal (tanpa membaca ulang dari server).
    S.simpanCache = jenis => {
      if (jenis === 'token') {
        tulisCache('token', (S.TOK || []).map(({ id, ...data }) => ({ id, data })));
      }

      if (jenis === 'paket') {
        // Paket bawaan (config.js) tidak ikut disimpan; hanya yang dari Firestore.
        const bawaanId = new Set((PAKET || []).map(p => String(p.id)));

        tulisCache(
          'paket',
          (S.PAKET || [])
            .filter(p => p && !bawaanId.has(String(p.id)))
            .map(({ id, ...data }) => ({ id, data }))
        );
      }
    };

    window.addEventListener('pagehide', () => stop.forEach(f => f()));

    await S.muat('semua', false);
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