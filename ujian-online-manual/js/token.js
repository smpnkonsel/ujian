/* Halaman Pembuat token: modal buat token + tabel daftar token */
import {PAKET} from './config.js';
import {$,esc,fmtT,toDate,toast,S} from './util.js';

const CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const gen=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>CH[n%CH.length]).join('');
let sel=null;

export function openModal(i){
 sel=PAKET[i];$('mnm').textContent=sel.nama;$('mw').value=sel.menit;$('mt').value=gen();$('mk').value='';
 $('merr').classList.add('hidden');$('mo').classList.remove('hidden');$('mw').focus();
}

async function simpan(){
 const {db,F}=S,m=Math.round(+$('mw').value),t=$('mt').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,''),er=$('merr');
 const fail=x=>{er.textContent=x;er.classList.remove('hidden')};
 if(!(m>=1&&m<=600))return fail('Waktu harus 1–600 menit.');
 if(t.length<4)return fail('Token minimal 4 karakter huruf/angka.');
 $('ms').disabled=true;
 try{
  const ref=F.doc(db,'tokens',t);
  if((await F.getDoc(ref)).exists())throw new Error('Token '+t+' sudah ada. Gunakan kode lain.');
  await F.setDoc(ref,{token:t,paketId:sel.id,paketNama:sel.nama,file:sel.file,menit:m,kunci:$('mk').value.replace(/\s/g,'').toUpperCase().replace(/[^A-E-]/g,''),aktif:true,dibuat:F.serverTimestamp()});
  $('mo').classList.add('hidden');toast('Token '+t+' disimpan');
 }catch(e){fail(e.message)}finally{$('ms').disabled=false}
}

export function drawTok(){
 const {db,F,TOK}=S,q=$('ftk').value.trim().toLowerCase(),L=TOK.filter(x=>!q||(x.id+' '+x.paketNama).toLowerCase().includes(q));
 $('tb').innerHTML=L.length?L.map(x=>`<tr><td class="tk">${esc(x.id)}</td><td>${esc(x.paketNama)}</td><td>${esc(x.menit)} menit</td><td><span class="badge ${x.aktif?'on':'off'}">${x.aktif?'Aktif':'Nonaktif'}</span></td><td>${fmtT(toDate(x.dibuat))}</td>
  <td><div class="acts"><button class="btn" data-c="${esc(x.id)}">Salin</button><button class="btn" data-a="${esc(x.id)}" data-s="${x.aktif?1:0}">${x.aktif?'Nonaktifkan':'Aktifkan'}</button><button class="btn d" data-x="${esc(x.id)}">Hapus</button></div></td></tr>`).join('')
  :`<tr><td colspan="6" class="empty">${TOK.length?'Tidak ada token yang cocok.':'Belum ada token. Pilih paket soal di atas lalu klik Buat token.'}</td></tr>`;
 document.querySelectorAll('[data-c]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.c);toast('Token disalin')}catch(e){prompt('Salin token:',b.dataset.c)}});
 document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>F.updateDoc(F.doc(db,'tokens',b.dataset.a),{aktif:b.dataset.s!=='1'}));
 document.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>confirm('Hapus token '+b.dataset.x+'?')&&F.deleteDoc(F.doc(db,'tokens',b.dataset.x)));
}

export function initToken(){
 $('mc').onclick=()=>$('mo').classList.add('hidden');
 $('ms').onclick=simpan;
 $('ftk').oninput=drawTok;
}