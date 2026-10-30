/* =========================================================
   UJIAN ONLINE — KW LEARNING
   Mendukung paket DOCX:
   1. Folder lokal
   2. GitHub
   3. Google Drive

   Fitur:
   - Login menggunakan token
   - Timer ujian
   - Navigasi soal
   - Tandai ragu-ragu
   - Simpan sesi lokal
   - Pulihkan sesi
   - Penilaian pilihan ganda
   - Simpan hasil ke Firestore

   Pembaca soal DOCX ada di parser.js (dipakai bersama admin).
========================================================= */

/* =========================================================
   PENGATURAN
========================================================= */

// true  = siswa melihat nilai jika kunci tersedia.
// false = siswa hanya melihat konfirmasi pengumpulan.
//
// PERINGATAN:
// Penilaian di browser tidak menjamin kerahasiaan kunci.
// Untuk keamanan sebenarnya, penilaian harus dilakukan
// pada server tepercaya.

const TAMPILKAN_NILAI = true;

const KOLEKSI_HASIL = 'hasil';
const KOLEKSI_KUNCI = 'kunci';
const KOLEKSI_TOKEN = 'tokens';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

const KEY = 'ujian-kw-v4';
const HURUF = 'ABCDE';
const RING = 339.3;

/* =========================================================
   IMPORT
   Naikkan angka ?v= setiap file diganti agar browser
   siswa tidak memakai salinan lama.
========================================================= */

import { ambilDokumen } from './storage.js?v=3';
import { parseSoalBaru } from './parser.js?v=4';

/* =========================================================
   ELEMEN DAN UTILITAS
========================================================= */

const $ = id => document.getElementById(id);

const panel = $('panel');
const ng = $('ng');

const esc = s => String(s ?? '').replace(
  /[&<>"]/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c])
);

const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');

const CEK = `
<svg viewBox="0 0 24 24" fill="none"
stroke="#2F9E5B" stroke-width="2.5"
stroke-linecap="round" stroke-linejoin="round">
<path d="M5 12.5l4.5 4.5L19 7.5"/>
</svg>`;

/* =========================================================
   KONFIGURASI FIREBASE
========================================================= */

let firebaseConfig = {};
let cfgErr = '';

try {
  const r = await fetch(
    './js/firebaseConfig.js?v=' + Date.now()
  );

  if (!r.ok) {
    throw new Error(
      'Berkas js/firebaseConfig.js tidak ditemukan (' +
      r.status + ')'
    );
  }

  const t = await r.text();
  const i = t.indexOf('apiKey');

  if (i < 0) {
    throw new Error(
      'Kata apiKey tidak ditemukan dalam firebaseConfig.js'
    );
  }

  const s = t.lastIndexOf('{', i);

  let d = 0;
  let e = -1;

  for (let k = s; k < t.length; k++) {
    if (t[k] === '{') {
      d++;
    } else if (t[k] === '}') {
      d--;

      if (d === 0) {
        e = k;
        break;
      }
    }
  }

  if (e < 0) {
    throw new Error(
      'Tanda kurung konfigurasi Firebase tidak lengkap'
    );
  }

  firebaseConfig = new Function(
    'return (' + t.slice(s, e + 1) + ')'
  )();

} catch (e) {
  cfgErr = e.message;
}

const cfgOk =
  !!firebaseConfig.apiKey &&
  !/^ISI/.test(firebaseConfig.apiKey);

/* =========================================================
   STATUS APLIKASI
========================================================= */

const baru = n => ({
  cur: 0,
  ans: new Array(n).fill(null),
  flag: new Array(n).fill(false),
  done: false,
  saved: false
});

let db = null;
let F = null;
let S = null;

let Q = [];
let state = baru(0);

let endAt = 0;
let tick = null;
let running = false;

/* =========================================================
   TIMER DAN PENYIMPANAN SESI
========================================================= */

function save() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        S,
        endAt,
        ans: state.ans,
        flag: state.flag,
        cur: state.cur,
        done: state.done,
        saved: state.saved
      })
    );
  } catch (e) {
    console.warn('Sesi tidak dapat disimpan:', e);
  }
}

function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}

function fmtT(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const c = seconds % 60;

  return (
    h + ':' +
    String(m).padStart(2, '0') + ':' +
    String(c).padStart(2, '0')
  );
}

