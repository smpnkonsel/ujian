/* =========================================================
   TOKEN.JS — semua kode halaman token.html
   - Daftar paket + pratinjau soal, tombol "Buat token"
   - Modal pembuatan token (kunci dibaca dari dokumen Word)
   - Pratinjau + kunci untuk 4 model soal (lihat pratinjau.js)
   - Daftar token: simpan / aktif-nonaktif / hapus
   - Token 4 angka. Setelah simpan, ubah status, atau hapus,
     daftar di layar dan cache diperbarui LOKAL tanpa membaca
     ulang Firestore.
   - Toast dan konfirmasi tampil di tengah layar (dari util.js).
   - Token menyimpan kelas & mapel dari paket (dipakai halaman siswa).
========================================================= */

import { PAKET } from './config.js?v=6';
import { $, esc, fmtT, toDate, toast, konfirmasi, S } from './util.js';
import { sambungFirebase } from './halaman.js?v=6';
import { muatSidebar } from './sidebar.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru, punyaKunci } from './parser.js?v=6';
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

/* ---------- Pratinjau soal + kunci jawaban ---------- */

const daftarPaket = () => Array.isArray(S.PAKET) ? S.PAKET : PAKET;

const LABEL_SUMBER = { lokal: 'Komputer', github: 'GitHub', drive: 'Google Drive' };

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

    if ((paket.sumber || 'lokal') === 'lokal' && location.protocol === 'file:') {
      throw new Error('Buka aplikasi melalui Live Server atau GitHub Pages, bukan klik ganda.');
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

  } catch (error) {
    console.error('Gagal membaca paket:', error);

    box.innerHTML = `
      <div class="msg err" style="margin:0">
        ${esc(error.message || 'Gagal membaca dokumen.')}
      </div>
    `;
  }
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
          <small>${p.kelas ? 'Kelas ' + esc(p.kelas) + ' · ' : ''}${esc(LABEL_SUMBER[p.sumber || 'lokal'] || p.sumber)} · ${esc(p.file || '')}</small>
        </div>

        <div class="acts">
          <button class="btn" type="button" data-v="${i}">Lihat soal</button>
          ${denganToken
            ? `<button class="btn g" type="button" data-t="${i}" ${S.ok ? '' : 'disabled'}>Buat token</button>`
            : ''}
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
      if (typeof onBuat === 'function') onBuat(Number(button.dataset.t));
    };
  });
}

/* Token terdiri dari 4 angka (0000-9999). */
const PANJANG_TOKEN = 4;

const gen = () => {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return String(n).padStart(PANJANG_TOKEN, '0');
};

/* Buat token yang belum dipakai di daftar lokal. */
const genUnik = () => {
  const dipakai = new Set((S.TOK || []).map(x => x.id));

  for (let i = 0; i < 50; i++) {
    const t = gen();
    if (!dipakai.has(t)) return t;
  }

  return gen();
};

let sel = null;

// Penanda pemeriksaan. Dinaikkan setiap modal dibuka/ditutup
// supaya hasil pemeriksaan lama tidak menimpa modal yang baru.
let cekId = 0;

