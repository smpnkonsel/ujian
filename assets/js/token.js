/* =========================================================
   TOKEN.JS — halaman token.html (mengikuti Firebase pusat)
   Token dibuat dari JADWAL ujian (jalur utama). Paket yang
   belum punya jadwal tetap bisa dibuatkan token (tanpa jadwal).

   - Paket  : [BANK_SOAL] koleksi "paket"
   - Jadwal : [BANK_SOAL] koleksi "jadwal"
   - Token  : Firebase tingkat (VII / VIII / IX), koleksi
              "tokens", dipilih lewat dbTingkat()
   - Digit pertama token = tingkat (1=VII, 2=VIII, 3=IX),
     sesuai tingkatDariToken() di firebase-pusat.js
   - Kelas memakai angka romawi: VII, VII A, VII B, dst.
     (data lama 7/8/9 tetap dikenali)
   - Firebase hanya diimpor dari firebase-pusat.js

   HEMAT FIRESTORE:
   - Tanpa onSnapshot (tidak ada listener / koneksi aktif)
   - Paket, jadwal, token di-cache 10 menit (sessionStorage)
   - Token dibaca sekali, dibatasi 300 dokumen per tingkat
   - Simpan / ubah status / hapus memperbarui daftar LOKAL
     (tanpa baca ulang), dengan rollback bila gagal
   - Tombol opsional #rf untuk baca ulang dari server
========================================================= */

import { F, TINGKAT, KOLEKSI, dbBankSoal, dbTingkat, tingkatDariToken } from './firebase-pusat.js';
import { $, esc, fmtT, toDate, toast, konfirmasi, S } from './util.js';
import { muatSidebar } from './sidebar.js';
import { ambilDokumen } from './storage.js';
import { parseSoalBaru, punyaKunci } from './parser.js?v=6';
import { htmlSoal } from './pratinjau.js';

/* ---------- Kotak peringatan (kuning) ---------- */

function peringatan(teks) {
  const w = $('cfgwarn');
  if (!w) { console.warn(teks); return; }
  w.classList.remove('hidden');
  const pesan = document.createElement('div');
  pesan.textContent = teks;
  w.appendChild(pesan);
}

function aman(nama, fn) {
  try { return fn(); }
  catch (error) {
    console.error(nama + ' gagal:', error);
    peringatan(nama + ' gagal: ' + (error.message || error));
  }
}

const daftarPaket = () => Array.isArray(S.PAKET) ? S.PAKET : [];
const daftarJadwal = () => Array.isArray(S.JADWAL) ? S.JADWAL : [];

const paketDari = id => daftarPaket().find(p => p.id === id) || null;

const LABEL_SUMBER = { lokal: 'Komputer', github: 'GitHub', drive: 'Google Drive' };
const LABEL_STATUS = { belum: 'Belum dimulai', jalan: 'Berlangsung', selesai: 'Selesai' };

/* ---------- Kelas (romawi) -> digit awal token ---------- */

const ANGKA_KE_ROMAWI = { '7': 'VII', '8': 'VIII', '9': 'IX' };
const DIGIT_TINGKAT = { VII: '1', VIII: '2', IX: '3' };

// "VII A" -> "VII", "8" -> "VIII", selain itu ''
function tingkatKelas(kelas) {
  let t = String(kelas || '').trim().toUpperCase();
  if (ANGKA_KE_ROMAWI[t]) t = ANGKA_KE_ROMAWI[t];
  const m = t.match(/^(VIII|VII|IX)(?:\s|$)/);
  return m ? m[1] : '';
}

// Tampilan kelas: "7" -> "VII", "VII A" tetap
function labelKelas(kelas) {
  const t = String(kelas || '').trim();
  return ANGKA_KE_ROMAWI[t] || t;
}

const digitTingkat = tingkat => DIGIT_TINGKAT[tingkat] || '';

/* ---------- Format nama mapel: Huruf Besar Di Awal Kata ---------- */

