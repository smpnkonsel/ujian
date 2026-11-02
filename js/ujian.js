/* =========================================================
   UJIAN ONLINE — KW LEARNING
   Paket DOCX dari folder lokal / GitHub / Google Drive.
   Alur: Modal 1 (verifikasi nama + token 4 angka)
       → Modal 2 (info mapel & kelas dari token + petunjuk)
       → ujian → hasil.
   Model soal: pilihan ganda (pg), pilihan ganda kompleks (pgk),
               benar/salah (bs), menjodohkan (jd).

   Dua format dokumen soal didukung:
   1. FORMAT BERTABEL (templat baru): bagian A/B/C/D + tabel
      KUNCI JAWABAN. Dibaca seluruhnya oleh parser.js (dipakai
      bersama admin), lalu diubah ke model ujian oleh keModelUjian().
   2. FORMAT PENANDA (lama): soal model baru ditandai #PGK / #BS /
      #JODOH dan dibaca oleh parser-khusus.js.
========================================================= */

// true  = siswa melihat nilai jika kunci tersedia.
// PERINGATAN: penilaian di browser tidak menjamin kerahasiaan kunci.
const TAMPILKAN_NILAI = true;

const KOLEKSI_HASIL = 'hasil';
const KOLEKSI_TOKEN = 'tokens';

const KEY = 'ujian-kw-v5';
const HURUF = 'ABCDE';       // pilihan ganda biasa A–E (sesuai templat)
const HURUF2 = 'ABCDEF';     // pilihan ganda kompleks & benar/salah
const RING = 339.3;

/* Naikkan angka ?v= setiap file diganti. */
import { FB, bacaConfig, KOLEKSI_PAKET } from './config.js?v=6';
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

/* ---------- Konfigurasi & status ---------- */

let firebaseConfig = {};
let cfgErr = '';
let cfgOk = false;

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

let db = null;
let F = null;
let S = null;
let Q = [];
let state = baru([]);
let endAt = 0;
let tick = null;
let running = false;

/* ---------- Timer & penyimpanan sesi ---------- */

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      S, endAt,
      ans: state.ans, flag: state.flag,
      cur: state.cur, done: state.done, saved: state.saved
    }));
  } catch (e) { console.warn('Sesi tidak dapat disimpan:', e); }
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
   MODAL 1 — VERIFIKASI TOKEN (nama lengkap + 4 angka)
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

  S = null;
  Q = [];

  sheet(false);
  ['side', 'tmr', 'fin', 'qs', 'intro', 'mo', 'hasil'].forEach(hide);

  $('ttl').textContent = 'Ujian Online';
  $('sub').textContent = 'Masukkan token dari guru untuk memulai ujian.';
  panel.innerHTML = '';

  setGateError(message);

  const w = $('gw');
  w.classList.toggle('hidden', cfgOk);
  if (!cfgOk) {
    w.innerHTML = 'Konfigurasi Firebase belum terbaca. Hubungi guru.<br><small>' +
      esc(cfgErr || 'apiKey kosong') + '</small>';
  }

  $('gb').disabled = !cfgOk;
  $('gb').textContent = 'Masuk Ujian';

  if (!message) {
    $('gn').value = '';
    kotakToken.forEach(b => { b.value = ''; });
  }

  show('gm');
  setTimeout(() => $('gn').focus(), 60);
}

