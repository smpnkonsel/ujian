/* Fungsi bantu + data yang dipakai bersama semua halaman */
export const $=id=>document.getElementById(id);
export const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const toDate=v=>!v?null:v.toDate?v.toDate():(typeof v==='number'||typeof v==='string')?new Date(v):null;
export const fmtT=d=>d?d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'–';
export const fmtN=n=>n===null||n===undefined?'–':(Math.round(n*10)/10).toString().replace('.',',');

/* ---------- Toast & konfirmasi di tengah layar ---------- */

(function pasangGaya() {
  if (document.getElementById('gaya-tengah')) return;

  const st = document.createElement('style');
  st.id = 'gaya-tengah';
  st.textContent = `
    .kt-ov{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;
      justify-content:center;padding:20px;background:rgba(10,20,32,.55);
      backdrop-filter:blur(2px);animation:kt-in .15s ease}
    .kt-box{width:100%;max-width:380px;background:var(--panel,#fff);color:var(--ink,#18212C);
      border:1px solid var(--line,#DCE2E9);border-radius:18px;padding:24px 22px 18px;
      text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.28);animation:kt-pop .18s ease}
    .kt-ico{width:52px;height:52px;border-radius:50%;margin:0 auto 12px;display:grid;
      place-items:center;font-size:24px;background:#FDECEC;color:#C0392B}
    .kt-ico.info{background:var(--tint,#EAF0F6);color:var(--navy,#0F3D63)}
    .kt-box h4{margin:0 0 6px;font-size:18px;color:var(--navy,#0F3D63)}
    .kt-box p{margin:0 0 18px;font-size:14.5px;color:var(--soft,#566273);word-break:break-word}
    .kt-act{display:flex;gap:10px}
    .kt-act button{flex:1;padding:11px 14px;border-radius:12px;font:inherit;font-weight:600;
      cursor:pointer;border:1px solid var(--line,#DCE2E9);background:transparent;color:var(--ink,#18212C)}
    .kt-act button.ya{background:var(--btn,#0F3D63);border-color:transparent;color:var(--btn-ink,#fff)}
    .kt-act button.bahaya{background:#C0392B;border-color:transparent;color:#fff}
    .kt-act button:focus-visible{outline:3px solid #D79A2C;outline-offset:2px}

    .kt-toast{position:fixed;left:50%;top:50%;z-index:3500;max-width:min(86vw,340px);
      transform:translate(-50%,-50%);padding:14px 22px;border-radius:14px;text-align:center;
      font-size:14.5px;font-weight:600;line-height:1.4;pointer-events:none;
      background:rgba(15,29,44,.94);color:#fff;box-shadow:0 12px 36px rgba(0,0,0,.35);
      animation:kt-toast .2s ease}
    .kt-toast.keluar{opacity:0;transition:opacity .25s}

    @keyframes kt-in{from{opacity:0}to{opacity:1}}
    @keyframes kt-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
    @keyframes kt-toast{from{opacity:0;transform:translate(-50%,-46%)}to{opacity:1;transform:translate(-50%,-50%)}}
  `;
  document.head.appendChild(st);
})();

/* Toast di tengah layar. */
let timerToast = null;

export function toast(teks) {
  document.querySelectorAll('.kt-toast').forEach(el => el.remove());
  clearTimeout(timerToast);

  const el = document.createElement('div');
  el.className = 'kt-toast';
  el.setAttribute('role', 'status');
  el.textContent = teks;
  document.body.appendChild(el);

  timerToast = setTimeout(() => {
    el.classList.add('keluar');
    setTimeout(() => el.remove(), 260);
  }, 2200);
}

/* Dialog konfirmasi di tengah layar. Mengembalikan Promise<boolean>. */
export function konfirmasi({
  judul = 'Konfirmasi',
  pesan = '',
  ya = 'Ya',
  batal = 'Batal',
  bahaya = false,
  tanpaBatal = false
} = {}) {
  return new Promise(selesai => {
    const ov = document.createElement('div');
    ov.className = 'kt-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');

    ov.innerHTML = `
      <div class="kt-box">
        <div class="kt-ico ${bahaya ? '' : 'info'}" aria-hidden="true">${bahaya ? '🗑' : 'ℹ'}</div>
        <h4>${esc(judul)}</h4>
        <p>${esc(pesan)}</p>
        <div class="kt-act">
          ${tanpaBatal ? '' : `<button type="button" data-n>${esc(batal)}</button>`}
          <button type="button" data-y class="${bahaya ? 'bahaya' : 'ya'}">${esc(ya)}</button>
        </div>
      </div>
    `;

    const tombol = e => {
      if (e.key === 'Escape') tutup(false);
    };

    const tutup = hasil => {
      document.removeEventListener('keydown', tombol);
      ov.remove();
      selesai(hasil);
    };

    ov.addEventListener('click', e => {
      if (e.target === ov && !tanpaBatal) tutup(false);
    });

    ov.querySelector('[data-y]').onclick = () => tutup(true);
    const n = ov.querySelector('[data-n]');
    if (n) n.onclick = () => tutup(false);

    document.addEventListener('keydown', tombol);
    document.body.appendChild(ov);

    // Fokus awal ke tombol aman (Batal) agar tidak tak sengaja menghapus.
    (n || ov.querySelector('[data-y]')).focus();
  });
}

/* State bersama: db & F (fungsi Firestore) diisi oleh halaman.js */
export const S={db:null,F:{},cfg:{},ok:false,TOK:[],HAS:[],FIL:[]};

/* ---------- Seragamkan satu dokumen hasil ujian ----------
   Dipakai dasbor.js dan nilai.js. doc = { id, data: () => objek }.
   Beberapa kemungkinan nama field dibaca supaya tetap jalan walau
   ujian.js memakai nama yang sedikit berbeda. */
const angka=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const pertama=(...a)=>a.find(v=>v!==undefined&&v!==null&&v!=='');

export function norm(doc){
 const d=doc.data()||{};
 const w=toDate(pertama(d.selesai,d.waktu,d.dikumpulkan,d.submittedAt,d.dibuat,d.createdAt));
 return{
  id:doc.id,
  nama:String(pertama(d.nama,d.name,d.siswa,'-')),
  kelas:String(pertama(d.kelas,d.class,'')),
  paket:String(pertama(d.paketNama,d.paket,d.ujian,d.namaUjian,'-')),
  token:String(pertama(d.token,d.kodeToken,'')),
  paketId:String(d.paketId||''),
  benar:angka(pertama(d.benar,d.jumlahBenar,d.correct)),
  salah:angka(pertama(d.salah,d.jumlahSalah,d.wrong)),
  nilai:angka(pertama(d.nilai,d.skor,d.score)),
  waktu:w&&!isNaN(w)?w:null
 };
}