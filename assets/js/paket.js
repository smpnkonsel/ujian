/* =========================================================
   PAKET.JS — halaman paket.html (mengikuti Firebase pusat)
   - Paket soal disimpan di [BANK_SOAL] koleksi "paket"
   - Daftar mapel dibaca dari [DAT-GURU-SISWA] dokumen Daftar/mapel
   - Firebase hanya diimpor dari firebase-pusat.js
   - Daftar paket real-time (onSnapshot), tanpa muat ulang manual
   - Nama mapel otomatis berawalan huruf besar tiap kata
   - Saat mengetik nama mapel, muncul saran mapel (datalist)
   - Kelas memakai angka romawi: VII, VII A, VII B, VIII, ... IX B
   - Jenis ujian (SAS/UTS/dll.) disimpan terpisah di field "jenis";
     field "nama" dan "mapel" berisi nama mapel saja
========================================================= */

import { F, dbBankSoal, KOLEKSI } from './firebase-pusat.js';
// Diimpor sebagai namespace: kalau dbSiswaGuru belum diekspor, halaman tetap jalan
// (tidak mati total) dan muncul peringatan kuning yang jelas.
import * as FP from './firebase-pusat.js';
import { $, esc, toast, konfirmasi, S } from './util.js';
import { muatSidebar } from './sidebar.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru } from './parser.js?v=6';
import { htmlSoal } from './pratinjau.js';

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

// Singkatan yang tetap kapital semua
const SINGKATAN = new Set([
  'IPA', 'IPS', 'PAS', 'PAT', 'PTS', 'UTS', 'UAS', 'SAS', 'PKN', 'PPKN', 'TIK',
  'PJOK', 'SBK', 'MTK', 'BK', 'PAI', 'LKS', 'AKM', 'ANBK',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'
]);

// Kata sambung yang tetap huruf kecil (kecuali di awal nama)
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

/* ---------- Kotak peringatan (kuning) ---------- */

function peringatan(teks) {
  const w = $('cfgwarn');
  if (!w) { console.warn(teks); return; }
  w.classList.remove('hidden');
  const pesan = document.createElement('div');
  pesan.textContent = teks;
  w.appendChild(pesan);
}

/* ---------- Saran mapel (dari Firebase Dat-Guru-Siswa: Daftar/mapel) ---------- */

// Cadangan: dipakai sampai data Firebase berhasil dimuat, atau bila Firebase gagal
const MAPEL_CADANGAN = [
  'Pendidikan Agama Islam',
  'PPKn',
  'Bahasa Indonesia',
  'Matematika',
  'IPA',
  'IPS',
  'Bahasa Inggris',
  'PJOK',
  'Informatika',
  'Seni Budaya'
];

let MAPEL_SMP = MAPEL_CADANGAN.map(m => formatNama(m));

function pasangSaranMapel() {
  const input = $('pnama');
  if (!input) return;

  let dl = document.getElementById('dmapel');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'dmapel';
    document.body.appendChild(dl);
  }
  dl.innerHTML = MAPEL_SMP.map(m => `<option value="${esc(m)}"></option>`).join('');

  input.setAttribute('list', 'dmapel');
  input.setAttribute('autocomplete', 'off');
}

function dengarMapel() {
  if (!FP.dbSiswaGuru) {
    peringatan('dbSiswaGuru belum diekspor dari firebase-pusat.js — saran mapel memakai daftar cadangan.');
    return;
  }

  F.onSnapshot(F.doc(FP.dbSiswaGuru, 'Daftar', 'mapel'), snap => {
    if (!snap.exists()) {
      peringatan('Dokumen Daftar/mapel belum ada — saran mapel memakai daftar cadangan.');
      return;
    }

    // Field "diperbaruiPada" otomatis terlewat karena bukan map yang punya "nama"
    const hasil = Object.values(snap.data())
      .filter(v => v && typeof v === 'object' && typeof v.nama === 'string' && v.nama.trim())
      .map(v => formatNama(v.nama))
      .sort((a, b) => a.localeCompare(b, 'id'));

    if (!hasil.length) return;   // tetap pakai daftar sebelumnya

    MAPEL_SMP = hasil;
    pasangSaranMapel();
  }, error => {
    console.error('Gagal memuat daftar mapel:', error);
    peringatan('Gagal memuat daftar mapel (' + (error.code || error.message || error) + ') — memakai daftar cadangan.');
  });
}

/* ---------- Nama ujian (SAS / UTS / dll.) ----------
   Kolom ini dibuat lewat JavaScript, jadi paket.html tidak perlu diubah.
   Letaknya tepat sebelum kolom nama mapel. */

const JENIS_BAWAAN = 'SAS';
const SARAN_JENIS = ['SAS', 'UTS', 'Ulangan Harian'];