async function masuk() {
  const nama = $('gn').value.trim().replace(/\s+/g, ' ');
  const token = nilaiToken();
  const button = $('gb');

  const fail = message => {
    setGateError(message);
    button.disabled = false;
    button.textContent = 'Masuk Ujian';
  };

  setGateError('');

  if (nama.length < 3) return fail('Isi nama lengkapmu terlebih dahulu.');
  if (token.length < 4) return fail('Token terdiri dari 4 angka.');

  button.disabled = true;
  button.textContent = 'Memeriksa token...';

  try {
    const snapshot = await F.getDoc(F.doc(db, KOLEKSI_TOKEN, token));

    if (!snapshot.exists()) {
      return fail('Token tidak ditemukan. Periksa kembali kodenya.');
    }

    const data = snapshot.data();

    if (!data.aktif) {
      return fail('Token ini sedang tidak aktif. Hubungi guru.');
    }

    /* Kunci dibaca dari dokumen Word (parser). Field token.kunci hanya cadangan
       untuk token lama; tidak ada bacaan Firestore tambahan. */
    const kunci = TAMPILKAN_NILAI ? (data.kunci || '') : '';

    let kelas = data.kelas ?? data.namaKelas ?? '';

    /* Token lama belum membawa kelas: ambil dari dokumen paket. */
    if (String(kelas).trim() === '' && data.paketId) {
      try {
        const ps = await F.getDoc(F.doc(db, KOLEKSI_PAKET || 'paket', data.paketId));
        if (ps.exists()) kelas = ps.data().kelas ?? '';
      } catch (error) {
        console.warn('Kelas dari paket tidak dapat dimuat:', error);
      }
    }

    S = {
      tok: token,
      nama,
      /* Kelas & mapel diambil dari data token (cadangan: paket). */
      kelas: String(kelas || '-').toUpperCase(),
      mapel: data.mapel || data.namaMapel || data.paketNama || 'Ujian Online',

      paketId: data.paketId || '',
      paketNama: data.paketNama || data.mapel || 'Ujian Online',
      sumber: data.sumber || 'lokal',
      file: data.file,
      menit: Number(data.menit) || 90,
      kunci
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
    // Pilihan pasangan memakai huruf Kolom B seperti di dokumen.
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

    /* Saat memulihkan sesi, utamakan salinan di perangkat
       (IndexedDB) agar cepat, soalnya sama persis, dan bisa
       dibuka tanpa internet. */
    const buffer = await ambilDokumen(
      { sumber: S.sumber || 'lokal', file: S.file },
      { utamakanCache: !!saved }
    );

    if (typeof mammoth === 'undefined') throw new Error('Library Mammoth belum dimuat.');

    const hasil = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const html = hasil.value;

    /* Format penanda (lama): soal model baru dimulai dari penanda
       #PGK / #BS / #JODOH pertama. Bagian sebelumnya = pilihan
       ganda biasa. */
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
  $('wk').textContent = 'Kelas ' + S.kelas + ' · Token ' + S.tok;

  /* Isi modal informasi. */
  $('im').textContent = S.mapel || '-';
  $('ik').textContent = S.kelas || '-';
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
  const ada = TAMPILKAN_NILAI;   // nilai selalu tampil (0 bila tidak ada yang benar)
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

/* ---------- Simpan hasil ke Firestore ---------- */

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

  const lama = Math.max(0, Math.min(S.menit * 60,
    Math.round((Date.now() - (endAt - S.menit * 60000)) / 1000)));

  const pemisah = Q.some(q => q.t === 'pgk' || q.t === 'jd') ? '|' : '';

  try {
    await F.addDoc(F.collection(db, KOLEKSI_HASIL), {
      token: S.tok,
      nama: S.nama,
      kelas: S.kelas,

      paketId: S.paketId || '',
      paketNama: S.paketNama,
      sumber: S.sumber || 'lokal',

      benar: pakai ? h.ben : null,
      salah: pakai ? h.sal : null,
      kosong: h.kos,
      nilai: pakai ? h.sc : null,

      jumlahSoal: Q.length,
      durasi: lama,

      jawaban: state.ans.map((a, i) => kodeJawaban(Q[i], a)).join(pemisah),

      waktu: F.serverTimestamp()
    });

    state.saved = true;
    save();
    setSv('ok', 'Hasil tersimpan.');

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

  const hasil = await batas(bacaConfig(), 10000, 'Konfigurasi terlalu lama dimuat.')
    .catch(e => ({ cfg: {}, err: e.message }));

  firebaseConfig = hasil.cfg || {};
  cfgErr = hasil.err || '';
  cfgOk = !!firebaseConfig.apiKey && !hasil.err;

  if (cfgOk) {
    try {
      const [appModule, firestoreModule] = await batas(
        Promise.all([
          import(FB + 'firebase-app.js'),
          import(FB + 'firebase-firestore.js')
        ]),
        15000,
        'Firebase terlalu lama dimuat. Periksa koneksi internet.'
      );

      F = firestoreModule;
      const app = appModule.initializeApp(firebaseConfig);
      /* Deteksi otomatis bila koneksi bawaan terhambat (jaringan sekolah/seluler). */
      db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

    } catch (error) {
      console.error('Firebase gagal diinisialisasi:', error);
      cfgOk = false;
      cfgErr = error.message || 'Tidak dapat memuat Firebase. Periksa koneksi internet.';
    }
  }

  let dataSesi = null;

  try {
    dataSesi = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (error) {
    dataSesi = null;
  }

  if (dataSesi && dataSesi.S && cfgOk && db) {
    S = dataSesi.S;

    const error = await batas(loadSoal(dataSesi), 25000, 'Pemulihan sesi terlalu lama.')
      .catch(e => e.message);

    if (error) {
      clearSave();
      showGate(error);
    }

  } else {
    showGate();
  }
}

mulai().catch(error => {
  console.error('Gagal memulai ujian:', error);
  cfgErr = error.message || 'Terjadi kesalahan saat memulai.';
  showGate();
});