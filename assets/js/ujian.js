/* =========================================================
   UJIAN ONLINE — KW LEARNING / CBT SMPN 20 KONAWE SELATAN
   Alur siswa:
   1. Masukkan NIS + token 4 angka.
   2. Tingkat dikenali dari digit pertama token (1=VII, 2=VIII, 3=IX).
   3. Token diperiksa di Firebase tingkat terkait.
   4. Jadwal & paket soal diambil dari Firebase Bank Soal.
   5. Identitas siswa diverifikasi di Firebase Data Siswa.
   6. Siswa mengerjakan soal (sesi dipantau langsung oleh pengawas).
   7. Jawaban disimpan sementara (localStorage).
   8. Saat dikirim: hasil & sesi disimpan ke Firebase tingkat terkait.

   Model soal: pilihan ganda (pg), pilihan ganda kompleks (pgk),
               benar/salah (bs), menjodohkan (jd).

   ---------------------------------------------------------
   STRUKTUR KOLEKSI (Firebase tingkat, ID dokumen = token_nis)
   ---------------------------------------------------------
   token/{token}        → dibuat guru (aktif, jadwalId, paketId, kelas ...)
   sesi/{token_nis}     → DIPANTAU MONITOR, diperbarui selama ujian:
        status          : 'mengerjakan' | 'selesai' | 'waktu-habis'
        terjawab/jumlahSoal/ditandai/soalKe : kemajuan siswa
        mulai / batas   : Timestamp mulai & batas waktu
        aktifTerakhir   : detak terakhir (offline bila > ~90 detik)
        pelanggaran     : berapa kali pindah tab/jendela
        ruang/pengawas/kelas/mapel/jadwalId : untuk filter monitor
   hasil/{token_nis}    → dibuat sekali saat dikumpulkan (nilai, jawaban)
========================================================= */

// true  = siswa melihat nilai jika kunci tersedia.
// PERINGATAN: penilaian di browser tidak menjamin kerahasiaan kunci.
const TAMPILKAN_NILAI = true;

const KEY = 'ujian-kw-v7';
const HURUF = 'ABCDE';       // pilihan ganda biasa A–E
const HURUF2 = 'ABCDEF';     // pilihan ganda kompleks & benar/salah
const RING = 339.3;

const DETAK_MS = 30000;      // detak sesi tiap 30 detik
const SINKRON_MS = 5000;     // jeda minimum pembaruan setelah menjawab

/* Naikkan angka ?v= setiap file diganti. */
import { F, dbTingkat, dbSiswaGuru, dbBankSoal, KOLEKSI, tingkatDariToken } from './firebase-pusat.js?v=1';
import { ambilDokumen } from './storage.js?v=5';
import { parseSoalBaru } from './parser.js?v=6';
import { parseKhusus } from './parser-khusus.js?v=1';

/* Penanda bahwa modul berhasil dimuat (dibaca oleh ujian.html). */
window.__ujianJalan = true;

const $ = id => document.getElementById(id);
const panel = $('panel');
const ng = $('ng');

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');

