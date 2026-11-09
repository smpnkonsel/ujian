/* =========================================================
   PERIODE.JS — pemilih periode untuk daftar data ujian

   Tujuan: halaman TIDAK memuat seluruh data lama. Admin/guru memilih
   periode (hari ini, 7 hari, bulan, semester, rentang tanggal), dan
   hanya data periode itu yang dimuat/ditampilkan. Hasil pilihan diingat
   per halaman selama sesi browser.

   Pemakaian:
     const per = buatPeriode(wadah, { kunci: 'hasil', bawaan: 'bulan-ini', onUbah: muat });
     const r = per.rentang();   // { dari: Date|null, sampai: Date|null (eksklusif), label }
========================================================= */

const HARI = 864e5;
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const awalHari = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const awalBulan = (th, bl) => new Date(th, bl, 1);
const pad = n => String(n).padStart(2, '0');
const fmtTgl = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtBln = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);

/* Semester Indonesia: Ganjil = Juli–Desember, Genap = Januari–Juni. */
export function semesterDari(d = new Date(), geser = 0) {
  let th = d.getFullYear(), ganjil = d.getMonth() >= 6;
  for (let i = 0; i < Math.abs(geser); i++) {
    if (geser < 0) { if (ganjil) ganjil = false; else { ganjil = true; th--; } }
  }
  const dari = ganjil ? new Date(th, 6, 1) : new Date(th, 0, 1);
  const sampai = ganjil ? new Date(th + 1, 0, 1) : new Date(th, 6, 1);
  const ta = ganjil ? th + '/' + (th + 1) : (th - 1) + '/' + th;
  return { dari, sampai, label: 'Semester ' + (ganjil ? 'Ganjil' : 'Genap') + ' ' + ta };
}

const DAFTAR = [
  ['hari', 'Hari ini'],
  ['7', '7 hari terakhir'],
  ['mendatang', 'Hari ini & mendatang'],
  ['bulan-ini', 'Bulan ini'],
  ['bulan-lalu', 'Bulan lalu'],
  ['semester-ini', 'Semester ini'],
  ['semester-lalu', 'Semester lalu'],
  ['bulan', 'Pilih bulan…'],
  ['rentang', 'Pilih tanggal…'],
  ['semua', 'Semua waktu (lambat)']
];

/* p = { mode, bulan: 'YYYY-MM', dari: 'YYYY-MM-DD', sampai: 'YYYY-MM-DD' } */
export function hitungRentang(p, sekarang = new Date()) {
  const h0 = awalHari(sekarang);
  switch (p.mode) {
    case 'hari': return { dari: h0, sampai: new Date(+h0 + HARI), label: 'Hari ini' };
    case '7': return { dari: new Date(+h0 - 6 * HARI), sampai: new Date(+h0 + HARI), label: '7 hari terakhir' };
    case 'mendatang': return { dari: h0, sampai: null, label: 'Hari ini & mendatang' };
    case 'bulan-ini': return {
      dari: awalBulan(h0.getFullYear(), h0.getMonth()), sampai: awalBulan(h0.getFullYear(), h0.getMonth() + 1),
      label: NAMA_BULAN[h0.getMonth()] + ' ' + h0.getFullYear()
    };
    case 'bulan-lalu': {
      const d = awalBulan(h0.getFullYear(), h0.getMonth() - 1);
      return { dari: d, sampai: awalBulan(h0.getFullYear(), h0.getMonth()), label: NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear() };
    }
    case 'semester-ini': return semesterDari(sekarang, 0);
    case 'semester-lalu': return semesterDari(sekarang, -1);
    case 'bulan': {
      const [th, bl] = String(p.bulan || fmtBln(h0)).split('-').map(Number);
      return { dari: awalBulan(th, bl - 1), sampai: awalBulan(th, bl), label: NAMA_BULAN[bl - 1] + ' ' + th };
    }
    case 'rentang': {
      const a = p.dari ? new Date(p.dari + 'T00:00:00') : h0;
      const b = p.sampai ? new Date(p.sampai + 'T00:00:00') : a;
      const [x, y] = a <= b ? [a, b] : [b, a];
      return { dari: x, sampai: new Date(+y + HARI), label: fmtTgl(x) + ' s/d ' + fmtTgl(y) };
    }
    default: return { dari: null, sampai: null, label: 'Semua waktu' };
  }
}

