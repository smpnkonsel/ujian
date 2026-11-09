/* =====================================================
   SIDEBAR-AWAL.JS
   Skrip biasa, bukan type="module".

   Satu skrip untuk dua peran:
     data-peran="admin" (bawaan) -> menu admin pusat
     data-peran="guru"           -> menu guru (halaman folder "Dasbor guru")
   Tombol menu (burger) untuk layar kecil dipasang di sini juga.

   Memasang sidebar SEKETIKA saat halaman dibaca.
   Tanpa fetch, sehingga tidak berkedip saat pindah halaman.
   Posisi scroll sidebar disimpan dan dipulihkan di halaman baru,
   jadi menu yang dibuka di bagian bawah tetap terlihat.

   Pasang setelah slot:
   <div id="sidebar-slot"
        data-mode="halaman"
        data-peran="admin"
        data-aktif="dasbor"></div>

   <script src="assets/js/sidebar-awal.js"></script>

   Untuk halaman di dalam folder:
   <script src="../assets/js/sidebar-awal.js"></script>

   Nilai data-aktif:
   dasbor, siswa, guru, kelas, akun, banksoal,
   jadwal, token, ruang, monitoring, aktivitas,
   jawaban, hasil, rekap, firebase, pengaturan.

   Logo: templat/logo.jpeg
===================================================== */

