/* =========================================================
   PAKET.JS — halaman paket (admin dan guru, satu file)
   - Peran dibaca dari atribut data-peran pada tag guard.js di HTML
     • admin : semua mapel, semua paket (seperti sebelumnya)
     • guru  : hanya mapel milik guru yang login, hanya paket miliknya
   - Paket soal disimpan di [BANK_SOAL] koleksi "paket"
   - Daftar mapel dibaca dari [DAT-GURU-SISWA] dokumen Daftar/mapel
   - Mapel milik guru dibaca dari [DAT-GURU-SISWA] dokumen guru
     (lihat bagian PENGATURAN GURU di bawah, sesuaikan bila perlu)
   - Daftar paket dibaca sekali + cache bersama (cache.js), diperbarui lokal
     setelah simpan/hapus (HEMAT FIRESTORE: tanpa listener realtime)
   - Kelas memakai angka romawi: VII, VII A, VII B, VIII, ... IX B
   - Jenis ujian (SAS/UTS/dll.) disimpan terpisah di field "jenis"
========================================================= */

import { F, dbBankSoal, KOLEKSI } from './firebase-pusat.js';
import * as FP from './firebase-pusat.js';
import { $, esc, toast, konfirmasi, S } from './util.js';
import { muatSidebar } from './sidebar.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru } from './parser.js?v=6';
import { htmlSoal } from './pratinjau.js';
import * as C from './cache.js';

/* ---------- Peran halaman ---------- */

const PERAN = (document.querySelector('script[data-peran]')?.dataset.peran || 'admin');
const LAGI_GURU = PERAN === 'guru';

/* =========================================================
   PENGATURAN GURU — sesuaikan bagian ini dengan data kamu
========================================================= */

// Dokumen guru di Dat-Guru-Siswa: koleksi "Guru", dokumen berisi id guru
const KOLEKSI_GURU = 'guru';

// Field yang berisi daftar mapel di dokumen guru.
// Boleh array (["Matematika","IPA"]) atau teks ("Matematika, IPA").
// Isinya boleh nama mapel langsung, atau kunci dari dokumen Daftar/mapel.
const FIELD_MAPEL_GURU = 'daftarIdMapel';

// Tempat guard.js menyimpan guru yang login (dicoba berurutan)
const KUNCI_STORAGE = ['guruLogin', 'user', 'pengguna', 'kw_user', 'sesi'];

function bacaJson(teks) {
  try { return JSON.parse(teks); } catch { return null; }
}

// Hasil: { id, nama, mapel } atau null bila tidak ditemukan
function ambilGuruLogin() {
  const kandidat = [S.user, S.guru, S.sesi, window.USER, window.user];

  // Pindai SEMUA isi sessionStorage dan localStorage (nama kuncinya tidak perlu cocok)
  for (const store of [sessionStorage, localStorage]) {
    for (let i = 0; i < store.length; i++) {
      const v = store.getItem(store.key(i));
      if (!v) continue;

      const j = bacaJson(v);
      if (j && typeof j === 'object') {
        kandidat.push(j);
        // objek bersarang, misalnya { guru: {...} } atau { user: {...} }
        Object.values(j).forEach(x => { if (x && typeof x === 'object') kandidat.push(x); });
      } else if (/^\d{16,20}$/.test(v.trim())) {
        kandidat.push({ id: v.trim() });                 // NIP polos
      } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) {
        kandidat.push({ email: v.trim() });              // email polos
      }
    }
  }

  for (const u of kandidat) {
    if (!u || typeof u !== 'object') continue;
    const id = u.id || u.uid || u.nip || u.kode || u.username;
    const email = u.akunEmail || u.email || '';
    if (!id && !email) continue;
    return {
      id: id ? String(id) : '',
      email: String(email),
      nama: u.nama || u.name || '',
      mapel: u[FIELD_MAPEL_GURU]
    };
  }
  return null;
}

/* ---------- Guru yang login lewat Firebase Authentication ----------
   Aturan Firestore memakai request.auth.token.email, jadi login guru
   adalah Firebase Auth. Instance Auth dicari dari semua ekspor
   firebase-pusat.js (objek yang punya currentUser + onAuthStateChanged). */

function cariAuth() {
  return Object.values(FP).filter(v =>
    v && typeof v === 'object' && 'currentUser' in v && typeof v.onAuthStateChanged === 'function');
}

// Menunggu sampai ada pengguna yang login; hasilnya email (atau '' bila kosong/habis waktu)
let INFO_AUTH = '';   // keterangan untuk pesan galat (project Auth cocok atau tidak)
let INFO_SESI = '';