function tickFn() {
  const remaining = Math.max(
    0,
    Math.ceil((endAt - Date.now()) / 1000)
  );

  $('tv').textContent = fmtT(remaining);

  $('tmr').className =
    'timer' +
    (
      remaining <= 300
        ? ' crit'
        : remaining <= 600
          ? ' warn'
          : ''
    );

  if (remaining <= 0) {
    hide('mo');
    selesai();
  }
}

function startTimer(resume) {
  if (!resume) {
    endAt = Date.now() + S.menit * 60 * 1000;
  }

  running = true;

  save();

  clearInterval(tick);

  tick = setInterval(tickFn, 250);

  tickFn();
}

/* =========================================================
   EVENT HALAMAN
========================================================= */

$('qs').onclick = () => {
  sheet(!$('side').classList.contains('open'));
};

$('scrim').onclick = () => sheet(false);

$('okb').onclick = () => {
  hide('intro');
  startTimer();
};

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

  if (
    event.key === 'F5' ||
    (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'r'
    )
  ) {
    event.preventDefault();
    return;
  }

  if (
    document.querySelector('.mo:not(.hidden)') ||
    !Q.length
  ) {
    return;
  }

  const key = 'abcde'.indexOf(
    event.key.toLowerCase()
  );

  if (
    event.key.length === 1 &&
    key >= 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    if (key < Q[state.cur].opts.length) {
      pilih(key);
    }

    return;
  }

  if (
    document.activeElement &&
    document.activeElement.type === 'radio'
  ) {
    return;
  }

  if (
    event.key === 'ArrowRight' &&
    state.cur < Q.length - 1
  ) {
    state.cur++;
    render();
  }

  if (
    event.key === 'ArrowLeft' &&
    state.cur > 0
  ) {
    state.cur--;
    render();
  }
});

/* =========================================================
   SIDEBAR
========================================================= */

function sheet(open) {
  $('side').classList.toggle('open', open);
  $('scrim').classList.toggle('on', open);
}

/* =========================================================
   LAYAR MASUK TOKEN
========================================================= */

function showGate(message) {
  running = false;

  clearInterval(tick);

  S = null;
  Q = [];

  sheet(false);

  [
    'side',
    'tmr',
    'fin',
    'qs',
    'intro',
    'mo',
    'hasil'
  ].forEach(hide);

  $('ttl').textContent = 'Ujian Online';

  $('sub').textContent =
    'Masukkan token dari guru untuk memulai ujian.';

  panel.innerHTML = `
    <div class="gate">

      <div class="logo">
        <svg viewBox="0 0 24 24" fill="none"
        stroke="#D79A2C" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="10" width="16" height="11" rx="2"/>
          <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
          <circle cx="12" cy="15.5" r="1.4" fill="#D79A2C"/>
        </svg>
      </div>

      <h2>Masuk Ujian</h2>

      <p>
        Isi data dirimu dan token yang diberikan guru.
      </p>

      <form class="gc" id="gf" autocomplete="off">

        <label for="gn">Nama lengkap</label>
        <input id="gn" maxlength="60" required>

        <label for="gk">Kelas</label>
        <input id="gk" maxlength="12"
        placeholder="mis. 8A" required>

        <label for="gt">Token ujian</label>
        <input id="gt" class="tk" maxlength="12"
        placeholder="••••••" required>

        <div id="ge" class="msg err ${message ? '' : 'hidden'}">
          ${esc(message || '')}
        </div>

        ${
          cfgOk
            ? ''
            : `
              <div class="msg warn">
                Konfigurasi Firebase belum terbaca.
                Hubungi guru.
                <br>
                <small>${esc(cfgErr || 'apiKey kosong')}</small>
              </div>
            `
        }

        <button class="bp" id="gb" type="submit"
        ${cfgOk ? '' : 'disabled'}>
          Masuk Ujian
        </button>

      </form>

      <div class="foot">
        SMP Negeri 20 Konawe Selatan
      </div>

    </div>
  `;

  $('gf').onsubmit = event => {
    event.preventDefault();
    masuk();
  };

  $('gt').focus();
}

/* =========================================================
   LOGIN DAN PEMERIKSAAN TOKEN
========================================================= */

