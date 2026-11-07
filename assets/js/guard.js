/* =========================================================
   GUARD.JS — penjaga halaman berdasarkan peran

   Pasang di <head> halaman (bukan di halaman login/ujian):
     <script>document.documentElement.style.visibility='hidden'</script>
     <script type="module" src="../assets/js/guard.js" data-peran="admin"></script>

   Halaman disembunyikan sampai peran terverifikasi, lalu
   ditampilkan. Bila belum login atau peran tidak cocok, pengguna
   dialihkan ke login atau ke dasbornya sendiri.
========================================================= */
import { jaga } from './auth.js';

const tag = document.querySelector('script[data-peran]');
const peran = (tag && tag.dataset.peran) || 'admin';

const tampil = () => { document.documentElement.style.visibility = ''; };

/* Jaring pengaman: jangan biarkan halaman kosong selamanya. */
const batas = setTimeout(() => {
  console.warn('Pemeriksaan login terlalu lama.');
  tampil();
}, 15000);

jaga(peran).then(sesi => {
  clearTimeout(batas);
  window.KW_SESI = sesi;
  document.dispatchEvent(new CustomEvent('kw-sesi', { detail: sesi }));
  tampil();
});
