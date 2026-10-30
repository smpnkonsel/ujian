/* =====================================================
   SIDEBAR.JS
   Memanggil sidebar.html ke halaman mana pun.

   Pemakaian di halaman:
     <div id="sidebar-slot"></div>
     <script type="module">
       import { muatSidebar } from './js/sidebar.js';
       await muatSidebar();
       await import('./js/main.js');   // skrip yang butuh sidebar
     </script>

   Atribut opsional pada #sidebar-slot:
     data-src="..."    lokasi sidebar.html (bawaan: folder induk js/)
     data-home="admin.html"
                       halaman yang memegang menu #dasbor/#token/#nilai.
                       Bila halaman saat ini berbeda, tautan menu
                       otomatis menuju halaman itu.
     data-mode="halaman"
                       tiap menu menuju file halamannya sendiri
                       (admin.html, token.html, nilai.html). Tanpa
                       atribut ini menu berupa tautan #bagian.
     data-aktif="nilai" menandai menu aktif (untuk halaman yang
                       tidak memakai nav.js)
===================================================== */

// Salinan sidebar.html. Dipakai bila file partials/sidebar.html
// tidak ditemukan atau tidak bisa diambil, supaya menu tetap tampil
// dan halaman tidak macet. Jika mengubah menu, ubah juga di sini.
const SIDEBAR_CADANGAN = `<aside id="sb" aria-label="Menu utama">
 <div class="brand">
  <h1>KW Learning</h1>
  <small>Admin ujian · SMPN 20 Konawe Selatan</small>
 </div>

 <nav>
  <a href="#dasbor" data-p="dasbor" data-url="admin.html">
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
   <span>Dasbor</span>
  </a>
  <a href="#token" data-p="token" data-url="token.html">
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/></svg>
   <span>Pembuat token</span>
  </a>
  <a href="#nilai" data-p="nilai" data-url="nilai.html">
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/></svg>
   <span>Unduh nilai</span>
  </a>
 </nav>

 <div class="sbf">
  <span class="dot" id="dot"></span>
  <span id="cs">Memeriksa koneksi…</span>
 </div>
</aside>

<div id="scrim"></div>`;

// Sidebar dianggap utuh bila kerangka, ketiga menu, status koneksi,
// dan latar gelapnya ada. Nilai 3 = jumlah menu pada MENU di bawah.
const JUMLAH_MENU = 3;

function sidebarUtuh(akar) {
  return !!(
    akar.querySelector('#sb') &&
    akar.querySelector('#scrim') &&
    akar.querySelector('#dot') &&
    akar.querySelector('#cs') &&
    akar.querySelectorAll('#sb nav a[data-p]').length >= JUMLAH_MENU &&
    [...akar.querySelectorAll('#sb nav a[data-p]')]
      .every(a => a.textContent.trim())
  );
}

// Tombol menu + penutup untuk halaman yang belum punya #burger.
function pasangToggle() {
  if (document.getElementById('burger')) return; // nav.js yang mengurus

  const tombol = document.createElement('button');
  tombol.id = 'sbtoggle';
  tombol.type = 'button';
  tombol.className = 'sb-toggle';
  tombol.setAttribute('aria-label', 'Buka menu');
  tombol.setAttribute('aria-controls', 'sb');
  tombol.setAttribute('aria-expanded', 'false');
  tombol.textContent = '\u2630';
  document.body.appendChild(tombol);

  const set = buka => {
    document.body.classList.toggle('open', buka);
    tombol.setAttribute('aria-expanded', String(buka));
  };

  tombol.addEventListener('click', () =>
    set(!document.body.classList.contains('open'))
  );

  const scrim = document.getElementById('scrim');
  if (scrim) scrim.addEventListener('click', () => set(false));

  document.querySelectorAll('#sb nav a').forEach(a =>
    a.addEventListener('click', () => set(false))
  );

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') set(false);
  });

  // Kembali ke tampilan desktop: tutup menu.
  if (window.matchMedia) {
    window.matchMedia('(min-width: 821px)').addEventListener('change', e => {
      if (e.matches) set(false);
    });
  }
}

export async function muatSidebar(opsi = {}) {
  const slot = document.querySelector(opsi.slot || '#sidebar-slot');

  if (!slot) {
    console.warn('Elemen #sidebar-slot tidak ditemukan.');
    return false;
  }

  const src = slot.dataset.src || new URL('../partials/sidebar.html', import.meta.url);

  let html;

  try {
    const res = await fetch(src, { cache: 'no-cache' });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    html = await res.text();


  } catch (error) {
    console.warn(
      'partials/sidebar.html tidak dapat dibaca (' + error.message +
      '). Memakai salinan bawaan.', String(src)
    );

    html = SIDEBAR_CADANGAN;
  }

  // Ganti slot dengan isi sidebar.html.
  const kotak = document.createElement('template');
  kotak.innerHTML = html;

  // File yang terpotong atau salah isi (menu hilang, status koneksi
  // hilang) diganti dengan salinan bawaan yang utuh.
  if (!sidebarUtuh(kotak.content)) {
    console.warn(
      'Isi partials/sidebar.html tidak lengkap. Memakai salinan bawaan.'
    );

    kotak.innerHTML = SIDEBAR_CADANGAN;
  }

  const home = slot.dataset.home;
  const aktif = slot.dataset.aktif;

  kotak.content.querySelectorAll('nav a[data-p]').forEach(a => {
    if (slot.dataset.mode === 'halaman' && a.dataset.url) {
      // Satu menu = satu file halaman.
      a.setAttribute('href', a.dataset.url);

    } else if (home && !document.getElementById('p-' + a.dataset.p)) {
      // Awali tautan dengan halaman induk hanya bila halaman ini
      // memang tidak memiliki bagian menu tersebut.
      a.setAttribute('href', home + a.getAttribute('href'));
    }

    if (aktif && a.dataset.p === aktif) {
      a.classList.add('on');
      a.setAttribute('aria-current', 'page');
    }
  });

  slot.replaceWith(kotak.content);

  pasangToggle();

  return true;
}