/* Apakah waktu (ms / Date / 'YYYY-MM-DD') jatuh dalam rentang? */
export function dalamRentang(nilai, r) {
  if (!r || (!r.dari && !r.sampai)) return true;
  let ms = nilai;
  if (typeof nilai === 'string') ms = +new Date(nilai.length <= 10 ? nilai + 'T00:00:00' : nilai);
  else if (nilai && typeof nilai.toMillis === 'function') ms = nilai.toMillis();
  else if (nilai instanceof Date) ms = +nilai;
  if (!Number.isFinite(ms)) return false;
  return (!r.dari || ms >= +r.dari) && (!r.sampai || ms < +r.sampai);
}

/* Membuat kontrol di dalam `wadah` (disarankan elemen .tools agar gayanya sama
   dengan filter lain). opsi: kunci, bawaan, tanpa (mode yang disembunyikan), onUbah. */
export function buatPeriode(wadah, { kunci = 'umum', bawaan = 'bulan-ini', tanpa = [], onUbah = () => {} } = {}) {
  const KUNCI = 'kwp:' + kunci;
  let p = { mode: bawaan };
  try { const t = JSON.parse(sessionStorage.getItem(KUNCI) || 'null'); if (t && t.mode) p = t; } catch (_) { /* abaikan */ }
  if (tanpa.includes(p.mode)) p.mode = bawaan;

  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Periode');
  sel.innerHTML = DAFTAR.filter(([k]) => !tanpa.includes(k))
    .map(([k, t]) => '<option value="' + k + '">' + t + '</option>').join('');

  const bln = document.createElement('input');
  bln.type = 'month'; bln.setAttribute('aria-label', 'Bulan');
  const dr = document.createElement('input');
  dr.type = 'date'; dr.setAttribute('aria-label', 'Dari tanggal');
  const sp = document.createElement('input');
  sp.type = 'date'; sp.setAttribute('aria-label', 'Sampai tanggal');
  [bln, dr, sp].forEach(e => { e.style.display = 'none'; });

  wadah.prepend(sp); wadah.prepend(dr); wadah.prepend(bln); wadah.prepend(sel);

  const h0 = new Date();
  bln.value = p.bulan || fmtBln(h0);
  dr.value = p.dari || fmtTgl(h0);
  sp.value = p.sampai || fmtTgl(h0);
  sel.value = p.mode;

  const tampil = () => {
    bln.style.display = p.mode === 'bulan' ? '' : 'none';
    dr.style.display = sp.style.display = p.mode === 'rentang' ? '' : 'none';
  };
  tampil();

  let timer = null;
  const ubah = (tunda) => {
    p = { mode: sel.value, bulan: bln.value, dari: dr.value, sampai: sp.value };
    try { sessionStorage.setItem(KUNCI, JSON.stringify(p)); } catch (_) { /* abaikan */ }
    tampil();
    clearTimeout(timer);
    timer = setTimeout(() => onUbah(hitungRentang(p)), tunda ? 400 : 0);
  };
  sel.addEventListener('change', () => ubah(false));
  [bln, dr, sp].forEach(e => e.addEventListener('change', () => ubah(true)));

  return {
    rentang: () => hitungRentang(p),
    label: () => hitungRentang(p).label,
    mode: () => p.mode
  };
}

/* Filter "jenis ujian" (SAS, PTS, Ulangan Harian, dst.) — disaring di sisi klien dari
   data periode yang sudah dimuat. Pilihan diingat per halaman selama sesi browser. */
const escH = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buatFilterJenis(wadah, { kunci = 'umum', onUbah = () => {} } = {}) {
  const KUNCI = 'kwj:' + kunci;
  let nilai = '';
  try { nilai = sessionStorage.getItem(KUNCI) || ''; } catch (_) { /* abaikan */ }

  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Jenis ujian');
  wadah.append(sel);

  const isi = daftar => {
    const unik = [...new Set((daftar || []).map(x => String(x || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'id'));
    sel.innerHTML = '<option value="">Semua jenis ujian</option>' +
      unik.map(j => '<option value="' + escH(j) + '">' + escH(j) + '</option>').join('') +
      '<option value="__kosong">(tanpa jenis)</option>';
    sel.value = [...sel.options].some(o => o.value === nilai) ? nilai : '';
    nilai = sel.value;
  };
  isi([]);

  sel.addEventListener('change', () => {
    nilai = sel.value;
    try { sessionStorage.setItem(KUNCI, nilai); } catch (_) { /* abaikan */ }
    onUbah();
  });

  return {
    isi,
    nilai: () => nilai,
    cocok: j => !nilai || (nilai === '__kosong' ? !String(j || '').trim() : String(j || '').trim() === nilai)
  };
}
