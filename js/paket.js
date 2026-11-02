/* =========================================================
   PAKET.JS — semua kode halaman paket.html
   - Form tambah paket soal (khusus Google Drive)
   - Daftar paket + pratinjau soal, kunci jawaban, dan hapus
   - Pratinjau mendukung 4 model soal (lihat pratinjau.js)
   Durasi tidak disimpan di paket: diisi saat Buat token.
   Simpan/hapus memperbarui daftar LOKAL (tanpa muat ulang server).
========================================================= */

import { PAKET, KOLEKSI_PAKET } from './config.js?v=6';
import { $, esc, toast, konfirmasi, S } from './util.js';
import { sambungFirebase } from './halaman.js?v=6';
import { muatSidebar } from './sidebar.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru } from './parser.js?v=6';
import { htmlSoal } from './pratinjau.js';

/* ---------- Kotak peringatan (kuning) ---------- */

function peringatan(teks) {
  const w = $('cfgwarn');

  if (!w) {
    console.warn(teks);
    return;
  }

  w.classList.remove('hidden');

  const pesan = document.createElement('div');
  pesan.textContent = teks;
  w.appendChild(pesan);
}

function aman(nama, fn) {
  try {
    return fn();
  } catch (error) {
    console.error(nama + ' gagal:', error);
    peringatan(nama + ' gagal: ' + (error.message || error));
  }
}

/* ---------- Daftar paket ---------- */

const daftarPaket = () => Array.isArray(S.PAKET) ? S.PAKET : PAKET;

// Paket bawaan dari config.js tidak ada di Firestore, jadi tidak bisa dihapus dari sini.
const bawaan = p => (PAKET || []).some(b => String(b.id) === String(p.id));

const LABEL_SUMBER = { lokal: 'File proyek', github: 'GitHub', drive: 'Google Drive' };

