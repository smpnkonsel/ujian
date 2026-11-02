/* =========================================================
   DASBOR.JS — semua kode halaman dasbor.html
   Membaca token dan nilai, lalu menggambar: total token,
   peserta mengumpulkan, sebaran nilai, token aktif,
   rata-rata per kelas, dan pengumpulan terbaru.
========================================================= */

import { $, esc, fmtT, fmtN, toast, S, norm } from './util.js';
import { sambungFirebase } from './halaman.js?v=6';
import { muatSidebar } from './sidebar.js';

/* Nama field waktu yang DITULIS ujian.js (mis. 'selesai') agar hanya
   hasil terbaru yang dibaca. null = baca sebatas BATAS_HASIL dokumen. */
const URUT_HASIL = 'waktu';
const BATAS_HASIL = 200;

const MAKS_TOKEN = 30;   // token aktif yang ditampilkan

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

/* ---------- Penolong ---------- */

let terakhir = null;   // waktu data terakhir dimuat

const rata = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const urutAlfa = (a, b) => a.localeCompare(b, 'id', { numeric: true });
const kosong = teks => `<div class="empty">${teks}</div>`;
const jam = d => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

const KELOMPOK = [['0–59', 0, 59], ['60–69', 60, 69], ['70–79', 70, 79], ['80–89', 80, 89], ['90–100', 90, 1e9]];

/* ---------- Gambar dasbor ---------- */

function drawDash() {
  const { TOK, HAS } = S;

  const act = TOK.filter(x => x.aktif);
  const ber = HAS.filter(h => h.nilai !== null);       // peserta yang punya nilai
  const ns = ber.map(h => h.nilai);

  /* Dua kotak kecil */
  $('s2').textContent = TOK.length;
  $('s3').textContent = HAS.length;

  $('upd').textContent = terakhir ? 'Data dimuat pukul ' + jam(terakhir) : 'Memuat data…';

  /* Sebaran nilai */
  const cnt = KELOMPOK.map(([, a, b]) => ns.filter(n => n >= a && n <= b).length);
  const mx = Math.max(1, ...cnt);

  $('dist').innerHTML = ns.length
    ? KELOMPOK.map((b, i) => `
        <div class="bar">
          <span>${b[0]}</span>
          <div class="trk"><i style="width:${cnt[i] / mx * 100}%"></i></div>
          <em>${cnt[i]}</em>
        </div>`).join('')
    : kosong('Belum ada nilai masuk.');

  /* Token aktif: hanya kode token, lebar kotak mengikuti teksnya */
  const tampil = act.slice(0, MAKS_TOKEN);

  $('dtok').innerHTML = act.length
    ? `<div class="tkwrap">
        ${tampil.map(x => `<button type="button" class="tkc" data-c="${esc(x.id)}" title="Klik untuk menyalin">${esc(x.id)}</button>`).join('')}
        ${act.length > MAKS_TOKEN ? `<span class="more">+${act.length - MAKS_TOKEN} lagi</span>` : ''}
      </div>`
    : kosong('Tidak ada token aktif.');

  /* Rata-rata per kelas */
  const perKelas = new Map();

  ber.forEach(h => {
    if (!h.kelas) return;
    if (!perKelas.has(h.kelas)) perKelas.set(h.kelas, []);
    perKelas.get(h.kelas).push(h.nilai);
  });

  const kelas = [...perKelas.entries()].sort((a, b) => urutAlfa(a[0], b[0])).slice(0, 8);

  $('dkls').innerHTML = kelas.length
    ? kelas.map(([k, v]) => {
        const r = rata(v);

        return `
          <div class="bar">
            <span title="${esc(k)}">${esc(k)}</span>
            <div class="trk"><i style="width:${Math.min(100, r)}%"></i></div>
            <em>${fmtN(r)}</em>
          </div>`;
      }).join('')
    : kosong('Belum ada nilai per kelas.');

  /* Pengumpulan terbaru */
  $('dlast').innerHTML = HAS.length
    ? HAS.slice(0, 5).map(h => `
        <tr>
          <td>${esc(h.nama)}</td>
          <td>${esc(h.paket)}</td>
          <td><b>${fmtN(h.nilai)}</b></td>
          <td>${fmtT(h.waktu)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Belum ada pengumpulan.</td></tr>';
}

/* ---------- Alat: muat ulang dan salin token ---------- */

function initAlat() {
  const tombol = $('muat');

  if (tombol) {
    tombol.onclick = async () => {
      if (!S.muat) {
        toast('Belum terhubung ke Firebase.');
        return;
      }

      tombol.disabled = true;

      try {
        await S.muat('semua', true);   // paksa baca dari server
        toast('Data dimuat ulang.');

      } finally {
        setTimeout(() => { tombol.disabled = false; }, 10000);
      }
    };
  }

  const daftarToken = $('dtok');

  if (daftarToken) {
    daftarToken.addEventListener('click', async e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;

      try {
        await navigator.clipboard.writeText(b.dataset.c);
        toast('Token ' + b.dataset.c + ' disalin');
      } catch (_) {
        prompt('Salin token:', b.dataset.c);
      }
    });
  }
}

/* ---------- Mulai ---------- */

try {
  S.TOK = [];
  S.HAS = [];
  S.ok = false;

  try { await muatSidebar(); }
  catch (error) { peringatan('Sidebar gagal dimuat: ' + (error.message || error)); }

  const gambar = () => aman('Dasbor', drawDash);

  const dataMasuk = () => {
    terakhir = new Date();
    gambar();
  };

  aman('Alat dasbor', initAlat);
  gambar();

  const tersambung = await sambungFirebase({
    token: true,
    hasil: true,
    norm,
    urutHasil: URUT_HASIL,
    batasHasil: BATAS_HASIL,
    langsung: false,
    onToken: dataMasuk,
    onHasil: dataMasuk,
    onGagal: gambar
  });

  if (!tersambung) gambar();

} catch (error) {
  console.error('Dasbor gagal dimulai:', error);
  peringatan('Dasbor gagal dimulai: ' + (error.message || error));
}