/* guard.js menaruh hasil pemeriksaan login di window.KW_SESI dan
   mengirim event "kw-sesi". Isinya dibaca dulu sebelum mencari Auth. */
function tungguSesi(batasMs = 8000) {
  return new Promise(selesai => {
    if (window.KW_SESI) return selesai(window.KW_SESI);
    const t = setTimeout(() => selesai(window.KW_SESI || null), batasMs);
    document.addEventListener('kw-sesi', e => {
      clearTimeout(t);
      selesai(e.detail || window.KW_SESI || null);
    }, { once: true });
  });
}

function emailDariSesi(s) {
  if (!s || typeof s !== 'object') return '';
  const c = [s.email, s.akunEmail, s.user && s.user.email, s.pengguna && s.pengguna.email,
             s.guru && (s.guru.akunEmail || s.guru.email), s.akun && s.akun.email];
  return String(c.find(x => typeof x === 'string' && x.includes('@')) || '');
}

function nipDariSesi(s) {
  if (!s || typeof s !== 'object') return '';
  const c = [s.nip, s.idGuru, s.guru && (s.guru.id || s.guru.nip)];
  return String(c.find(x => x) || '');
}

function tungguEmailLogin(batasMs = 6000) {
  return new Promise(selesai => {
    let daftar = cariAuth();
    if (!daftar.length) { INFO_AUTH = 'tidak ada instance Auth di firebase-pusat.js'; return selesai(''); }

    // Aturan Firestore dat-guru-siswa membaca login project ITU, jadi pilih Auth
    // yang satu project dengan dbSiswaGuru bila ada.
    const appTujuan = FP.dbSiswaGuru && FP.dbSiswaGuru.app;
    const cocok = appTujuan ? daftar.filter(a => a.app === appTujuan) : [];
    if (cocok.length) { daftar = cocok; INFO_AUTH = 'Auth satu project dengan dat-guru-siswa'; }
    else INFO_AUTH = 'TIDAK ada Auth yang satu project dengan dat-guru-siswa';

    let beres = false;
    const akhir = email => { if (!beres) { beres = true; selesai(email || ''); } };

    for (const a of daftar) {
      if (a.currentUser && a.currentUser.email) return akhir(a.currentUser.email);
    }
    daftar.forEach(a => a.onAuthStateChanged(u => { if (u && u.email) akhir(u.email); }));
    setTimeout(() => akhir(''), batasMs);
  });
}

let GURU = null;   // diisi saat halaman mulai (lihat bagian "Mulai")
let ADMIN = null;  // identitas admin yang login (untuk halaman admin)

/* ---------- Pengaturan kelas ---------- */

const TINGKAT = ['VII', 'VIII', 'IX'];
const PARALEL = ['A', 'B'];            // tambah huruf di sini bila perlu: ['A', 'B', 'C']

// Hasil: VII, VII A, VII B, VIII, VIII A, VIII B, IX, IX A, IX B
const DAFTAR_KELAS = TINGKAT.flatMap(t => [t, ...PARALEL.map(p => t + ' ' + p)]);

// Data lama yang tersimpan sebagai 7/8/9 tetap tampil benar
const ANGKA_KE_ROMAWI = { '7': 'VII', '8': 'VIII', '9': 'IX' };

function labelKelas(k) {
  const t = String(k || '').trim();
  return ANGKA_KE_ROMAWI[t] || t;
}

function isiPilihanKelas() {
  const sel = $('pkelas');
  if (!sel) return;
  sel.innerHTML = '<option value="">Pilih kelas</option>' +
    DAFTAR_KELAS.map(k => `<option value="${k}">Kelas ${k}</option>`).join('');
}

/* ---------- Format nama mapel: Huruf Besar Di Awal Kata ---------- */

const SINGKATAN = new Set([
  'IPA', 'IPS', 'PAS', 'PAT', 'PTS', 'UTS', 'UAS', 'SAS', 'PKN', 'PPKN', 'TIK',
  'PJOK', 'SBK', 'MTK', 'BK', 'PAI', 'LKS', 'AKM', 'ANBK',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'
]);

const KATA_SAMBUNG = new Set(['dan', 'di', 'ke', 'dari', 'yang', 'untuk']);

function formatNama(teks) {
  return String(teks || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\p{L}[\p{L}']*/gu, (kata, posisi) => {
      if (SINGKATAN.has(kata.toUpperCase())) return kata.toUpperCase();
      if (posisi > 0 && KATA_SAMBUNG.has(kata)) return kata;
      return kata.charAt(0).toUpperCase() + kata.slice(1);
    });
}

