/* =========================================================
   TOKEN.JS
   Halaman pembuat token:
   - Modal pembuatan token
   - Memeriksa kunci jawaban di dokumen soal
   - Menyimpan token ke Firestore
   - Menyimpan informasi sumber paket
   - Tabel daftar token
   - Salin, aktif/nonaktif, dan hapus token
========================================================= */

import { PAKET } from './config.js';
import {
  $,
  esc,
  fmtT,
  toDate,
  toast,
  S
} from './util.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru } from './parser.js?v=4';

const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const gen = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    n => CH[n % CH.length]
  ).join('');

let sel = null;

// Penanda pemeriksaan kunci. Dinaikkan setiap modal dibuka/ditutup
// supaya hasil pemeriksaan lama tidak menimpa modal yang baru.
let cekId = 0;

// Hasil pemeriksaan kunci pada dokumen paket terpilih.
let infoKunci = {
  siap: false,
  total: 0,
  ada: 0,
  lengkap: false
};

/* =========================================================
   DAFTAR PAKET AKTIF
========================================================= */

function daftarPaket() {
  return Array.isArray(S.PAKET)
    ? S.PAKET
    : PAKET;
}

/* =========================================================
   PERIKSA KUNCI JAWABAN DI DOKUMEN
   - Lengkap  : kolom kunci disembunyikan.
   - Sebagian : kolom kunci tampil, soal tanpa kunci diisi manual.
   - Tidak ada: kolom kunci tampil.
   - Gagal    : kolom kunci tampil sebagai cadangan.
========================================================= */

async function periksaKunci(paket) {
  const id = ++cekId;

  infoKunci = {
    siap: false,
    total: 0,
    ada: 0,
    lengkap: false
  };

  const wrap = $('mkwrap');
  const info = $('mkinfo');
  const tombol = $('ms');

  if (wrap) wrap.classList.remove('hidden');

  if (info) {
    info.textContent = 'Memeriksa kunci jawaban di dokumen…';
  }

  tombol.disabled = true;

  try {
    if (typeof mammoth === 'undefined') {
      throw new Error('Library Mammoth belum dimuat.');
    }

    const buffer = await ambilDokumen({
      sumber: paket.sumber || 'lokal',
      file: paket.file
    });

    const hasil = await mammoth.convertToHtml({
      arrayBuffer: buffer
    });

    if (id !== cekId) return;

    const soal = parseSoalBaru(hasil.value);

    const total = soal.length;
    const ada = soal.filter(q => q.correct !== null).length;

    infoKunci = {
      siap: true,
      total,
      ada,
      lengkap: total > 0 && ada === total
    };

    if (infoKunci.lengkap) {
      if (wrap) wrap.classList.add('hidden');

      info.textContent =
        'Kunci jawaban sudah ada di dokumen (' + total +
        ' soal). Tidak perlu diisi lagi.';

    } else if (ada === 0) {
      info.textContent =
        'Dokumen tidak memiliki kunci jawaban (' + total +
        ' soal). Isi kunci di bawah, atau kosongkan jika ' +
        'nilai akan diumumkan guru.';

    } else {
      info.textContent =
        'Dokumen hanya memiliki kunci untuk ' + ada +
        ' dari ' + total + ' soal. Isi kunci lengkap ' +
        total + ' huruf di bawah. Kunci di dokumen tetap ' +
        'diutamakan.';
    }

  } catch (e) {
    if (id !== cekId) return;

    console.warn('Kunci dokumen tidak dapat diperiksa:', e);

    info.textContent =
      'Kunci di dokumen tidak dapat diperiksa (' +
      (e.message || 'kesalahan') +
      '). Isi kunci di bawah jika diperlukan.';

  } finally {
    if (id === cekId) {
      tombol.disabled = false;
    }
  }
}

/* =========================================================
   MEMBUKA MODAL PEMBUAT TOKEN
========================================================= */

export function openModal(i) {
  const paket = daftarPaket()[i];

  if (!paket) {
    toast('Paket soal tidak ditemukan.');
    return;
  }

  sel = paket;

  $('mnm').textContent = sel.nama;
  $('mw').value = sel.menit || 90;
  $('mt').value = gen();
  $('mk').value = '';

  $('merr').textContent = '';
  $('merr').classList.add('hidden');

  $('mo').classList.remove('hidden');
  $('mw').focus();

  periksaKunci(paket);
}

/* =========================================================
   MENYIMPAN TOKEN
========================================================= */

