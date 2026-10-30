/* Ujian online — KW Learning */

/* ====== PENGATURAN ====== */
// true  = siswa langsung melihat nilai di modal hasil (kunci dibaca dari koleksi "kunci")
// false = siswa hanya melihat "jawaban terkirim"; kunci tidak pernah dikirim ke browser siswa
const TAMPILKAN_NILAI=true;
const KOLEKSI_HASIL='hasil',KOLEKSI_KUNCI='kunci';
/* ======================== */

let firebaseConfig={},cfgErr='';
try{
 const r=await fetch('./js/firebaseConfig.js?v='+Date.now());if(!r.ok)throw new Error('berkas js/firebaseConfig.js tidak ditemukan ('+r.status+')');
 const t=await r.text(),i=t.indexOf('apiKey');if(i<0)throw new Error('kata apiKey tidak ada di dalam js/firebaseConfig.js');
 const s=t.lastIndexOf('{',i);let d=0,e=-1;for(let k=s;k<t.length;k++){if(t[k]==='{')d++;else if(t[k]==='}'&&--d===0){e=k;break}}
 if(e<0)throw new Error('tanda kurung { } pada konfigurasi tidak lengkap');
 firebaseConfig=new Function('return ('+t.slice(s,e+1)+')')();
}catch(e){cfgErr=e.message}

const FB='https://www.gstatic.com/firebasejs/10.12.2/',KEY='ujian-kw-v4',HURUF='ABCDE',RING=339.3;
const $=id=>document.getElementById(id),panel=$('panel'),ng=$('ng');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const show=id=>$(id).classList.remove('hidden'),hide=id=>$(id).classList.add('hidden');
const cfgOk=!!firebaseConfig.apiKey&&!/^ISI/.test(firebaseConfig.apiKey);
const baru=n=>({cur:0,ans:new Array(n).fill(null),flag:new Array(n).fill(false),done:false,saved:false});
let db=null,F=null,S=null,Q=[],state=baru(0),endAt=0,tick=null,running=false;
const CEK='<svg viewBox="0 0 24 24" fill="none" stroke="#2F9E5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- Pembaca soal Word ---------- */
const RE_OPT=/^((?:<[^>]+>)*)\(?([A-Ea-e])[.)]\s*/,RE_NUM=/^((?:<[^>]+>)*)\d+\s*[.)]\s*/,RE_KEY=/^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:=]\s*\(?([A-Ea-e])\)?/i,RE_KEYHEAD=/^kunci\s*jawaban/i,RE_SKIP=/^(pembahasan|level|tingkat|topik|skor|bobot)\s*[:=]/i;
const PAIR=/(\d+)\s*[.):\-]?\s*([A-Ea-e])(?![a-z])/g;
function optSegs(h){const r=[];for(const s of h.split(/\t+/)){if(!s.replace(/<[^>]+>/g,'').trim()&&!/<img/.test(s))continue;const m=s.match(RE_OPT);
 if(m)r.push({l:m[2].toUpperCase(),h:s.replace(RE_OPT,'$1').trim()});else if(r.length)r[r.length-1].h+=' '+s.trim()}return r}
function parseSoal(html,kunci){
 const d=new DOMParser().parseFromString(html,'text/html');
 const bl=[...d.body.querySelectorAll('p,li')].map(e=>({h:e.innerHTML.trim(),t:e.textContent.trim()})).filter(b=>b.t||/<img/.test(b.h));
 const out=[],pairs=[];let c=null,km=false;
 const scan=t=>{let m;PAIR.lastIndex=0;while((m=PAIR.exec(t)))pairs.push([+m[1],m[2]])};
 for(const b of bl){
  if(km){scan(b.t);continue}
  const k=b.t.match(RE_KEY);if(k){if(c)c.key=k[1].toUpperCase();continue}
  if(RE_KEYHEAD.test(b.t)){km=true;scan(b.t);continue}
  if(RE_SKIP.test(b.t))continue;
  if(c&&!b.t){if(c.o.length)c.o[c.o.length-1].h+=' '+b.h;else c.q+='<br>'+b.h;continue}
  if(c&&RE_OPT.test(b.h)){optSegs(b.h).forEach(o=>c.o.push(o));continue}
  if(RE_NUM.test(b.h)){c={q:b.h.replace(RE_NUM,'$1'),o:[],key:null};out.push(c);continue}
  if(!c||c.o.length>=2){c={q:b.h,o:[],key:null};out.push(c);continue}
  if(c.o.length===0)c.q+='<br>'+b.h;else c.o[c.o.length-1].h+=' '+b.h}
 const qs=out.filter(q=>q.o.length>=2);qs.forEach(q=>q.o.sort((a,b)=>a.l<b.l?-1:1));
 pairs.forEach(([n,l])=>{if(qs[n-1]&&!qs[n-1].key)qs[n-1].key=l.toUpperCase()});
 const ks=kunci?[...String(kunci).replace(/\s/g,'').toUpperCase()]:[];
 return qs.map((q,i)=>{const l=q.key||(ks[i]&&ks[i]!=='-'?ks[i]:null),L=q.o.map(o=>o.l),c=l?L.indexOf(l):-1;
  return{q:q.q.replace(/^\s+/,''),opts:q.o.map(o=>o.h),correct:c>=0?c:null}});
}

