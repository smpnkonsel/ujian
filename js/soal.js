/* =========================================================
   SOAL.JS
   Pembaca soal DOCX + daftar paket soal
   Mendukung sumber lokal, GitHub, dan Google Drive
   Lihat soal: tiap soal diikuti kunci jawabannya.
========================================================= */

import { PAKET } from './config.js';
import { $, esc, S } from './util.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru } from './parser.js?v=4';

/* =========================================================
   DAFTAR PAKET AKTIF
========================================================= */

function daftarPaket() {
  return Array.isArray(S.PAKET) ? S.PAKET : PAKET;
}

/* =========================================================
   LABEL SUMBER PAKET
========================================================= */

function labelSumber(paket) {
  const sumber = paket.sumber || 'lokal';

  const labels = {
    lokal: 'Folder lokal',
    github: 'GitHub',
    drive: 'Google Drive'
  };

  return labels[sumber] || sumber;
}

/* =========================================================
   PRATINJAU SOAL + KUNCI JAWABAN
========================================================= */

function htmlSoal(qs) {
  const berkunci = qs.filter(q => q.key).length;
  const lengkap = berkunci === qs.length;

  const ringkas = `
    <div class="prev-sum">
      <span class="chip"><b>${qs.length}</b> soal terbaca</span>
      <span class="chip ${lengkap ? 'ok' : 'warn'}">
        ${lengkap
          ? 'Semua soal punya kunci jawaban'
          : `Kunci jawaban ${berkunci} dari ${qs.length} soal`}
      </span>
    </div>
  `;

  const daftar = qs.map((q, n) => `
    <div class="q">
      <span class="qn">${n + 1}</span>
      <div>${q.q}</div>

      <ol>
        ${q.o.map(o => `
          <li class="${o.l === q.key ? 'ok' : ''}">${o.l}. ${o.h}</li>
        `).join('')}
      </ol>

      ${q.key
        ? `<div class="kunci">Kunci jawaban <b class="huruf">${esc(q.key)}</b></div>`
        : `<div class="kunci kosong">Kunci jawaban belum ada di dokumen untuk soal ini.</div>`}
    </div>
  `).join('');

  return ringkas + daftar;
}

async function preview(i) {
  const box = $('pv' + i);

  if (!box) return;

  if (!box.classList.contains('hidden')) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  box.textContent = 'Memuat soal...';

  try {
    const paket = daftarPaket()[i];

    if (!paket) {
      throw new Error('Paket soal tidak ditemukan.');
    }

    if (
      (paket.sumber || 'lokal') === 'lokal' &&
      location.protocol === 'file:'
    ) {
      throw new Error(
        'Buka aplikasi melalui Live Server atau GitHub Pages, bukan klik ganda.'
      );
    }

    const buffer = await ambilDokumen(paket);

    if (typeof mammoth === 'undefined') {
      throw new Error(
        'Library Mammoth belum dimuat. Periksa pemuatan mammoth.browser.min.js.'
      );
    }

    const hasil = await mammoth.convertToHtml({
      arrayBuffer: buffer
    });

    const qs = parseSoalBaru(hasil.value);

    if (!qs.length) {
      throw new Error(
        'Tidak ada soal pilihan ganda yang terbaca. Periksa format DOCX.'
      );
    }

    box.innerHTML = htmlSoal(qs);

  } catch (error) {
    console.error('Gagal membaca paket:', error);

    box.innerHTML = `
      <div class="msg err" style="margin:0">
        ${esc(error.message || 'Gagal membaca dokumen.')}
      </div>
    `;
  }
}

/* =========================================================
   MENGGAMBAR DAFTAR PAKET
   onBuat(i) dipanggil saat tombol Buat Token diklik.
========================================================= */

export function drawPakets(onBuat) {
  const container = $('pakets');

  if (!container) return;

  const paketList = daftarPaket();

  if (!paketList.length) {
    container.innerHTML = `
      <div class="empty">
        Belum ada paket soal.
      </div>
    `;

    return;
  }

  container.innerHTML = paketList.map((p, i) => `
    <div class="card">

      <div class="pk">

        <div>
          <b>${esc(p.nama || 'Paket tanpa nama')}</b>

          <small>
            ${esc(labelSumber(p))}
            · ${esc(p.file || '')}
          </small>
        </div>

        <div class="acts">

          <button class="btn" type="button" data-v="${i}">
            Lihat soal
          </button>

          <button
            class="btn g"
            type="button"
            data-t="${i}"
            ${S.ok ? '' : 'disabled'}>
            Buat token
          </button>

        </div>

      </div>

      <div class="prev hidden" id="pv${i}"></div>

    </div>
  `).join('');

  container.querySelectorAll('[data-v]').forEach(button => {
    button.onclick = () => preview(Number(button.dataset.v));
  });

  container.querySelectorAll('[data-t]').forEach(button => {
    button.onclick = () => {
      if (typeof onBuat === 'function') {
        onBuat(Number(button.dataset.t));
      }
    };
  });
}

/* =========================================================
   KOMPATIBILITAS
   Nama lama parseSoal tetap tersedia agar file lain yang
   masih mengimpornya tidak error. Isinya memakai parser baru.
========================================================= */

export const parseSoal = html =>
  parseSoalBaru(html).map(q => ({ q: q.q, o: q.o }));