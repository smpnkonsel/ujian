/* Titik awal: memuat konfigurasi, menyambung Firebase, lalu menggambar semua halaman */
import {FB,KOLEKSI_HASIL,bacaConfig} from './config.js';
import {$,esc,S} from './util.js';
import {initNav} from './nav.js';
import {drawPakets} from './soal.js';
import {initToken,openModal,drawTok} from './token.js';
import {initNilai,drawNilai,norm} from './nilai.js';
import {drawDash} from './dasbor.js';

const {cfg,err}=await bacaConfig();
S.cfg=cfg;
S.ok=!!cfg.apiKey&&!/^ISI/.test(cfg.apiKey);

initNav();initToken();initNilai();
drawPakets(openModal);

function peringatan(teks){
 const w=$('cfgwarn');w.classList.remove('hidden');
 w.insertAdjacentHTML('beforeend','<br><small>'+esc(teks)+'</small>');
}

if(!S.ok){
 peringatan('Penyebab: '+(err||'apiKey kosong'));
 $('cs').textContent='Firebase belum terhubung';
 $('tb').innerHTML=$('nb').innerHTML='<tr><td colspan="9" class="empty">Belum terhubung ke Firebase.</td></tr>';
 drawDash();
}else{
 try{
  const [a,fs]=await Promise.all([import(FB+'firebase-app.js'),import(FB+'firebase-firestore.js')]);
  const F=S.F=fs,db=S.db=fs.getFirestore(a.initializeApp(cfg));
  $('dot').classList.add('on');$('cs').textContent='Terhubung: '+cfg.projectId;

  F.onSnapshot(F.query(F.collection(db,'tokens'),F.orderBy('dibuat','desc')),s=>{
   S.TOK=s.docs.map(d=>({id:d.id,...d.data()}));drawTok();drawDash();
  },e=>{$('tb').innerHTML='<tr><td colspan="6" class="empty">Gagal memuat token ('+esc(e.code||'error')+'): '+esc(e.message)+'</td></tr>'});

  F.onSnapshot(F.collection(db,KOLEKSI_HASIL),s=>{
   S.HAS=s.docs.map(norm).sort((a,b)=>(b.waktu||0)-(a.waktu||0));drawNilai();drawDash();
  },e=>{$('nb').innerHTML='<tr><td colspan="9" class="empty">Gagal memuat nilai dari koleksi "'+esc(KOLEKSI_HASIL)+'" ('+esc(e.code||'error')+'). Periksa nama koleksi dan aturan Firestore.</td></tr>'});
 }catch(e){
  $('cs').textContent='Koneksi gagal';peringatan(e.message);
 }
}