/* ---------- Timer & penyimpanan sesi ---------- */
function save(){try{localStorage.setItem(KEY,JSON.stringify({S,endAt,ans:state.ans,flag:state.flag,cur:state.cur,done:state.done,saved:state.saved}))}catch(e){}}
function clearSave(){try{localStorage.removeItem(KEY)}catch(e){}}
function fmtT(s){const h=Math.floor(s/3600),m=Math.floor(s%3600/60),c=s%60;return h+':'+String(m).padStart(2,'0')+':'+String(c).padStart(2,'0')}
function tickFn(){const r=Math.max(0,Math.ceil((endAt-Date.now())/1000));$('tv').textContent=fmtT(r);
 $('tmr').className='timer'+(r<=300?' crit':r<=600?' warn':'');
 if(r<=0){hide('mo');selesai()}}
function startTimer(resume){if(!resume)endAt=Date.now()+S.menit*60*1000;running=true;save();clearInterval(tick);tick=setInterval(tickFn,250);tickFn()}
const sheet=o=>{$('side').classList.toggle('open',o);$('scrim').classList.toggle('on',o)};
$('qs').onclick=()=>sheet(!$('side').classList.contains('open'));$('scrim').onclick=()=>sheet(false);
$('okb').onclick=()=>{hide('intro');startTimer()};
$('fin').onclick=()=>keluar();
$('i6').textContent=TAMPILKAN_NILAI?'Setelah dikumpulkan, hasilmu langsung ditampilkan.':'Setelah dikumpulkan, nilai akan diumumkan oleh guru.';
addEventListener('beforeunload',e=>{if(running){e.preventDefault();e.returnValue=''}});
addEventListener('keydown',e=>{
 if(!running)return;
 if(e.key==='F5'||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='r')){e.preventDefault();return}
 if(document.querySelector('.mo:not(.hidden)')||!Q.length)return;
 const k='abcde'.indexOf(e.key.toLowerCase());
 if(e.key.length===1&&k>=0&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(k<Q[state.cur].opts.length)pilih(k);return}
 if(document.activeElement&&document.activeElement.type==='radio')return;
 if(e.key==='ArrowRight'&&state.cur<Q.length-1){state.cur++;render()}
 if(e.key==='ArrowLeft'&&state.cur>0){state.cur--;render()}
});