const kunciBanding = t => formatNama(t).toLowerCase();

/* ---------- Kotak peringatan (kuning) ---------- */

function peringatan(teks) {
  const w = $('cfgwarn');
  if (!w) { console.warn(teks); return; }
  w.classList.remove('hidden');
  const pesan = document.createElement('div');
  pesan.textContent = teks;
  w.appendChild(pesan);
}

/* ---------- Saran mapel ----------
   Admin : semua mapel dari Daftar/mapel
   Guru  : hanya mapel milik guru yang login                      */

const MAPEL_CADANGAN = [
  'Pendidikan Agama Islam', 'PPKn', 'Bahasa Indonesia', 'Matematika', 'IPA',
  'IPS', 'Bahasa Inggris', 'PJOK', 'Informatika', 'Seni Budaya'
];

let MAPEL_SEKOLAH = MAPEL_CADANGAN.map(m => formatNama(m));  // semua mapel (nama)
let PETA_MAPEL = {};          // kunci dokumen Daftar/mapel → nama
let MAPEL_GURU_MENTAH = null; // isi field mapel guru (belum diterjemahkan)
let MAPEL_SMP = [];           // daftar final yang dipakai sebagai saran

function daftarDariMentah(mentah) {
  if (Array.isArray(mentah)) return mentah;
  if (typeof mentah === 'string') return mentah.split(/[,;\n]/);
  if (mentah && typeof mentah === 'object') return Object.values(mentah);
  return [];
}

let DAFTAR_GURU = [];   // semua guru (dipakai halaman admin)
let GURU_PILIH = null;  // guru yang dipilih admin sebagai pemilik paket

function terjemahMapel(mentah) {
  const hasil = daftarDariMentah(mentah)
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .map(v => formatNama(PETA_MAPEL[v] || v));
  return [...new Set(hasil)].sort((a, b) => a.localeCompare(b, 'id'));
}

function hitungMapel() {
  if (!LAGI_GURU) {
    // Admin: semua mapel sekolah, atau hanya mapel guru yang dipilih
    MAPEL_SMP = GURU_PILIH ? terjemahMapel(GURU_PILIH.mapel) : MAPEL_SEKOLAH;
    return;
  }
  MAPEL_SMP = terjemahMapel(MAPEL_GURU_MENTAH);
}

function pasangSaranMapel() {
  const input = $('pnama');
  if (!input) return;

  hitungMapel();

  let dl = document.getElementById('dmapel');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'dmapel';
    document.body.appendChild(dl);
  }
  dl.innerHTML = MAPEL_SMP.map(m => `<option value="${esc(m)}"></option>`).join('');

  input.setAttribute('list', 'dmapel');
  input.setAttribute('autocomplete', 'off');

  if (LAGI_GURU) {
    if (MAPEL_SMP.length === 1) {
      // Guru satu mapel: isi otomatis dan kunci
      input.value = MAPEL_SMP[0];
      input.readOnly = true;
    } else {
      input.readOnly = false;
      if (MAPEL_SMP.length > 1) input.placeholder = 'Pilih salah satu mapel Anda';
    }
  } else if (GURU_PILIH && MAPEL_SMP.length === 1) {
    // Admin memilih guru yang hanya punya satu mapel: isi otomatis dan kunci
    input.value = MAPEL_SMP[0];
    input.readOnly = true;
  } else {
    input.readOnly = false;
  }
}

/* ---------- Admin: memilih guru pemilik paket (opsional) ---------- */

function opsiGuruHtml() {
  return '<option value="">Tanpa guru (atas nama admin)</option>' +
    DAFTAR_GURU.map(g => `<option value="${esc(g.id)}">${esc(g.nama)}</option>`).join('');
}

function pasangPilihGuru() {
  if (LAGI_GURU) return;
  const mapel = $('pnama');
  if (!mapel || $('pguru')) return;

  const labelMapel = mapel.previousElementSibling && mapel.previousElementSibling.tagName === 'LABEL'
    ? mapel.previousElementSibling : null;
  const awal = labelMapel || mapel;

  const sel = document.createElement('select');
  sel.id = 'pguru';
  sel.className = mapel.className;
  sel.innerHTML = opsiGuruHtml();
  sel.addEventListener('change', () => {
    GURU_PILIH = DAFTAR_GURU.find(g => g.id === sel.value) || null;
    mapel.value = '';          // mapel mengikuti guru yang dipilih
    pasangSaranMapel();
  });

  if (labelMapel) {
    const lb = document.createElement('label');
    lb.className = labelMapel.className;
    lb.htmlFor = 'pguru';
    lb.textContent = 'Guru pengampu (opsional)';
    awal.before(lb);
  }
  awal.before(sel);
}