async function simpan() {
  const { db, F } = S;

  const m = Math.round(+$('mw').value);

  const t = $('mt').value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const er = $('merr');

  const fail = message => {
    er.textContent = message;
    er.classList.remove('hidden');
  };

  if (!sel) {
    return fail('Paket soal belum dipilih.');
  }

  if (!(m >= 1 && m <= 600)) {
    return fail('Waktu harus 1–600 menit.');
  }

  if (t.length < 4) {
    return fail('Token minimal 4 karakter huruf/angka.');
  }

  if (!sel.file) {
    return fail('Lokasi file paket soal tidak tersedia.');
  }

  if (!S.ok || !db || !F) {
    return fail('Firebase belum terhubung.');
  }

  // Kunci: jika dokumen sudah lengkap, tidak perlu disimpan di token.
  let kunci = '';

  if (!infoKunci.lengkap) {
    kunci = $('mk').value
      .replace(/\s/g, '')
      .toUpperCase()
      .replace(/[^A-E-]/g, '');

    if (
      kunci &&
      infoKunci.siap &&
      infoKunci.total &&
      kunci.length !== infoKunci.total
    ) {
      return fail(
        'Kunci harus ' + infoKunci.total +
        ' huruf (sekarang ' + kunci.length +
        '). Gunakan tanda - untuk soal tanpa kunci.'
      );
    }
  }

  const tombol = $('ms');
  tombol.disabled = true;

  try {
    const ref = F.doc(db, 'tokens', t);

    // Pastikan token belum pernah digunakan.
    if ((await F.getDoc(ref)).exists()) {
      throw new Error(
        'Token ' + t + ' sudah ada. Gunakan kode lain.'
      );
    }

    // Simpan data paket dan token.
    await F.setDoc(ref, {
      token: t,

      paketId: sel.id || '',
      paketNama: sel.nama || 'Paket soal',

      // Penting untuk menentukan lokasi dokumen.
      sumber: sel.sumber || 'lokal',
      file: sel.file,

      menit: m,
      kunci,

      aktif: true,
      dibuat: F.serverTimestamp()
    });

    $('mo').classList.add('hidden');

    toast('Token ' + t + ' berhasil disimpan.');

  } catch (e) {
    console.error('Gagal menyimpan token:', e);
    fail(e.message || 'Gagal menyimpan token.');

  } finally {
    tombol.disabled = false;
  }
}

/* =========================================================
   TABEL DAFTAR TOKEN
========================================================= */

export function drawTok() {
  const { db, F, TOK } = S;

  const input = $('ftk');

  const q = input
    ? input.value.trim().toLowerCase()
    : '';

  const L = TOK.filter(x =>
    !q ||
    (
      (x.id || '') + ' ' +
      (x.paketNama || '') + ' ' +
      (x.sumber || '')
    ).toLowerCase().includes(q)
  );

  $('tb').innerHTML = L.length
    ? L.map(x => `
      <tr>

        <td class="tk">
          ${esc(x.id)}
        </td>

        <td>
          ${esc(x.paketNama || '-')}
          <small style="display:block;color:var(--soft)">
            ${esc(x.sumber || 'lokal')}
          </small>
        </td>

        <td>
          ${esc(x.menit)} menit
        </td>

        <td>
          <span class="badge ${x.aktif ? 'on' : 'off'}">
            ${x.aktif ? 'Aktif' : 'Nonaktif'}
          </span>
        </td>

        <td>
          ${fmtT(toDate(x.dibuat))}
        </td>

        <td>
          <div class="acts">

            <button
              class="btn"
              data-c="${esc(x.id)}">
              Salin
            </button>

            <button
              class="btn"
              data-a="${esc(x.id)}"
              data-s="${x.aktif ? 1 : 0}">
              ${x.aktif ? 'Nonaktifkan' : 'Aktifkan'}
            </button>

            <button
              class="btn d"
              data-x="${esc(x.id)}">
              Hapus
            </button>

          </div>
        </td>

      </tr>
    `).join('')

    : `
      <tr>
        <td colspan="6" class="empty">
          ${
            TOK.length
              ? 'Tidak ada token yang cocok.'
              : 'Belum ada token. Pilih paket soal di atas lalu klik Buat token.'
          }
        </td>
      </tr>
    `;

  // Tombol salin token.
  document.querySelectorAll('[data-c]').forEach(button => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(
          button.dataset.c
        );

        toast('Token disalin');

      } catch (e) {
        prompt('Salin token:', button.dataset.c);
      }
    };
  });

  // Tombol aktif/nonaktif.
  document.querySelectorAll('[data-a]').forEach(button => {
    button.onclick = async () => {
      try {
        await F.updateDoc(
          F.doc(db, 'tokens', button.dataset.a),
          {
            aktif: button.dataset.s !== '1'
          }
        );

        toast('Status token diperbarui.');

      } catch (e) {
        toast('Gagal memperbarui token: ' + e.message);
      }
    };
  });

  // Tombol hapus.
  document.querySelectorAll('[data-x]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.x;

      if (!confirm('Hapus token ' + id + '?')) {
        return;
      }

      try {
        await F.deleteDoc(
          F.doc(db, 'tokens', id)
        );

        toast('Token berhasil dihapus.');

      } catch (e) {
        toast('Gagal menghapus token: ' + e.message);
      }
    };
  });
}

/* =========================================================
   INISIALISASI EVENT
========================================================= */

export function initToken() {
  $('mc').onclick = () => {
    // Batalkan pemeriksaan kunci yang masih berjalan.
    cekId++;

    $('ms').disabled = false;
    $('mo').classList.add('hidden');
  };

  $('ms').onclick = simpan;

  $('ftk').oninput = drawTok;
}