async function masuk() {
  const nama = $('gn').value.trim();

  const kelas = $('gk').value
    .trim()
    .toUpperCase();

  const token = $('gt').value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const errorBox = $('ge');
  const button = $('gb');

  const fail = message => {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');

    button.disabled = false;
    button.textContent = 'Masuk Ujian';
  };

  if (!nama || !kelas || token.length < 4) {
    return fail(
      'Lengkapi nama, kelas, dan token.'
    );
  }

  button.disabled = true;
  button.textContent = 'Memeriksa token...';

  try {
    const snapshot = await F.getDoc(
      F.doc(db, KOLEKSI_TOKEN, token)
    );

    if (!snapshot.exists()) {
      return fail(
        'Token tidak ditemukan. Periksa kembali kodenya.'
      );
    }

    const data = snapshot.data();

    if (!data.aktif) {
      return fail(
        'Token ini sedang tidak aktif. Hubungi guru.'
      );
    }

    let kunci = '';

    if (TAMPILKAN_NILAI) {
      kunci = data.kunci || '';

      try {
        const keySnapshot = await F.getDoc(
          F.doc(db, KOLEKSI_KUNCI, token)
        );

        if (keySnapshot.exists()) {
          kunci = keySnapshot.data().kunci || kunci;
        }
      } catch (error) {
        console.warn('Kunci tidak dapat dimuat:', error);
      }
    }

    S = {
      tok: token,
      nama,
      kelas,

      paketId: data.paketId || '',
      paketNama: data.paketNama || 'Ujian Online',

      sumber: data.sumber || 'lokal',
      file: data.file,

      menit: Number(data.menit) || 90,

      kunci
    };

  } catch (error) {
    console.error(error);

    return fail(
      'Tidak dapat terhubung ke server. Periksa koneksi internet.'
    );
  }

  button.textContent = 'Memuat soal...';

  const error = await loadSoal();

  if (error) {
    return fail(error);
  }

  show('intro');
}

/* =========================================================
   MEMUAT SOAL SESUAI SUMBER PAKET
========================================================= */

async function loadSoal(saved) {
  try {
    if (!S || !S.file) {
      throw new Error(
        'Informasi file soal tidak ditemukan. Hubungi guru.'
      );
    }

    if (
      (S.sumber || 'lokal') === 'lokal' &&
      location.protocol === 'file:'
    ) {
      throw new Error(
        'Halaman harus dibuka melalui Live Server atau GitHub Pages.'
      );
    }

    // Membaca file dari lokal, GitHub, atau Google Drive.
    const buffer = await ambilDokumen({
      sumber: S.sumber || 'lokal',
      file: S.file
    });

    if (typeof mammoth === 'undefined') {
      throw new Error(
        'Library Mammoth belum dimuat.'
      );
    }

    const hasil = await mammoth.convertToHtml({
      arrayBuffer: buffer
    });

    Q = parseSoalBaru(
      hasil.value,
      S.kunci
    );

    if (!Q.length) {
      throw new Error(
        'Tidak ada soal pilihan ganda yang terbaca.'
      );
    }

    if (!TAMPILKAN_NILAI) {
      Q.forEach(question => {
        question.correct = null;
      });
    }

  } catch (error) {
    console.error('Gagal memuat soal:', error);

    return error.message ||
      'Gagal memuat dokumen soal.';
  }

  state = baru(Q.length);

  // Navigasi nomor soal.
  ng.innerHTML = '';

  Q.forEach((question, index) => {
    const button = document.createElement('button');

    button.className = 'nc';
    button.textContent = index + 1;

    button.setAttribute(
      'aria-label',
      'Soal ' + (index + 1)
    );

    button.onclick = () => {
      state.cur = index;
      render();
      sheet(false);
    };

    ng.appendChild(button);
  });

  $('ttl').textContent = S.paketNama;

  $('sub').textContent =
    Q.length +
    ' soal pilihan ganda · waktu ' +
    S.menit +
    ' menit. Jawaban bisa diubah sebelum dikumpulkan.';

  $('wn').textContent = S.nama;

  $('wk').textContent =
    'Kelas ' + S.kelas +
    ' · Token ' + S.tok;

  $('jq').textContent = Q.length;
  $('dm').textContent = S.menit;

  $('tv').textContent = fmtT(S.menit * 60);

  $('tmr').className = 'timer';

  show('side');
  show('tmr');
  show('qs');

  hide('fin');

  // Pulihkan sesi sebelumnya.
  if (
    saved &&
    Array.isArray(saved.ans) &&
    saved.ans.length === Q.length
  ) {
    state.ans = saved.ans;

    state.cur = Math.min(
      Math.max(0, saved.cur || 0),
      Q.length - 1
    );

    state.saved = !!saved.saved;

    endAt = saved.endAt;

    if (
      Array.isArray(saved.flag) &&
      saved.flag.length === Q.length
    ) {
      state.flag = saved.flag;
    }

    if (saved.done || Date.now() >= endAt) {
      selesai();
      return null;
    }

    startTimer(true);
  }

  render();

  return null;
}

