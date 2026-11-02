/* =========================================================
   PARSER.JS
   Pembaca soal dari HTML hasil Mammoth (DOCX).

   Dipakai bersama oleh halaman admin (Lihat soal) dan
   halaman siswa (ujian), sehingga tampilannya sama.

   ---------------------------------------------------------
   FORMAT BARU (templat dengan bagian bertingkat)
   ---------------------------------------------------------
   Dokumen dibagi oleh judul bagian. Judul menentukan model soal:

     "A. Pilihan Ganda"            -> jenis "pg"
     "B. Pilihan Ganda Kompleks"   -> jenis "kompleks"
     "C. Benar / Salah"            -> jenis "bs"
     "D. Menjodohkan"              -> jenis "jodoh"
     "KUNCI JAWABAN"               -> tabel kunci (No | Model | Kunci)

   Kunci diambil dari tabel KUNCI JAWABAN:
     pg        : B
     kompleks  : A, C, D
     bs        : Benar / Salah
     jodoh     : 1-C, 2-B, 3-A, 4-D

   ---------------------------------------------------------
   FORMAT LAMA (hanya pilihan ganda) tetap terbaca
   ---------------------------------------------------------
   Dokumen tanpa bagian kompleks / benar-salah / menjodohkan
   dibaca dengan aturan lama: nomor diketik "1.", pilihan "A.",
   kunci "Kunci: X" atau tabel kunci di akhir.

   ---------------------------------------------------------
   BENTUK DATA SETIAP SOAL
   ---------------------------------------------------------
   Semua jenis punya:
     jenis   : 'pg' | 'kompleks' | 'bs' | 'jodoh'
     no      : nomor soal di dokumen
     q       : teks soal (HTML)
     o       : [{ l: huruf, h: html }]   (kosong untuk jodoh)
     opts    : o.map(h)
     correct : indeks jawaban benar (pg, bs) atau null
     key     : kunci dalam bentuk teks, atau null

   Tambahan per jenis:
     kompleks : kunciSet ['A','C','D'], correctSet [0,2,3]
     bs       : o = Benar, Salah. correct 0 = Benar, 1 = Salah
     jodoh    : kiri [{no,h}], kanan [{l,h}], pasangan {1:'C',...}

   Penilaian: nilaiSoal(soal, jawaban) -> angka 0..1
========================================================= */

export const JENIS_LABEL = {
  pg: 'Pilihan ganda',
  kompleks: 'Pilihan ganda kompleks',
  bs: 'Benar / Salah',
  jodoh: 'Menjodohkan'
};

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
  let no = null;

  if (idx >= 0) {
    // Soal bernomor.
    isi = stem.slice(idx);

    const mn = stem[idx].t.match(/^\D*(\d{1,3})/);
    if (mn) no = Number(mn[1]);

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
    key: null,
    no
  };
}

/* =========================================================
   INTI PEMBACA PILIHAN GANDA (tanpa DOM, mudah diuji)
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
      jenis: 'pg',
      no: s.no,
      q: s.q.replace(/^\s+/, ''),
      o: s.o,
      opts: s.o.map(option => option.h),
      correct: index >= 0 ? index : null,
      key: huruf
    };
  });
}

/* =========================================================
   FORMAT BARU: MEMBACA STRUKTUR DOKUMEN
========================================================= */

// Isi satu sel tabel sebagai HTML (paragraf digabung <br>).
function isiSel(sel) {
  const paragraf = [...sel.children].filter(c => c.tagName === 'P');

  if (paragraf.length) {
    return paragraf
      .map(p => p.innerHTML.trim())
      .filter(Boolean)
      .join('<br>');
  }

  return sel.innerHTML.trim();
}

function bacaTabel(tabel) {
  return [...tabel.querySelectorAll('tr')].map(tr =>
    [...tr.children]
      .filter(c => c.tagName === 'TD' || c.tagName === 'TH')
      .map(c => ({
        h: isiSel(c),
        t: c.textContent.replace(/\s+/g, ' ').trim()
      }))
  );
}