/* ---------- Pratinjau soal: jendela di tengah layar ---------- */

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
      </div>
    `;

    // Di dalam #mn supaya gaya neumorphism ikut berlaku.
    $('mn').appendChild(m);

    m.addEventListener('click', e => { if (e.target === m) tutupModal(); });
    $('ptutup').onclick = tutupModal;

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') tutupModal();
    });
  }

  $('pjudul').textContent = judul;
  m.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  return $('pisi');
}

async function preview(i) {
  const paket = daftarPaket()[i];
  const box = bukaModal(paket ? (paket.nama || 'Paket soal') : 'Paket soal');

  box.textContent = 'Memuat soal...';

  try {
    if (!paket) {
      throw new Error('Paket soal tidak ditemukan.');
    }

    const buffer = await ambilDokumen(paket);

    if (typeof mammoth === 'undefined') {
      throw new Error('Library Mammoth belum dimuat. Periksa pemuatan mammoth.browser.min.js.');
    }

    const hasil = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const qs = parseSoalBaru(hasil.value);

    if (!qs.length) {
      throw new Error('Tidak ada soal yang terbaca. Periksa format DOCX.');
    }

    box.innerHTML = htmlSoal(qs);
    box.scrollTop = 0;

  } catch (error) {
    console.error('Gagal membaca paket:', error);

    box.innerHTML = `
      <div class="msg err" style="margin:0">
        ${esc(error.message || 'Gagal membaca dokumen.')}
      </div>
    `;
  }
}

/* ---------- Hapus paket ---------- */

async function hapusPaket(i) {
  const paket = daftarPaket()[i];
  if (!paket) return;

  const { db, F } = S;

  if (!S.ok || !db || !F || typeof F.deleteDoc !== 'function') {
    toast('Firebase belum terhubung, paket belum bisa dihapus.');
    return;
  }

  if (!paket.id || bawaan(paket)) {
    toast('Paket bawaan dari config.js tidak bisa dihapus dari halaman ini.');
    return;
  }

  const nama = paket.nama || 'paket ini';

  const yakin = await konfirmasi({
    judul: 'Hapus paket soal?',
    pesan: 'Paket "' + nama + '" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.',
    ya: 'Hapus',
    batal: 'Batal',
    bahaya: true
  });

  if (!yakin) return;

  // Hapus dari layar langsung; server menyusul di latar belakang.
  const lama = daftarPaket();
  S.PAKET = lama.filter(p => p !== paket);
  if (typeof S.simpanCache === 'function') S.simpanCache('paket');
  drawPakets(false);
  toast('Paket soal dihapus.');

  F.deleteDoc(F.doc(db, KOLEKSI_PAKET, paket.id)).catch(error => {
    console.error('Gagal menghapus paket:', error);

    // Kembalikan bila server menolak.
    S.PAKET = lama;
    if (typeof S.simpanCache === 'function') S.simpanCache('paket');
    drawPakets(false);
    toast('Gagal menghapus: ' + (error.message || error.code || 'Kesalahan Firestore'));
  });
}

/* ---------- Daftar paket ----------
   denganToken = true menambah tombol "Buat token" (onBuat(i)). */

function drawPakets(denganToken, onBuat) {
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
          <b>${esc(p.nama || 'Paket tanpa nama')}</b>
          <small>${p.kelas ? 'Kelas ' + esc(p.kelas) + ' · ' : ''}${esc(LABEL_SUMBER[p.sumber || 'lokal'] || p.sumber)}${bawaan(p) ? ' · bawaan' : ''}</small>
        </div>

        <div class="acts">
          <button class="btn" type="button" data-v="${i}">Lihat soal</button>
          ${denganToken
            ? `<button class="btn g" type="button" data-t="${i}" ${S.ok ? '' : 'disabled'}>Buat token</button>`
            : ''}
          ${bawaan(p)
            ? ''
            : `<button class="btn d" type="button" data-h="${i}" ${S.ok ? '' : 'disabled'}>Hapus</button>`}
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-v]').forEach(button => {
    button.onclick = () => preview(Number(button.dataset.v));
  });

  container.querySelectorAll('[data-t]').forEach(button => {
    button.onclick = () => {
      if (typeof onBuat === 'function') onBuat(Number(button.dataset.t));
    };
  });

  container.querySelectorAll('[data-h]').forEach(button => {
    button.onclick = () => hapusPaket(Number(button.dataset.h));
  });
}

/* ---------- Form: galat ---------- */

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

/* ---------- Form: pengolah link Drive ---------- */

// Ambil ID file dari link Google Drive (atau ID polos).
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

/* ---------- Form: simpan paket ----------
   Urutan isian: link Drive (#pid), nama mapel ujian (#pnama),
   kelas (#pkelas). */

async function simpanPaket() {
  bersihkanError();

  const { db, F } = S;

  const file = ambilIdDrive($('pid').value);
  const nama = $('pnama').value.trim();
  const kelas = $('pkelas').value;

  if (!file) return tampilError('Link atau ID Google Drive tidak valid.');
  if (!nama) return tampilError('Nama mapel ujian wajib diisi.');
  if (!kelas) return tampilError('Kelas wajib dipilih.');

  if (!S.ok || !db || !F) {
    return tampilError('Firebase belum terhubung, paket belum bisa disimpan.');
  }

  const tombol = $('psimpan');
  tombol.disabled = true;

  try {
    // Hanya ID Drive yang disimpan. storage.js menentukan sendiri
    // apakah file DOCX biasa atau Google Docs asli.
    const id = buatId(nama, kelas);
    const data = { nama, kelas, sumber: 'drive', file };

    await F.setDoc(
      F.doc(db, KOLEKSI_PAKET, id),
      { ...data, dibuat: F.serverTimestamp() }
    );

    // Tambahkan ke daftar lokal tanpa muat ulang dari server.
    S.PAKET = [{ id, ...data, dibuat: F.Timestamp.now() }, ...daftarPaket()];
    if (typeof S.simpanCache === 'function') S.simpanCache('paket');
    drawPakets(false);

    $('pid').value = '';
    $('pnama').value = '';
    $('pkelas').value = '';

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

/* ---------- Mulai ---------- */

try {
  S.PAKET = [...(PAKET || [])];
  S.ok = false;

  try { await muatSidebar(); }
  catch (error) { peringatan('Sidebar gagal dimuat: ' + (error.message || error)); }

  const gambar = () => aman('Daftar paket', () => drawPakets(false));

  aman('Form paket soal', () => { $('psimpan').onclick = simpanPaket; });

  gambar();

  const tersambung = await sambungFirebase({
    paket: true,
    onPaket: gambar,
    onGagal: gambar
  });

  if (!tersambung) gambar();

} catch (error) {
  console.error('Halaman paket gagal dimulai:', error);
  peringatan('Halaman paket gagal dimulai: ' + (error.message || error));
}