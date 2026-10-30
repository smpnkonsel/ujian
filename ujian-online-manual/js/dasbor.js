/* Halaman Dasbor: kartu ringkasan, sebaran nilai, token aktif, pengumpulan terbaru */
import {$,esc,fmtT,fmtN,S} from './util.js';

const KELOMPOK=[['0–59',0,59],['60–69',60,69],['70–79',70,79],['80–89',80,89],['90–100',90,1e9]];

export function drawDash(){
 const {TOK,HAS}=S,act=TOK.filter(x=>x.aktif),ns=HAS.map(h=>h.nilai).filter(n=>n!==null);
 $('s1').textContent=act.length;$('s2').textContent=TOK.length;$('s3').textContent=HAS.length;
 $('s4').textContent=ns.length?fmtN(ns.reduce((a,b)=>a+b,0)/ns.length):'–';

 const cnt=KELOMPOK.map(([,a,b])=>ns.filter(n=>n>=a&&n<=b).length),mx=Math.max(1,...cnt);
 $('dist').innerHTML=ns.length?KELOMPOK.map((b,i)=>`<div class="bar"><span>${b[0]}</span><i style="width:${cnt[i]/mx*100}%"></i><em>${cnt[i]}</em></div>`).join(''):'<div class="empty">Belum ada nilai masuk.</div>';

 $('dtok').innerHTML=act.length?act.slice(0,6).map(x=>`<div class="pk" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span class="tk">${esc(x.id)}</span><small>${esc(x.paketNama)}</small></div>`).join(''):'<div class="empty">Tidak ada token aktif.</div>';

 $('dlast').innerHTML=HAS.length?HAS.slice(0,5).map(h=>`<tr><td>${esc(h.nama)}</td><td>${esc(h.paket)}</td><td><b>${fmtN(h.nilai)}</b></td><td>${fmtT(h.waktu)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Belum ada pengumpulan.</td></tr>';
}