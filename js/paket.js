/* =========================================================
   PAKET.JS
   Form "Tambah paket soal":
   - Sumber: komputer/folder lokal, GitHub, Google Drive
   - Menyimpan paket ke Firestore (koleksi paket_soal)
   - Paket langsung muncul di daftar lewat onSnapshot (main.js)
   Durasi tidak disimpan di paket: diisi saat Buat token.
========================================================= */

import { KOLEKSI_PAKET } from './config.js';
import { $, toast, S } from './util.js';

/* =========================================================
   PENANGANAN ERROR FORM
========================================================= */

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

/* =========================================================
   PENGOLAH LOKASI FILE
========================================================= */

// Ambil ID file dari link Google Drive (atau ID polos).
function ambilIdDrive(teks) {
  const t = String(teks || '').trim();

  if (!t) return '';

  // https://drive.google.com/file/d/ID/view
  // https://docs.google.com/document/d/ID/edit
  let m = t.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];

  // https://drive.google.com/open?id=ID
  m = t.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];

  // ID polos.
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return t;

  return '';
}

// Ubah link GitHub biasa menjadi link raw.
function ambilUrlGithub(teks) {
  const t = String(teks || '').trim();

  if (!/^https?:\/\//i.test(t)) return '';

  // https://github.com/user/repo/blob/main/path/file.docx
  const m = t.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/i
  );

  if (m) {
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  }

  return t;
}

/* =========================================================
   ID PAKET
========================================================= */

function buatId(nama) {
  const slug = nama
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'paket';

  return slug + '-' + Date.now().toString(36);
}

/* =========================================================
   SIMPAN PAKET
========================================================= */

async function simpanPaket() {
  bersihkanError();

  const { db, F } = S;

  const sumber = $('psumber').value;
  const nama = $('pnama').value.trim();

  if (!nama) {
    return tampilError('Nama paket ujian wajib diisi.');
  }

  let file = '';

  if (sumber === 'lokal') {
    file = $('pfile').value.trim();

    if (!file) {
      return tampilError('Lokasi file DOCX wajib diisi.');
    }

    if (!/\.docx$/i.test(file)) {
      return tampilError('File harus berformat .docx.');
    }

  } else if (sumber === 'github') {
    file = ambilUrlGithub($('purl').value);

    if (!file) {
      return tampilError(
        'Link GitHub tidak valid. Gunakan link yang diawali https://'
      );
    }

  } else if (sumber === 'drive') {
    file = ambilIdDrive($('pid').value);

    if (!file) {
      return tampilError(
        'Link atau ID Google Drive tidak valid.'
      );
    }

    // Hanya ID yang disimpan. storage.js menentukan sendiri
    // apakah file DOCX biasa atau Google Docs asli.
  }

  if (!S.ok || !db || !F) {
    return tampilError(
      'Firebase belum terhubung, paket belum bisa disimpan.'
    );
  }

  const tombol = $('psimpan');
  tombol.disabled = true;

  try {
    const id = buatId(nama);

    await F.setDoc(
      F.doc(db, KOLEKSI_PAKET, id),
      {
        nama,
        sumber,
        file,
        dibuat: F.serverTimestamp()
      }
    );

    // Kosongkan form.
    $('pnama').value = '';
    $('pfile').value = '';
    $('purl').value = '';
    $('pid').value = '';

    toast('Paket soal berhasil disimpan.');

  } catch (error) {
    console.error('Gagal menyimpan paket soal:', error);

    tampilError(
      'Gagal menyimpan paket: ' +
      (error.message || error.code || 'Kesalahan Firestore')
    );

  } finally {
    tombol.disabled = false;
  }
}

/* =========================================================
   INISIALISASI EVENT
========================================================= */

export function initPaket() {
  const tombol = $('psimpan');

  if (!tombol) {
    console.warn('Tombol #psimpan tidak ditemukan.');
    return;
  }

  tombol.onclick = simpanPaket;
}