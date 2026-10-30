/* =========================================================
   TOKEN.JS
   Halaman pembuat token:
   - Modal pembuatan token (tanpa input kunci jawaban)
   - Kunci jawaban dibaca otomatis dari dokumen Word soal
   - Menyimpan token ke Firestore
   - Tabel daftar token
   - Salin, aktif/nonaktif, dan hapus token
========================================================= */

import { PAKET } from './config.js';
import { $, esc, fmtT, toDate, toast, S } from './util.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru } from './parser.js?v=4';

const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const gen = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    n => CH[n % CH.length]
  ).join('');

let sel = null;

// Penanda pemeriksaan. Dinaikkan setiap modal dibuka/ditutup
// supaya hasil pemeriksaan lama tidak menimpa modal yang baru.
let cekId = 0;

function daftarPaket() {
  return Array.isArray(S.PAKET) ? S.PAKET : PAKET;
}

/* =========================================================
   PERIKSA KUNCI JAWABAN DI DOKUMEN (hanya informasi)
========================================================= */

function setInfo(teks, kelas) {
  const info = $('mkinfo');
  if (!info) return;

  info.textContent = teks;
  info.className = 'kinfo' + (kelas ? ' ' + kelas : '');
}

async function periksaKunci(paket) {
  const id = ++cekId;
  const tombol = $('ms');

  setInfo('Memeriksa kunci jawaban di dokumen…');
  tombol.disabled = true;

  try {
    if (typeof mammoth === 'undefined') {
      throw new Error('Library Mammoth belum dimuat.');
    }

    const buffer = await ambilDokumen({
      sumber: paket.sumber || 'lokal',
      file: paket.file
    });

    const hasil = await mammoth.convertToHtml({ arrayBuffer: buffer });

    if (id !== cekId) return;

    const soal = parseSoalBaru(hasil.value);
    const total = soal.length;
    const ada = soal.filter(q => q.correct !== null).length;

    if (total > 0 && ada === total) {
      setInfo(
        'Kunci jawaban lengkap di dokumen (' + total + ' soal). ' +
        'Nilai dihitung otomatis.',
        'ok'
      );
    } else if (ada === 0) {
      setInfo(
        'Dokumen belum memuat kunci jawaban (' + total + ' soal). ' +
        'Tambahkan baris "Kunci: X" di bawah tiap soal pada dokumen Word, ' +
        'atau nilai tidak dapat dihitung otomatis.',
        'warn'
      );
    } else {
      setInfo(
        'Kunci jawaban baru ada untuk ' + ada + ' dari ' + total +
        ' soal. Lengkapi baris "Kunci: X" pada dokumen Word.',
        'warn'
      );
    }

  } catch (e) {
    if (id !== cekId) return;

    console.warn('Kunci dokumen tidak dapat diperiksa:', e);

    setInfo(
      'Dokumen tidak dapat diperiksa (' + (e.message || 'kesalahan') + ').',
      'warn'
    );

  } finally {
    if (id === cekId) tombol.disabled = false;
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

  if (!sel) return fail('Paket soal belum dipilih.');
  if (!(m >= 1 && m <= 600)) return fail('Waktu harus 1–600 menit.');
  if (t.length < 4) return fail('Token minimal 4 karakter huruf/angka.');
  if (!sel.file) return fail('Lokasi file paket soal tidak tersedia.');
  if (!S.ok || !db || !F) return fail('Firebase belum terhubung.');

  const tombol = $('ms');
  tombol.disabled = true;

  try {
    const ref = F.doc(db, 'tokens', t);

    if ((await F.getDoc(ref)).exists()) {
      throw new Error('Token ' + t + ' sudah ada. Gunakan kode lain.');
    }

    await F.setDoc(ref, {
      token: t,

      paketId: sel.id || '',
      paketNama: sel.nama || 'Paket soal',

      sumber: sel.sumber || 'lokal',
      file: sel.file,

      menit: m,

      // Kunci jawaban dibaca dari dokumen Word, bukan dari token.
      kunci: '',

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
  const q = input ? input.value.trim().toLowerCase() : '';

  const L = TOK.filter(x =>
    !q ||
    ((x.id || '') + ' ' + (x.paketNama || '') + ' ' + (x.sumber || ''))
      .toLowerCase().includes(q)
  );

  $('tb').innerHTML = L.length
    ? L.map(x => `
      <tr>
        <td class="tk">${esc(x.id)}</td>

        <td>
          ${esc(x.paketNama || '-')}
          <small style="display:block;color:var(--soft)">
            ${esc(x.sumber || 'lokal')}
          </small>
        </td>

        <td>${esc(x.menit)} menit</td>

        <td>
          <span class="badge ${x.aktif ? 'on' : 'off'}">
            ${x.aktif ? 'Aktif' : 'Nonaktif'}
          </span>
        </td>

        <td>${fmtT(toDate(x.dibuat))}</td>

        <td>
          <div class="acts">
            <button class="btn" data-c="${esc(x.id)}">Salin</button>

            <button class="btn" data-a="${esc(x.id)}" data-s="${x.aktif ? 1 : 0}">
              ${x.aktif ? 'Nonaktifkan' : 'Aktifkan'}
            </button>

            <button class="btn d" data-x="${esc(x.id)}">Hapus</button>
          </div>
        </td>
      </tr>
    `).join('')
    : `
      <tr>
        <td colspan="6" class="empty">
          ${TOK.length
            ? 'Tidak ada token yang cocok.'
            : 'Belum ada token. Pilih paket soal di atas lalu klik Buat token.'}
        </td>
      </tr>
    `;

  document.querySelectorAll('[data-c]').forEach(button => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.c);
        toast('Token disalin');
      } catch (e) {
        prompt('Salin token:', button.dataset.c);
      }
    };
  });

  document.querySelectorAll('[data-a]').forEach(button => {
    button.onclick = async () => {
      try {
        await F.updateDoc(
          F.doc(db, 'tokens', button.dataset.a),
          { aktif: button.dataset.s !== '1' }
        );
        toast('Status token diperbarui.');
      } catch (e) {
        toast('Gagal memperbarui token: ' + e.message);
      }
    };
  });

  document.querySelectorAll('[data-x]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.x;

      if (!confirm('Hapus token ' + id + '?')) return;

      try {
        await F.deleteDoc(F.doc(db, 'tokens', id));
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
    cekId++;
    $('ms').disabled = false;
    $('mo').classList.add('hidden');
  };

  $('ms').onclick = simpan;
  $('ftk').oninput = drawTok;
}