/* =========================================================
   PEMBARUAN STATUS NAVIGASI
========================================================= */

function upd() {
  const answered = state.ans.filter(
    answer => answer !== null
  ).length;

  const flagged = state.flag.filter(Boolean).length;

  $('pf').style.width =
    Math.round(answered / Q.length * 100) + '%';

  $('pl').textContent =
    answered + ' dari ' + Q.length +
    ' soal terjawab' +
    (
      flagged
        ? ' · ' + flagged + ' ditandai'
        : ''
    );

  ng.querySelectorAll('.nc').forEach((button, index) => {
    button.classList.toggle(
      'a',
      state.ans[index] !== null
    );

    button.classList.toggle(
      'f',
      state.flag[index]
    );

    button.classList.toggle(
      'cur',
      index === state.cur && !state.done
    );
  });
}

/* =========================================================
   MEMILIH JAWABAN
========================================================= */

function pilih(index) {
  const radios = panel.querySelectorAll(
    'input[type=radio]'
  );

  const radio = radios[index];

  if (radio) {
    radio.checked = true;

    radio.dispatchEvent(
      new Event('change')
    );
  }
}

/* =========================================================
   TAMPILAN SOAL
========================================================= */

function question() {
  const index = state.cur;

  const q = Q[index];

  const answer = state.ans[index];
  const flagged = state.flag[index];

  panel.innerHTML = `
    <div class="card">

      <div class="qh">

        <span class="qn">
          Soal ${index + 1}
          <small>dari ${Q.length}</small>
        </span>

        <button
          type="button"
          class="flag ${flagged ? 'on' : ''}"
          id="fl"
          aria-pressed="${flagged}">
          ${flagged ? 'Ditandai ragu-ragu' : 'Tandai ragu-ragu'}
        </button>

      </div>

      <p class="qt">${q.q}</p>

      <fieldset>
        <legend class="sr">Pilihan jawaban</legend>

        ${q.opts.map((option, k) => `
          <label class="opt ${answer === k ? 'sel' : ''}">

            <input
              type="radio"
              name="o"
              value="${k}"
              ${answer === k ? 'checked' : ''}>

            <span class="ol">${HURUF[k]}</span>

            <span>${option}</span>

          </label>
        `).join('')}

      </fieldset>

      <div class="nb">

        <button
          class="bg"
          id="pv"
          ${index ? '' : 'disabled'}>
          Sebelumnya
        </button>

        <button class="bp" id="nx">
          ${index === Q.length - 1 ? 'Ke ringkasan' : 'Berikutnya'}
        </button>

      </div>

    </div>
  `;

  panel.querySelectorAll(
    'input[type=radio]'
  ).forEach(input => {
    input.onchange = event => {
      state.ans[index] = Number(
        event.target.value
      );

      upd();
      save();

      panel.querySelectorAll('.opt').forEach(
        (label, k) => {
          label.classList.toggle(
            'sel',
            k === state.ans[index]
          );
        }
      );
    };
  });

  $('fl').onclick = () => {
    state.flag[index] = !state.flag[index];

    const button = $('fl');

    button.classList.toggle(
      'on',
      state.flag[index]
    );

    button.setAttribute(
      'aria-pressed',
      state.flag[index]
    );

    button.textContent = state.flag[index]
      ? 'Ditandai ragu-ragu'
      : 'Tandai ragu-ragu';

    upd();
    save();
  };

  $('pv').onclick = () => {
    state.cur--;
    render();
  };

  $('nx').onclick = () => {
    if (index === Q.length - 1) {
      submit();
    } else {
      state.cur++;
      render();
    }
  };
}

function render() {
  if (state.done) return;

  question();
  upd();

  if (running) {
    save();
  }

  panel.scrollTo({
    top: 0
  });
}

/* =========================================================
   KONFIRMASI PENGUMPULAN
========================================================= */

