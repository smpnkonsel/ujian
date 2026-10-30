/* Fungsi bantu + data yang dipakai bersama semua halaman */
export const $=id=>document.getElementById(id);
export const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const toDate=v=>!v?null:v.toDate?v.toDate():(typeof v==='number'||typeof v==='string')?new Date(v):null;
export const fmtT=d=>d?d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'–';
export const fmtN=n=>n===null||n===undefined?'–':(Math.round(n*10)/10).toString().replace('.',',');

let tt;
export function toast(m){const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2200)}

/* State bersama: db & F (fungsi Firestore) diisi oleh main.js */
export const S={db:null,F:{},cfg:{},ok:false,TOK:[],HAS:[],FIL:[]};