// Ubah isi dokumen menjadi urutan elemen: judul, paragraf, tabel.
function bacaElemen(doc) {
  const hasil = [];

  const jalan = induk => {
    for (const el of induk.children) {
      const tag = el.tagName;

      if (/^H[1-6]$/.test(tag)) {
        hasil.push({ k: 'h', t: el.textContent.trim() });

      } else if (tag === 'TABLE') {
        hasil.push({ k: 'tabel', rows: bacaTabel(el) });

      } else if (tag === 'OL' || tag === 'UL') {
        for (const li of el.children) {
          const salin = li.cloneNode(true);

          salin.querySelectorAll('ol, ul').forEach(n => n.remove());

          const h = salin.innerHTML.trim();
          const t = salin.textContent.trim();

          if (t || /<img/i.test(h)) hasil.push({ k: 'p', h, t });
        }

      } else if (tag === 'P') {
        const h = el.innerHTML.trim();
        const t = el.textContent.trim();

        if (t || /<img/i.test(h)) hasil.push({ k: 'p', h, t });

      } else {
        jalan(el);
      }
    }
  };

  jalan(doc.body);

  return hasil;
}

const RE_JUDUL_P =
  /^(?:[A-Z]|[IVX]{1,4})[.)]\s*(?:pilihan\s+ganda|benar|menjodohkan|kunci)/i;

// Teks judul bagian bila elemen ini sebuah judul, selain itu null.
function judulBagian(e) {
  if (e.k === 'h') return e.t;

  if (
    e.k === 'p' &&
    e.t.length < 80 &&
    /^(?:<[^>]+>)*<(?:strong|b)>/i.test(e.h) &&
    (/^kunci\s+jawaban\s*$/i.test(e.t) || RE_JUDUL_P.test(e.t))
  ) {
    return e.t;
  }

  return null;
}

function modeDariJudul(t) {
  if (/kunci\s+jawaban/i.test(t)) return 'kunci';
  if (/kompleks|lebih\s+dari\s+satu/i.test(t)) return 'kompleks';
  if (/benar\s*(?:\/|atau|-)?\s*salah/i.test(t)) return 'bs';
  if (/menjodohkan|jodoh/i.test(t)) return 'jodoh';
  if (/pilihan\s+ganda/i.test(t)) return 'pg';

  return null;
}

function pecahBagian(elemen) {
  const bagian = [{ mode: 'pg', isi: [] }];

  for (const e of elemen) {
    const judul = judulBagian(e);

    if (judul !== null) {
      const mode = modeDariJudul(judul);

      // Judul yang tidak dikenal (mis. "Petunjuk") dibuang saja.
      if (mode) bagian.push({ mode, isi: [] });

      continue;
    }

    bagian[bagian.length - 1].isi.push(e);
  }

  return bagian;
}

/* ---------- Benar / Salah ---------- */

const OPSI_BS = [
  { l: 'Benar', h: 'Benar' },
  { l: 'Salah', h: 'Salah' }
];

function soalBS(isi) {
  const hasil = [];

  for (const e of isi) {
    if (e.k === 'tabel') {
      const rows = e.rows;

      const hi = rows.findIndex(r =>
        r.some(c => /pernyataan/i.test(c.t))
      );

      if (hi < 0) continue;

      const head = rows[hi];

      const iNo = Math.max(0, head.findIndex(c => /^no\.?$/i.test(c.t)));
      const iP = head.findIndex(c => /pernyataan/i.test(c.t));

      rows.slice(hi + 1).forEach(r => {
        const sel = r[iP];

        if (!sel || !(sel.t || /<img/i.test(sel.h))) return;

        const n = parseInt(r[iNo] && r[iNo].t, 10);

        hasil.push({
          no: Number.isFinite(n) ? n : null,
          q: sel.h
        });
      });

    } else if (e.k === 'p' && RE_NUM.test(e.h) && e.t) {
      // Pernyataan bernomor biasa: "7. Air mendidih ..."
      const mn = e.t.match(/^\D*(\d{1,3})/);

      hasil.push({
        no: mn ? Number(mn[1]) : null,
        q: e.h.replace(RE_NUM, '$1')
      });
    }
  }

  return hasil.map(s => ({
    jenis: 'bs',
    no: s.no,
    q: s.q,
    o: OPSI_BS.map(x => ({ ...x })),
    opts: OPSI_BS.map(x => x.h),
    correct: null,
    key: null
  }));
}