/* ---------- Layar masuk token ---------- */
function showGate(msg){
 running=false;clearInterval(tick);S=null;Q=[];sheet(false);
 ['side','tmr','fin','qs','intro','mo','hasil'].forEach(hide);
 $('ttl').textContent='Ujian Online';$('sub').textContent='Masukkan token dari guru untuk memulai ujian.';
 panel.innerHTML=`<div class="gate"><div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="#D79A2C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4" fill="#D79A2C"/></svg></div>
 <h2>Masuk Ujian</h2><p>Isi data dirimu dan token yang diberikan guru.</p>
 <form class="gc" id="gf" autocomplete="off">
  <label for="gn">Nama lengkap</label><input id="gn" maxlength="60" required>
  <label for="gk">Kelas</label><input id="gk" maxlength="12" placeholder="mis. 8A" required>
  <label for="gt">Token ujian</label><input id="gt" class="tk" maxlength="12" placeholder="••••••" required>
  <div id="ge" class="msg err ${msg?'':'hidden'}">${esc(msg||'')}</div>
  ${cfgOk?'':'<div class="msg warn">Konfigurasi Firebase belum terbaca. Hubungi guru.<br><small>Penyebab: '+esc(cfgErr||'apiKey kosong')+'</small></div>'}
  <button class="bp" id="gb" type="submit" ${cfgOk?'':'disabled'}>Masuk Ujian</button></form>
 <div class="foot">SMP Negeri 20 Konawe Selatan</div></div>`;
 $('gf').onsubmit=e=>{e.preventDefault();masuk()};$('gt').focus();
}
async function masuk(){
 const nama=$('gn').value.trim(),kelas=$('gk').value.trim().toUpperCase(),tok=$('gt').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,''),er=$('ge'),b=$('gb');
 const fail=x=>{er.textContent=x;er.classList.remove('hidden');b.disabled=false;b.textContent='Masuk Ujian'};
 if(!nama||!kelas||tok.length<4)return fail('Lengkapi nama, kelas, dan token.');
 b.disabled=true;b.textContent='Memeriksa token…';
 try{
  const s=await F.getDoc(F.doc(db,'tokens',tok));
  if(!s.exists())return fail('Token tidak ditemukan. Periksa kembali kodenya.');
  const t=s.data();if(!t.aktif)return fail('Token ini sedang tidak aktif. Hubungi guru.');
  let kunci='';
  if(TAMPILKAN_NILAI){
   kunci=t.kunci||'';  // token lama: kunci masih di dokumen token
   try{const k=await F.getDoc(F.doc(db,KOLEKSI_KUNCI,tok));if(k.exists())kunci=k.data().kunci||kunci}catch(e){}
  }
  S={tok,nama,kelas,paketNama:t.paketNama,file:t.file,menit:t.menit,kunci};
 }catch(e){return fail('Tidak dapat terhubung ke server. Periksa koneksi internet.')}
 b.textContent='Memuat soal…';
 const err=await loadSoal();
 if(err)return fail(err);
 show('intro');
}

/* ---------- Memuat soal sesuai token ---------- */
async function loadSoal(saved){
 try{
  if(location.protocol==='file:')throw new Error('Halaman harus dibuka lewat server (Live Server / GitHub Pages), bukan klik ganda.');
  const r=await fetch(encodeURI(S.file)+'?v='+Date.now());if(!r.ok)throw new Error('Berkas soal tidak ditemukan. Hubungi guru.');
  Q=parseSoal((await mammoth.convertToHtml({arrayBuffer:await r.arrayBuffer()})).value,S.kunci);
  if(!Q.length)throw new Error('Soal tidak terbaca. Hubungi guru.');
  if(!TAMPILKAN_NILAI)Q.forEach(q=>q.correct=null);
 }catch(e){return e.message}
 state=baru(Q.length);
 ng.innerHTML='';Q.forEach((q,k)=>{const b=document.createElement('button');b.className='nc';b.textContent=k+1;b.setAttribute('aria-label','Soal '+(k+1));b.onclick=()=>{state.cur=k;render();sheet(false)};ng.appendChild(b)});
 $('ttl').textContent=S.paketNama;$('sub').textContent=Q.length+' soal pilihan ganda · waktu '+S.menit+' menit. Jawaban bisa diubah sebelum dikumpulkan.';
 $('wn').textContent=S.nama;$('wk').textContent='Kelas '+S.kelas+' · Token '+S.tok;
 $('jq').textContent=Q.length;$('dm').textContent=S.menit;$('tv').textContent=fmtT(S.menit*60);$('tmr').className='timer';
 show('side');show('tmr');show('qs');hide('fin');
 if(saved&&Array.isArray(saved.ans)&&saved.ans.length===Q.length){
  state.ans=saved.ans;state.cur=saved.cur||0;state.saved=!!saved.saved;endAt=saved.endAt;
  if(Array.isArray(saved.flag)&&saved.flag.length===Q.length)state.flag=saved.flag;
  if(saved.done||Date.now()>=endAt){selesai();return null}
  startTimer(true)}
 render();return null;
}