/* Simpan perubahan lokal ke cache + gambar ulang tabel. */
function sinkron() {
  if (typeof S.simpanCache === 'function') S.simpanCache('token');
  drawTok();
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

  setInfo('Memeriksa kunci jawaban di dokumen…');

  try {
    if (typeof mammoth === 'undefined') {
      throw new Error('Library Mammoth belum dimuat.');
    }

    // Utamakan salinan di perangkat agar modal tidak menunggu unduhan.
    const buffer = await ambilDokumen(
      { sumber: paket.sumber || 'lokal', file: paket.file },
      { utamakanCache: true }
    );

    const hasil = await mammoth.convertToHtml({ arrayBuffer: buffer });

    if (id !== cekId) return;

    const soal = parseSoalBaru(hasil.value);
    const total = soal.length;
    const ada = soal.filter(punyaKunci).length;

    if (total > 0 && ada === total) {
      setInfo(
        'Kunci jawaban lengkap di dokumen (' + total + ' soal). ' +
        'Nilai dihitung otomatis.',
        'ok'
      );
    } else if (ada === 0) {
      setInfo(
        'Dokumen belum memuat kunci jawaban (' + total + ' soal). ' +
        'Tambahkan tabel KUNCI JAWABAN di akhir dokumen Word ' +
        '(atau baris "Kunci: X" di bawah tiap soal pilihan ganda), ' +
        'atau nilai tidak dapat dihitung otomatis.',
        'warn'
      );
    } else {
      setInfo(
        'Kunci jawaban baru ada untuk ' + ada + ' dari ' + total +
        ' soal. Lengkapi tabel KUNCI JAWABAN pada dokumen Word.',
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

  // Input token: maksimal 4 karakter, keyboard HP langsung angka.
  const inputToken = $('mt');
  inputToken.maxLength = PANJANG_TOKEN;
  inputToken.inputMode = 'numeric';
  inputToken.value = genUnik();

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

  // Hanya angka.
  const t = $('mt').value
    .trim()
    .replace(/\D/g, '');

  const er = $('merr');

  const fail = message => {
    er.textContent = message;
    er.classList.remove('hidden');
  };

  if (!sel) return fail('Paket soal belum dipilih.');
  if (!(m >= 1 && m <= 600)) return fail('Waktu harus 1–600 menit.');
  if (t.length !== PANJANG_TOKEN) return fail('Token harus tepat 4 angka.');
  if (!sel.file) return fail('Lokasi file paket soal tidak tersedia.');
  if (!S.ok || !db || !F) return fail('Firebase belum terhubung.');

  const tombol = $('ms');
  tombol.disabled = true;

  try {
    const ref = F.doc(db, 'tokens', t);

    if (S.TOK.some(x => x.id === t)) {
      throw new Error('Token ' + t + ' sudah ada. Gunakan kode lain.');
    }

    // Daftar lokal bisa terpotong/kedaluwarsa: pastikan di server juga belum ada
    // (1 bacaan saja) agar token lama tidak tertimpa.
    const adaDiServer = await F.getDoc(ref);
    if (adaDiServer.exists()) {
      throw new Error('Token ' + t + ' sudah dipakai. Gunakan kode lain.');
    }

    const data = {
      token: t,

      paketId: sel.id || '',
      paketNama: sel.nama || 'Paket soal',

      // Dipakai halaman siswa untuk info Mata Pelajaran & Kelas.
      mapel: sel.nama || 'Paket soal',
      kelas: sel.kelas || '',

      sumber: sel.sumber || 'lokal',
      file: sel.file,

      menit: m,

      // Kunci jawaban dibaca dari dokumen Word, bukan dari token.
      kunci: '',

      aktif: true
    };

    // Tampil langsung, simpan ke server di latar belakang.
    S.TOK = [{ id: t, ...data, dibuat: F.Timestamp.now() }, ...S.TOK];
    sinkron();
    $('mo').classList.add('hidden');
    toast('Menyimpan token ' + t + '…');

    F.setDoc(ref, { ...data, dibuat: F.serverTimestamp() })
      .then(() => toast('Token ' + t + ' berhasil disimpan.'))
      .catch(e => {
        console.error('Gagal menyimpan token:', e);
        S.TOK = S.TOK.filter(x => x.id !== t);
        sinkron();
        toast('Gagal menyimpan token: ' + (e.message || e));
      });

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
    ((x.id || '') + ' ' + (x.paketNama || '') + ' ' + (x.kelas || '') + ' ' + (x.sumber || ''))
      .toLowerCase().includes(q)
  );

  $('tb').innerHTML = L.length
    ? L.map(x => `
      <tr>
        <td class="tk">${esc(x.id)}</td>

        <td>
          ${esc(x.paketNama || '-')}
          <small style="display:block;color:var(--soft)">
            ${x.kelas ? 'Kelas ' + esc(x.kelas) + ' · ' : ''}${esc(x.sumber || 'lokal')}
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
        await konfirmasi({
          judul: 'Salin token',
          pesan: 'Token: ' + button.dataset.c,
          ya: 'Tutup',
          tanpaBatal: true
        });
      }
    };
  });

  document.querySelectorAll('[data-a]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.a;
      const aktifBaru = button.dataset.s !== '1';

      const lama = S.TOK;
      S.TOK = S.TOK.map(x => x.id === id ? { ...x, aktif: aktifBaru } : x);
      sinkron();
      toast('Status token diperbarui.');

      F.updateDoc(F.doc(db, 'tokens', id), { aktif: aktifBaru }).catch(e => {
        S.TOK = lama;
        sinkron();
        toast('Gagal memperbarui token: ' + (e.message || e));
      });
    };
  });

  document.querySelectorAll('[data-x]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.x;

      const yakin = await konfirmasi({
        judul: 'Hapus token?',
        pesan: 'Token ' + id + ' akan dihapus permanen dan tidak bisa dipakai lagi.',
        ya: 'Hapus',
        batal: 'Batal',
        bahaya: true
      });

      if (!yakin) return;

      const lama = S.TOK;
      S.TOK = S.TOK.filter(x => x.id !== id);
      sinkron();
      toast('Token berhasil dihapus.');

      F.deleteDoc(F.doc(db, 'tokens', id)).catch(e => {
        S.TOK = lama;
        sinkron();
        toast('Gagal menghapus token: ' + (e.message || e));
      });
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

  // Saat mengetik, buang karakter selain angka.
  $('mt').oninput = e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, PANJANG_TOKEN);
  };

  $('ms').onclick = simpan;
  $('ftk').oninput = drawTok;
}


/* ---------- Mulai ---------- */

function isiTabel(id, kolom, pesan) {
  const tbody = $(id);
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="${kolom}" class="empty">${esc(pesan)}</td></tr>`;
}

try {
  S.PAKET = [...(PAKET || [])];
  S.TOK = [];
  S.ok = false;

  try { await muatSidebar(); }
  catch (error) { peringatan('Sidebar gagal dimuat: ' + (error.message || error)); }

  const gambarPaket = () => aman('Daftar paket', () => drawPakets(true, openModal));
  const gambarToken = () => aman('Daftar token', drawTok);

  aman('Pembuat token', initToken);

  gambarPaket();

  const tersambung = await sambungFirebase({
    paket: true,
    token: true,
    onPaket: gambarPaket,
    onToken: gambarToken,
    onGagal: (pesan, jenis) => {
      if (jenis === 'token' || jenis === 'semua') isiTabel('tb', 6, pesan);
      gambarPaket();
    }
  });

  if (!tersambung) gambarPaket();

} catch (error) {
  console.error('Halaman token gagal dimulai:', error);
  peringatan('Halaman token gagal dimulai: ' + (error.message || error));
}