/* =========================================================
   AUTH.JS — login, peran, dan penjaga halaman (admin & guru)

   - Admin : akun email + sandi yang sama di kelima Firebase.
   - Guru  : akun dibuat admin di halaman Akun Guru (koleksi guru,
             akunAktif = true), lalu masuk ke kelima Firebase.
   Peran ditentukan dari data akun, bukan dari penanda di browser.
   Keamanan sebenarnya ada di Firestore Rules; penjaga halaman ini
   hanya mengatur alur tampilan.
========================================================= */
import {
  A, F, FIREBASE_PUSAT, KOLEKSI, dbSiswaGuru, masukAdmin
} from './firebase-pusat.js';

export const DOMAIN_GURU = '@smp.belajar.id';

export const HALAMAN = {
  login: 'login.html',
  admin: 'dasbor.html',
  guru: 'Dasbor guru/Dasbor-guru.html'
};

const SEMUA = () => Object.values(FIREBASE_PUSAT);
const K_GURU = 'kw_guru';     // { nama, mapel, email } dipakai sidebar guru
const K_SESI = 'kw_sesi';     // cache peran per tab

/* ---------- Alamat ---------- */
export const URL_ROOT = new URL('../../', import.meta.url);
export const urlRoot = (path = '') =>
  new URL(path.split('/').map(encodeURIComponent).join('/'), URL_ROOT).href;

/* Halaman saat ini, relatif terhadap root proyek (untuk ?next=). */
function halamanIni() {
  const akar = URL_ROOT.pathname;
  const p = decodeURIComponent(location.pathname);
  return p.startsWith(decodeURIComponent(akar)) ? p.slice(decodeURIComponent(akar).length) : '';
}

/* ---------- Pesan galat ---------- */
const PESAN = {
  'auth/invalid-credential': 'Email atau kata sandi salah.',
  'auth/wrong-password': 'Email atau kata sandi salah.',
  'auth/user-not-found': 'Akun dengan email ini belum terdaftar.',
  'auth/invalid-email': 'Format email tidak valid.',
  'auth/user-disabled': 'Akun ini dinonaktifkan.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
  'auth/network-request-failed': 'Tidak ada koneksi internet. Periksa jaringan lalu coba lagi.',
  'auth/operation-not-allowed': 'Login Email/Password belum diaktifkan di Firebase Console.'
};
export const pesanAuth = kode => PESAN[kode] || ('Gagal masuk: ' + kode);

/* ---------- Data guru ---------- */
async function cekGuru(email) {
  try {
    const s = await F.getDocs(F.query(
      F.collection(dbSiswaGuru, KOLEKSI.guru),
      F.where('akunEmail', '==', email),
      F.limit(1)
    ));
    if (s.empty) return { ok: false, pesan: 'Akun ini belum terdaftar sebagai guru.' };
    const d = s.docs[0].data();
    if (!d.akunAktif) return { ok: false, pesan: 'Akun guru belum diaktifkan. Hubungi admin.' };
    return { ok: true, data: { id: s.docs[0].id, nama: d.nama || '', mapel: d.mapel || '', email } };
  } catch (e) {
    return { ok: false, pesan: 'Gagal memeriksa data guru (' + (e.code || e.message) + ').' };
  }
}

/* ---------- Penyimpanan sesi di browser ---------- */
function simpanSesi(peran, ingat, guru) {
  const pakai = ingat ? localStorage : sessionStorage;
  const lain = ingat ? sessionStorage : localStorage;
  try {
    lain.removeItem(K_GURU);
    if (peran === 'guru') pakai.setItem(K_GURU, JSON.stringify(guru || {}));
    else pakai.removeItem(K_GURU);
    sessionStorage.removeItem(K_SESI);
  } catch (_) { /* penyimpanan tidak tersedia */ }
}

export function hapusSesiLokal() {
  try {
    [localStorage, sessionStorage].forEach(st => {
      st.removeItem(K_GURU);
      st.removeItem(K_SESI);
    });
    localStorage.removeItem('kw-peran');
    /* Cache data master (cache.js) ikut dibersihkan saat keluar. */
    Object.keys(localStorage).filter(k => k.startsWith('kwc:')).forEach(k => localStorage.removeItem(k));
  } catch (_) { /* abaikan */ }
}

/* ---------- Masuk ---------- */
async function cobaAdmin(email, sandi) {
  const { ok, gagal } = await masukAdmin(email, sandi);
  if (ok) return { ok: true, peran: 'admin' };
  let teks = pesanAuth(gagal[0].pesan);
  if (gagal.length < SEMUA().length) {
    teks += ' (gagal di: ' + gagal.map(g => g.nama.replace('Firebase ', '')).join(', ') + ')';
  }
  return { ok: false, pesan: teks };
}