const SINGKATAN = new Set([
  'IPA', 'IPS', 'PAS', 'PAT', 'PTS', 'UTS', 'UAS', 'PKN', 'PPKN', 'TIK',
  'PJOK', 'SBK', 'MTK', 'BK', 'PAI', 'LKS', 'AKM', 'ANBK',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'
]);

function formatNama(teks) {
  return String(teks || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\p{L}[\p{L}']*/gu, kata =>
      SINGKATAN.has(kata.toUpperCase())
        ? kata.toUpperCase()
        : kata.charAt(0).toUpperCase() + kata.slice(1)
    );
}

/* ---------- Waktu jadwal (tgl "YYYY-MM-DD", jam "HH:MM") ---------- */

function gabungWaktu(tgl, jam) {
  if (!tgl) return 0;
  const [th, bl, tg] = String(tgl).split('-').map(Number);
  const [jm, mn] = String(jam || '00:00').split(':').map(Number);
  if (!th || !bl || !tg) return 0;
  return new Date(th, bl - 1, tg, jm || 0, mn || 0).getTime();
}

const mulaiJadwal = j => gabungWaktu(j.tgl, j.mulai);

function selesaiJadwal(j) {
  let s = gabungWaktu(j.tgl, j.selesai);
  // Jam selesai lebih awal dari mulai = lewat tengah malam
  if (s && s <= mulaiJadwal(j)) s += 86400000;
  return s;
}

// Durasi dari jam mulai-selesai; bila tak terbaca, pakai menit di jadwal/paket
function menitJadwal(j, paket) {
  const a = mulaiJadwal(j);
  const b = selesaiJadwal(j);
  if (a && b && b > a) return Math.round((b - a) / 60000);
  return Number(j.menit) || Number(paket?.menit) || 90;
}

function statusJadwal(j) {
  const a = mulaiJadwal(j);
  const b = selesaiJadwal(j);
  const now = Date.now();
  if (a && now < a) return 'belum';
  if (b && now > b) return 'selesai';
  return a ? 'jalan' : 'belum';
}

/* =========================================================
   BACA FIRESTORE HEMAT (sekali baca + cache)
========================================================= */

const CACHE_MENIT = 10;
const BATAS_TOKEN = 300;

/* Baca satu query satu kali. Pakai getDocs bila tersedia;
   bila tidak, ambil snapshot pertama lalu langsung berhenti
   mendengarkan (tetap hanya satu kali baca). */
function bacaSekali(q) {
  if (typeof F.getDocs === 'function') return F.getDocs(q);

  return new Promise((resolve, reject) => {
    let berhenti = null;
    let selesai = false;
    berhenti = F.onSnapshot(q, snap => {
      if (selesai) return;
      selesai = true;
      if (berhenti) berhenti();
      resolve(snap);
    }, reject);
    if (selesai && berhenti) berhenti();
  });
}

// Timestamp Firestore -> angka (agar aman disimpan di cache JSON)
function keMs(v) {
  const d = toDate(v);
  return d ? +d : 0;
}

function bacaCache(kunci) {
  try {
    const mentah = sessionStorage.getItem('tok:' + kunci);
    if (!mentah) return null;
    const { t, data } = JSON.parse(mentah);
    if (Date.now() - t > CACHE_MENIT * 60000) return null;
    return data;
  } catch (e) { return null; }
}

function tulisCache(kunci, data) {
  try {
    sessionStorage.setItem('tok:' + kunci, JSON.stringify({ t: Date.now(), data }));
  } catch (e) { /* penyimpanan penuh: abaikan */ }
}

async function muatPaket(paksa) {
  if (!paksa) {
    const c = bacaCache('paket');
    if (c) { S.PAKET = c; return; }
  }
  const q = F.query(F.collection(dbBankSoal, KOLEKSI.paket), F.orderBy('dibuat', 'desc'));
  const snap = await bacaSekali(q);
  S.PAKET = snap.docs.map(d => {
    const x = { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) };
    x.dibuat = keMs(x.dibuat);
    return x;
  });
  tulisCache('paket', S.PAKET);
}

