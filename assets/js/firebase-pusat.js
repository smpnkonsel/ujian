// ============================================================
// FIREBASE PUSAT CBT SMP NEGERI 20 KONAWE SELATAN
// SDK: 12.8.0  (versi dengan Firebase Authentication untuk guru)
//
// PENANDA:
// [VII]         = Firebase ujian kelas VII
// [VIII]        = Firebase ujian kelas VIII
// [IX]          = Firebase ujian kelas IX
// [SISWA_GURU]  = Firebase data siswa dan guru
// [BANK_SOAL]   = Firebase paket soal dan jadwal
//
// ATURAN:
// Semua halaman wajib mengimpor Firebase dari file ini.
// DILARANG initializeApp ulang di modul lain.
//
// LOGIN ADMIN:
// Admin login dengan email + kata sandi yang SAMA di kelima project
// (akun dibuat di Authentication tiap project). Siswa tidak perlu akun.
// ============================================================

import { initializeApp, getApps } from
"https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

import * as F from
"https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import * as A from
"https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

export { F, A };

// ============================================================
// 1. DAFTAR TINGKAT
// ============================================================

export const TINGKAT = ["VII", "VIII", "IX"];

// ============================================================
// 2. KONFIGURASI 5 FIREBASE
// ============================================================

export const CONFIG = {

  // [FIREBASE 1] KELAS VII
  VII: {
    apiKey: "AIzaSyBHuax2uJzSvbioflvwt9mZhxipOxufVnc",
    authDomain: "cbt-6a20d.firebaseapp.com",
    projectId: "cbt-6a20d",
    storageBucket: "cbt-6a20d.firebasestorage.app",
    messagingSenderId: "511273625056",
    appId: "1:511273625056:web:a43ec8ac65e92e483b3785"
  },

  // [FIREBASE 2] KELAS VIII
  VIII: {
    apiKey: "AIzaSyB_gA7bX7DsezKYbmtkXDwZh8K3rDpRw0A",
    authDomain: "cbt-viii.firebaseapp.com",
    projectId: "cbt-viii",
    storageBucket: "cbt-viii.firebasestorage.app",
    messagingSenderId: "478248562613",
    appId: "1:478248562613:web:b4a3e071a01a45651eb3fc"
  },

  // [FIREBASE 3] KELAS IX
  IX: {
    apiKey: "AIzaSyAv6ysrVumKKnOH16k4jxavxSTOaaB4NVI",
    authDomain: "cbt-ix.firebaseapp.com",
    projectId: "cbt-ix",
    storageBucket: "cbt-ix.firebasestorage.app",
    messagingSenderId: "855269360287",
    appId: "1:855269360287:web:05e99a23fd10bf447398aa"
  },

  // [FIREBASE 4] DATA SISWA DAN GURU
  SISWA_GURU: {
    apiKey: "AIzaSyA5CKfTv7prvUMdEdjzk_hTTX8KjGgXu58",
    authDomain: "dat-guru-siswa.firebaseapp.com",
    projectId: "dat-guru-siswa",
    storageBucket: "dat-guru-siswa.firebasestorage.app",
    messagingSenderId: "312536541675",
    appId: "1:312536541675:web:6ed7717b0870cd7eef11ae"
  },

  // [FIREBASE 5] BANK SOAL DAN JADWAL
  BANK_SOAL: {
    apiKey: "AIzaSyAnCGjqs6Ou-ZHjBOYWkCEsMpcLC5dsoTE",
    authDomain: "bank-soal-edaf4.firebaseapp.com",
    projectId: "bank-soal-edaf4",
    storageBucket: "bank-soal-edaf4.firebasestorage.app",
    messagingSenderId: "52227391881",
    appId: "1:52227391881:web:911ea03b193746657e2158"
  }

};

// ============================================================
// 3. NAMA FIREBASE
// ============================================================

export const NAMA_FIREBASE = {
  VII: "Firebase CBT Kelas VII",
  VIII: "Firebase CBT Kelas VIII",
  IX: "Firebase CBT Kelas IX",
  SISWA_GURU: "Firebase Data Siswa dan Guru",
  BANK_SOAL: "Firebase Bank Soal dan Jadwal"
};

// ============================================================
// 4. INISIALISASI FIREBASE
// ============================================================

export const FIREBASE_PUSAT = {};