const CEK = `<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/* Jawaban awal tiap model soal. */
const kosongJawab = q =>
  q.t === 'pgk' ? [] :
  q.t === 'jd'  ? q.l.map(() => '') :
  null;

/* Apakah soal sudah dijawab (jodoh: semua pasangan terisi). */
const terjawab = (q, a) =>
  q.t === 'pgk' ? a.length > 0 :
  q.t === 'jd'  ? a.every(v => v !== '') :
  a !== null;

const baru = list => ({
  cur: 0,
  ans: list.map(kosongJawab),
  flag: list.map(() => false),
  done: false,
  saved: false
});

let db = null;       // Firestore tingkat siswa (token, hasil, sesi)
let S = null;
let Q = [];
let state = baru([]);
let endAt = 0;
let tick = null;
let running = false;

let pelanggaran = 0; // jumlah pindah tab/jendela selama ujian
let detak = null;    // interval detak sesi
let tunda = null;    // timeout pembaruan sesi (throttle)

/* ---------- Referensi dokumen (satu tempat, ID seragam) ---------- */

const idDok = () => S.tok + '_' + S.nis;
const refHasil = () => F.doc(db, KOLEKSI.hasil, idDok());
const refSesi = () => F.doc(db, KOLEKSI.sesi, idDok());

/* ---------- Sesi untuk monitor pengawas ---------- */

const hitungKemajuan = () => ({
  terjawab: Q.filter((q, i) => terjawab(q, state.ans[i])).length,
  ditandai: state.flag.filter(Boolean).length,
  soalKe: state.cur + 1,
  pelanggaran
});

/* Tulis/gabung dokumen sesi. Kegagalan tidak boleh mengganggu siswa. */
async function tulisSesi(extra = {}) {
  if (!db || !S || !Q.length) return;
  try {
    await F.setDoc(refSesi(), {
      ...hitungKemajuan(),
      aktifTerakhir: F.serverTimestamp(),
      ...extra
    }, { merge: true });
  } catch (e) {
    console.warn('Sesi tidak tersimpan:', e);
  }
}

/* Identitas lengkap sesi — ditulis saat mulai. */
function identitasSesi() {
  return {
    token: S.tok,
    nis: S.nis,
    nama: S.nama,
    kelas: S.kelas,
    tingkat: S.tingkat,
    mapel: S.mapel || '',
    paketId: S.paketId || '',
    paketNama: S.paketNama || '',
    jadwalId: S.jadwalId || '',
    ruang: S.ruang || '',
    pengawas: S.pengawas || '',
    jumlahSoal: Q.length,
    menit: S.menit,
    mulai: F.Timestamp.fromDate(new Date(endAt - S.menit * 60000)),
    batas: F.Timestamp.fromDate(new Date(endAt)),
    perangkat: String(navigator.userAgent || '').slice(0, 120)
  };
}

/* Pembaruan tertunda setelah siswa menjawab (maks. 1x per SINKRON_MS). */
function sinkron() {
  if (!running || tunda) return;
  tunda = setTimeout(() => { tunda = null; if (running) tulisSesi(); }, SINKRON_MS);
}

function mulaiDetak() {
  clearInterval(detak);
  detak = setInterval(() => { if (running) tulisSesi(); }, DETAK_MS);
}

function hentikanDetak() {
  clearInterval(detak);
  clearTimeout(tunda);
  detak = null;
  tunda = null;
}

/* ---------- Timer & penyimpanan sesi lokal ---------- */

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      S, endAt,
      ans: state.ans, flag: state.flag,
      cur: state.cur, done: state.done, saved: state.saved,
      pelanggaran
    }));
  } catch (e) { console.warn('Sesi tidak dapat disimpan:', e); }
  sinkron();
}

function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

function fmtT(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const c = seconds % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(c).padStart(2, '0');
}

function tickFn() {
  const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  $('tv').textContent = fmtT(remaining);
  $('tmr').className = 'timer' + (remaining <= 300 ? ' crit' : remaining <= 600 ? ' warn' : '');
  if (remaining <= 0) {
    hide('mo');
    state.otomatis = true;      // dikumpulkan otomatis karena waktu habis
    selesai();
  }
}

function startTimer(resume) {
  if (!resume) endAt = Date.now() + S.menit * 60 * 1000;
  running = true;
  save();
  clearInterval(tick);
  tick = setInterval(tickFn, 250);
  tickFn();

  /* Monitor: sesi dibuat saat mulai, atau dipulihkan setelah refresh. */
  if (!resume) tulisSesi({ ...identitasSesi(), status: 'mengerjakan' });
  else tulisSesi({ status: 'mengerjakan', batas: F.Timestamp.fromDate(new Date(endAt)) });
  mulaiDetak();
}

/* ---------- Event halaman ---------- */

$('qs').onclick = () => sheet(!$('side').classList.contains('open'));
$('scrim').onclick = () => sheet(false);
$('okb').onclick = () => { hide('intro'); startTimer(); };
$('fin').onclick = () => keluar();

$('i6').textContent = TAMPILKAN_NILAI
  ? 'Setelah dikumpulkan, hasilmu langsung ditampilkan.'
  : 'Setelah dikumpulkan, nilai akan diumumkan oleh guru.';

addEventListener('beforeunload', event => {
  if (running) {
    event.preventDefault();
    event.returnValue = '';
  }
});

/* Pindah tab / minimize dihitung sebagai pelanggaran untuk monitor. */
document.addEventListener('visibilitychange', () => {
  if (!running || !document.hidden) return;
  pelanggaran++;
  save();
  tulisSesi({ pelanggaranTerakhir: F.serverTimestamp() });
});

addEventListener('keydown', event => {
  if (!running) return;

  if (event.key === 'F5' ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')) {
    event.preventDefault();
    return;
  }

  if (document.querySelector('.mo:not(.hidden)') || !Q.length) return;

  const key = 'abcdef'.indexOf(event.key.toLowerCase());

  if (event.key.length === 1 && key >= 0 &&
      !event.ctrlKey && !event.metaKey && !event.altKey) {
    const o = Q[state.cur].opts;
    if (o && key < o.length) pilih(key);
    return;
  }

  if (['radio', 'checkbox', 'select-one'].includes(document.activeElement?.type)) return;

  if (event.key === 'ArrowRight' && state.cur < Q.length - 1) { state.cur++; render(); }
  if (event.key === 'ArrowLeft' && state.cur > 0) { state.cur--; render(); }
});

function sheet(open) {
  $('side').classList.toggle('open', open);
  $('scrim').classList.toggle('on', open);
}

/* =========================================================
   MODAL 1 — VERIFIKASI (NIS + token 4 angka)
========================================================= */

const kotakToken = [...document.querySelectorAll('#tkrow input')];
const nilaiToken = () => kotakToken.map(b => b.value).join('');

function setGateError(message) {
  const e = $('ge');
  e.textContent = message || '';
  e.classList.toggle('hidden', !message);
}

function pasangKotakToken() {
  kotakToken.forEach((b, i) => {
    b.oninput = () => {
      b.value = b.value.replace(/[^0-9]/g, '').slice(-1);
      if (b.value && kotakToken[i + 1]) kotakToken[i + 1].focus();
    };
    b.onkeydown = e => {
      if (e.key === 'Backspace' && !b.value && kotakToken[i - 1]) kotakToken[i - 1].focus();
      else if (e.key === 'ArrowLeft' && kotakToken[i - 1]) kotakToken[i - 1].focus();
      else if (e.key === 'ArrowRight' && kotakToken[i + 1]) kotakToken[i + 1].focus();
    };
    b.onpaste = e => {
      e.preventDefault();
      const s = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 4);
      for (let k = 0; k < s.length; k++) kotakToken[k].value = s[k];
      kotakToken[Math.min(s.length, 3)].focus();
    };
  });

  $('gf').onsubmit = event => {
    event.preventDefault();
    masuk();
  };
}

function showGate(message) {
  running = false;
  clearInterval(tick);
  hentikanDetak();

  S = null;
  Q = [];
  db = null;
  pelanggaran = 0;

  sheet(false);
  ['side', 'tmr', 'fin', 'qs', 'intro', 'mo', 'hasil', 'gw'].forEach(hide);

  $('ttl').textContent = 'Ujian Online';
  $('sub').textContent = 'Masukkan NIS dan token dari guru untuk memulai ujian.';
  panel.innerHTML = '';

  setGateError(message);

  $('gn').setAttribute('inputmode', 'numeric');
  $('gn').setAttribute('placeholder', 'NIS');

  $('gb').disabled = false;
  $('gb').textContent = 'Masuk Ujian';

  if (!message) {
    $('gn').value = '';
    kotakToken.forEach(b => { b.value = ''; });
  }

  show('gm');
  setTimeout(() => $('gn').focus(), 60);
}

/* ---------- Pembantu verifikasi ---------- */

const normKelas = s => String(s ?? '').toUpperCase().replace(/[\s\-_.]/g, '');

/* Timestamp Firestore / Date / angka / teks tanggal → milidetik (atau null). */
function keMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/* Daftar kelas yang diizinkan token/jadwal (string, "A, B", atau array). */
function daftarKelas(v) {
  if (Array.isArray(v)) return v.map(normKelas).filter(Boolean);
  return String(v ?? '').split(/[,;]/).map(normKelas).filter(Boolean);
}

/* Cari siswa di Firebase Data Siswa: dokumen ber-ID NIS, cadangan field nis. */
async function cariSiswa(nis) {
  const langsung = await F.getDoc(F.doc(dbSiswaGuru, KOLEKSI.siswa, nis));
  if (langsung.exists()) return langsung.data();

  const q = await F.getDocs(F.query(
    F.collection(dbSiswaGuru, KOLEKSI.siswa),
    F.where('nis', 'in', [nis, Number(nis)]),
    F.limit(1)
  ));
  return q.empty ? null : q.docs[0].data();
}

/* Jendela waktu jadwal. Utamakan Timestamp (mulaiAt/selesaiAt);
   jadwal lama: gabungkan tgl + jam. */
function jendelaJadwal(j) {
  const gabung = jam => (j.tgl && jam) ? keMs(j.tgl + 'T' + jam) : keMs(jam);
  return {
    mulai: keMs(j.mulaiAt) ?? gabung(j.mulai),
    akhir: keMs(j.selesaiAt) ?? gabung(j.selesai)
  };
}

/* Pesan galat bila jadwal belum dibuka / sudah ditutup, atau '' bila boleh masuk. */
function cekWaktu(j) {
  const { mulai, akhir } = jendelaJadwal(j);
  const sekarang = Date.now();
  if (mulai !== null && sekarang < mulai) return 'Ujian belum dimulai.';
  if (akhir !== null && sekarang > akhir) return 'Waktu ujian sudah berakhir.';
  return '';
}

/* Cari jadwal di Bank Soal untuk token tanpa jadwalId.
   Prioritas: sedang berlangsung > hari ini > terdekat. */
async function cariJadwal({ tingkat, kelasSiswa, paketId, mapel }) {
  const snap = await F.getDocs(F.query(
    F.collection(dbBankSoal, KOLEKSI.jadwal),
    F.where('tingkat', '==', tingkat)
  ));

  const sekarang = Date.now();
  const mapelN = String(mapel).trim().toLowerCase();

  const calon = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(j => {
    if (paketId && j.paketId && j.paketId !== paketId) return false;
    if (!paketId && mapelN && j.mapel && String(j.mapel).trim().toLowerCase() !== mapelN) return false;
    if (kelasSiswa && j.kelas && normKelas(j.kelas) !== kelasSiswa) return false;
    return true;
  });

  const skorJ = j => {
    const { mulai, akhir } = jendelaJadwal(j);
    if (mulai === null || akhir === null) return 1e15;
    if (sekarang >= mulai && sekarang <= akhir) return 0;
    return Math.min(Math.abs(sekarang - mulai), Math.abs(sekarang - akhir));
  };

  calon.sort((a, b) => skorJ(a) - skorJ(b));
  return calon[0] || null;
}

async function masuk() {
  const nis = $('gn').value.trim().replace(/\D/g, '');
  const token = nilaiToken();
  const button = $('gb');

  const fail = message => {
    setGateError(message);
    button.disabled = false;
    button.textContent = 'Masuk Ujian';
  };

  setGateError('');

  if (nis.length < 4) return fail('Isi NIS dengan benar.');
  if (token.length < 4) return fail('Token terdiri dari 4 angka.');

  /* Langkah 2: tingkat dari digit pertama token. */
  const tingkat = tingkatDariToken(token);
  if (!tingkat) return fail('Token tidak valid.');

  button.disabled = true;
  button.textContent = 'Memeriksa token...';

  try {
    /* Langkah 3: periksa token di Firebase tingkat terkait. */
    const dbT = dbTingkat(tingkat);
    const tk = await F.getDoc(F.doc(dbT, KOLEKSI.token, token));

    if (!tk.exists()) return fail('Token tidak ditemukan. Periksa kembali kodenya.');

    const data = tk.data();
    if (!data.aktif) return fail('Token ini sedang tidak aktif. Hubungi guru.');

    /* Langkah 4: jadwal dan paket soal (Firebase Bank Soal). */
    button.textContent = 'Mengambil jadwal...';

    let jadwal = {};
    if (data.jadwalId) {
      const js = await F.getDoc(F.doc(dbBankSoal, KOLEKSI.jadwal, data.jadwalId));
      if (!js.exists()) return fail('Jadwal ujian tidak ditemukan. Hubungi guru.');
      jadwal = js.data();

      const w = cekWaktu(jadwal);
      if (w) return fail(w);
    }

    let paketId = jadwal.paketId || data.paketId || '';
    let paket = {};
    const muatPaket = async id => {
      if (!id) return {};
      const ps = await F.getDoc(F.doc(dbBankSoal, KOLEKSI.paket, id));
      return ps.exists() ? ps.data() : {};
    };
    paket = await muatPaket(paketId);

    /* Langkah 5: verifikasi identitas siswa (Firebase Data Siswa). */
    button.textContent = 'Memverifikasi siswa...';

    const siswa = await cariSiswa(nis);
    if (!siswa) return fail('NIS tidak terdaftar. Hubungi guru.');

    if (siswa.tingkat && normKelas(siswa.tingkat) !== normKelas(tingkat)) {
      return fail('NIS ini bukan untuk ujian tingkat ' + tingkat + '.');
    }

    const kelasSiswa = normKelas(siswa.kelas);

    /* Token belum membawa jadwalId: cari jadwal yang cocok agar
       ruang, pengawas, dan jam ujian tetap terbaca (dipakai monitor). */
    let jadwalId = data.jadwalId || '';
    if (!jadwalId) {
      try {
        const j = await cariJadwal({
          tingkat, kelasSiswa, paketId,
          mapel: data.mapel || data.namaMapel || paket.mapel || ''
        });
        if (j) {
          jadwal = j;
          jadwalId = j.id || '';
          const w = cekWaktu(jadwal);
          if (w) return fail(w);
          if (!paketId && jadwal.paketId) {
            paketId = jadwal.paketId;
            paket = await muatPaket(paketId);
          }
        } else {
          console.warn('Jadwal untuk token ini tidak ditemukan; ruang & pengawas kosong.');
        }
      } catch (e) {
        console.warn('Pencarian jadwal dilewati:', e);
      }
    }

    const kelasToken = daftarKelas(data.kelas ?? data.namaKelas ?? jadwal.kelas ?? paket.kelas);

    if (kelasToken.length && kelasSiswa &&
        !kelasToken.some(k => k === kelasSiswa || k === normKelas(tingkat))) {
      return fail('Token ini bukan untuk kelasmu.');
    }

    /* Cegah mengerjakan dua kali: ID hasil = token_nis, cukup satu getDoc. */
    try {
      const sudah = await F.getDoc(F.doc(dbT, KOLEKSI.hasil, token + '_' + nis));
      if (sudah.exists()) return fail('Kamu sudah mengerjakan ujian ini.');
    } catch (e) {
      console.warn('Pemeriksaan hasil sebelumnya dilewati:', e);
    }

    db = dbT;

    S = {
      tok: token,
      tingkat,
      nis,
      nama: String(siswa.nama || siswa.namaLengkap || nis).trim(),
      kelas: String(siswa.kelas || data.kelas || jadwal.kelas || paket.kelas || '-').toUpperCase(),
      mapel: paket.mapel || data.mapel || data.namaMapel || paket.nama || data.paketNama || 'Ujian Online',

      paketId,
      paketNama: paket.nama || paket.paketNama || data.paketNama || data.mapel || 'Ujian Online',
      sumber: paket.sumber || data.sumber || 'lokal',
      file: paket.file || data.file,
      menit: Number(jadwal.menit ?? jadwal.durasi ?? data.menit ?? paket.menit) || 90,

      jadwalId,
      ruang: String(jadwal.ruang || '').trim(),
      pengawas: String(jadwal.pengawas || '').trim(),
      /* Kunci dibaca dari dokumen Word (parser). Field kunci hanya cadangan. */
      kunci: TAMPILKAN_NILAI ? (paket.kunci || data.kunci || '') : ''
    };

  } catch (error) {
    console.error(error);
    return fail('Tidak dapat terhubung ke server. Periksa koneksi internet.');
  }

  button.textContent = 'Memuat soal...';

  const error = await loadSoal();
  if (error) return fail(error);

  hide('gm');
  show('intro');
}

/* ---------- Mengubah hasil parser.js ke model ujian ----------
   parser.js (jenis: pg / kompleks / bs / jodoh)  →
   model halaman ini (t: pg / pgk / bs / jd). */

function keModelUjian(s) {
  const dasar = { q: s.q, no: s.no };

  if (s.jenis === 'kompleks') {
    return {
      ...dasar,
      t: 'pgk',
      opts: s.opts,
      correct: Array.isArray(s.correctSet) && s.correctSet.length
        ? s.correctSet
        : null
    };
  }

  if (s.jenis === 'bs') {
    return {
      ...dasar,
      t: 'bs',
      opts: ['Benar', 'Salah'],
      correct: s.correct         // 0 = Benar, 1 = Salah
    };
  }

  if (s.jenis === 'jodoh') {
    const r = s.kanan.map(k => k.l + '. ' + k.h);

    const correct = s.kiri.map(k =>
      s.kanan.findIndex(x => x.l === (s.pasangan || {})[k.no])
    );

    return {
      ...dasar,
      t: 'jd',
      q: s.q || 'Jodohkan pasangan berikut.',
      l: s.kiri.map(k => k.h),
      r,
      correct: correct.every(i => i >= 0) ? correct : null
    };
  }

  return { ...s, t: 'pg' };
}

/* ---------- Memuat soal sesuai sumber paket ---------- */

async function loadSoal(saved) {
  try {
    if (!S || !S.file) {
      throw new Error('Informasi file soal tidak ditemukan. Hubungi guru.');
    }

    if ((S.sumber || 'lokal') === 'lokal' && location.protocol === 'file:') {
      throw new Error('Halaman harus dibuka melalui Live Server atau GitHub Pages.');
    }

    /* Saat memulihkan sesi, utamakan salinan di perangkat (IndexedDB). */
    const buffer = await ambilDokumen(
      { sumber: S.sumber || 'lokal', file: S.file },
      { utamakanCache: !!saved }
    );

    if (typeof mammoth === 'undefined') throw new Error('Library Mammoth belum dimuat.');

    const hasil = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const html = hasil.value;

    /* Format penanda (lama): soal model baru dimulai dari penanda
       #PGK / #BS / #JODOH pertama. */
    const idx = html.search(/<p[^>]*>(?:\s*<[^>]+>)*\s*#\s*(?:PGK|BS|JODOH)\b/i);

    if (idx >= 0) {
      let pg = [];

      try {
        pg = parseSoalBaru(html.slice(0, idx), S.kunci);
      } catch (e) {
        /* bagian pilihan ganda kosong: lanjut ke soal berpenanda */
      }

      Q = pg.map(q => ({ ...q, t: 'pg' }));
      Q = Q.concat(parseKhusus(html.slice(idx), Q.length));

    } else {
      /* Format bertabel (templat baru) atau pilihan ganda saja. */
      Q = parseSoalBaru(html, S.kunci).map(keModelUjian);
    }

    if (!Q.length) throw new Error('Tidak ada soal yang terbaca.');

    /* Pilihan ganda biasa dibatasi A–E. */
    Q.forEach(q => {
      if (q.t === 'pg' && q.opts.length > HURUF.length) {
        q.opts = q.opts.slice(0, HURUF.length);
        if (q.correct !== null && q.correct >= HURUF.length) q.correct = null;
      }
    });

    if (!TAMPILKAN_NILAI) Q.forEach(q => { q.correct = null; });

    const tanpaKunci = Q.filter(q => q.correct === null).length;
    if (TAMPILKAN_NILAI && tanpaKunci) console.warn(tanpaKunci + ' dari ' + Q.length + ' soal belum punya kunci jawaban.');

  } catch (error) {
    console.error('Gagal memuat soal:', error);
    return error.message || 'Gagal memuat dokumen soal.';
  }

  state = baru(Q);

  ng.innerHTML = '';

  Q.forEach((q, index) => {
    const button = document.createElement('button');
    button.className = 'nc';
    button.textContent = index + 1;
    button.setAttribute('aria-label', 'Soal ' + (index + 1));
    button.onclick = () => { state.cur = index; render(); sheet(false); };
    ng.appendChild(button);
  });

  $('ttl').textContent = S.paketNama;
  $('sub').textContent = Q.length + ' soal · waktu ' + S.menit +
    ' menit. Jawaban bisa diubah sebelum dikumpulkan.';

  $('wn').textContent = S.nama;
  $('wk').textContent = 'Kelas ' + S.kelas + ' · NIS ' + S.nis;

  /* Isi modal informasi. */
  $('im').textContent = S.mapel || '-';
  $('ik').textContent = S.kelas || '-';
  if ($('ir')) $('ir').textContent = S.ruang || '-';
  if ($('ip')) $('ip').textContent = S.pengawas || '-';
  $('jq').textContent = Q.length;
  $('dm').textContent = S.menit;

  $('tv').textContent = fmtT(S.menit * 60);
  $('tmr').className = 'timer';

  show('side');
  show('tmr');
  show('qs');
  hide('fin');

  if (saved && Array.isArray(saved.ans) && saved.ans.length === Q.length) {
    state.ans = saved.ans;
    state.cur = Math.min(Math.max(0, saved.cur || 0), Q.length - 1);
    state.saved = !!saved.saved;
    pelanggaran = Number(saved.pelanggaran) || 0;
    endAt = saved.endAt;

    if (Array.isArray(saved.flag) && saved.flag.length === Q.length) state.flag = saved.flag;

    if (saved.done || Date.now() >= endAt) {
      selesai();
      return null;
    }

    startTimer(true);

  } else if (saved) {
    return 'Sesi sebelumnya tidak cocok dengan soal saat ini. Silakan masuk kembali.';
  }

  render();
  return null;
}

/* ---------- Status navigasi ---------- */

function upd() {
  const answered = Q.filter((q, i) => terjawab(q, state.ans[i])).length;
  const flagged = state.flag.filter(Boolean).length;

  $('pf').style.width = Math.round(answered / Q.length * 100) + '%';
  $('pl').textContent = answered + ' dari ' + Q.length + ' soal terjawab' +
    (flagged ? ' · ' + flagged + ' ditandai' : '');

  ng.querySelectorAll('.nc').forEach((button, index) => {
    button.classList.toggle('a', terjawab(Q[index], state.ans[index]));
    button.classList.toggle('f', state.flag[index]);
    button.classList.toggle('cur', index === state.cur && !state.done);
  });
}

/* Pilih lewat keyboard (huruf). Hanya untuk pg, pgk, bs. */
function pilih(index) {
  const q = Q[state.cur];
  if (q.t === 'jd') return;

  const el = panel.querySelectorAll('input[name=o]')[index];
  if (!el) return;

  el.checked = q.t === 'pgk' ? !el.checked : true;
  el.dispatchEvent(new Event('change'));
}

/* ---------- Tampilan soal ---------- */

function opsiHTML(q, a) {
  if (q.t === 'jd') {
    return q.l.map((l, j) => `
      <div class="jrow">
        <div class="jl">${l}</div>
        <select class="pj" data-j="${j}" aria-label="Pasangan untuk ${esc(l.replace(/<[^>]+>/g, ''))}">
          <option value="">Pilih pasangan…</option>
          ${q.r.map((r, k) =>
            `<option value="${k}" ${String(a[j]) === String(k) ? 'selected' : ''}>${r.replace(/<[^>]+>/g, '')}</option>`
          ).join('')}
        </select>
      </div>`).join('');
  }

  const tipe = q.t === 'pgk' ? 'checkbox' : 'radio';
  const huruf = q.t === 'pg' ? HURUF : HURUF2;

  return q.opts.map((option, k) => {
    const on = q.t === 'pgk' ? a.includes(k) : a === k;
    return `
      <label class="opt ${on ? 'sel' : ''}">
        <input type="${tipe}" name="o" value="${k}" ${on ? 'checked' : ''}>
        <span class="ol">${q.t === 'pgk' ? (on ? '✓' : '') : huruf[k]}</span>
        <span>${option}</span>
      </label>`;
  }).join('');
}

function question() {
  const index = state.cur;
  const q = Q[index];
  const answer = state.ans[index];
  const flagged = state.flag[index];

  panel.innerHTML = `
    <div class="card">
      <div class="qh">
        <span class="qn">Soal ${index + 1} <small>dari ${Q.length}</small></span>

        <button type="button" class="flag ${flagged ? 'on' : ''}" id="fl"
          role="switch" aria-checked="${flagged}">
          <span class="sw"><i></i></span>
          <span id="flt">${flagged ? 'Ditandai ragu-ragu' : 'Tandai ragu-ragu'}</span>
        </button>
      </div>

      <p class="qt">${q.q}</p>

      ${q.t === 'pgk' ? '<p class="petunjuk">Pilih semua jawaban yang benar.</p>' : ''}
      ${q.t === 'jd' ? '<p class="petunjuk">Pilih pasangan yang tepat untuk setiap pernyataan.</p>' : ''}

      <fieldset>
        <legend class="sr">Pilihan jawaban</legend>
        ${opsiHTML(q, answer)}
      </fieldset>

      <div class="nb">
        <button class="bg" id="pv" ${index ? '' : 'disabled'}>Sebelumnya</button>
        <button class="bp" id="nx">${index === Q.length - 1 ? 'Ke ringkasan' : 'Berikutnya'}</button>
      </div>
    </div>`;

  /* pg, bs (radio) dan pgk (checkbox) */
  panel.querySelectorAll('input[name=o]').forEach(input => {
    input.onchange = () => {
      if (q.t === 'pgk') {
        state.ans[index] = [...panel.querySelectorAll('input[name=o]:checked')]
          .map(x => Number(x.value))
          .sort((a, b) => a - b);
      } else {
        state.ans[index] = Number(input.value);
      }

      upd();
      save();

      panel.querySelectorAll('.opt').forEach((label, k) => {
        const on = q.t === 'pgk' ? state.ans[index].includes(k) : state.ans[index] === k;
        label.classList.toggle('sel', on);
        if (q.t === 'pgk') label.querySelector('.ol').textContent = on ? '✓' : '';
      });
    };
  });

  /* menjodohkan (select) */
  panel.querySelectorAll('select.pj').forEach(sel => {
    sel.onchange = () => {
      state.ans[index][Number(sel.dataset.j)] = sel.value;
      upd();
      save();
    };
  });

  $('fl').onclick = () => {
    state.flag[index] = !state.flag[index];
    const on = state.flag[index];
    $('fl').classList.toggle('on', on);
    $('fl').setAttribute('aria-checked', on);
    $('flt').textContent = on ? 'Ditandai ragu-ragu' : 'Tandai ragu-ragu';
    upd();
    save();
  };

  $('pv').onclick = () => { state.cur--; render(); };

  $('nx').onclick = () => {
    if (index === Q.length - 1) submit();
    else { state.cur++; render(); }
  };
}

function render() {
  if (state.done) return;
  question();
  upd();
  if (running) save();
  panel.scrollTo({ top: 0 });
}

/* ---------- Kotak konfirmasi (pengganti confirm bawaan) ---------- */

function confirmBox(message, callback, o = {}) {
  $('mjudul').textContent = o.judul || 'Kumpulkan jawaban?';
  $('mm').textContent = message;
  $('yes').textContent = o.ya || 'Ya, kumpulkan';
  $('no').textContent = o.tidak || 'Kembali';

  show('mo');

  const yes = $('yes');
  const no = $('no');

  const off = () => {
    hide('mo');
    yes.onclick = null;
    no.onclick = null;
  };

  yes.onclick = () => { off(); callback(); };
  no.onclick = off;
}

function submit() {
  const unanswered = Q.filter((q, i) => !terjawab(q, state.ans[i])).length;
  const flagged = state.flag.filter(Boolean).length;
  const messages = [];

  if (unanswered) messages.push('masih ada ' + unanswered + ' soal belum dijawab');
  if (flagged) messages.push(flagged + ' soal ditandai ragu-ragu');

  confirmBox(
    messages.length
      ? 'Perhatian: ' + messages.join(' dan ') + '. Tetap kumpulkan jawaban?'
      : 'Semua soal sudah dijawab. Kumpulkan sekarang? Jawaban tidak bisa diubah lagi.',
    selesai
  );
}

$('bs').onclick = submit;

/* ---------- Menghitung nilai ---------- */

/* Skor satu soal: 0–1, atau null bila kunci belum ada.
   pgk & jodoh dinilai sebagian. */
function skor(q, a) {
  if (q.correct === null) return null;

  if (q.t === 'pgk') {
    const benar = a.filter(v => q.correct.includes(v)).length;
    return Math.max(0, benar - (a.length - benar)) / q.correct.length;
  }

  if (q.t === 'jd') {
    return q.l.filter((_, j) => a[j] !== '' && Number(a[j]) === q.correct[j]).length / q.l.length;
  }

  return a === q.correct ? 1 : 0;
}

function hitung() {
  let total = 0, benar = 0, salah = 0, kosong = 0, tersedia = 0;

  Q.forEach((q, index) => {
    const answer = state.ans[index];
    const dijawab = terjawab(q, answer);

    if (!dijawab) kosong++;

    const s = skor(q, answer);
    if (s === null) return;

    tersedia++;
    total += s;

    if (s === 1) benar++;
    else if (dijawab) salah++;
  });

  return {
    ben: benar, sal: salah, kos: kosong, K: tersedia, tot: Q.length,
    sc: tersedia ? Math.round(total / tersedia * 100) : 0
  };
}

/* ---------- Selesai ujian ---------- */

function selesai() {
  if (state.done && !running) return;

  clearInterval(tick);
  hentikanDetak();
  running = false;
  state.done = true;

  sheet(false);
  ['tmr', 'side', 'qs'].forEach(hide);
  show('fin');
  save();

  panel.innerHTML = `
    <div class="gate">
      <div class="logo">${CEK}</div>
      <h2>Ujian selesai</h2>
      <p>Jawabanmu sudah dikumpulkan.</p>
      <div class="sv note"></div>
      <div class="acts2">
        <button class="bg" id="lh">Lihat hasil</button>
        <button class="bp" id="kx">Selesai &amp; keluar</button>
      </div>
    </div>`;

  $('lh').onclick = showHasil;
  $('kx').onclick = keluar;

  showHasil();

  if (state.saved) setSv('ok', 'Hasil tersimpan.');
  else kirim();
}

/* ---------- Keluar (tanpa confirm bawaan browser) ---------- */

function keluar() {
  const out = () => {
    hide('hasil');
    hide('mo');
    clearSave();
    showGate();
  };

  if (!state.saved) {
    confirmBox('Hasil belum tersimpan ke server. Tetap keluar?', out,
      { judul: 'Keluar sekarang?', ya: 'Ya, keluar', tidak: 'Batal' });
    return;
  }

  out();
}

/* ---------- Modal hasil ---------- */

function showHasil() {
  const h = hitung();
  const ada = TAMPILKAN_NILAI;
  let atas;

  if (ada) {
    const color = h.sc >= 75 ? '#16a34a' : h.sc >= 50 ? '#f59e0b' : '#dc2626';
    const message = h.sc >= 80 ? 'Hebat! Hasil yang sangat baik.'
      : h.sc >= 60 ? 'Cukup baik. Terus belajar ya.'
      : 'Jangan menyerah, pelajari lagi materinya.';

    const catatan = h.K === 0
      ? `<p class="catatan">Kunci jawaban belum tersedia, jadi nilai belum bisa dihitung. Hubungi guru.</p>`
      : h.K < h.tot
        ? `<p class="catatan">${h.tot - h.K} soal belum punya kunci, jadi nilai dihitung dari ${h.K} soal.</p>`
        : '';

    atas = `
      <svg class="ring" viewBox="0 0 132 132" role="img" aria-label="Nilai ${h.sc}">
        <circle class="rb" cx="66" cy="66" r="54"/>
        <circle class="rf" id="rg" cx="66" cy="66" r="54"
          style="stroke:${color};stroke-dasharray:${RING};stroke-dashoffset:${RING}"/>
        <text class="rn" x="66" y="74" text-anchor="middle" fill="${color}">${h.sc}</text>
        <text class="rl" x="66" y="94" text-anchor="middle">NILAI</text>
      </svg>
      <p class="pesan">${message}</p>
      <div class="stats3">
        <div><b>${h.ben}</b><span>Benar</span></div>
        <div><b>${h.sal}</b><span>Salah</span></div>
        <div><b>${h.kos}</b><span>Kosong</span></div>
      </div>
      ${catatan}`;
  } else {
    atas = `
      <div class="okc">${CEK}</div>
      <p class="pesan">Jawabanmu sudah dikumpulkan.</p>
      <div class="stats3">
        <div><b>${Q.length - h.kos}</b><span>Dijawab</span></div>
        <div><b>${h.kos}</b><span>Kosong</span></div>
      </div>`;
  }

  $('hs').innerHTML = `
    <h3 id="hh">Hasil ujian</h3>
    <p class="who2">${esc(S.nama)} · Kelas ${esc(S.kelas)}</p>
    ${atas}
    <div class="sv note"></div>
    <div class="ma">
      <button class="bg hidden" id="rt">Kirim ulang</button>
      <button class="bg" id="tp">Tutup</button>
      <button class="bp" id="kl">Selesai</button>
    </div>`;

  $('tp').onclick = () => hide('hasil');
  $('kl').onclick = keluar;
  $('rt').onclick = kirim;

  if (state.saved) setSv('ok', 'Hasil tersimpan.');

  show('hasil');
  $('kl').focus();

  if (ada) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ring = $('rg');
      if (ring) ring.style.strokeDashoffset = RING * (1 - h.sc / 100);
    }));
  }
}

function setSv(kind, message, retry) {
  document.querySelectorAll('.sv').forEach(element => {
    element.className = 'sv note ' + kind;
    element.textContent = message;
  });

  const retryButton = $('rt');
  if (retryButton) retryButton.classList.toggle('hidden', !retry);
}

/* ---------- Simpan hasil & sesi ke Firebase tingkat ---------- */

/* Kode jawaban per soal untuk disimpan:
   pg/bs = huruf (bs: A=Benar, B=Salah), pgk = huruf-huruf (mis. ACE),
   jodoh = nomor pasangan dipisah koma (mis. 3,1,2). "-" = kosong. */
function kodeJawaban(q, a) {
  if (q.t === 'pgk') return a.length ? a.map(k => HURUF2[k]).join('') : '-';
  if (q.t === 'jd') {
    return a.every(v => v === '')
      ? '-'
      : a.map(v => v === '' ? '-' : Number(v) + 1).join(',');
  }
  return a === null ? '-' : HURUF2[a];
}

async function kirim() {
  setSv('', 'Menyimpan hasil...');

  const h = hitung();
  const pakai = h.K > 0;
  const status = state.otomatis ? 'waktu-habis' : 'selesai';

  const lama = Math.max(0, Math.min(S.menit * 60,
    Math.round((Date.now() - (endAt - S.menit * 60000)) / 1000)));

  const pemisah = Q.some(q => q.t === 'pgk' || q.t === 'jd') ? '|' : '';

  try {
    if (!db) db = dbTingkat(S.tingkat);

    /* ID = token_nis: satu siswa satu hasil per token. Kirim ulang
       (tombol "Kirim ulang") menimpa dokumen yang sama, tidak menggandakan. */
    await F.setDoc(refHasil(), {
      token: S.tok,
      nis: S.nis,
      nama: S.nama,
      kelas: S.kelas,
      tingkat: S.tingkat,

      mapel: S.mapel || '',
      paketId: S.paketId || '',
      paketNama: S.paketNama,
      jadwalId: S.jadwalId || '',
      ruang: S.ruang || '',
      pengawas: S.pengawas || '',
      sumber: S.sumber || 'lokal',

      status,
      mulai: F.Timestamp.fromDate(new Date(endAt - S.menit * 60000)),

      benar: pakai ? h.ben : null,
      salah: pakai ? h.sal : null,
      kosong: h.kos,
      nilai: pakai ? h.sc : null,

      jumlahSoal: Q.length,
      durasi: lama,
      pelanggaran,

      jawaban: state.ans.map((a, i) => kodeJawaban(Q[i], a)).join(pemisah),

      waktu: F.serverTimestamp()
    });

    state.saved = true;
    save();
    setSv('ok', 'Hasil tersimpan.');

    /* Sesi ditutup supaya monitor menampilkan siswa sudah selesai.
       Gagal menyimpannya tidak membatalkan hasil. */
    await tulisSesi({
      status,
      durasi: lama,
      nilai: pakai && TAMPILKAN_NILAI ? h.sc : null,
      selesai: F.serverTimestamp()
    });

  } catch (error) {
    console.error('Gagal menyimpan hasil:', error);
    setSv('err', 'Hasil belum terkirim ke server. Periksa internet lalu coba lagi.', true);
  }
}

/* ---------- Memulai aplikasi ---------- */

/* Batas waktu agar tahap awal tidak menggantung selamanya. */
const batas = (janji, ms, pesan) => Promise.race([
  janji,
  new Promise((_, tolak) => setTimeout(() => tolak(new Error(pesan)), ms))
]);

async function mulai() {
  pasangKotakToken();

  let dataSesi = null;

  try {
    dataSesi = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (error) {
    dataSesi = null;
  }

  if (dataSesi && dataSesi.S && dataSesi.S.tingkat) {
    try {
      db = dbTingkat(dataSesi.S.tingkat);
    } catch (e) {
      db = null;
    }
  }

  if (dataSesi && dataSesi.S && db) {
    S = dataSesi.S;

    const error = await batas(loadSoal(dataSesi), 25000, 'Pemulihan sesi terlalu lama.')
      .catch(e => e.message);

    if (error) {
      clearSave();
      showGate(error);
    }

  } else {
    clearSave();
    showGate();
  }
}

mulai().catch(error => {
  console.error('Gagal memulai ujian:', error);
  showGate(error.message || 'Terjadi kesalahan saat memulai.');
});