function pasangInputJenis() {
  const mapel = $('pnama');
  if (!mapel || $('pjenis')) return;

  const labelMapel = mapel.previousElementSibling && mapel.previousElementSibling.tagName === 'LABEL'
    ? mapel.previousElementSibling : null;
  const awal = labelMapel || mapel;

  const dl = document.createElement('datalist');
  dl.id = 'djenis';
  dl.innerHTML = SARAN_JENIS.map(j => `<option value="${esc(j)}"></option>`).join('');
  document.body.appendChild(dl);

  const input = document.createElement('input');
  input.id = 'pjenis';
  input.type = 'text';
  input.className = mapel.className;
  input.value = JENIS_BAWAAN;
  input.placeholder = 'Contoh: SAS, UTS';
  input.setAttribute('list', 'djenis');
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('blur', () => { input.value = formatNama(input.value); });

  if (labelMapel) {
    const lb = document.createElement('label');
    lb.className = labelMapel.className;
    lb.htmlFor = 'pjenis';
    lb.textContent = 'Nama ujian';
    awal.before(lb);
  }
  awal.before(input);
}

const daftarPaket = () => Array.isArray(S.PAKET) ? S.PAKET : [];

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

  // onSnapshot langsung memperbarui daftar; jika server menolak, daftar kembali sendiri.
  F.deleteDoc(F.doc(dbBankSoal, KOLEKSI.paket, paket.id))
    .then(() => toast('Paket soal dihapus.'))
    .catch(error => {
      console.error('Gagal menghapus paket:', error);
      toast('Gagal menghapus: ' + (error.message || error.code || 'Kesalahan Firestore'));
    });
}

/* ---------- Daftar paket ---------- */

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
          <small>${p.jenis ? '<b>' + esc(p.jenis) + '</b> · ' : ''}${p.kelas ? 'Kelas ' + esc(labelKelas(p.kelas)) + ' · ' : ''}${esc(LABEL_SUMBER[p.sumber || 'lokal'] || p.sumber)}</small>
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
  const jenis = formatNama($('pjenis') ? $('pjenis').value : '');
  const mapel = formatNama($('pnama').value);
  const kelas = $('pkelas').value;

  if (!file) return tampilError('Link atau ID Google Drive tidak valid.');
  if (!jenis) return tampilError('Nama ujian wajib diisi (contoh: SAS).');
  if (!mapel) return tampilError('Nama mapel ujian wajib diisi.');
  if (!DAFTAR_KELAS.includes(kelas)) return tampilError('Kelas wajib dipilih.');

  const tombol = $('psimpan');
  tombol.disabled = true;

  try {
    const id = buatId(jenis + ' ' + mapel, kelas);
    // nama = mapel saja; jenis ujian disimpan terpisah
    const data = { nama: mapel, jenis, mapel, kelas, sumber: 'drive', file };

    await F.setDoc(
      F.doc(dbBankSoal, KOLEKSI.paket, id),
      { ...data, dibuat: F.serverTimestamp() }
    );

    $('pid').value = '';
    $('pnama').value = '';
    if ($('pjenis')) $('pjenis').value = JENIS_BAWAAN;
    $('pkelas').value = '';
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
  const q = F.query(
    F.collection(dbBankSoal, KOLEKSI.paket),
    F.orderBy('dibuat', 'desc')
  );

  F.onSnapshot(q, snap => {
    S.PAKET = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    S.ok = true;
    if (typeof S.simpanCache === 'function') S.simpanCache('paket');
    drawPakets();
  }, error => {
    console.error('Gagal memuat paket:', error);
    S.ok = false;
    peringatan('Gagal memuat paket dari server: ' + (error.message || error.code || error));
    drawPakets();
  });
}

/* ---------- Mulai ---------- */

S.PAKET = [];
S.ok = false;

// Pasang form dulu, sebelum ada await apa pun
isiPilihanKelas();
pasangSaranMapel();      // langsung berisi daftar cadangan, lalu diganti data Firebase
pasangInputJenis();

const tombolSimpan = $('psimpan');
if (tombolSimpan) tombolSimpan.addEventListener('click', simpanPaket);
else console.error('Tombol #psimpan tidak ditemukan');

const inputNama = $('pnama');
if (inputNama) {
  // Rapikan otomatis saat selesai mengetik
  inputNama.addEventListener('blur', () => { inputNama.value = formatNama(inputNama.value); });
}

try {
  try { await muatSidebar(); }
  catch (error) { peringatan('Sidebar gagal dimuat: ' + (error.message || error)); }

  drawPakets();
  dengarPaket();
  dengarMapel();         // mapel dari Firebase Dat-Guru-Siswa (Daftar/mapel)

} catch (error) {
  console.error('Halaman paket gagal dimulai:', error);
  peringatan('Halaman paket gagal dimulai: ' + (error.message || error));
}