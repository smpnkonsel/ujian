/* =========================================================
   MAIN.JS — INISIALISASI ADMIN KW LEARNING (admin.html)

   Fitur:
   - Menyambung Firebase lewat halaman.js (satu kode untuk
     semua halaman)
   - Memantau paket, token, dan hasil ujian secara realtime
   - Memperbarui dasbor, daftar paket, token, dan nilai

   Perbaikan:
   - Tiap komponen dijalankan terpisah. Bila satu gagal atau
     elemennya tidak ada di halaman, yang lain tetap jalan dan
     data tetap dibaca.
   - Bagian yang elemennya tidak ada (misalnya token atau nilai
     sudah dipindah ke halaman sendiri) dilewati otomatis.
   - Galat ditampilkan di kotak kuning, tidak diam-diam kosong.
========================================================= */

import { PAKET } from './config.js';
import { $, esc, S } from './util.js';
import { initNav } from './nav.js';
import { drawPakets } from './soal.js';
import { initToken, openModal, drawTok } from './token.js';
import { initPaket } from './paket.js';
import { initNilai, drawNilai, norm } from './nilai.js';
import { drawDash } from './dasbor.js';
import { sambungFirebase } from './halaman.js';

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
   MENJALANKAN SATU KOMPONEN SECARA AMAN
   Galat satu komponen tidak menghentikan yang lain.
========================================================= */

function aman(nama, fn) {
  try {
    return fn();

  } catch (error) {
    console.error(nama + ' gagal:', error);
    peringatan(nama + ' gagal: ' + (error.message || error));
  }
}

/* =========================================================
   GAMBAR ULANG (hanya bila elemennya ada di halaman)
========================================================= */

const refreshPakets = () =>
  $('pakets') && aman('Daftar paket', () => drawPakets(openModal));

const refreshTok = () =>
  $('tb') && aman('Daftar token', drawTok);

const refreshNilai = () =>
  $('nb') && aman('Daftar nilai', drawNilai);

const refreshDash = () =>
  $('s1') && aman('Dasbor', drawDash);

/* =========================================================
   PESAN GAGAL PADA TABEL
========================================================= */

function isiTabel(id, kolom, pesan) {
  const tbody = $(id);

  if (!tbody) return;

  tbody.innerHTML =
    `<tr><td colspan="${kolom}" class="empty">${esc(pesan)}</td></tr>`;
}

function saatGagal(pesan, jenis) {
  if (jenis === 'token' || jenis === 'semua') {
    isiTabel('tb', 6, pesan);
  }

  if (jenis === 'hasil' || jenis === 'semua') {
    isiTabel('nb', 9, pesan);
  }

  refreshDash();
}

/* =========================================================
   INISIALISASI KOMPONEN ADMIN
========================================================= */

function initKomponen() {
  aman('Navigasi', initNav);

  if ($('mo') && $('ms') && $('mc')) {
    aman('Pembuat token', initToken);
  }

  if ($('psimpan')) {
    aman('Form paket soal', initPaket);
  }

  if ($('nb')) {
    aman('Halaman nilai', initNilai);
  }

  // Tampilkan paket bawaan sebelum Firestore selesai dimuat.
  refreshPakets();
  refreshDash();
}

/* =========================================================
   INISIALISASI APLIKASI
========================================================= */

async function mulaiAdmin() {
  initKomponen();

  const tersambung = await sambungFirebase({
    paket: true,
    token: true,
    hasil: true,
    norm,

    onPaket: () => {
      refreshPakets();
      refreshDash();
    },

    onToken: () => {
      refreshTok();
      refreshDash();
    },

    onHasil: () => {
      refreshNilai();
      refreshDash();
    },

    onGagal: saatGagal
  });

  if (tersambung) {
    console.log('KW Learning Admin berhasil diinisialisasi.');
  } else {
    refreshPakets();
    refreshDash();
  }
}

mulaiAdmin().catch(error => {
  console.error('Admin gagal dimulai:', error);
  peringatan('Admin gagal dimulai: ' + (error.message || error));
});