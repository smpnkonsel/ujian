/* =========================================================
   PARSER SOAL MODEL BARU — KW LEARNING
   Membaca soal di DOCX dengan penanda:
     #PGK    pilihan ganda kompleks (kunci: A,C,E)
     #BS     benar / salah           (kunci: Benar / Salah)
     #JODOH  menjodohkan             (baris "1. kiri = kanan")
   Dipakai setelah soal pilihan ganda biasa.
========================================================= */

const bersih = s => s.replace(/<[^>]+>/g, '').trim();
const buangAwal = (s, re) => s.replace(new RegExp('^(?:<[^>]+>)*\\s*' + re), '').trim();

/* Pengacakan tetap (hasilnya sama setiap kali dibuka). */
function acakTetap(n, seed) {
  const a = [...Array(n).keys()];
  let x = seed * 9301 + 49297;
  for (let i = n - 1; i > 0; i--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor(x / 233280 * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift());
  return a;
}

function bangun(c, nomor) {
  const q = c.q.join('<br>');
  if (!q) return null;

  if (c.tipe === 'PGK') {
    if (c.opts.length < 2) return null;
    const idx = [...new Set((c.kunci.toUpperCase().match(/[A-F]/g) || [])
      .map(h => h.charCodeAt(0) - 65))]
      .filter(i => i < c.opts.length)
      .sort((a, b) => a - b);
    return { t: 'pgk', q, opts: c.opts, correct: idx.length ? idx : null };
  }

  if (c.tipe === 'BS') {
    const k = c.kunci.trim().toLowerCase();
    return {
      t: 'bs', q, opts: ['Benar', 'Salah'],
      correct: k.startsWith('b') ? 0 : k.startsWith('s') ? 1 : null
    };
  }

  if (c.tipe === 'JODOH') {
    if (c.kiri.length < 2) return null;
    const urut = acakTetap(c.kanan.length, nomor + 3);   // urut[k] = indeks kanan asli
    const r = urut.map(i => c.kanan[i]);
    const correct = c.kiri.map((_, j) => urut.indexOf(j));
    return { t: 'jd', q, l: c.kiri, r, correct };
  }

  return null;
}

export function parseKhusus(html, mulaiNomor = 0) {
  const lines = html
    .replace(/<\/(p|li)>/gi, '\n')
    .replace(/<(?!\/?(?:img|sub|sup|b|i|strong|em)\b)[^>]*>/gi, '')
    .split('\n').map(s => s.trim()).filter(Boolean);

  const out = [];
  let c = null;

  const tutup = () => {
    if (!c) return;
    const q = bangun(c, mulaiNomor + out.length);
    if (q) out.push(q);
    c = null;
  };

  for (const ln of lines) {
    const p = bersih(ln);
    let m;

    if ((m = p.match(/^#\s*(PGK|BS|JODOH)\b/i))) {
      tutup();
      c = { tipe: m[1].toUpperCase(), q: [], opts: [], kiri: [], kanan: [], kunci: '' };
      continue;
    }
    if (!c) continue;

    if ((m = p.match(/^kunci\s*[:=]\s*(.+)$/i))) { c.kunci = m[1]; continue; }

    if (c.tipe === 'PGK' && /^[A-Fa-f][.)]\s*\S/.test(p)) {
      c.opts.push(buangAwal(ln, '[A-Fa-f][.)]\\s*'));
      continue;
    }

    if (c.tipe === 'JODOH' && /^\d+[.)]\s*.+=.+$/.test(p)) {
      const [k, ...sisa] = buangAwal(ln, '\\d+[.)]\\s*').split('=');
      c.kiri.push(k.trim());
      c.kanan.push(sisa.join('=').trim());
      continue;
    }

    c.q.push(ln);
  }

  tutup();
  return out;
}