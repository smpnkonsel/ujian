/* Halaman Unduh nilai: normalisasi data, filter, ringkasan, unduh CSV */
import {$,esc,fmtT,fmtN,toDate,toast,S} from './util.js';

/* Ubah dokumen Firestore jadi bentuk seragam.
   Bila field di ujian.html berbeda, sesuaikan nama field di sini. */
export const norm=d=>{
 const x=d.data(),n=+(x.nilai??x.skor??x.score);
 return {
  nama:x.nama??x.name??'(tanpa nama)',
  kelas:x.kelas??'',
  paket:x.paketNama??x.ujian??x.paket??'',
  token:x.token??'',
  benar:x.benar??x.jumlahBenar??'',
  salah:x.salah??x.jumlahSalah??'',
  nilai:isNaN(n)?null:n,
  waktu:toDate(x.selesai??x.waktu??x.dikumpulkan??x.dibuat??x.submittedAt)
 };
};

function fillOpts(id,vals,all){
 const s=$(id),v=s.value;
 s.innerHTML=`<option value="">${all}</option>`+[...new Set(vals.filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join('');
 s.value=v;
}

export function drawNilai(){
 const {HAS}=S;
 fillOpts('fu',HAS.map(h=>h.paket),'Semua ujian');fillOpts('fk',HAS.map(h=>h.kelas),'Semua kelas');
 const u=$('fu').value,k=$('fk').value,q=$('fq').value.trim().toLowerCase();
 S.FIL=HAS.filter(h=>(!u||h.paket===u)&&(!k||h.kelas===k)&&(!q||h.nama.toLowerCase().includes(q)));
 const FIL=S.FIL,ns=FIL.map(h=>h.nilai).filter(n=>n!==null),avg=ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;
 $('n1').textContent=FIL.length;$('n2').textContent=fmtN(avg);
 $('n3').textContent=ns.length?fmtN(Math.max(...ns)):'–';$('n4').textContent=ns.length?fmtN(Math.min(...ns)):'–';
 $('dl').disabled=!FIL.length;
 $('nb').innerHTML=FIL.length?FIL.map((h,i)=>`<tr><td>${i+1}</td><td>${esc(h.nama)}</td><td>${esc(h.kelas)}</td><td>${esc(h.paket)}</td><td class="tk">${esc(h.token)}</td><td>${esc(h.benar)}</td><td>${esc(h.salah)}</td><td><b>${fmtN(h.nilai)}</b></td><td>${fmtT(h.waktu)}</td></tr>`).join('')
  :`<tr><td colspan="9" class="empty">${HAS.length?'Tidak ada data yang cocok dengan filter.':'Belum ada peserta yang mengumpulkan jawaban.'}</td></tr>`;
}

/* CSV dengan pemisah ';' dan penanda UTF-8 agar rapi di Excel berbahasa Indonesia */
function unduh(){
 const c=v=>'"'+String(v??'').replace(/"/g,'""')+'"',H=['No','Nama','Kelas','Ujian','Token','Benar','Salah','Nilai','Waktu'];
 const rows=S.FIL.map((h,i)=>[i+1,h.nama,h.kelas,h.paket,h.token,h.benar,h.salah,h.nilai??'',fmtT(h.waktu)].map(c).join(';'));
 const blob=new Blob(['\uFEFF'+[H.map(c).join(';'),...rows].join('\r\n')],{type:'text/csv;charset=utf-8'});
 const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'nilai-ujian-'+new Date().toISOString().slice(0,10)+'.csv'});
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast('Unduhan dimulai');
}

export function initNilai(){
 ['fu','fk'].forEach(i=>$(i).onchange=drawNilai);
 $('fq').oninput=drawNilai;
 $('dl').onclick=unduh;
}