function confirmBox(message, callback) {
  $('mm').textContent = message;

  show('mo');

  const yes = $('yes');
  const no = $('no');

  const off = () => {
    hide('mo');

    yes.onclick = null;
    no.onclick = null;
  };

  yes.onclick = () => {
    off();
    callback();
  };

  no.onclick = off;
}

function submit() {
  const unanswered = state.ans.filter(
    answer => answer === null
  ).length;

  const flagged = state.flag.filter(Boolean).length;

  const messages = [];

  if (unanswered) {
    messages.push(
      'masih ada ' + unanswered + ' soal belum dijawab'
    );
  }

  if (flagged) {
    messages.push(
      flagged + ' soal ditandai ragu-ragu'
    );
  }

  confirmBox(
    messages.length
      ? 'Perhatian: ' + messages.join(' dan ') +
        '. Tetap kumpulkan jawaban?'
      : 'Semua soal sudah dijawab. Kumpulkan sekarang? Jawaban tidak bisa diubah lagi.',
    selesai
  );
}

$('bs').onclick = submit;

/* =========================================================
   MENGHITUNG NILAI
========================================================= */

function hitung() {
  let benar = 0;
  let salah = 0;
  let kosong = 0;
  let tersedia = 0;

  Q.forEach((question, index) => {
    const answer = state.ans[index];

    if (answer === null) {
      kosong++;
    }

    if (question.correct === null) {
      return;
    }

    tersedia++;

    if (answer === question.correct) {
      benar++;
    } else if (answer !== null) {
      salah++;
    }
  });

  return {
    ben: benar,
    sal: salah,
    kos: kosong,
    K: tersedia,
    sc: tersedia
      ? Math.round(benar / tersedia * 100)
      : null
  };
}

/* =========================================================
   SELESAI UJIAN
========================================================= */

function selesai() {
  if (state.done && !running) {
    return;
  }

  clearInterval(tick);

  running = false;
  state.done = true;

  sheet(false);

  [
    'tmr',
    'side',
    'qs'
  ].forEach(hide);

  show('fin');

  save();

  panel.innerHTML = `
    <div class="gate">

      <div class="logo">
        ${CEK}
      </div>

      <h2>Ujian selesai</h2>

      <p>Jawabanmu sudah dikumpulkan.</p>

      <div class="sv note"></div>

      <div class="acts2">

        <button class="bg" id="lh">
          Lihat hasil
        </button>

        <button class="bp" id="kx">
          Selesai &amp; keluar
        </button>

      </div>

    </div>
  `;

  $('lh').onclick = showHasil;
  $('kx').onclick = keluar;

  showHasil();

  if (state.saved) {
    setSv('ok', 'Hasil tersimpan.');
  } else {
    kirim();
  }
}

/* =========================================================
   KELUAR DARI UJIAN
========================================================= */

function keluar() {
  if (
    !state.saved &&
    !confirm(
      'Hasil belum tersimpan ke server. Tetap keluar?'
    )
  ) {
    return;
  }

  hide('hasil');

  clearSave();

  showGate();
}

/* =========================================================
   MODAL HASIL
========================================================= */

