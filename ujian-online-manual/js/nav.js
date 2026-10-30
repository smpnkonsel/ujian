/* Navigasi sidebar (#dasbor, #token, #nilai) */
import {$} from './util.js';

const JUDUL={dasbor:'Dasbor',token:'Pembuat token',nilai:'Unduh nilai'};

function route(){
 const p=JUDUL[location.hash.slice(1)]?location.hash.slice(1):'dasbor';
 document.querySelectorAll('.pg').forEach(e=>e.classList.toggle('on',e.id==='p-'+p));
 document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('on',a.dataset.p===p));
 $('ttl').textContent=JUDUL[p];
 document.body.classList.remove('open');scrollTo(0,0);
}

export function initNav(){
 addEventListener('hashchange',route);route();
 $('burger').onclick=()=>document.body.classList.toggle('open');
 $('scrim').onclick=()=>document.body.classList.remove('open');
}