/* ---------- Tampilan soal ---------- */
function upd(){
 const n=state.ans.filter(a=>a!==null).length,f=state.flag.filter(Boolean).length;
 $('pf').style.width=Math.round(n/Q.length*100)+'%';
 $('pl').textContent=n+' dari '+Q.length+' soal terjawab'+(f?' · '+f+' ditandai':'');
 ng.querySelectorAll('.nc').forEach((c,i)=>{c.classList.toggle('a',state.ans[i]!==null);c.classList.toggle('f',state.flag[i]);c.classList.toggle('cur',i===state.cur&&!state.done)});
}
function pilih(k){const r=panel.querySelectorAll('input[type=radio]')[k];if(r){r.checked=true;r.dispatchEvent(new Event('change'))}}
function question(){
 const i=state.cur,q=Q[i],a=state.ans[i],fl=state.flag[i];
 panel.innerHTML=`<div class="card"><div class="qh"><span class="qn">Soal ${i+1} <small>dari ${Q.length}</small></span>
 <button type="button" class="flag${fl?' on':''}" id="fl" aria-pressed="${fl}">${fl?'Ditandai ragu-ragu':'Tandai ragu-ragu'}</button></div>
 <p class="qt">${q.q}</p>
 <fieldset><legend class="sr">Pilihan jawaban</legend>${q.opts.map((o,k)=>`<label class="opt${a===k?' sel':''}"><input type="radio" name="o" value="${k}" ${a===k?'checked':''}><span class="ol">${HURUF[k]}</span><span>${o}</span></label>`).join('')}</fieldset>
 <div class="nb"><button class="bg" id="pv" ${i?'':'disabled'}>Sebelumnya</button><button class="bp" id="nx">${i===Q.length-1?'Ke ringkasan':'Berikutnya'}</button></div></div>`;
 panel.querySelectorAll('input').forEach(x=>x.onchange=e=>{state.ans[i]=+e.target.value;upd();save();panel.querySelectorAll('.opt').forEach((l,k)=>l.classList.toggle('sel',k===state.ans[i]))});
 $('fl').onclick=()=>{state.flag[i]=!state.flag[i];const b=$('fl');b.classList.toggle('on',state.flag[i]);b.setAttribute('aria-pressed',state.flag[i]);b.textContent=state.flag[i]?'Ditandai ragu-ragu':'Tandai ragu-ragu';upd();save()};
 $('pv').onclick=()=>{state.cur--;render()};
 $('nx').onclick=()=>i===Q.length-1?submit():(state.cur++,render());
}
function render(){if(state.done)return;question();upd();if(running)save();panel.scrollTo({top:0})}

/* ---------- Mengumpulkan ---------- */
function confirmBox(msg,ok){$('mm').textContent=msg;show('mo');
 const y=$('yes'),n=$('no'),off=()=>{hide('mo');y.onclick=n.onclick=null};y.onclick=()=>{off();ok()};n.onclick=off}
function submit(){
 const un=state.ans.filter(a=>a===null).length,rg=state.flag.filter(Boolean).length,m=[];
 if(un)m.push('masih ada '+un+' soal belum dijawab');if(rg)m.push(rg+' soal ditandai ragu-ragu');
 confirmBox(m.length?'Perhatian: '+m.join(' dan ')+'. Tetap kumpulkan jawaban?':'Semua soal sudah dijawab. Kumpulkan sekarang? Jawaban tidak bisa diubah lagi.',selesai);
}
$('bs').onclick=submit;

function hitung(){
 let ben=0,sal=0,kos=0,K=0;
 Q.forEach((q,i)=>{const a=state.ans[i];if(a===null)kos++;if(q.correct===null)return;K++;if(a===q.correct)ben++;else if(a!==null)sal++});
 return{ben,sal,kos,K,sc:K?Math.round(ben/K*100):null};
}
function selesai(){
 clearInterval(tick);running=false;state.done=true;sheet(false);
 ['tmr','side','qs'].forEach(hide);show('fin');save();
 panel.innerHTML=`<div class="gate"><div class="logo">${CEK}</div><h2>Ujian selesai</h2><p>Jawabanmu sudah dikumpulkan.</p>
 <div class="sv note"></div><div class="acts2"><button class="bg" id="lh">Lihat hasil</button><button class="bp" id="kx">Selesai &amp; keluar</button></div></div>`;
 $('lh').onclick=showHasil;$('kx').onclick=keluar;
 showHasil();
 if(state.saved)setSv('ok','Hasil tersimpan.');else kirim();
}
function keluar(){
 if(!state.saved&&!confirm('Hasil belum tersimpan ke server. Tetap keluar?'))return;
 hide('hasil');clearSave();showGate();
}