function dengarDaftarGuru() {
  if (LAGI_GURU || !FP.dbSiswaGuru) return;

  /* Disimpan RINGKAS di cache: dokumen guru berisi sandi awal akun, jangan di-cache. */
  C.ambilCache('guruRingkas', 30, async () => {
    const snap = await F.getDocs(F.collection(FP.dbSiswaGuru, KOLEKSI_GURU));
    return snap.docs.map(d => {
      const x = d.data();
      return { id: d.id, akunEmail: x.akunEmail || '', nama: x.nama || '', akunNama: x.akunNama || '', mapel: x[FIELD_MAPEL_GURU] ?? null };
    });
  }).then(daftar => {
    DAFTAR_GURU = daftar.map(x => ({
      id: x.id,
      email: String(x.akunEmail || '').toLowerCase(),
      nama: x.nama || x.akunNama || x.akunEmail || x.id,
      mapel: x.mapel
    })).sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));

    const sel = $('pguru');
    if (sel) {
      const sekarang = sel.value;
      sel.innerHTML = opsiGuruHtml();
      sel.value = sekarang;
    }
    if (GURU_PILIH) GURU_PILIH = DAFTAR_GURU.find(g => g.id === GURU_PILIH.id) || null;
  }).catch(error => {
    console.error('Gagal memuat daftar guru:', error);
    peringatan('Gagal memuat daftar guru (' + (error.code || error.message || error) + ').');
  });
}

function dengarMapel() {
  if (!FP.dbSiswaGuru) {
    peringatan('dbSiswaGuru belum diekspor dari firebase-pusat.js — saran mapel memakai daftar cadangan.');
    return;
  }

  // Daftar mapel seluruh sekolah (dipakai admin, dan untuk menerjemahkan kunci mapel guru).
  // Satu dokumen, dibaca sekali dan di-cache 60 menit.
  (async () => {
    try {
      let data = C.bacaCache('mapelDaftar', 60);

      if (!data) {
        const snap = await F.getDoc(F.doc(FP.dbSiswaGuru, 'Daftar', 'mapel'));
        if (!snap.exists()) {
          if (!LAGI_GURU) peringatan('Dokumen Daftar/mapel belum ada — saran mapel memakai daftar cadangan.');
          return;
        }
        data = snap.data();
        C.tulisCache('mapelDaftar', data);
      }

      const entri = Object.entries(data)
        .filter(([, v]) => v && typeof v === 'object' && typeof v.nama === 'string' && v.nama.trim());

      PETA_MAPEL = Object.fromEntries(entri.map(([k, v]) => [k, v.nama]));

      const hasil = entri.map(([, v]) => formatNama(v.nama)).sort((a, b) => a.localeCompare(b, 'id'));
      if (hasil.length) MAPEL_SEKOLAH = hasil;

      pasangSaranMapel();
      if (LAGI_GURU) drawPakets();   // mapel guru bisa bergantung pada PETA_MAPEL

    } catch (error) {
      console.error('Gagal memuat daftar mapel:', error);
      if (!LAGI_GURU) {
        peringatan('Gagal memuat daftar mapel (' + (error.code || error.message || error) + ') — memakai daftar cadangan.');
      }
    }
  })();
}