async function cobaGuru(email, sandi) {
  const g = FIREBASE_PUSAT.SISWA_GURU;
  try {
    await A.signInWithEmailAndPassword(g.auth, email, sandi);
  } catch (e) {
    return { ok: false, pesan: pesanAuth(e.code) };
  }
  const cek = await cekGuru(email.toLowerCase());
  if (!cek.ok) {
    try { await A.signOut(g.auth); } catch (_) { /* abaikan */ }
    return { ...cek, spesifik: true };
  }
  /* Masuk juga ke project lain agar dasbor guru bisa membaca data tiap kelas */
  const lain = await Promise.allSettled(
    SEMUA().filter(x => x !== g).map(x => A.signInWithEmailAndPassword(x.auth, email, sandi))
  );
  const gagal = lain.filter(r => r.status === 'rejected');
  if (gagal.length) {
    await keluarSemua();
    return {
      ok: false,
      spesifik: true,
      pesan: 'Akun guru belum aktif di semua Firebase. Minta admin menekan Aktifkan lagi di halaman Akun Guru.'
    };
  }
  return { ok: true, peran: 'guru', guru: cek.data };
}

/* Mengembalikan 'admin' atau 'guru'. Melempar Error berisi pesan untuk pengguna. */
export async function masuk(email, sandi, ingat) {
  const mode = ingat ? A.browserLocalPersistence : A.browserSessionPersistence;
  await Promise.all(SEMUA().map(x => A.setPersistence(x.auth, mode)));

  /* Email berdomain guru dicoba sebagai guru dulu, selain itu sebagai admin dulu */
  const urut = email.toLowerCase().endsWith(DOMAIN_GURU) ? [cobaGuru, cobaAdmin] : [cobaAdmin, cobaGuru];
  const hasil = [];
  for (const coba of urut) {
    const h = await coba(email, sandi);
    if (h.ok) {
      simpanSesi(h.peran, ingat, h.guru);
      return h.peran;
    }
    hasil.push(h);
  }
  throw new Error((hasil.find(h => h.spesifik) || hasil[0]).pesan);
}

/* ---------- Keluar ---------- */
export async function keluarSemua() {
  await Promise.allSettled(SEMUA().map(x => A.signOut(x.auth)));
  hapusSesiLokal();
}

/* ---------- Sesi aktif ---------- */
/* Mengembalikan { peran, email, guru } atau null bila belum masuk. */
export async function peranSesi() {
  await Promise.all(SEMUA().map(x => x.auth.authStateReady()));

  const pengguna = FIREBASE_PUSAT.SISWA_GURU.auth.currentUser;
  if (!pengguna || !pengguna.email) return null;

  const email = pengguna.email.toLowerCase();

  /* Cache per tab agar pindah halaman tidak membaca Firestore lagi */
  try {
    const c = JSON.parse(sessionStorage.getItem(K_SESI) || 'null');
    if (c && c.email === email && (c.peran === 'admin' || c.peran === 'guru')) {
      return { peran: c.peran, email, guru: c.guru || null };
    }
  } catch (_) { /* abaikan */ }

  const cek = await cekGuru(email);
  let hasil = null;

  if (cek.ok) {
    hasil = { peran: 'guru', email, guru: cek.data };
  } else if (SEMUA().every(x => x.auth.currentUser)) {
    hasil = { peran: 'admin', email, guru: null };
  }

  if (hasil) {
    try { sessionStorage.setItem(K_SESI, JSON.stringify(hasil)); } catch (_) { /* abaikan */ }
    if (hasil.peran === 'guru') {
      try {
        const st = localStorage.getItem(K_GURU) !== null ? localStorage : sessionStorage;
        st.setItem(K_GURU, JSON.stringify(hasil.guru));
      } catch (_) { /* abaikan */ }
    }
  }
  return hasil;
}

/* ---------- Penjaga halaman ---------- */
export function alamatLogin() {
  const ini = halamanIni();
  const next = ini && ini !== HALAMAN.login ? '?next=' + encodeURIComponent(ini) : '';
  return urlRoot(HALAMAN.login) + next;
}

/* Memastikan pengunjung punya peran yang diminta; bila tidak, dialihkan.
   Promise tidak pernah selesai saat pengalihan berlangsung. */
export async function jaga(peranDiminta) {
  let sesi = null;
  try { sesi = await peranSesi(); } catch (e) { console.warn('Gagal memeriksa sesi:', e); }

  if (!sesi) {
    location.replace(alamatLogin());
    return new Promise(() => {});
  }
  if (sesi.peran !== peranDiminta) {
    location.replace(urlRoot(HALAMAN[sesi.peran]));
    return new Promise(() => {});
  }
  return sesi;
}
