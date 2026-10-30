/* =========================================================
   PARSER.JS
   Pembaca soal pilihan ganda dari HTML hasil Mammoth (DOCX).

   Dipakai bersama oleh halaman admin (Lihat soal) dan
   halaman siswa (ujian), sehingga tampilannya sama.

   Aturan utama:
   - Soal ditandai oleh nomor yang DIKETIK ("1.", "2.", ...).
   - Semua yang ada sebelum soal nomor 1 (logo, kop, identitas,
     petunjuk) dibuang.
   - Judul bagian di antara soal ("I. Pilihan Ganda", "Petunjuk")
     dibuang.
   - Teks atau gambar di antara dua soal (wacana/stimulus) ikut
     ke soal berikutnya.
   - Gambar tetap dipertahankan di soal maupun di pilihan.
========================================================= */

/* =========================================================
   POLA
========================================================= */

// Pilihan jawaban A-E.
const RE_OPT =
  /^((?:<[^>]+>|\s|&nbsp;)*)(?:\*\*)?\(?([A-Ea-e])[.)]\s*/;

// Nomor soal (tidak cocok untuk angka desimal seperti "1.500").
const RE_NUM =
  /^((?:<[^>]+>|\s|&nbsp;)*)(?:\*\*)?\d{1,3}\s*[.)](?!\d)\s*/;

// Kunci jawaban.
const RE_KEY =
  /^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:=]\s*\(?([A-Ea-e])\)?/i;

const RE_KEYHEAD = /^kunci(?:\s*jawaban)?\b/i;

// Informasi yang tidak dimasukkan sebagai soal.
const RE_SKIP =
  /^(pembahasan|level|tingkat|topik|skor|bobot)\s*[:=]/i;

// Judul bagian dan petunjuk (dibuang).
const RE_HEAD =
  /^(petunjuk|bagian\s+[ivx\d]+|pilihan\s+ganda\b|soal\s+pilihan\s+ganda|nama\s*:|kelas\s*:|mata\s+pelajaran|pilihlah\s+(?:salah\s+satu\s+)?jawaban\s+(?:yang\s+)?(?:paling\s+)?(?:tepat|benar))/i;

// Angka Romawi kapital sebagai judul bagian: "I. Pilihan Ganda".
const RE_ROMAWI = /^[IVX]{1,4}\s*[.)]\s+\S/;

// Pasangan "nomor + huruf" pada tabel kunci jawaban.
const PAIR =
  /(\d+)\s*[.):\-]?\s*([A-Ea-e])(?![a-z])/g;

const adalahJudul = teks =>
  RE_HEAD.test(teks) || RE_ROMAWI.test(teks);

const teksKosong = html =>
  !html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, '')
    .trim();

/* =========================================================
   MEMECAH PILIHAN DALAM SATU BARIS
   (pilihan dipisah tab: "A. x <tab> B. y <tab> C. z")
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
   MEMBENTUK SOAL BARU DARI BLOK SEBELUM PILIHAN
========================================================= */

function mulaiSoal(stem, pertama) {
  // Cari nomor soal terakhir di antara blok sebelum pilihan.
  let idx = -1;

  for (let i = stem.length - 1; i >= 0; i--) {
    if (stem[i].t && RE_NUM.test(stem[i].h)) {
      idx = i;
      break;
    }
  }

  let pra = [];
  let isi;

  if (idx >= 0) {
    // Soal bernomor.
    isi = stem.slice(idx);

    // Wacana/gambar sebelum nomor ikut ke soal ini,
    // kecuali untuk soal pertama (itu kop dan petunjuk).
    pra = pertama
      ? []
      : stem.slice(0, idx).filter(b => !adalahJudul(b.t));

  } else if (pertama) {
    // Tanpa nomor: ambil paragraf teks terakhir dan gambar
    // sesudahnya. Kop, logo, dan petunjuk di atasnya dibuang.
    let k = -1;

    for (let i = stem.length - 1; i >= 0; i--) {
      if (stem[i].t) {
        k = i;
        break;
      }
    }

    isi = k >= 0 ? stem.slice(k) : stem.slice(-1);

  } else {
    // Tanpa nomor, bukan soal pertama.
    isi = stem.filter(b => !adalahJudul(b.t));
  }

  const bagian = [
    ...pra.map(b => b.h),
    ...isi.map((b, i) =>
      i === 0 && idx >= 0
        ? b.h.replace(RE_NUM, '$1')
        : b.h
    )
  ];

  return {
    q: bagian.join('<br>').replace(/^(?:\s|<br>)+/i, ''),
    o: [],
    key: null
  };
}

/* =========================================================
   INTI PEMBACA (tanpa DOM, mudah diuji)
   blocks: [{ h: html paragraf, t: teks polos paragraf }]
========================================================= */