// Khusus guru: baca mapel milik guru yang login
function dengarMapelGuru() {
  if (!LAGI_GURU) return;

  if (!GURU) {
    const kunciAda = ['sessionStorage', 'localStorage'].map(n => {
      const st = window[n];
      const daftar = Array.from({ length: st.length }, (_, i) => st.key(i));
      return n + ': ' + (daftar.join(', ') || '(kosong)');
    }).join(' | ');
    peringatan('Data guru yang login tidak ditemukan. Silakan masuk ulang.');
    peringatan('Kunci tersimpan di browser → ' + kunciAda);
    kunciFormGuru();
    return;
  }

  // Bila guard.js sudah menyimpan mapel guru, pakai itu dulu
  if (GURU.mapel) {
    MAPEL_GURU_MENTAH = GURU.mapel;
    pasangSaranMapel();
  }

  if (!FP.dbSiswaGuru) return;

  const terapkan = data => {
    MAPEL_GURU_MENTAH = data[FIELD_MAPEL_GURU];
    if (!GURU.nama) GURU.nama = data.nama || data.akunNama || '';
    pasangSaranMapel();
    drawPakets();

    if (!MAPEL_SMP.length) {
      peringatan('Anda belum memiliki mapel yang terdaftar. Hubungi admin.');
      kunciFormGuru();
    }
  };
  const gagal = error => {
    console.error('Gagal memuat data guru:', error);
    peringatan('Gagal memuat data guru (' + (error.code || error.message || error) + ').');
    peringatan('Info: email login = ' + (GURU.email || '-') + '; ' + (INFO_AUTH || 'Auth tidak diperiksa') + '; ' + INFO_SESI + '.');
    kunciFormGuru();
  };

  /* Dibaca sekali per sesi (cache 30 menit). Yang disimpan hanya field yang
     dibutuhkan — dokumen guru juga berisi sandi awal akun. */
  const kunciCache = 'mapelGuru:' + String(GURU.email || GURU.id).toLowerCase();
  const ringkas = d => ({ id: d.id, nama: d.nama || '', akunNama: d.akunNama || '', [FIELD_MAPEL_GURU]: d[FIELD_MAPEL_GURU] ?? null });

  (async () => {
    try {
      let data = C.bacaCache(kunciCache, 30);

      if (!data) {
        // Id guru (NIP) diketahui: baca dokumen guru/{NIP} langsung
        if (GURU.id) {
          const snap = await F.getDoc(F.doc(FP.dbSiswaGuru, KOLEKSI_GURU, GURU.id));
          if (!snap.exists()) {
            if (!GURU.mapel) {
              peringatan('Data mapel guru tidak ditemukan di ' + KOLEKSI_GURU + '/' + GURU.id + '.');
              kunciFormGuru();
            }
            return;
          }
          data = ringkas({ id: snap.id, ...snap.data() });
        } else {
          // Hanya email yang diketahui: cari dokumen guru lewat field akunEmail
          if (!GURU.email) {
            peringatan('Id guru (NIP) tidak ditemukan pada data login.');
            kunciFormGuru();
            return;
          }
          const snap = await F.getDocs(F.query(F.collection(FP.dbSiswaGuru, KOLEKSI_GURU), F.where('akunEmail', '==', GURU.email), F.limit(1)));
          const d = snap.docs[0];
          if (!d) {
            peringatan('Akun ' + GURU.email + ' tidak ditemukan di data guru.');
            kunciFormGuru();
            return;
          }
          data = ringkas({ id: d.id, ...d.data() });
        }
        C.tulisCache(kunciCache, data);
      }

      if (!GURU.id && data.id) GURU.id = data.id;
      terapkan(data);

    } catch (error) {
      gagal(error);
    }
  })();
}

function kunciFormGuru() {
  const tombol = $('psimpan');
  if (tombol) tombol.disabled = true;
}

/* ---------- Jenis ujian (SAS / PTS / UH) ---------- */

/* Disimpan sebagai singkatan di field "jenis" (dibaca halaman Rekap Nilai:
   SAS dan PTS terisi otomatis ke rapor) dan dipakai filter jenis di daftar hasil. */
const JENIS_BAWAAN = 'SAS';
const DAFTAR_JENIS = [
  ['SAS', 'SAS – Sumatif Akhir Semester'],
  ['PTS', 'PTS – Penilaian Tengah Semester'],
  ['UH', 'UH – Ulangan Harian']
];

function pasangInputJenis() {
  const mapel = $('pnama');
  if (!mapel || $('pjenis')) return;

  const labelMapel = mapel.previousElementSibling && mapel.previousElementSibling.tagName === 'LABEL'
    ? mapel.previousElementSibling : null;
  const awal = labelMapel || mapel;

  const input = document.createElement('select');
  input.id = 'pjenis';
  input.className = mapel.className;
  input.innerHTML = DAFTAR_JENIS.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join('');
  input.value = JENIS_BAWAAN;

  if (labelMapel) {
    const lb = document.createElement('label');
    lb.className = labelMapel.className;
    lb.htmlFor = 'pjenis';
    lb.textContent = 'Jenis ujian';
    awal.before(lb);
  }
  awal.before(input);
}

/* ---------- Daftar paket (guru hanya melihat miliknya) ---------- */

const semuaPaket = () => Array.isArray(S.PAKET) ? S.PAKET : [];