(function () {
  'use strict';

  var slot = document.getElementById('sidebar-slot');

  if (!slot || document.getElementById('sb')) return;

  /* =====================================================
     ALAMAT ROOT PROYEK
  ===================================================== */

  var SKRIP = document.currentScript;

  var BASE = SKRIP && SKRIP.src
    ? new URL('../../', SKRIP.src).href
    : new URL('./', location.href).href;

  function alamat(p) {
    return new URL(
      p.split('/').map(encodeURIComponent).join('/'),
      BASE
    ).href;
  }

  /* =====================================================
     IKON SVG
  ===================================================== */

  var IKON = {

    dasbor:
      '<rect x="3" y="3" width="7.5" height="9" rx="2"/>' +
      '<rect x="13.5" y="3" width="7.5" height="5" rx="2"/>' +
      '<rect x="13.5" y="11" width="7.5" height="10" rx="2"/>' +
      '<rect x="3" y="15" width="7.5" height="6" rx="2"/>',

    siswa:
      '<circle cx="12" cy="8" r="4"/>' +
      '<path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',

    guru:
      '<path d="M2 9l10-5 10 5-10 5z"/>' +
      '<path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',

    kelas:
      '<circle cx="9" cy="8" r="3.5"/>' +
      '<path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/>' +
      '<path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.2.7 3.5 2.3 3.5 5.2"/>',

    akun:
      '<circle cx="12" cy="8" r="4"/>' +
      '<path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' +
      '<path d="M17 4l2 2 3-3"/>',

    banksoal:
      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3v5h5M12 12v6M9 15h6"/>',

    jadwal:
      '<rect x="3" y="5" width="18" height="16" rx="2"/>' +
      '<path d="M3 10h18M8 3v4M16 3v4"/>',

    token:
      '<circle cx="8" cy="15" r="4"/>' +
      '<path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/>',

    ruang:
      '<path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M3 21h18M14.5 12h.5"/>',

    monitoring:
      '<rect x="3" y="4" width="18" height="12" rx="2"/>' +
      '<path d="M8 20h8M12 16v4M6.5 11.5l3-3 2.5 2 4.5-4.5"/>',

    aktivitas:
      '<path d="M3 12h4l3-8 4 16 3-8h4"/>',

    jawaban:
      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3v5h5M9 13h6M9 17h4"/>',

    hasil:
      '<path d="M5 20v-9M12 20V4M19 20v-6"/>',

    rekap:
      '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/>',

    firebase:
      '<ellipse cx="12" cy="6" rx="8" ry="3"/>' +
      '<path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',

    pengaturan:
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',

    logout:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<path d="M16 17l5-5-5-5M21 12H9"/>'

  };

  /* =====================================================
     MENU UTAMA
     Semua menu dikelola dari satu file ini.
  ===================================================== */

  var MENU_ADMIN = [

    [null, [
      ['dasbor', 'Dashboard', 'dasbor.html']
    ]],

    ['Data Master', [
      ['siswa', 'Data Siswa', 'Data Master/siswa.html'],
      ['guru', 'Data Guru', 'Data Master/guru.html'],
      ['kelas', 'Data Kelas', 'Data Master/Kelas.html'],
      ['akun', 'Data Akun', 'Data Master/Akun-guru.html']
    ]],

    ['Manajemen Ujian', [
      ['banksoal', 'Bank Soal', 'Manajemen Ujian/Banksoal.html'],
      ['jadwal', 'Jadwal Ujian', 'Manajemen Ujian/jadwal.html'],
      ['token', 'Token Ujian', 'Manajemen Ujian/token.html']
    ]],

    ['Monitoring', [
      ['ruang', 'Ruang Ujian', 'Monitoring/ruang.html'],
      ['monitoring', 'Monitoring Peserta', 'Monitoring/monitoring.html'],
      ['aktivitas', 'Aktivitas Siswa', 'Monitoring/aktivitas.html']
    ]],

    ['Hasil Ujian', [
      ['jawaban', 'Jawaban Siswa', 'Hasil Ujian/jawaban.html'],
      ['hasil', 'Nilai Ujian', 'Hasil Ujian/hasil.html'],
      ['rekap', 'Rekap Nilai', 'Hasil Ujian/nilai.html'],
      ['reset', 'Reset Ujian Siswa', 'Hasil Ujian/reset.html']
    ]],

    ['Pengaturan', [
      ['firebase', 'Konfigurasi Firebase', 'Pengaturan/firebase.html'],
      ['pengaturan', 'Pengaturan Aplikasi', 'Pengaturan/pengaturan.html'],
      ['data', 'Cadangan & Pemeriksaan Data', 'Pengaturan/data.html']
    ]]

  ];

  var MENU_GURU = [

    [null, [
      ['dasbor', 'Dashboard', 'Dasbor guru/Dasbor-guru.html']
    ]],

    ['Data Master', [
      ['siswa', 'Data Siswa', 'Dasbor guru/siswa.html'],
      ['kelas', 'Data Kelas', 'Dasbor guru/Kelas.html'],
      ['banksoal', 'Bank Soal', 'Dasbor guru/Tambah-paket-guru.html']
    ]],

    ['Monitoring', [
      ['ruang', 'Ruang Ujian', 'Dasbor guru/ruang.html'],
      ['monitoring', 'Monitoring Peserta', 'Dasbor guru/monitoring.html'],
      ['aktivitas', 'Aktivitas Siswa', 'Dasbor guru/aktivitas.html']
    ]],

    ['Hasil Ujian', [
      ['jawaban', 'Jawaban Siswa', 'Dasbor guru/jawaban.html'],
      ['hasil', 'Nilai Ujian', 'Dasbor guru/hasil.html'],
      ['rekap', 'Rekap Nilai', 'Dasbor guru/nilai.html']
    ]]

  ];

  var PERAN = slot.dataset.peran === 'guru' ? 'guru' : 'admin';
  var MENU = PERAN === 'guru' ? MENU_GURU : MENU_ADMIN;
  var BERANDA = PERAN === 'guru' ? 'Dasbor guru/Dasbor-guru.html' : 'dasbor.html';

  /* Nama guru dari sesi login (diisi auth.js) */
  var guru = {};
  try {
    guru = JSON.parse(
      localStorage.getItem('kw_guru') ||
      sessionStorage.getItem('kw_guru') || '{}'
    ) || {};
  } catch (e) { guru = {}; }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var SUBJUDUL = PERAN === 'guru'
    ? esc(guru.nama || 'Guru') + ' · SMPN 20 Konawe Selatan'
    : 'Admin Pusat · SMPN 20 Konawe Selatan';

  /* =====================================================
     PEMBUAT IKON
  ===================================================== */

  function ikon(id) {

    return '<span class="ico" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24">' +
      (IKON[id] || '') +
      '</svg></span>';

  }

  /* =====================================================
     MEMBUAT NAVIGASI
  ===================================================== */

  var nav = '';

  MENU.forEach(function (grup) {

    if (grup[0]) {
      nav += '<p class="grp">' + grup[0] + '</p>';
    }

    grup[1].forEach(function (menu) {

      nav +=
        '<a href="' + alamat(menu[2]) + '" data-p="' + menu[0] + '">' +
        ikon(menu[0]) +
        '<span class="lb">' + menu[1] + '</span>' +
        '</a>';

    });

  });

  /* =====================================================
     LOGOUT
  ===================================================== */

  nav +=
    '<a href="' + alamat('logout.html') + '" ' +
    'class="keluar" id="sb-logout" data-p="logout">' +
    ikon('logout') +
    '<span class="lb">Logout</span>' +
    '</a>';

  /* =====================================================
     HTML SIDEBAR
  ===================================================== */

  var HTML =

    '<aside id="sb" aria-label="Menu utama">' +

      '<a class="brand" href="' + alamat(BERANDA) + '" ' +
      'aria-label="KW Learning — beranda">' +

        '<span class="logo" role="img" aria-label="Logo sekolah"></span>' +

        '<span class="bt">' +
          '<h1>KW Learning</h1>' +
          '<small>' + SUBJUDUL + '</small>' +
        '</span>' +

      '</a>' +

      '<nav>' + nav + '</nav>' +

      '<div class="sbf">' +
        '<span class="dot" id="dot"></span>' +
        '<span id="cs">Memeriksa koneksi…</span>' +
      '</div>' +

    '</aside>' +

    '<div id="scrim"></div>';

  /* =====================================================
     MEMBUAT TEMPLATE
  ===================================================== */

  var kotak = document.createElement('template');

  kotak.innerHTML = HTML;

  /* =====================================================
     MENU AKTIF
  ===================================================== */

  var aktif = slot.dataset.aktif;

  kotak.content.querySelectorAll('nav a[data-p]').forEach(function (a) {

    if (a.dataset.p === 'logout') return;

    if (aktif && a.dataset.p === aktif) {

      a.classList.add('on');

      a.setAttribute('aria-current', 'page');

    }

  });

  /* =====================================================
     STATUS KONEKSI FIREBASE

     Mengambil status terakhir dari sessionStorage.
     Status aktual diperbarui oleh skrip halaman (jika ada).
  ===================================================== */

  var KUNCI_KONEKSI = 'kw_sb_koneksi';

  try {

    var simpan = JSON.parse(
      sessionStorage.getItem(KUNCI_KONEKSI) || 'null'
    );

    if (simpan) {

      var dot = kotak.content.querySelector('#dot');

      var cs = kotak.content.querySelector('#cs');

      if (dot && simpan.on) {
        dot.classList.add('on');
      }

      if (cs && simpan.teks) {
        cs.textContent = simpan.teks;
      }

    }

  } catch (e) {
    // Abaikan jika sessionStorage tidak tersedia.
  }

  /* =====================================================
     MEMASANG SIDEBAR
  ===================================================== */

  slot.replaceWith(kotak.content);

  /* =====================================================
     POSISI SCROLL SIDEBAR

     Sidebar punya scroll sendiri (overflow-y: auto). Setiap
     pindah halaman sidebar dibuat baru sehingga scroll kembali
     ke atas. Posisi disimpan di sessionStorage, lalu dipulihkan
     seketika sebelum halaman digambar.
     Kunjungan pertama (belum ada posisi): menu aktif dibawa
     ke tengah sidebar.
  ===================================================== */

  var KUNCI_SCROLL = 'kw_sb_scroll_' + PERAN;

  var sbEl = document.getElementById('sb');

  if (sbEl) {

    var tersimpan = null;

    try {
      tersimpan = sessionStorage.getItem(KUNCI_SCROLL);
    } catch (e) {
      // Abaikan.
    }

    var pulihkan = function () {

      if (tersimpan !== null) {

        sbEl.scrollTop = parseInt(tersimpan, 10) || 0;

      } else {

        var menuAktif = sbEl.querySelector('nav a.on');

        if (menuAktif) {
          sbEl.scrollTop =
            menuAktif.offsetTop -
            (sbEl.clientHeight / 2) +
            (menuAktif.offsetHeight / 2);
        }

      }

    };

    pulihkan();

    /* Cadangan: bila CSS baru selesai diterapkan setelah skrip jalan */
    document.addEventListener('DOMContentLoaded', function () {

      if (
        tersimpan !== null &&
        sbEl.scrollTop !== (parseInt(tersimpan, 10) || 0)
      ) {
        pulihkan();
      }

    });

    var simpanScroll = function () {

      try {
        sessionStorage.setItem(KUNCI_SCROLL, String(sbEl.scrollTop));
      } catch (e) {
        // Abaikan.
      }

    };

    var menunggu = false;

    sbEl.addEventListener('scroll', function () {

      if (menunggu) return;

      menunggu = true;

      requestAnimationFrame(function () {
        menunggu = false;
        simpanScroll();
      });

    }, { passive: true });

    /* Pastikan tersimpan tepat sebelum pindah halaman */
    sbEl.querySelectorAll('nav a, .brand').forEach(function (a) {
      a.addEventListener('click', simpanScroll);
    });

    window.addEventListener('pagehide', simpanScroll);

  }

  /* =====================================================
     MENYIMPAN PERUBAHAN STATUS KONEKSI

     MutationObserver mengamati:
     1. Perubahan class pada indikator koneksi.
     2. Perubahan teks status koneksi.
  ===================================================== */

  try {

    var dotEl = document.getElementById('dot');

    var csEl = document.getElementById('cs');

    if (dotEl && csEl) {

      var catat = function () {

        try {

          sessionStorage.setItem(
            KUNCI_KONEKSI,
            JSON.stringify({
              on: dotEl.classList.contains('on'),
              teks: csEl.textContent
            })
          );

        } catch (e) {
          // Abaikan.
        }

      };

      var pengamat = new MutationObserver(catat);

      pengamat.observe(dotEl, {
        attributes: true,
        attributeFilter: ['class']
      });

      pengamat.observe(csEl, {
        childList: true,
        characterData: true,
        subtree: true
      });

      // Simpan status awal.
      catat();

    }

  } catch (e) {
    // Abaikan jika MutationObserver tidak tersedia.
  }

  /* =====================================================
     TOMBOL MENU (layar kecil)
     Memakai #burger milik halaman; bila tidak ada, dibuat otomatis.
  ===================================================== */

  function pasangToggle() {

    var tombol = document.getElementById('burger');

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

    function set(buka) {
      document.body.classList.toggle('open', buka);
      tombol.setAttribute('aria-expanded', String(buka));
    }

    tombol.addEventListener('click', function () {
      set(!document.body.classList.contains('open'));
    });

    var scrim = document.getElementById('scrim');
    if (scrim) scrim.addEventListener('click', function () { set(false); });

    document.querySelectorAll('#sb nav a').forEach(function (a) {
      a.addEventListener('click', function () { set(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') set(false);
    });

    if (window.matchMedia) {
      window.matchMedia('(min-width: 821px)').addEventListener('change', function (e) {
        if (e.matches) set(false);
      });
    }
  }

  /* #burger berada di bawah slot, jadi pasang setelah dokumen selesai dibaca. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pasangToggle);
  } else {
    pasangToggle();
  }

  /* =====================================================
     PENANDA SIDEBAR SELESAI DIPASANG
  ===================================================== */

  window.__sidebarAwal = true;
  window.__sidebarToggle = true;

})();