async function muatJadwal(paksa) {
  if (!paksa) {
    const c = bacaCache('jadwal');
    if (c) { S.JADWAL = c; return; }
  }
  const snap = await bacaSekali(F.collection(dbBankSoal, KOLEKSI.jadwal));
  S.JADWAL = snap.docs.map(d => {
    const x = { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) };
    x.dibuat = keMs(x.dibuat);
    return x;
  });
  tulisCache('jadwal', S.JADWAL);
}

/* Token: tiga tingkat dibaca paralel, masing-masing maksimal 300 dokumen */
async function muatToken(paksa) {
  if (!paksa) {
    const c = bacaCache('token');
    if (c) { S.TOK = c; return; }
  }

  const hasil = await Promise.allSettled(TINGKAT.map(async t => {
    const q = F.query(
      F.collection(dbTingkat(t), KOLEKSI.token),
      F.orderBy('dibuat', 'desc'),
      F.limit(BATAS_TOKEN)
    );
    const snap = await bacaSekali(q);
    return snap.docs.map(d => {
      const x = { id: d.id, tingkat: t, ...d.data({ serverTimestamps: 'estimate' }) };
      x.dibuat = keMs(x.dibuat);
      return x;
    });
  }));

  const semua = [];
  hasil.forEach((h, i) => {
    if (h.status === 'fulfilled') semua.push(...h.value);
    else {
      console.error('Gagal memuat token ' + TINGKAT[i] + ':', h.reason);
      peringatan('Gagal memuat token kelas ' + TINGKAT[i] + ': ' + (h.reason?.message || h.reason?.code || h.reason));
    }
  });

  S.TOK = semua.sort((a, b) => (b.dibuat || 0) - (a.dibuat || 0));

  // Cache hanya bila ketiganya berhasil, supaya data parsial tidak tersimpan
  if (hasil.every(h => h.status === 'fulfilled')) tulisCache('token', S.TOK);
}

/* Simpan perubahan lokal: cache + gambar ulang (tanpa baca Firestore) */
function sinkron() {
  tulisCache('token', S.TOK || []);
  drawTok();
  drawDaftar();
}

/* =========================================================
   DAFTAR JADWAL + PAKET TANPA JADWAL
========================================================= */

let ITEMS = [];            // { key, jadwal|null, paket|null }
const BUKA = new Set();    // key pratinjau yang sedang terbuka

function susunItems() {
  const jadwal = daftarJadwal()
    .slice()
    .sort((a, b) => mulaiJadwal(b) - mulaiJadwal(a));

  const dariJadwal = jadwal.map(j => ({
    key: 'j:' + j.id,
    jadwal: j,
    paket: paketDari(j.paketId)
  }));

  // Paket yang belum dipakai jadwal mana pun
  const dipakai = new Set(jadwal.map(j => j.paketId));
  const tanpaJadwal = daftarPaket()
    .filter(p => !dipakai.has(p.id))
    .map(p => ({ key: 'p:' + p.id, jadwal: null, paket: p }));

  ITEMS = [...dariJadwal, ...tanpaJadwal];
}

// Tingkat dari jadwal; bila kosong, ikut kelas paket
function tingkatItem(item) {
  const j = item.jadwal;
  return (j && (tingkatKelas(j.tingkat) || tingkatKelas(j.kelas)))
    || tingkatKelas(item.paket?.kelas)
    || '';
}

async function preview(i) {
  const item = ITEMS[i];
  const box = $('pv' + i);
  if (!box || !item) return;

  if (!box.classList.contains('hidden')) {
    box.classList.add('hidden');
    BUKA.delete(item.key);
    return;
  }

  BUKA.add(item.key);
  box.classList.remove('hidden');
  box.textContent = 'Memuat soal...';

  try {
    if (!item.paket) throw new Error('Paket soal untuk jadwal ini tidak ditemukan di bank soal.');

    const buffer = await ambilDokumen(item.paket);

    if (typeof mammoth === 'undefined') {
      throw new Error('Library Mammoth belum dimuat. Periksa pemuatan mammoth.browser.min.js.');
    }

    const hasil = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const qs = parseSoalBaru(hasil.value);
    if (!qs.length) throw new Error('Tidak ada soal yang terbaca. Periksa format DOCX.');

    box.innerHTML = htmlSoal(qs);

  } catch (error) {
    console.error('Gagal membaca paket:', error);
    box.innerHTML = `<div class="msg err" style="margin:0">${esc(error.message || 'Gagal membaca dokumen.')}</div>`;
  }
}

