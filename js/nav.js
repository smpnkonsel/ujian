/* =========================================================
   NAV.JS
   Navigasi admin.html: #dasbor, #token, #nilai
   - Berpindah bagian lewat hash (#token, #nilai)
   - Menandai menu sidebar yang aktif
   - Membuka/menutup laci sidebar di HP

   Aman dipakai walau sidebar dimuat belakangan: tombol menu,
   latar gelap, dan tautan ditangani lewat delegasi klik di
   document, jadi tidak bergantung pada elemen yang sudah ada
   saat initNav() dipanggil.
========================================================= */

import { $ } from './util.js';

const JUDUL = {
  dasbor: 'Dasbor',
  token: 'Pembuat token',
  nilai: 'Unduh nilai'
};

const tutupMenu = () => document.body.classList.remove('open');

function route() {
  const hash = location.hash.slice(1);
  const p = JUDUL[hash] ? hash : 'dasbor';

  document.querySelectorAll('.pg').forEach(e =>
    e.classList.toggle('on', e.id === 'p-' + p)
  );

  document.querySelectorAll('nav a[data-p]').forEach(a =>
    a.classList.toggle('on', a.dataset.p === p)
  );

  const judul = $('ttl');
  if (judul) judul.textContent = JUDUL[p];

  tutupMenu();
  scrollTo(0, 0);
}

export function initNav() {
  addEventListener('hashchange', route);
  route();

  // Satu pendengar untuk burger, latar gelap, dan tautan menu.
  document.addEventListener('click', e => {
    if (e.target.closest('#burger')) {
      document.body.classList.toggle('open');
      return;
    }

    if (e.target.closest('#scrim') || e.target.closest('#sb nav a')) {
      tutupMenu();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') tutupMenu();
  });
}