// Deteksi otomatis koneksi yang terhambat (jaringan sekolah/seluler).
function buatFirestore(app) {
  try {
    return F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch (e) {
    // Sudah diinisialisasi sebelumnya pada app yang sama.
    return F.getFirestore(app);
  }
}

for (const kode of Object.keys(CONFIG)) {

  const namaApp = "CBT-" + kode;

  // Mencegah inisialisasi ganda dalam satu halaman.
  const app =
    getApps().find(item => item.name === namaApp) ||
    initializeApp(CONFIG[kode], namaApp);

  FIREBASE_PUSAT[kode] = {
    kode,
    nama: NAMA_FIREBASE[kode],
    app,
    db: buatFirestore(app),
    auth: A.getAuth(app)
  };

}

// ============================================================
// 5. PINTASAN DATABASE
// ============================================================

// [VII]
export const dbVII = FIREBASE_PUSAT.VII.db;

// [VIII]
export const dbVIII = FIREBASE_PUSAT.VIII.db;

// [IX]
export const dbIX = FIREBASE_PUSAT.IX.db;

// [DATA SISWA DAN GURU]
export const dbSiswaGuru = FIREBASE_PUSAT.SISWA_GURU.db;

// [BANK SOAL DAN JADWAL]
export const dbBankSoal = FIREBASE_PUSAT.BANK_SOAL.db;

// Mengambil database berdasarkan tingkat.
export function dbTingkat(tingkat) {

  const t = String(tingkat).toUpperCase().trim();

  if (!TINGKAT.includes(t)) {
    throw new Error("Tingkat kelas tidak valid: " + tingkat);
  }

  return FIREBASE_PUSAT[t].db;
}

// ============================================================
// 6. NAMA KOLEKSI FIREBASE
// ============================================================

export const KOLEKSI = {

  // Firebase data-guru-siswa
  siswa: "siswa",
  guru: "guru",

  // Firebase bank-soal-edaf4
  paket: "paket",
  jadwal: "jadwal",

  // Firebase CBT VII, VIII, IX
  token: "tokens",
  hasil: "hasil",
  sesi: "sesi",
  pengaturan: "pengaturan",

  // Daftar email guru yang sah di SETIAP project (id dokumen = email).
  // Ditulis admin saat mengaktifkan akun guru; dibaca oleh rules.
  akunGuru: "akunGuru"

};

// ============================================================
// 7. PENENTU TINGKAT BERDASARKAN TOKEN
//
// 1xxx = VII
// 2xxx = VIII
// 3xxx = IX
// ============================================================

export const DIGIT_TINGKAT = {
  "1": "VII",
  "2": "VIII",
  "3": "IX"
};

export function tingkatDariToken(token) {

  const kode = String(token ?? "").trim();

  if (!/^[1-3]\d{3}$/.test(kode)) {
    return null;
  }

  return DIGIT_TINGKAT[kode[0]] || null;

}

// Tingkat dari label kelas siswa: "VII A" -> "VII", "8B" -> "VIII".
export function tingkatDariKelas(kelas) {

  const s = String(kelas ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
  const m = s.match(/^(VIII|VII|IX|7|8|9)/);

  if (!m) return null;

  return { "7": "VII", "8": "VIII", "9": "IX" }[m[1]] || m[1];

}

// ============================================================
// 8. PENANDA LOKASI PENYIMPANAN
// ============================================================

export const LOKASI_DATA = {

  siswa: "SISWA_GURU/siswa",
  guru: "SISWA_GURU/guru",

  paket: "BANK_SOAL/paket",
  jadwal: "BANK_SOAL/jadwal",

  token: "TINGKAT/tokens",
  hasil: "TINGKAT/hasil",
  sesi: "TINGKAT/sesi"

};

// ============================================================
// 9. LOGIN ADMIN (Firebase Authentication di kelima project)
// ============================================================

// Masuk ke kelima project sekaligus.
// Mengembalikan { ok: boolean, gagal: [{ kode, nama, pesan }] }.
export async function masukAdmin(email, sandi) {

  const kodeAll = Object.keys(FIREBASE_PUSAT);

  const hasil = await Promise.allSettled(
    kodeAll.map(kode =>
      A.signInWithEmailAndPassword(FIREBASE_PUSAT[kode].auth, email, sandi)
    )
  );

  const gagal = [];

  hasil.forEach((r, i) => {
    if (r.status === "rejected") {
      const kode = kodeAll[i];
      gagal.push({
        kode,
        nama: NAMA_FIREBASE[kode],
        pesan: r.reason?.code || r.reason?.message || "gagal"
      });
    }
  });

  // Semua project harus berhasil, jika tidak batalkan semuanya.
  if (gagal.length) {
    await keluarAdmin();
  }

  return { ok: gagal.length === 0, gagal };

}

export async function keluarAdmin() {
  await Promise.allSettled(
    Object.values(FIREBASE_PUSAT).map(item => A.signOut(item.auth))
  );
}

// True bila admin sudah login di kelima project.
export async function adminMasuk() {

  const semua = Object.values(FIREBASE_PUSAT);

  await Promise.all(semua.map(item => item.auth.authStateReady()));

  return semua.every(item => item.auth.currentUser);

}

// ============================================================
// 10. FUNGSI INFORMASI KONEKSI
// ============================================================

export function infoFirebase() {

  return Object.entries(FIREBASE_PUSAT).map(([kode, data]) => ({
    kode,
    nama: data.nama,
    projectId: CONFIG[kode].projectId,
    status: "TERINISIALISASI"
  }));

}