function kartu(item, i) {
  const { jadwal: j, paket: p } = item;
  const tok = S.TOK || [];

  let judul;
  let info;

  if (j) {
    const st = statusJadwal(j);
    const sudah = tok.filter(t => t.jadwalId === j.id).length;
    const tingkat = tingkatItem(item);

    judul = formatNama(j.mapel || p?.nama || j.paketNama) || 'Jadwal';
    info = [
      tingkat ? 'Kelas ' + tingkat : '',
      j.tgl || '',
      (j.mulai || j.selesai) ? (j.mulai || '') + '–' + (j.selesai || '') : '',
      j.ruang || '',
      LABEL_STATUS[st],
      sudah ? sudah + ' token' : ''
    ].filter(Boolean).map(esc).join(' · ');
  } else {
    const sudah = tok.filter(t => t.paketId === p.id).length;

    judul = formatNama(p.nama) || 'Paket Tanpa Nama';
    info = [
      p.kelas ? 'Kelas ' + labelKelas(p.kelas) : '',
      LABEL_SUMBER[p.sumber || 'lokal'] || p.sumber || '',
      sudah ? sudah + ' token' : ''
    ].filter(Boolean).map(esc).join(' · ');
  }

  return `
    <div class="card">
      <div class="pk">
        <div>
          <b>${esc(judul)}</b>
          <small>${info}</small>
        </div>
        <div class="acts">
          <button class="btn" type="button" data-v="${i}">Lihat soal</button>
          <button class="btn g" type="button" data-t="${i}" ${S.ok ? '' : 'disabled'}>Buat token</button>
        </div>
      </div>
      <div class="prev hidden" id="pv${i}"></div>
    </div>`;
}

function drawDaftar() {
  const container = $('pakets');
  if (!container) return;

  susunItems();

  if (!ITEMS.length) {
    container.innerHTML =
      '<div class="empty">Belum ada jadwal ujian atau paket soal. Buat dulu di <a href="jadwal.html">Jadwal Ujian</a>.</div>';
    return;
  }

  const adaTanpaJadwal = ITEMS.some(x => !x.jadwal);
  let html = '';
  let penandaTerpasang = false;

  ITEMS.forEach((item, i) => {
    if (!item.jadwal && !penandaTerpasang && adaTanpaJadwal) {
      penandaTerpasang = true;
      html += '<small style="display:block;margin:16px 0 6px;color:var(--soft)">Paket tanpa jadwal</small>';
    }
    html += kartu(item, i);
  });

  container.innerHTML = html;

  container.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => preview(Number(b.dataset.v)); });
  container.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => openModal(Number(b.dataset.t)); });

  // Pulihkan pratinjau yang tadi terbuka (dokumen diambil dari cache perangkat)
  ITEMS.forEach((item, i) => {
    if (BUKA.has(item.key)) {
      BUKA.delete(item.key);
      preview(i);
    }
  });
}

/* ---------- Pembuat kode token ---------- */

const PANJANG_TOKEN = 4;

// 1 digit tingkat + 3 digit acak
const gen = digit => {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  return digit + String(n).padStart(PANJANG_TOKEN - 1, '0');
};

const genUnik = digit => {
  const dipakai = new Set((S.TOK || []).map(x => x.id));
  for (let i = 0; i < 80; i++) {
    const t = gen(digit);
    if (!dipakai.has(t)) return t;
  }
  return gen(digit);
};