/* ---------- Modal hasil ---------- */
function showHasil(){
 const h=hitung(),tampil=TAMPILKAN_NILAI&&h.K>0;let atas;
 if(tampil){
  const col=h.sc>=75?'#2F9E5B':h.sc>=50?'#D79A2C':'#C0392B',
   pesan=h.sc>=80?'Hebat! Hasil yang sangat baik.':h.sc>=60?'Cukup baik. Terus belajar ya.':'Jangan menyerah, pelajari lagi materinya.';
  atas=`<svg class="ring" viewBox="0 0 132 132" role="img" aria-label="Nilai ${h.sc}"><circle class="rb" cx="66" cy="66" r="54"/><circle class="rf" id="rg" cx="66" cy="66" r="54" style="stroke:${col};stroke-dasharray:${RING};stroke-dashoffset:${RING}"/><text class="rn" x="66" y="80" text-anchor="middle" fill="${col}">${h.sc}</text></svg>
  <p class="pesan">${pesan}</p>
  <div class="stats3"><div><b>${h.ben}</b><span>Benar</span></div><div><b>${h.sal}</b><span>Salah</span></div><div><b>${h.kos}</b><span>Kosong</span></div></div>`;
 }else{
  atas=`<div class="okc">${CEK}</div><p class="pesan">Jawabanmu sudah terkirim. Nilai akan diumumkan oleh guru.</p>
  <div class="stats3"><div><b>${Q.length-h.kos}</b><span>Dijawab</span></div><div><b>${h.kos}</b><span>Kosong</span></div></div>`;
 }
 $('hs').innerHTML=`<h3 id="hh">Hasil ujian</h3><p class="who2">${esc(S.nama)} · Kelas ${esc(S.kelas)}</p>${atas}
 <div class="sv note"></div>
 <div class="ma"><button class="bg hidden" id="rt">Kirim ulang</button><button class="bg" id="tp">Tutup</button><button class="bp" id="kl">Selesai</button></div>`;
 $('tp').onclick=()=>hide('hasil');$('kl').onclick=keluar;$('rt').onclick=kirim;
 if(state.saved)setSv('ok','Hasil tersimpan.');
 show('hasil');$('kl').focus();
 if(tampil)requestAnimationFrame(()=>requestAnimationFrame(()=>{const g=$('rg');if(g)g.style.strokeDashoffset=RING*(1-h.sc/100)}));
}
function setSv(kind,text,retry){
 document.querySelectorAll('.sv').forEach(e=>{e.className='sv note '+kind;e.textContent=text});
 const r=$('rt');if(r)r.classList.toggle('hidden',!retry);
}
async function kirim(){
 setSv('','Menyimpan hasil…');
 const h=hitung(),pakai=h.K>0,lama=Math.max(0,Math.min(S.menit*60,Math.round((Date.now()-(endAt-S.menit*60000))/1000)));
 try{
  await F.addDoc(F.collection(db,KOLEKSI_HASIL),{token:S.tok,nama:S.nama,kelas:S.kelas,paketNama:S.paketNama,
   benar:pakai?h.ben:null,salah:pakai?h.sal:null,kosong:h.kos,nilai:h.sc,jumlahSoal:Q.length,durasi:lama,
   jawaban:state.ans.map(a=>a===null?'-':HURUF[a]).join(''),waktu:F.serverTimestamp()});
  state.saved=true;save();setSv('ok','Hasil tersimpan.');
 }catch(e){setSv('err','Hasil belum terkirim ke server. Periksa internet lalu coba lagi.',true)}
}

/* ---------- Mulai ---------- */
if(cfgOk){
 const [a,fs]=await Promise.all([import(FB+'firebase-app.js'),import(FB+'firebase-firestore.js')]);
 F=fs;db=fs.getFirestore(a.initializeApp(firebaseConfig));
}
let d=null;try{d=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
if(d&&d.S&&cfgOk){S=d.S;const err=await loadSoal(d);if(err){clearSave();showGate(err)}}
else showGate();