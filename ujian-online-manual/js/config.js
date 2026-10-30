/* PENGATURAN — ubah di sini bila menambah soal atau mengganti nama koleksi */

// Nama koleksi Firestore tempat ujian.html menyimpan nilai peserta
export const KOLEKSI_HASIL='hasil';

// Daftar soal = isi folder soal2 (nama file harus persis sama, hanya .docx)
export const PAKET=[
 {id:'info8',nama:'Informatika Kelas 8 — PAS Semester 1',file:'soal2/SOAL PAS INFO KLS 8 S1.docx',menit:90},
 {id:'ipa7',nama:'IPA Kelas 7 — PAS Semester 1',file:'soal2/SOAL PAS ipa  KLS 7 S1.docx',menit:90},
 {id:'pjok8',nama:'PJOK Kelas 8',file:'soal2/PJOK KELAS 8.docx',menit:90}
];

export const FB='https://www.gstatic.com/firebasejs/10.12.2/';

// Membaca js/firebaseConfig.js (objek { apiKey: ..., ... })
export async function bacaConfig(){
 try{
  const r=await fetch('./js/firebaseConfig.js?v='+Date.now());
  if(!r.ok)throw new Error('berkas js/firebaseConfig.js tidak ditemukan ('+r.status+')');
  const t=await r.text(),i=t.indexOf('apiKey');
  if(i<0)throw new Error('kata apiKey tidak ada di js/firebaseConfig.js');
  const s=t.lastIndexOf('{',i);let d=0,e=-1;
  for(let k=s;k<t.length;k++){if(t[k]==='{')d++;else if(t[k]==='}'&&--d===0){e=k;break}}
  if(e<0)throw new Error('tanda kurung { } pada konfigurasi tidak lengkap');
  return {cfg:new Function('return ('+t.slice(s,e+1)+')')(),err:''};
 }catch(e){return {cfg:{},err:e.message}}
}