let sel = null;   // { jadwal, paket, tingkat }
let cekId = 0;

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
  if (!paket) {
    setInfo('Paket soal untuk jadwal ini tidak ditemukan di bank soal.', 'warn');
    return;
  }

  const id = ++cekId;
  setInfo('Memeriksa kunci jawaban di dokumen…');

  try {
    if (typeof mammoth === 'undefined') throw new Error('Library Mammoth belum dimuat.');

    // Utamakan salinan di perangkat agar tidak mengunduh ulang
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
      setInfo('Kunci jawaban lengkap di dokumen (' + total + ' soal). Nilai dihitung otomatis.', 'ok');
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
    setInfo('Dokumen tidak dapat diperiksa (' + (e.message || 'kesalahan') + ').', 'warn');
  }
}

/* =========================================================
   MODAL PEMBUAT TOKEN
========================================================= */

export function openModal(i) {
  const item = ITEMS[i];

  if (!item) { toast('Jadwal atau paket tidak ditemukan.'); return; }

  const { jadwal, paket } = item;

  if (!paket) {
    toast('Paket soal untuk jadwal ini tidak ditemukan di bank soal.');
    return;
  }

  const tingkat = tingkatItem(item);
  const digit = digitTingkat(tingkat);

  if (!digit) {
    toast('Belum ada kelas (VII/VIII/IX) pada jadwal/paket ini, token tidak bisa dibuat.');
    return;
  }

  sel = { jadwal, paket, tingkat };

  const nama = formatNama(jadwal?.mapel || paket.nama || jadwal?.paketNama);
  const waktu = jadwal
    ? ' · ' + [jadwal.tgl, (jadwal.mulai || '') + '–' + (jadwal.selesai || '')].filter(Boolean).join(' ')
    : '';

  $('mnm').textContent = nama + ' · Kelas ' + labelKelas(paket.kelas || tingkat) + waktu;
  $('mw').value = Math.min(jadwal ? menitJadwal(jadwal, paket) : (paket.menit || 90), 600);

  const inputToken = $('mt');
  inputToken.maxLength = PANJANG_TOKEN;
  inputToken.inputMode = 'numeric';
  inputToken.value = genUnik(digit);

  $('merr').textContent = '';
  $('merr').classList.add('hidden');

  $('mo').classList.remove('hidden');
  $('mw').focus();

  periksaKunci(paket);
}

/* =========================================================
   SIMPAN TOKEN -> Firebase tingkat
========================================================= */