/* ---------- Menjodohkan ---------- */

function soalJodoh(isi) {
  const hasil = [];
  let tunggu = null;

  for (const e of isi) {
    if (e.k === 'p') {
      const m = e.t.match(/^soal\s*(\d+)\s*[.):\-]?\s*(.*)$/i);

      if (m) {
        tunggu = {
          no: Number(m[1]),
          q: e.h.replace(
            /^((?:<[^>]+>|\s)*)soal\s*\d+\s*[.):\-]?\s*/i,
            '$1'
          )
        };
      } else if (RE_NUM.test(e.h)) {
        const mn = e.t.match(/^\D*(\d{1,3})/);

        tunggu = {
          no: mn ? Number(mn[1]) : null,
          q: e.h.replace(RE_NUM, '$1')
        };
      }

      continue;
    }

    if (e.k !== 'tabel') continue;

    const rows = e.rows;

    const hi = rows.findIndex(r =>
      r.some(c => /kolom\s*a/i.test(c.t)) ||
      r.some(c => /^huruf$/i.test(c.t))
    );

    if (hi < 0) continue;

    const head = rows[hi];
    const akhir = head.length - 1;

    const cari = (re, cadangan) => {
      const i = head.findIndex(c => re.test(c.t));
      return i >= 0 ? i : cadangan;
    };

    const iNo = cari(/^no\.?$/i, 0);
    const iA = cari(/kolom\s*a/i, 1);
    const iHuruf = cari(/^huruf$/i, Math.max(0, akhir - 1));
    const iB = cari(/kolom\s*b/i, akhir);

    const kiri = [];
    const kanan = [];

    rows.slice(hi + 1).forEach(r => {
      const a = r[iA];
      const b = r[iB];
      const n = parseInt(r[iNo] && r[iNo].t, 10);

      if (a && (a.t || /<img/i.test(a.h)) && Number.isFinite(n)) {
        kiri.push({ no: n, h: a.h });
      }

      const huruf = ((r[iHuruf] && r[iHuruf].t) || '')
        .replace(/[^A-Za-z]/g, '')
        .charAt(0)
        .toUpperCase();

      if (huruf && b && (b.t || /<img/i.test(b.h))) {
        kanan.push({ l: huruf, h: b.h });
      }
    });

    if (!kiri.length || !kanan.length) continue;

    hasil.push({
      jenis: 'jodoh',
      no: tunggu ? tunggu.no : null,
      q: tunggu ? tunggu.q : '',
      o: [],
      opts: [],
      kiri,
      kanan,
      pasangan: {},
      correct: null,
      key: null
    });

    tunggu = null;
  }

  return hasil;
}

/* ---------- Tabel kunci ---------- */

function bacaTabelKunci(tabelList) {
  const peta = new Map();

  for (const rows of tabelList) {
    const hi = rows.findIndex(r =>
      r.some(c => /^kunci/i.test(c.t))
    );

    if (hi < 0) continue;

    const head = rows[hi];

    const iNo = Math.max(0, head.findIndex(c => /^no\.?$/i.test(c.t)));
    const iKunci = head.findIndex(c => /^kunci/i.test(c.t));

    rows.slice(hi + 1).forEach(r => {
      const n = parseInt(r[iNo] && r[iNo].t, 10);
      const teks = (r[iKunci] && r[iKunci].t) || '';

      if (Number.isFinite(n) && teks && !peta.has(n)) {
        peta.set(n, teks);
      }
    });
  }

  return peta;
}