// Satu pintu: preview, hapus, dan gambar daftar semuanya lewat fungsi ini,
// sehingga indeks tombol selalu cocok dengan daftar yang tampil.
// Paket milik guru: yang diberi guruId guru ini, atau paket lama (belum punya
// guruId) yang mapelnya termasuk mapel guru ini.
function milikGuru(p) {
  /* Email dicocokkan lebih dulu: NIP/ID guru bisa diganti admin di Data Guru,
     sedangkan email akun (dan aturan Firestore) tetap. */
  if (p.guruEmail && GURU.email) return String(p.guruEmail).toLowerCase() === String(GURU.email).toLowerCase();
  if (p.guruId) return !!GURU.id && p.guruId === GURU.id;
  const mapelPaket = kunciBanding(p.mapel || p.nama);
  return MAPEL_SMP.some(m => kunciBanding(m) === mapelPaket);
}

const daftarPaket = () => {
  if (!LAGI_GURU) return semuaPaket();
  return GURU ? semuaPaket().filter(milikGuru) : [];
};

const LABEL_SUMBER = { lokal: 'File proyek', github: 'GitHub', drive: 'Google Drive' };

/* ---------- Pratinjau soal ---------- */

function tutupModal() {
  const m = $('pmodal');
  if (!m) return;
  m.classList.add('hidden');
  document.body.style.overflow = '';
}

function bukaModal(judul) {
  let m = $('pmodal');

  if (!m) {
    m = document.createElement('div');
    m.id = 'pmodal';
    m.className = 'pmodal hidden';
    m.innerHTML = `
      <div class="pbox" role="dialog" aria-modal="true" aria-labelledby="pjudul">
        <div class="phead">
          <h3 id="pjudul"></h3>
          <button class="btn" type="button" id="ptutup" aria-label="Tutup">✕</button>
        </div>
        <div class="prev" id="pisi"></div>
      </div>`;
    $('mn').appendChild(m);

    m.addEventListener('click', e => { if (e.target === m) tutupModal(); });
    $('ptutup').onclick = tutupModal;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') tutupModal(); });
  }

  $('pjudul').textContent = judul;
  m.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  return $('pisi');
}

async function preview(i) {
  const paket = daftarPaket()[i];
  const judul = paket ? ((paket.jenis ? paket.jenis + ' ' : '') + (paket.nama || 'Paket soal')) : 'Paket soal';
  const box = bukaModal(judul);
  box.textContent = 'Memuat soal...';

  try {
    if (!paket) throw new Error('Paket soal tidak ditemukan.');

    const buffer = await ambilDokumen(paket);

    if (typeof mammoth === 'undefined') {
      throw new Error('Library Mammoth belum dimuat. Periksa pemuatan mammoth.browser.min.js.');
    }

    const hasil = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const qs = parseSoalBaru(hasil.value);

    if (!qs.length) throw new Error('Tidak ada soal yang terbaca. Periksa format DOCX.');

    box.innerHTML = htmlSoal(qs);
    box.scrollTop = 0;

  } catch (error) {
    console.error('Gagal membaca paket:', error);
    box.innerHTML = `<div class="msg err" style="margin:0">${esc(error.message || 'Gagal membaca dokumen.')}</div>`;
  }
}

/* ---------- Hapus paket ---------- */

async function hapusPaket(i) {
  const paket = daftarPaket()[i];
  if (!paket || !paket.id) return;

  const yakin = await konfirmasi({
    judul: 'Hapus paket soal?',
    pesan: 'Paket "' + ((paket.jenis ? paket.jenis + ' ' : '') + (paket.nama || 'paket ini')) + '" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.',
    ya: 'Hapus',
    batal: 'Batal',
    bahaya: true
  });
  if (!yakin) return;

  // Jadwal yang masih memakai paket ini akan "kehilangan" soalnya: siswa gagal masuk ujian.
  try {
    const dipakai = await F.getDocs(F.query(
      F.collection(dbBankSoal, KOLEKSI.jadwal), F.where('paketId', '==', paket.id), F.limit(3)));
    if (!dipakai.empty) {
      const lanjut = await konfirmasi({
        judul: 'Paket masih dipakai jadwal',
        pesan: dipakai.size + (dipakai.size >= 3 ? '+' : '') + ' jadwal ujian memakai paket ini. Jika dihapus, siswa tidak bisa memuat soal untuk jadwal itu. Tetap hapus?',
        ya: 'Tetap hapus', batal: 'Batal', bahaya: true
      });
      if (!lanjut) return;
    }
  } catch (e) { console.warn('Pemeriksaan jadwal dilewati:', e); }

  F.deleteDoc(F.doc(dbBankSoal, KOLEKSI.paket, paket.id))
    .then(() => {
      S.PAKET = semuaPaket().filter(p => p.id !== paket.id);
      C.tulisCache('paket', S.PAKET);
      C.hapusCacheHalaman('paket');
      drawPakets();
      toast('Paket soal dihapus.');
    })
    .catch(error => {
      console.error('Gagal menghapus paket:', error);
      toast('Gagal menghapus: ' + (error.message || error.code || 'Kesalahan Firestore'));
    });
}