async function simpan() {
  const m = Math.round(+$('mw').value);
  const t = $('mt').value.trim().replace(/\D/g, '');
  const er = $('merr');

  const fail = message => {
    er.textContent = message;
    er.classList.remove('hidden');
  };

  if (!sel) return fail('Jadwal atau paket belum dipilih.');
  if (!(m >= 1 && m <= 600)) return fail('Waktu harus 1–600 menit.');
  if (t.length !== PANJANG_TOKEN) return fail('Token harus tepat 4 angka.');
  if (!sel.paket?.file) return fail('Lokasi file paket soal tidak tersedia.');

  // Tingkat ditentukan dari digit pertama token (aturan pusat)
  const tingkat = tingkatDariToken(t);
  if (!tingkat) return fail('Token harus diawali 1 (VII), 2 (VIII), atau 3 (IX).');

  // Tingkat token harus sama dengan tingkat jadwal/paket
  const digitSel = digitTingkat(sel.tingkat);
  if (digitSel !== t[0]) {
    return fail('Kelas ' + sel.tingkat + ' harus memakai token berawalan ' + digitSel + '.');
  }

  const db = dbTingkat(tingkat);
  const tombol = $('ms');
  tombol.disabled = true;

  try {
    const ref = F.doc(db, KOLEKSI.token, t);

    // Cek daftar lokal dulu (tanpa biaya read)
    if ((S.TOK || []).some(x => x.id === t && x.tingkat === tingkat)) {
      throw new Error('Token ' + t + ' sudah ada. Gunakan kode lain.');
    }

    // Daftar lokal bisa terpotong: pastikan di server juga belum ada
    if ((await F.getDoc(ref)).exists()) {
      throw new Error('Token ' + t + ' sudah dipakai. Gunakan kode lain.');
    }

    const { jadwal, paket } = sel;
    const namaPaket = formatNama(paket.nama) || 'Paket Soal';

    const data = {
      token: t,
      tingkat,

      // Penghubung ke jadwal & paket (dibaca halaman siswa)
      jadwalId: jadwal?.id || '',
      paketId: paket.id || '',

      // Ringkasan untuk daftar token admin
      paketNama: namaPaket,
      mapel: formatNama(jadwal?.mapel) || namaPaket,
      kelas: labelKelas(paket.kelas || jadwal?.kelas || tingkat),
      tgl: jadwal?.tgl || '',

      // Cadangan lokasi dokumen soal
      sumber: paket.sumber || 'lokal',
      file: paket.file,

      menit: m,
      aktif: true
    };

    // Tunggu sampai benar-benar tersimpan, baru tutup modal
    await F.setDoc(ref, { ...data, dibuat: F.serverTimestamp() });

    // Perbarui daftar LOKAL + cache (tanpa baca ulang Firestore)
    S.TOK = [{ id: t, ...data, dibuat: Date.now() }, ...(S.TOK || [])];
    sinkron();

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
  const TOK = S.TOK || [];
  const input = $('ftk');
  const q = input ? input.value.trim().toLowerCase() : '';

  const L = TOK.filter(x =>
    !q ||
    ((x.id || '') + ' ' + (x.mapel || '') + ' ' + (x.paketNama || '') + ' ' + labelKelas(x.kelas) + ' ' + (x.tingkat || '') + ' ' + (x.sumber || '') + ' ' + (x.tgl || ''))
      .toLowerCase().includes(q)
  );

  $('tb').innerHTML = L.length
    ? L.map(x => `
      <tr>
        <td class="tk">${esc(x.id)}</td>
        <td>
          ${esc(formatNama(x.mapel || x.paketNama) || '-')}
          <small style="display:block;color:var(--soft)">
            ${x.kelas ? 'Kelas ' + esc(labelKelas(x.kelas)) + ' · ' : ''}${esc(LABEL_SUMBER[x.sumber || 'lokal'] || x.sumber || 'lokal')}${x.tgl ? ' · ' + esc(x.tgl) : ''}
          </small>
        </td>
        <td>${esc(x.menit)} menit</td>
        <td><span class="badge ${x.aktif ? 'on' : 'off'}">${x.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
        <td>${x.dibuat ? fmtT(toDate(x.dibuat)) : '–'}</td>
        <td>
          <div class="acts">
            <button class="btn" data-c="${esc(x.id)}">Salin</button>
            <button class="btn" data-a="${esc(x.id)}" data-g="${esc(x.tingkat)}" data-s="${x.aktif ? 1 : 0}">${x.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
            <button class="btn d" data-x="${esc(x.id)}" data-g="${esc(x.tingkat)}">Hapus</button>
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${TOK.length
        ? 'Tidak ada token yang cocok.'
        : 'Belum ada token. Pilih jadwal di atas lalu klik Buat token.'}</td></tr>`;

  document.querySelectorAll('[data-c]').forEach(button => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.c);
        toast('Token disalin');
      } catch (e) {
        await konfirmasi({ judul: 'Salin token', pesan: 'Token: ' + button.dataset.c, ya: 'Tutup', tanpaBatal: true });
      }
    };
  });

  // Aktifkan / nonaktifkan: update lokal dulu, rollback bila gagal
  document.querySelectorAll('[data-a]').forEach(button => {
    button.onclick = () => {
      const id = button.dataset.a;
      const tk = button.dataset.g;
      const aktifBaru = button.dataset.s !== '1';

      if (!tk) return toast('Token tidak valid.');

      const lama = S.TOK;
      S.TOK = (S.TOK || []).map(x => x.id === id && x.tingkat === tk ? { ...x, aktif: aktifBaru } : x);
      sinkron();
      toast('Status token diperbarui.');

      F.updateDoc(F.doc(dbTingkat(tk), KOLEKSI.token, id), { aktif: aktifBaru }).catch(e => {
        S.TOK = lama;
        sinkron();
        toast('Gagal memperbarui token: ' + (e.message || e));
      });
    };
  });

  // Hapus: update lokal dulu, rollback bila gagal
  document.querySelectorAll('[data-x]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.x;
      const tk = button.dataset.g;

      if (!tk) return toast('Token tidak valid.');

      const yakin = await konfirmasi({
        judul: 'Hapus token?',
        pesan: 'Token ' + id + ' akan dihapus permanen dan tidak bisa dipakai lagi.',
        ya: 'Hapus',
        batal: 'Batal',
        bahaya: true
      });
      if (!yakin) return;

      const lama = S.TOK;
      S.TOK = (S.TOK || []).filter(x => !(x.id === id && x.tingkat === tk));
      sinkron();
      toast('Token berhasil dihapus.');

      F.deleteDoc(F.doc(dbTingkat(tk), KOLEKSI.token, id)).catch(e => {
        S.TOK = lama;
        sinkron();
        toast('Gagal menghapus token: ' + (e.message || e));
      });
    };
  });
}

