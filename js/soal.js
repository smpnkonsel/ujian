/* =========================================================
   SOAL.JS
   Pembaca soal DOCX + daftar paket soal
   Mendukung sumber lokal, GitHub, dan Google Drive
========================================================= */

import { PAKET } from './config.js';
import { $, esc, S } from './util.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru } from './parser.js?v=4';

/* =========================================================
   REGEX PEMBACA SOAL
========================================================= */

// Pilihan jawaban A-E.
const RE_OPT =
  /^((?:<[^>]+>|\s|&nbsp;)*)(?:\*\*)?\(?([A-Ea-e])[.)]\s*/;

// Nomor soal.
const RE_NUM =
  /^((?:<[^>]+>|\s|&nbsp;)*)(?:\*\*)?\d+[.)]\s*/;

// Kunci jawaban.
const RE_KEY =
  /^(?:kunci(?:\s+jawaban)?|jawaban)\s*[:=]/i;

// Informasi yang tidak dimasukkan sebagai soal.
const RE_SKIP =
  /^(pembahasan|level|tingkat|topik|skor|bobot)\s*[:=]/i;

/* =========================================================
   MEMECAH PILIHAN JAWABAN
========================================================= */

function optSegs(html) {
  const result = [];

  for (const segment of html.split(/\t+/)) {
    if (
      !segment.replace(/<[^>]+>/g, '').trim() &&
      !/<img/i.test(segment)
    ) {
      continue;
    }

    const match = segment.match(RE_OPT);

    if (match) {
      result.push({
        l: match[2].toUpperCase(),
        h: segment.replace(RE_OPT, '$1').trim()
      });
    } else if (result.length) {
      result[result.length - 1].h += ' ' + segment.trim();
    }
  }

  return result;
}

/* =========================================================
   PARSER SOAL DOCX
   Format yang didukung:
   1. Pertanyaan
   A. Pilihan
   B. Pilihan
   C. Pilihan
   D. Pilihan
========================================================= */

export function parseSoal(html) {
  const doc = new DOMParser().parseFromString(
    html,
    'text/html'
  );

  const blocks = [
    ...doc.body.querySelectorAll('p, li')
  ]
    .map(element => ({
      h: element.innerHTML.trim(),
      t: element.textContent.trim()
    }))
    .filter(block =>
      block.t || /<img/i.test(block.h)
    );

  const output = [];
  let current = null;

  for (const block of blocks) {

    // Lewati kunci dan informasi tambahan.
    if (
      RE_KEY.test(block.t) ||
      RE_SKIP.test(block.t)
    ) {
      continue;
    }

    // Baris kosong yang berisi gambar atau HTML.
    if (current && !block.t) {
      if (current.o.length) {
        current.o[current.o.length - 1].h +=
          ' ' + block.h;
      } else {
        current.q += '<br>' + block.h;
      }

      continue;
    }

    // Baris pilihan jawaban.
    if (current && RE_OPT.test(block.h)) {
      optSegs(block.h).forEach(option => {
        current.o.push(option);
      });

      continue;
    }

    // Baris nomor soal baru.
    if (RE_NUM.test(block.h)) {
      current = {
        q: block.h.replace(RE_NUM, '$1'),
        o: []
      };

      output.push(current);
      continue;
    }

    // Belum ada soal atau soal sebelumnya sudah selesai.
    if (!current || current.o.length >= 2) {
      current = {
        q: block.h,
        o: []
      };

      output.push(current);
      continue;
    }

    // Lanjutan pertanyaan atau pilihan jawaban.
    if (current.o.length === 0) {
      current.q += '<br>' + block.h;
    } else {
      current.o[current.o.length - 1].h +=
        ' ' + block.h;
    }
  }

  return output
    .filter(question => question.o.length >= 2)
    .map(question => {
      question.o.sort((a, b) =>
        a.l.localeCompare(b.l)
      );

      return question;
    });
}

/* =========================================================
   DAFTAR PAKET AKTIF
   Mengutamakan S.PAKET dari main.js.
   Jika belum tersedia, gunakan PAKET bawaan.
========================================================= */

function daftarPaket() {
  return Array.isArray(S.PAKET)
    ? S.PAKET
    : PAKET;
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
   PRATINJAU SOAL
========================================================= */

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

    // Ambil dokumen sesuai sumber penyimpanan.
    const buffer = await ambilDokumen(paket);

    // Baca DOCX menggunakan Mammoth.
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

    box.innerHTML =
      `<p style="margin:0 0 6px;color:var(--soft);font-size:13.5px">
        <b>${qs.length}</b> soal pilihan ganda terbaca.
      </p>` +

      qs.map((q, n) => `
        <div class="q">
          <b>${n + 1}.</b> ${q.q}
          <ol>
            ${q.o.map(o => `
              <li>${o.l}. ${o.h}</li>
            `).join('')}
          </ol>
        </div>
      `).join('');

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
   Durasi tidak ditampilkan: waktu diisi saat Buat token.
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

          <button
            class="btn"
            type="button"
            data-v="${i}">
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

      <div
        class="prev hidden"
        id="pv${i}">
      </div>

    </div>
  `).join('');

  // Tombol pratinjau.
  container.querySelectorAll('[data-v]').forEach(button => {
    button.onclick = () => {
      preview(Number(button.dataset.v));
    };
  });

  // Tombol pembuatan token.
  container.querySelectorAll('[data-t]').forEach(button => {
    button.onclick = () => {
      const index = Number(button.dataset.t);

      if (typeof onBuat === 'function') {
        onBuat(index);
      }
    };
  });
}