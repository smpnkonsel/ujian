/* =========================================================
   NILAI.JS — semua kode halaman nilai.html
   Membaca hasil ujian, lalu menggambar tabel, statistik, filter
   (ujian, kelas, nama), dan unduh CSV untuk Excel.
   Pengubah dokumen hasil (norm) ada di util.js.
========================================================= */

import { $, esc, fmtT, fmtN, toast, S, norm } from './util.js';
import { sambungFirebase } from './halaman.js?v=6';
import { muatSidebar } from './sidebar.js';

/* Nama field waktu yang DITULIS ujian.js (mis. 'selesai') agar hanya
   hasil terbaru yang dibaca. null = baca sebatas BATAS_HASIL dokumen. */
const URUT_HASIL = 'waktu';
const BATAS_HASIL = 200;

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

/* ---------- Filter ---------- */

function terfilter() {
  const u = $('fu') ? $('fu').value : '';
  const k = $('fk') ? $('fk').value : '';
  const q = $('fq') ? $('fq').value.trim().toLowerCase() : '';

  return (S.HAS || []).filter(h =>
    (!u || h.paket === u) &&
    (!k || h.kelas === k) &&
    (!q || h.nama.toLowerCase().includes(q))
  );
}

/* Isi ulang pilihan select tanpa menghilangkan pilihan sekarang. */
function isiPilihan(sel, semua, nilai) {
  if (!sel) return;

  const sekarang = sel.value;

  sel.innerHTML =
    `<option value="">${esc(semua)}</option>` +
    nilai.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');

  if (nilai.includes(sekarang)) sel.value = sekarang;
}

const unik = arr =>
  [...new Set(arr.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

/* ---------- Gambar halaman ---------- */

export function drawNilai() {
  const semua = S.HAS || [];

  isiPilihan($('fu'), 'Semua ujian', unik(semua.map(h => h.paket)));
  isiPilihan($('fk'), 'Semua kelas', unik(semua.map(h => h.kelas)));

  const L = terfilter();
  const ns = L.map(h => h.nilai).filter(n => n !== null);

  $('n1').textContent = L.length;
  $('n2').textContent = ns.length ? fmtN(ns.reduce((a, b) => a + b, 0) / ns.length) : '–';
  $('n3').textContent = ns.length ? fmtN(Math.max(...ns)) : '–';
  $('n4').textContent = ns.length ? fmtN(Math.min(...ns)) : '–';

  $('nb').innerHTML = L.length
    ? L.map((h, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(h.nama)}</td>
        <td>${esc(h.kelas || '–')}</td>
        <td>${esc(h.paket)}</td>
        <td class="tk">${esc(h.token || '–')}</td>
        <td>${fmtN(h.benar)}</td>
        <td>${fmtN(h.salah)}</td>
        <td><b>${fmtN(h.nilai)}</b></td>
        <td>${fmtT(h.waktu)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="9" class="empty">${
        semua.length ? 'Tidak ada data yang cocok.' : 'Belum ada nilai masuk.'
      }</td></tr>`;
}

/* ---------- Unduh CSV (dibuka Excel) ---------- */

// Cegah rumus Excel dari teks yang diawali = + - @ dan bungkus tanda kutip.
function sel(v) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function unduhCsv() {
  const L = terfilter();

  if (!L.length) {
    toast('Tidak ada data untuk diunduh.');
    return;
  }

  const kepala = ['No', 'Nama', 'Kelas', 'Ujian', 'Token', 'Benar', 'Salah', 'Nilai', 'Waktu'];

  const baris = L.map((h, i) => [
    i + 1,
    h.nama,
    h.kelas,
    h.paket,
    h.token,
    h.benar ?? '',
    h.salah ?? '',
    h.nilai === null ? '' : fmtN(h.nilai),
    h.waktu ? h.waktu.toLocaleString('id-ID') : ''
  ]);

  // Pemisah titik koma + BOM agar Excel berbahasa Indonesia membukanya benar.
  const teks = '\uFEFF' +
    [kepala, ...baris].map(r => r.map(sel).join(';')).join('\r\n');

  const url = URL.createObjectURL(new Blob([teks], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');

  a.href = url;
  a.download = 'nilai-ujian-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Pasang event ---------- */

export function initNilai() {
  ['fu', 'fk'].forEach(id => { if ($(id)) $(id).onchange = drawNilai; });
  if ($('fq')) $('fq').oninput = drawNilai;
  if ($('dl')) $('dl').onclick = unduhCsv;
}


/* ---------- Mulai ---------- */

function isiTabel(id, kolom, pesan) {
  const tbody = $(id);
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="${kolom}" class="empty">${esc(pesan)}</td></tr>`;
}

try {
  S.HAS = [];
  S.ok = false;

  try { await muatSidebar(); }
  catch (error) { peringatan('Sidebar gagal dimuat: ' + (error.message || error)); }

  aman('Halaman nilai', initNilai);

  const tersambung = await sambungFirebase({
    hasil: true,
    norm,
    urutHasil: URUT_HASIL,
    batasHasil: BATAS_HASIL,
    langsung: false,
    onHasil: () => aman('Daftar nilai', drawNilai),
    onGagal: (pesan, jenis) => {
      if (jenis === 'hasil' || jenis === 'semua') isiTabel('nb', 9, pesan);
    }
  });

  if (tersambung) console.log('Halaman nilai siap.');

} catch (error) {
  console.error('Halaman nilai gagal dimulai:', error);
  peringatan('Halaman nilai gagal dimulai: ' + (error.message || error));
}