/* ---------- Gambar daftar paket ---------- */

function drawPakets() {
  const container = $('pakets');
  if (!container) return;

  const paketList = daftarPaket();

  if (!paketList.length) {
    container.innerHTML = '<div class="empty">Belum ada paket soal.</div>';
    return;
  }

  container.innerHTML = paketList.map((p, i) => `
    <div class="card">
      <div class="pk">
        <div>
          <b>${esc(formatNama(p.nama) || 'Paket Tanpa Nama')}</b>
          <small>${p.jenis ? '<b>' + esc(p.jenis) + '</b> · ' : ''}${p.kelas ? 'Kelas ' + esc(labelKelas(p.kelas)) + ' · ' : ''}${esc(LABEL_SUMBER[p.sumber || 'lokal'] || p.sumber)}${!LAGI_GURU && p.guruNama ? ' · ' + esc(p.guruNama) : ''}</small>
        </div>
        <div class="acts">
          <button class="btn" type="button" data-v="${i}">Lihat soal</button>
          <button class="btn d" type="button" data-h="${i}" ${S.ok ? '' : 'disabled'}>Hapus</button>
        </div>
      </div>
    </div>`).join('');

  container.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => preview(Number(b.dataset.v)); });
  container.querySelectorAll('[data-h]').forEach(b => { b.onclick = () => hapusPaket(Number(b.dataset.h)); });
}

/* ---------- Form ---------- */

function tampilError(pesan) {
  const box = $('perr');
  if (!box) return;
  box.textContent = pesan;
  box.classList.remove('hidden');
}

function bersihkanError() {
  const box = $('perr');
  if (!box) return;
  box.textContent = '';
  box.classList.add('hidden');
}

function ambilIdDrive(teks) {
  const t = String(teks || '').trim();
  if (!t) return '';
  let m = t.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  m = t.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return t;
  return '';
}

function buatId(nama, kelas) {
  const slug = (kelas + '-' + nama)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'paket';
  return slug + '-' + Date.now().toString(36);
}

async function simpanPaket() {
  bersihkanError();

  const file = ambilIdDrive($('pid').value);
  const jenis = $('pjenis') ? $('pjenis').value : '';
  const mapel = formatNama($('pnama').value);
  const kelas = $('pkelas').value;

  if (!file) return tampilError('Link atau ID Google Drive tidak valid.');
  if (!jenis) return tampilError('Jenis ujian wajib dipilih (SAS, PTS, atau UH).');
  if (!mapel) return tampilError('Nama mapel ujian wajib diisi.');
  if (!DAFTAR_KELAS.includes(kelas)) return tampilError('Kelas wajib dipilih.');

  if (LAGI_GURU) {
    if (!GURU || !GURU.id) return tampilError('Data guru yang login belum terbaca. Muat ulang halaman atau masuk ulang.');
    const diizinkan = MAPEL_SMP.map(kunciBanding);
    if (!diizinkan.includes(kunciBanding(mapel))) {
      return tampilError('Mapel tersebut bukan mapel Anda. Pilih dari saran yang muncul.');
    }
  }

  if (!LAGI_GURU && GURU_PILIH) {
    if (!GURU_PILIH.email) return tampilError('Guru yang dipilih belum punya email akun.');
    if (!MAPEL_SMP.map(kunciBanding).includes(kunciBanding(mapel))) {
      return tampilError('Mapel tersebut bukan mapel guru yang dipilih. Pilih dari saran yang muncul.');
    }
  }

  const tombol = $('psimpan');
  tombol.disabled = true;

  try {
    const id = buatId(jenis + ' ' + mapel, kelas);
    const data = { nama: mapel, jenis, mapel, kelas, sumber: 'drive', file };

    // Paket guru diberi identitas pemilik supaya daftarnya bisa disaring
    if (LAGI_GURU && GURU) {
      data.guruId = GURU.id;
      data.guruEmail = GURU.email;      // dipakai aturan Firestore untuk mencocokkan pemilik
      data.guruNama = GURU.nama || '';
    } else if (!LAGI_GURU && GURU_PILIH) {
      // Admin membuat paket atas nama guru yang dipilih
      data.guruId = GURU_PILIH.id;
      data.guruEmail = GURU_PILIH.email;
      data.guruNama = GURU_PILIH.nama;
    } else if (!LAGI_GURU && ADMIN) {
      // Paket buatan admin memakai susunan field yang sama dengan paket guru
      data.guruId = '';
      data.guruEmail = ADMIN.email;
      data.guruNama = ADMIN.nama;
    }

    await F.setDoc(
      F.doc(dbBankSoal, KOLEKSI.paket, id),
      { ...data, dibuat: F.serverTimestamp() }
    );

    // Perbarui daftar lokal + cache (tanpa membaca ulang Firestore)
    S.PAKET = [{ id, ...data, dibuat: Date.now() }, ...semuaPaket()];
    C.tulisCache('paket', S.PAKET);
    C.hapusCacheHalaman('paket');
    drawPakets();

    $('pid').value = '';
    if (!($('pnama').readOnly)) $('pnama').value = '';
    if ($('pjenis')) $('pjenis').value = JENIS_BAWAAN;
    $('pkelas').value = '';
    document.dispatchEvent(new Event('paket:tersimpan'));   // untuk reset pilihan kelas di halaman guru
    toast('Paket soal berhasil disimpan.');

  } catch (error) {
    console.error('Gagal menyimpan paket soal:', error);
    tampilError('Gagal menyimpan paket: ' + (error.message || error.code || 'Kesalahan Firestore'));
  } finally {
    tombol.disabled = false;
  }
}