export function bangunSoal(blocks, kunci) {
  const hasil = [];
  const pairs = [];

  let stem = [];
  let cur = null;
  let modeKunci = false;

  // Teks tabel kunci dikumpulkan dulu, lalu dibaca sekali di akhir.
  // Dengan begitu tabel kunci (nomor dan huruf di sel terpisah)
  // tetap terbaca.
  let teksKunci = '';

  const scan = text => {
    let match;

    PAIR.lastIndex = 0;

    while ((match = PAIR.exec(text))) {
      pairs.push([
        Number(match[1]),
        match[2].toUpperCase()
      ]);
    }
  };

  for (const b of blocks) {

    // Setelah "Kunci jawaban", semua blok dibaca sebagai kunci.
    if (modeKunci) {
      teksKunci += ' ' + b.t;
      continue;
    }

    const km = b.t.match(RE_KEY);

    if (km) {
      const target = cur || hasil[hasil.length - 1];

      if (target) {
        target.key = km[1].toUpperCase();
      }

      continue;
    }

    if (RE_KEYHEAD.test(b.t)) {
      modeKunci = true;
      teksKunci += ' ' + b.t;
      continue;
    }

    if (RE_SKIP.test(b.t)) {
      continue;
    }

    const kosong = !b.t;
    const isOpt = !kosong && RE_OPT.test(b.h);
    const isNum = !kosong && RE_NUM.test(b.h);

    // ---- Baris pilihan jawaban ----
    if (isOpt) {
      if (!cur) {
        cur = mulaiSoal(stem, hasil.length === 0);
        hasil.push(cur);
        stem = [];
      }

      optSegs(b.h).forEach(option => cur.o.push(option));
      continue;
    }

    // ---- Blok lain ketika soal sedang punya pilihan ----
    if (cur) {
      if (!isNum) {
        const last = cur.o[cur.o.length - 1];

        if (kosong) {
          // Blok gambar saja. Milik pilihan terakhir jika
          // pilihan itu masih kosong ("D." lalu gambar).
          if (last && teksKosong(last.h) && !/<img/i.test(last.h)) {
            last.h += ' ' + b.h;
            continue;
          }

          // Selain itu, gambar milik soal berikutnya.
          cur = null;
          stem.push(b);
          continue;
        }

        // Lanjutan teks dari pilihan yang baru satu.
        if (cur.o.length < 2) {
          last.h += ' ' + b.h;
          continue;
        }
      }

      // Soal sebelumnya selesai.
      cur = null;
    }

    stem.push(b);
  }

  scan(teksKunci);

  const soal = hasil.filter(s => s.o.length >= 2);

  soal.forEach(s => {
    s.o.sort((a, b) => a.l.localeCompare(b.l));
  });

  // Kunci dari tabel "Kunci jawaban".
  pairs.forEach(([nomor, huruf]) => {
    if (soal[nomor - 1] && !soal[nomor - 1].key) {
      soal[nomor - 1].key = huruf;
    }
  });

  // Kunci dari token (string seperti "CBCDA...").
  const keys = kunci
    ? [...String(kunci).replace(/\s/g, '').toUpperCase()]
    : [];

  return soal.map((s, i) => {
    const huruf =
      s.key ||
      (keys[i] && keys[i] !== '-' ? keys[i] : null);

    const index = huruf
      ? s.o.findIndex(option => option.l === huruf)
      : -1;

    return {
      q: s.q.replace(/^\s+/, ''),
      o: s.o,
      opts: s.o.map(option => option.h),
      correct: index >= 0 ? index : null,
      key: huruf
    };
  });
}

/* =========================================================
   PEMBACA DARI HTML MAMMOTH
========================================================= */

export function parseSoalBaru(html, kunci) {
  const doc = new DOMParser().parseFromString(
    html,
    'text/html'
  );

  const blocks = [...doc.body.querySelectorAll('p, li')]
    // li yang membungkus p diabaikan, p-nya yang dipakai.
    .filter(el =>
      !(el.tagName === 'LI' && el.querySelector(':scope > p'))
    )
    .map(el => {
      const salin = el.cloneNode(true);

      // Daftar bersarang dibaca sebagai blok sendiri.
      salin.querySelectorAll('ol, ul').forEach(n => n.remove());

      return {
        h: salin.innerHTML.trim(),
        t: salin.textContent.trim()
      };
    })
    .filter(b => b.t || /<img/i.test(b.h));

  return bangunSoal(blocks, kunci);
}

/* =========================================================
   GAYA GAMBAR: gambar tidak melebihi lebar layar
========================================================= */

if (
  typeof document !== 'undefined' &&
  !document.getElementById('gaya-gambar-soal')
) {
  const gaya = document.createElement('style');

  gaya.id = 'gaya-gambar-soal';

  gaya.textContent = `
    .qt img, .opt img, .q img, .prev img {
      max-width: 100%;
      height: auto;
      vertical-align: middle;
    }
  `;

  document.head.appendChild(gaya);
}