function showHasil() {
  const h = hitung();

  const tampil =
    TAMPILKAN_NILAI &&
    h.K > 0;

  let atas;

  if (tampil) {
    const color =
      h.sc >= 75
        ? '#2F9E5B'
        : h.sc >= 50
          ? '#D79A2C'
          : '#C0392B';

    const message =
      h.sc >= 80
        ? 'Hebat! Hasil yang sangat baik.'
        : h.sc >= 60
          ? 'Cukup baik. Terus belajar ya.'
          : 'Jangan menyerah, pelajari lagi materinya.';

    atas = `
      <svg class="ring"
      viewBox="0 0 132 132"
      role="img"
      aria-label="Nilai ${h.sc}">

        <circle
          class="rb"
          cx="66"
          cy="66"
          r="54"/>

        <circle
          class="rf"
          id="rg"
          cx="66"
          cy="66"
          r="54"
          style="
            stroke:${color};
            stroke-dasharray:${RING};
            stroke-dashoffset:${RING}
          "/>

        <text
          class="rn"
          x="66"
          y="80"
          text-anchor="middle"
          fill="${color}">
          ${h.sc}
        </text>

      </svg>

      <p class="pesan">${message}</p>

      <div class="stats3">

        <div>
          <b>${h.ben}</b>
          <span>Benar</span>
        </div>

        <div>
          <b>${h.sal}</b>
          <span>Salah</span>
        </div>

        <div>
          <b>${h.kos}</b>
          <span>Kosong</span>
        </div>

      </div>
    `;

  } else {
    atas = `
      <div class="okc">
        ${CEK}
      </div>

      <p class="pesan">
        Jawabanmu sudah terkirim.
        Nilai akan diumumkan oleh guru.
      </p>

      <div class="stats3">

        <div>
          <b>${Q.length - h.kos}</b>
          <span>Dijawab</span>
        </div>

        <div>
          <b>${h.kos}</b>
          <span>Kosong</span>
        </div>

      </div>
    `;
  }

  $('hs').innerHTML = `
    <h3 id="hh">Hasil ujian</h3>

    <p class="who2">
      ${esc(S.nama)} · Kelas ${esc(S.kelas)}
    </p>

    ${atas}

    <div class="sv note"></div>

    <div class="ma">

      <button class="bg hidden" id="rt">
        Kirim ulang
      </button>

      <button class="bg" id="tp">
        Tutup
      </button>

      <button class="bp" id="kl">
        Selesai
      </button>

    </div>
  `;

  $('tp').onclick = () => hide('hasil');

  $('kl').onclick = keluar;

  $('rt').onclick = kirim;

  if (state.saved) {
    setSv('ok', 'Hasil tersimpan.');
  }

  show('hasil');

  $('kl').focus();

  if (tampil) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ring = $('rg');

        if (ring) {
          ring.style.strokeDashoffset =
            RING * (1 - h.sc / 100);
        }
      });
    });
  }
}

/* =========================================================
   STATUS PENYIMPANAN
========================================================= */

function setSv(kind, message, retry) {
  document.querySelectorAll('.sv').forEach(element => {
    element.className =
      'sv note ' + kind;

    element.textContent = message;
  });

  const retryButton = $('rt');

  if (retryButton) {
    retryButton.classList.toggle(
      'hidden',
      !retry
    );
  }
}

/* =========================================================
   SIMPAN HASIL KE FIRESTORE
========================================================= */

async function kirim() {
  setSv('', 'Menyimpan hasil...');

  const h = hitung();

  const pakai = h.K > 0;

  const lama = Math.max(
    0,
    Math.min(
      S.menit * 60,
      Math.round(
        (
          Date.now() -
          (endAt - S.menit * 60000)
        ) / 1000
      )
    )
  );

  try {
    await F.addDoc(
      F.collection(db, KOLEKSI_HASIL),
      {
        token: S.tok,
        nama: S.nama,
        kelas: S.kelas,

        paketId: S.paketId || '',
        paketNama: S.paketNama,
        sumber: S.sumber || 'lokal',

        benar: pakai ? h.ben : null,
        salah: pakai ? h.sal : null,
        kosong: h.kos,

        nilai: h.sc,

        jumlahSoal: Q.length,
        durasi: lama,

        jawaban: state.ans
          .map(answer =>
            answer === null
              ? '-'
              : HURUF[answer]
          )
          .join(''),

        waktu: F.serverTimestamp()
      }
    );

    state.saved = true;

    save();

    setSv('ok', 'Hasil tersimpan.');

  } catch (error) {
    console.error('Gagal menyimpan hasil:', error);

    setSv(
      'err',
      'Hasil belum terkirim ke server. Periksa internet lalu coba lagi.',
      true
    );
  }
}

/* =========================================================
   INISIALISASI FIREBASE
========================================================= */

if (cfgOk) {
  try {
    const [
      appModule,
      firestoreModule
    ] = await Promise.all([
      import(FB + 'firebase-app.js'),
      import(FB + 'firebase-firestore.js')
    ]);

    F = firestoreModule;

    const app = appModule.initializeApp(
      firebaseConfig
    );

    db = F.getFirestore(app);

  } catch (error) {
    console.error('Firebase gagal diinisialisasi:', error);

    cfgErr = error.message;
  }
}

/* =========================================================
   PEMULIHAN SESI
========================================================= */

let dataSesi = null;

try {
  dataSesi = JSON.parse(
    localStorage.getItem(KEY) || 'null'
  );
} catch (error) {
  dataSesi = null;
}

if (
  dataSesi &&
  dataSesi.S &&
  cfgOk &&
  db
) {
  S = dataSesi.S;

  const error = await loadSoal(dataSesi);

  if (error) {
    clearSave();
    showGate(error);
  }

} else {
  showGate();
}