/* ---------- Sinkron real-time dari [BANK_SOAL] ---------- */

function dengarPaket() {
  muatPaket(false);
}

/* Dibaca sekali, di-cache 15 menit (dipakai bersama halaman lain). */
async function muatPaket(paksa) {
  try {
    let data = paksa ? null : C.bacaCache('paket', 15);

    if (!data) {
      const snap = await F.getDocs(F.query(
        F.collection(dbBankSoal, KOLEKSI.paket),
        F.orderBy('dibuat', 'desc')
      ));
      data = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
      C.tulisCache('paket', data);
    }

    S.PAKET = data;
    S.ok = true;
    drawPakets();

  } catch (error) {
    console.error('Gagal memuat paket:', error);
    S.ok = false;
    peringatan('Gagal memuat paket dari server: ' + (error.message || error.code || error));
    drawPakets();
  }
}

/* ---------- Mulai ---------- */

S.PAKET = [];
S.ok = false;

isiPilihanKelas();
pasangSaranMapel();      // admin: daftar cadangan dulu; guru: kosong sampai data guru terbaca
pasangInputJenis();
pasangPilihGuru();       // admin saja: pilihan guru pengampu

const tombolSimpan = $('psimpan');
if (tombolSimpan) tombolSimpan.addEventListener('click', simpanPaket);
else console.error('Tombol #psimpan tidak ditemukan');

const inputNama = $('pnama');
if (inputNama) {
  inputNama.addEventListener('blur', () => {
    if (!inputNama.readOnly) inputNama.value = formatNama(inputNama.value);
  });
}

try {
  try { await muatSidebar(); }
  catch (error) { peringatan('Sidebar gagal dimuat: ' + (error.message || error)); }

  if (LAGI_GURU) {
    // Utamakan akun Firebase Auth yang sedang login; cadangan: data di browser
    const sesi = await tungguSesi();
    INFO_SESI = sesi && typeof sesi === 'object'
      ? 'isi sesi = ' + Object.keys(sesi).join(', ')
      : 'sesi guard.js kosong';
    console.info('KW_SESI:', sesi);

    const email = emailDariSesi(sesi) || await tungguEmailLogin();
    GURU = email
      ? { id: nipDariSesi(sesi), email: email.toLowerCase(), nama: (sesi && sesi.nama) || '' }
      : ambilGuruLogin();
  } else {
    const sesi = await tungguSesi();
    const email = emailDariSesi(sesi) || await tungguEmailLogin();
    if (email) ADMIN = { email: email.toLowerCase(), nama: (sesi && sesi.nama) || 'Admin' };
  }

  drawPakets();
  dengarPaket();
  dengarMapel();         // semua mapel sekolah (Daftar/mapel)
  dengarMapelGuru();     // khusus guru: mapel milik guru yang login
  dengarDaftarGuru();    // khusus admin: daftar guru untuk dipilih sebagai pemilik paket

} catch (error) {
  console.error('Halaman paket gagal dimulai:', error);
  peringatan('Halaman paket gagal dimulai: ' + (error.message || error));
}