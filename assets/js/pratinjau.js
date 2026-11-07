/* =========================================================
   PRATINJAU.JS
   Tampilan "Lihat soal" untuk semua jenis soal:
   pilihan ganda, pilihan ganda kompleks, benar/salah,
   dan menjodohkan. Dipakai bersama oleh token.js dan paket.js.
========================================================= */

import { esc } from './util.js';
import { JENIS_LABEL, punyaKunci } from './parser.js?v=6';

/* ---------- Gaya tambahan (hanya untuk jenis soal baru) ---------- */

if (
  typeof document !== 'undefined' &&
  !document.getElementById('gaya-pratinjau')
) {
  const gaya = document.createElement('style');

  gaya.id = 'gaya-pratinjau';

  gaya.textContent = `
    .jns{display:inline-block;margin:0 8px 4px 0;padding:2px 9px;border-radius:99px;
      font-size:11px;font-weight:700;letter-spacing:.02em;vertical-align:middle;
      background:var(--tint,#EAF0F6);color:var(--navy,#0F3D63)}
    .jd{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px 0 2px}
    .jd-k b{display:block;margin-bottom:4px;font-size:12px;color:var(--soft,#566273)}
    .jd-k ol{margin:0;padding-left:0;list-style:none}
    .jd-k li{margin:3px 0}
    .jd-p{margin-left:6px;font-weight:700;color:var(--navy,#0F3D63)}
    @media (max-width:520px){.jd{grid-template-columns:1fr}}
  `;

  document.head.appendChild(gaya);
}

/* ---------- Satu soal ---------- */

function opsiOk(q, o) {
  if (q.jenis === 'kompleks') {
    return Array.isArray(q.kunciSet) && q.kunciSet.includes(o.l);
  }

  return o.l === q.key;
}

function bagianPilihan(q) {
  if (!q.o.length) return '';

  return `
    <ol>
      ${q.o.map(o => {
        const label = q.jenis === 'bs' ? '' : o.l + '. ';

        return `<li class="${opsiOk(q, o) ? 'ok' : ''}">${label}${o.h}</li>`;
      }).join('')}
    </ol>
  `;
}

function bagianJodoh(q) {
  const kiri = q.kiri.map(k => `
    <li>${k.no}. ${k.h}${q.pasangan[k.no]
      ? `<span class="jd-p">→ ${esc(q.pasangan[k.no])}</span>`
      : ''}</li>
  `).join('');

  const kanan = q.kanan.map(k => `<li>${esc(k.l)}. ${k.h}</li>`).join('');

  return `
    <div class="jd">
      <div class="jd-k"><b>Kolom A</b><ol>${kiri}</ol></div>
      <div class="jd-k"><b>Kolom B</b><ol>${kanan}</ol></div>
    </div>
  `;
}

function bagianKunci(q) {
  if (punyaKunci(q)) {
    return `<div class="kunci">Kunci jawaban <b class="huruf">${esc(q.key)}</b></div>`;
  }

  return `<div class="kunci kosong">Kunci jawaban belum ada di dokumen untuk soal ini.</div>`;
}

function blokSoal(q, n) {
  const nomor = q.no || n + 1;
  const label = JENIS_LABEL[q.jenis] || '';

  return `
    <div class="q">
      <span class="qn">${esc(nomor)}</span>
      <div>
        <span class="jns">${esc(label)}</span>${q.q}
      </div>

      ${q.jenis === 'jodoh' ? bagianJodoh(q) : bagianPilihan(q)}

      ${bagianKunci(q)}
    </div>
  `;
}

/* ---------- Seluruh paket ---------- */

export function htmlSoal(qs) {
  const berkunci = qs.filter(punyaKunci).length;
  const lengkap = berkunci === qs.length;

  // Hitung per jenis: "Pilihan ganda 3 · Benar / Salah 3 ..."
  const hitung = {};

  qs.forEach(q => {
    hitung[q.jenis] = (hitung[q.jenis] || 0) + 1;
  });

  const rincian = Object.keys(JENIS_LABEL)
    .filter(j => hitung[j])
    .map(j => `${JENIS_LABEL[j]} ${hitung[j]}`)
    .join(' · ');

  const ringkas = `
    <div class="prev-sum">
      <span class="chip"><b>${qs.length}</b> soal terbaca</span>
      <span class="chip">${esc(rincian)}</span>
      <span class="chip ${lengkap ? 'ok' : 'warn'}">
        ${lengkap
          ? 'Semua soal punya kunci jawaban'
          : `Kunci jawaban ${berkunci} dari ${qs.length} soal`}
      </span>
    </div>
  `;

  return ringkas + qs.map(blokSoal).join('');
}