function terapkanKunci(s, teks) {
  const t = String(teks || '').trim();

  if (!t) return;

  if (s.jenis === 'pg') {
    const m = t.match(/[A-Ea-e]/);

    if (!m) return;

    const huruf = m[0].toUpperCase();
    const idx = s.o.findIndex(x => x.l === huruf);

    s.key = huruf;
    s.correct = idx >= 0 ? idx : null;

  } else if (s.jenis === 'kompleks') {
    const huruf = (t.toUpperCase().replace(/\bDAN\b/g, ' ').match(/[A-E]/g) || []);

    const ada = new Set(s.o.map(x => x.l));
    const set = [...new Set(huruf)].filter(h => ada.has(h)).sort();

    if (!set.length) return;

    s.kunciSet = set;
    s.correctSet = set.map(h => s.o.findIndex(x => x.l === h));
    s.key = set.join(', ');

  } else if (s.jenis === 'bs') {
    if (/^\s*s(alah)?\s*$/i.test(t) || /\bsalah\b/i.test(t)) {
      s.correct = 1;
      s.key = 'Salah';
    } else if (/^\s*b(enar)?\s*$/i.test(t) || /\bbenar\b/i.test(t)) {
      s.correct = 0;
      s.key = 'Benar';
    }

  } else if (s.jenis === 'jodoh') {
    const re = /(\d+)\s*[-–—:=]\s*([A-Za-z])(?![a-z])/g;
    let m;

    while ((m = re.exec(t))) {
      s.pasangan[Number(m[1])] = m[2].toUpperCase();
    }

    const nomor = Object.keys(s.pasangan).map(Number).sort((a, b) => a - b);

    if (nomor.length) {
      s.key = nomor.map(n => n + '-' + s.pasangan[n]).join(', ');
    }
  }
}

/* ---------- Merangkai semua bagian ---------- */

function bangunDokumenBaru(bagian) {
  const semua = [];
  const tabelKunci = [];

  let teksKunci = '';

  for (const b of bagian) {

    if (b.mode === 'pg' || b.mode === 'kompleks') {
      const blocks = b.isi
        .filter(e => e.k === 'p')
        .map(e => ({ h: e.h, t: e.t }));

      bangunSoal(blocks, null).forEach(s => {
        s.jenis = b.mode;

        if (b.mode === 'kompleks') {
          // Kunci kompleks hanya dari tabel kunci.
          s.key = null;
          s.correct = null;
        }

        semua.push(s);
      });

    } else if (b.mode === 'bs') {
      soalBS(b.isi).forEach(s => semua.push(s));

    } else if (b.mode === 'jodoh') {
      soalJodoh(b.isi).forEach(s => semua.push(s));

    } else if (b.mode === 'kunci') {
      b.isi.forEach(e => {
        if (e.k === 'tabel') {
          tabelKunci.push(e.rows);
          teksKunci += ' ' + e.rows.map(r => r.map(c => c.t).join(' ')).join(' ');
        } else if (e.k === 'p') {
          teksKunci += ' ' + e.t;
        }
      });
    }
  }

  // Nomor yang tidak terbaca dilanjutkan dari soal sebelumnya.
  let terakhir = 0;

  semua.forEach(s => {
    if (!Number.isFinite(s.no)) s.no = terakhir + 1;
    terakhir = s.no;
  });

  // Kunci dari tabel KUNCI JAWABAN.
  const peta = bacaTabelKunci(tabelKunci);

  semua.forEach(s => {
    if (peta.has(s.no)) terapkanKunci(s, peta.get(s.no));
  });

  // Cadangan: tabel kunci berbentuk lain ("1 B  2 C ...") untuk
  // soal pilihan ganda yang kuncinya belum ketemu.
  const pg = semua.filter(s => s.jenis === 'pg');

  if (pg.some(s => !s.key) && teksKunci) {
    let m;

    PAIR.lastIndex = 0;

    while ((m = PAIR.exec(teksKunci))) {
      const nomor = Number(m[1]);
      const sasaran = pg.find(s => s.no === nomor) || pg[nomor - 1];

      if (sasaran && !sasaran.key) terapkanKunci(sasaran, m[2]);
    }
  }

  return semua;
}

