/* Pembaca soal (.docx) + daftar paket soal. Harus sama dengan pembaca di ujian.html */
import {PAKET} from './config.js';
import {$,esc,S} from './util.js';

const RE_OPT=/^((?:<[^>]+>)*)\(?([A-Ea-e])[.)]\s*/,RE_NUM=/^((?:<[^>]+>)*)\d+\s*[.)]\s*/,RE_KEY=/^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:=]/i,RE_SKIP=/^(pembahasan|level|tingkat|topik|skor|bobot)\s*[:=]/i;

function optSegs(h){const r=[];for(const s of h.split(/\t+/)){if(!s.replace(/<[^>]+>/g,'').trim()&&!/<img/.test(s))continue;const m=s.match(RE_OPT);
 if(m)r.push({l:m[2].toUpperCase(),h:s.replace(RE_OPT,'$1').trim()});else if(r.length)r[r.length-1].h+=' '+s.trim()}return r}

export function parseSoal(html){
 const d=new DOMParser().parseFromString(html,'text/html');
 const bl=[...d.body.querySelectorAll('p,li')].map(e=>({h:e.innerHTML.trim(),t:e.textContent.trim()})).filter(b=>b.t||/<img/.test(b.h));
 const out=[];let c=null;
 for(const b of bl){
  if(RE_KEY.test(b.t)||RE_SKIP.test(b.t))continue;
  if(c&&!b.t){if(c.o.length)c.o[c.o.length-1].h+=' '+b.h;else c.q+='<br>'+b.h;continue}
  if(c&&RE_OPT.test(b.h)){optSegs(b.h).forEach(o=>c.o.push(o));continue}
  if(RE_NUM.test(b.h)){c={q:b.h.replace(RE_NUM,'$1'),o:[]};out.push(c);continue}
  if(!c||c.o.length>=2){c={q:b.h,o:[]};out.push(c);continue}
  if(c.o.length===0)c.q+='<br>'+b.h;else c.o[c.o.length-1].h+=' '+b.h}
 return out.filter(q=>q.o.length>=2).map(q=>(q.o.sort((a,b)=>a.l<b.l?-1:1),q));
}

async function preview(i){
 const box=$('pv'+i);if(!box.classList.contains('hidden')){box.classList.add('hidden');return}
 box.classList.remove('hidden');box.textContent='Memuat soal…';
 try{
  if(location.protocol==='file:')throw new Error('Buka lewat Live Server atau GitHub Pages (bukan klik ganda).');
  const r=await fetch(encodeURI(PAKET[i].file)+'?v='+Date.now());if(!r.ok)throw new Error('Berkas tidak ditemukan ('+r.status+').');
  const qs=parseSoal((await mammoth.convertToHtml({arrayBuffer:await r.arrayBuffer()})).value);
  if(!qs.length)throw new Error('Tidak ada soal pilihan ganda yang terbaca.');
  box.innerHTML=`<p style="margin:0 0 6px;color:var(--soft);font-size:13.5px"><b>${qs.length}</b> soal pilihan ganda terbaca.</p>`+
   qs.map((q,n)=>`<div class="q"><b>${n+1}.</b> ${q.q}<ol>${q.o.map(o=>`<li>${o.l}. ${o.h}</li>`).join('')}</ol></div>`).join('');
 }catch(e){box.innerHTML=`<div class="msg err" style="margin:0">${esc(e.message)}</div>`}
}

/* onBuat(i) dipanggil saat tombol "Buat token" diklik */
export function drawPakets(onBuat){
 $('pakets').innerHTML=PAKET.map((p,i)=>`<div class="card"><div class="pk"><div><b>${esc(p.nama)}</b><small>${esc(p.file)}</small></div>
 <div class="acts"><button class="btn" data-v="${i}">Lihat soal</button><button class="btn g" data-t="${i}" ${S.ok?'':'disabled'}>Buat token</button></div></div><div class="prev hidden" id="pv${i}"></div></div>`).join('');
 document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>preview(+b.dataset.v));
 document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>onBuat(+b.dataset.t));
}