/* =========================================================
   EVENT
========================================================= */

export function initToken() {
  $('mc').onclick = () => {
    cekId++;
    $('ms').disabled = false;
    $('mo').classList.add('hidden');
  };

  $('mt').oninput = e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, PANJANG_TOKEN);
  };

  $('ms').onclick = simpan;
  $('ftk').oninput = drawTok;

  // Tombol opsional: paksa baca ulang dari server (pakai bila perlu saja)
  const rf = $('rf');
  if (rf) {
    rf.onclick = async () => {
      rf.disabled = true;
      try {
        await Promise.all([muatPaket(true), muatJadwal(true), muatToken(true)]);
        drawDaftar();
        drawTok();
        toast('Data dimuat ulang.');
      } catch (e) {
        toast('Gagal memuat ulang: ' + (e.message || e));
      } finally {
        rf.disabled = false;
      }
    };
  }
}

/* ---------- Mulai ---------- */

S.PAKET = [];
S.JADWAL = [];
S.TOK = [];
S.ok = false;

function isiTabel(id, kolom, pesan) {
  const tbody = $(id);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${kolom}" class="empty">${esc(pesan)}</td></tr>`;
}

// Pasang tombol/form dulu, sebelum ada await apa pun
aman('Pembuat token', initToken);

try {
  try { await muatSidebar(); }
  catch (error) { peringatan('Sidebar gagal dimuat: ' + (error.message || error)); }

  const [pak, jad, tok] = await Promise.allSettled([
    muatPaket(false),
    muatJadwal(false),
    muatToken(false)
  ]);

  if (pak.status === 'fulfilled') {
    S.ok = true;
  } else {
    console.error('Gagal memuat paket:', pak.reason);
    peringatan('Gagal memuat paket: ' + (pak.reason?.message || pak.reason?.code || pak.reason));
  }

  // Jadwal pelengkap: bila gagal, paket tetap tampil dan token tetap bisa dibuat
  if (jad.status === 'rejected') {
    console.error('Gagal memuat jadwal:', jad.reason);
    peringatan('Gagal memuat jadwal: ' + (jad.reason?.message || jad.reason?.code || jad.reason));
  }

  if (tok.status === 'rejected') {
    console.error('Gagal memuat token:', tok.reason);
    isiTabel('tb', 6, 'Gagal memuat token: ' + (tok.reason?.message || tok.reason?.code || tok.reason));
  }

  aman('Daftar jadwal', drawDaftar);
  aman('Daftar token', drawTok);

  // Dari halaman Jadwal: token.html?jadwal=ID langsung membuka pembuat token
  const dariUrl = new URLSearchParams(location.search).get('jadwal');
  const idx = dariUrl ? ITEMS.findIndex(x => x.key === 'j:' + dariUrl) : -1;
  if (idx >= 0) openModal(idx);

} catch (error) {
  console.error('Halaman token gagal dimulai:', error);
  peringatan('Halaman token gagal dimulai: ' + (error.message || error));
}