/* =========================================================
   PEMBACA DARI HTML MAMMOTH
========================================================= */

// Aturan lama: semua paragraf dan item daftar dibaca berurutan.
function parseLama(doc, kunci) {
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

export function parseSoalBaru(html, kunci) {
  const doc = new DOMParser().parseFromString(
    html,
    'text/html'
  );

  // Format baru dipakai hanya bila dokumen memuat bagian
  // kompleks, benar/salah, atau menjodohkan. Dokumen pilihan
  // ganda biasa tetap memakai aturan lama.
  const bagian = pecahBagian(bacaElemen(doc));

  const baru = bagian.some(b =>
    b.mode === 'kompleks' || b.mode === 'bs' || b.mode === 'jodoh'
  );

  if (baru) {
    const hasil = bangunDokumenBaru(bagian);

    if (hasil.length) return hasil;
  }

  return parseLama(doc, kunci);
}

/* =========================================================
   KUNCI LENGKAP ATAU BELUM
========================================================= */

export function punyaKunci(s) {
  if (!s) return false;

  if (s.jenis === 'kompleks') {
    return Array.isArray(s.kunciSet) && s.kunciSet.length > 0;
  }

  if (s.jenis === 'jodoh') {
    return (
      Array.isArray(s.kiri) &&
      s.kiri.length > 0 &&
      s.kiri.every(k => s.pasangan && s.pasangan[k.no])
    );
  }

  return s.correct !== null && s.correct !== undefined;
}

/* =========================================================
   PENILAIAN SATU SOAL  ->  angka 0..1
   (aturan bawaan; ubah di sini bila kebijakan sekolah berbeda)

   pg, bs    : benar = 1, salah/kosong = 0.
               jawaban: indeks pilihan (angka) atau hurufnya.
   kompleks  : (pilihan benar - pilihan salah) / jumlah kunci,
               minimal 0. Pilih semua yang benar = 1.
               jawaban: larik huruf ['A','C'] atau indeks [0,2].
   jodoh     : pasangan benar / jumlah pasangan.
               jawaban: objek { 1: 'C', 2: 'B', ... }.
========================================================= */

export function nilaiSoal(s, jawaban) {
  if (!s || jawaban === null || jawaban === undefined) return 0;

  if (s.jenis === 'kompleks') {
    if (!punyaKunci(s) || !Array.isArray(jawaban)) return 0;

    const pilih = new Set(
      jawaban.map(j =>
        typeof j === 'number'
          ? (s.o[j] ? s.o[j].l : '')
          : String(j).toUpperCase()
      ).filter(Boolean)
    );

    const kunci = new Set(s.kunciSet);

    let benar = 0;
    let salah = 0;

    pilih.forEach(h => (kunci.has(h) ? benar++ : salah++));

    return Math.max(0, (benar - salah) / kunci.size);
  }

  if (s.jenis === 'jodoh') {
    if (!punyaKunci(s) || typeof jawaban !== 'object') return 0;

    const total = s.kiri.length;

    const benar = s.kiri.filter(k =>
      String(jawaban[k.no] || '').toUpperCase() === s.pasangan[k.no]
    ).length;

    return benar / total;
  }

  // pg dan bs
  if (s.correct === null || s.correct === undefined) return 0;

  const idx =
    typeof jawaban === 'number'
      ? jawaban
      : s.o.findIndex(x =>
          x.l.toUpperCase() === String(jawaban).trim().toUpperCase()
        );

  return idx === s.correct ? 1 : 0;
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