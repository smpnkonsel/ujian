/* =====================================================
   SIDEBAR-AWAL.JS  (skrip BIASA, bukan type="module")
   Memasang sidebar SEKETIKA saat halaman dibaca, sebelum
   browser menggambar layar pertama. Tidak ada fetch, jadi
   sidebar tidak berkedip saat pindah halaman.

   Pasang tepat SETELAH slot di setiap halaman:
     <div id="sidebar-slot" data-mode="halaman" data-aktif="token"></div>
     <script src="js/sidebar-awal.js"></script>

   Menu diubah di file ini (satu-satunya sumber menu).
   Logo sekolah: templat/logo.jpeg (diatur di css/sidebar.css).
===================================================== */
(function () {
  var slot = document.getElementById('sidebar-slot');
  if (!slot || document.getElementById('sb')) return;

  var HTML = '' +
'<aside id="sb" aria-label="Menu utama">' +
' <a class="brand" href="index.html" aria-label="KW Learning — beranda">' +
'  <span class="logo" role="img" aria-label="Logo sekolah"></span>' +
'  <span class="bt">' +
'   <h1>KW Learning</h1>' +
'   <small>Panel Guru · SMPN 20 Konawe Selatan</small>' +
'  </span>' +
' </a>' +
' <nav>' +
'  <a href="dasbor.html" data-p="dasbor" data-url="dasbor.html">' +
'   <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="9" rx="2"/><rect x="13.5" y="3" width="7.5" height="5" rx="2"/><rect x="13.5" y="11" width="7.5" height="10" rx="2"/><rect x="3" y="15" width="7.5" height="6" rx="2"/></svg></span>' +
'   <span class="lb">Dasbor</span>' +
'  </a>' +
'  <a href="paket.html" data-p="paket" data-url="paket.html">' +
'   <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9 15h6"/></svg></span>' +
'   <span class="lb">Tambah paket soal</span>' +
'  </a>' +
'  <a href="token.html" data-p="token" data-url="token.html">' +
'   <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/></svg></span>' +
'   <span class="lb">Buat token</span>' +
'  </a>' +
'  <a href="nilai.html" data-p="nilai" data-url="nilai.html">' +
'   <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/></svg></span>' +
'   <span class="lb">Unduh nilai</span>' +
'  </a>' +
' </nav>' +
' <div class="sbf">' +
'  <span class="dot" id="dot"></span>' +
'  <span id="cs">Memeriksa koneksi…</span>' +
' </div>' +
'</aside>' +
'<div id="scrim"></div>';

  var kotak = document.createElement('template');
  kotak.innerHTML = HTML;

  var aktif = slot.dataset.aktif;
  var modeHalaman = slot.dataset.mode === 'halaman';

  kotak.content.querySelectorAll('nav a[data-p]').forEach(function (a) {
    if (modeHalaman && a.dataset.url) a.setAttribute('href', a.dataset.url);
    if (aktif && a.dataset.p === aktif) {
      a.classList.add('on');
      a.setAttribute('aria-current', 'page');
    }
  });

  /* Status koneksi: tampilkan keadaan terakhir yang diketahui,
     jadi titik hijau tidak berkedip dari abu-abu tiap pindah halaman.
     Nilai asli tetap diperbarui oleh halaman.js seperti biasa. */
  var KUNCI = 'kw_sb_koneksi';
  try {
    var simpan = JSON.parse(sessionStorage.getItem(KUNCI) || 'null');
    if (simpan) {
      var dot = kotak.content.getElementById
        ? kotak.content.getElementById('dot')
        : kotak.content.querySelector('#dot');
      var cs = kotak.content.querySelector('#cs');
      if (dot && simpan.on) dot.classList.add('on');
      if (cs && simpan.teks) cs.textContent = simpan.teks;
    }
  } catch (e) { /* abaikan */ }

  slot.replaceWith(kotak.content);

  try {
    var dotEl = document.getElementById('dot');
    var csEl = document.getElementById('cs');

    var catat = function () {
      try {
        sessionStorage.setItem(KUNCI, JSON.stringify({
          on: dotEl.classList.contains('on'),
          teks: csEl.textContent
        }));
      } catch (e) { /* abaikan */ }
    };

    var pengamat = new MutationObserver(catat);
    pengamat.observe(dotEl, { attributes: true, attributeFilter: ['class'] });
    pengamat.observe(csEl, { childList: true, characterData: true, subtree: true });
  } catch (e) { /* abaikan */ }

  window.__sidebarAwal = true;
})();