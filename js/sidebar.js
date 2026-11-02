/* =====================================================
   SIDEBAR.JS
   Sidebar dipasang seketika oleh js/sidebar-awal.js (skrip biasa
   di setiap halaman, tepat setelah #sidebar-slot). File ini hanya
   memasang perilaku tombol menu untuk layar kecil.

   Pemakaian di halaman:
     <div id="sidebar-slot" data-mode="halaman" data-aktif="token"></div>
     <script src="js/sidebar-awal.js"></script>
     ...
     <script type="module" src="js/token.js"></script>

   Tombol #burger di halaman (bila ada) dipakai untuk membuka
   dan menutup menu di layar kecil. Bila tidak ada, tombol dibuat
   otomatis.
===================================================== */

let sudahPasang = false;

// Pemasang tombol menu. Memakai #burger milik halaman bila ada;
// bila tidak, membuat tombol sendiri.
function pasangToggle() {
  if (sudahPasang) return;
  sudahPasang = true;

  let tombol = document.getElementById('burger');

  if (!tombol) {
    tombol = document.createElement('button');
    tombol.id = 'sbtoggle';
    tombol.type = 'button';
    tombol.className = 'sb-toggle';
    tombol.setAttribute('aria-label', 'Buka menu');
    tombol.textContent = '\u2630';
    document.body.appendChild(tombol);
  }

  tombol.setAttribute('aria-controls', 'sb');
  tombol.setAttribute('aria-expanded', 'false');

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

// Cadangan: bila halaman lupa memasang <script src="js/sidebar-awal.js">,
// skrip itu dimuat di sini (sidebar tetap tampil, hanya mungkin berkedip).
function muatSkripAwal() {
  return new Promise(selesai => {
    const s = document.createElement('script');
    s.src = new URL('./sidebar-awal.js', import.meta.url);
    s.onload = () => selesai(true);
    s.onerror = () => selesai(false);
    document.head.appendChild(s);
  });
}

export async function muatSidebar() {
  if (!document.getElementById('sb')) {
    console.warn(
      'sidebar-awal.js belum dipasang di halaman ini. ' +
      'Tambahkan <script src="js/sidebar-awal.js"></script> tepat setelah #sidebar-slot.'
    );

    const ok = await muatSkripAwal();

    if (!ok || !document.getElementById('sb')) {
      console.warn('Sidebar tidak dapat dipasang.');
      return false;
    }
  }

  pasangToggle();

  return true;
}