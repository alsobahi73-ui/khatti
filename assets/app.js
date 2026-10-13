/* خطّي — دوال مشتركة */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const K={
get(k,f){try{const v=localStorage.getItem("khatti_demo_v1_"+k);if(v===null)return f;const parsed=JSON.parse(v);if(f!==undefined&&f!==null&&(Array.isArray(f)?!Array.isArray(parsed):typeof parsed!==typeof f||parsed===null))return f;if(k==="me"||k==="driver"){if(!KhattiCore.record(parsed)||!KhattiCore.name(parsed.name))return f;if(k==="driver"&&!parsed.verified&&!KhattiCore.record(parsed.vehicle))return f}
if(Array.isArray(parsed))return parsed.filter(v=>{if(!KhattiCore.record(v))return false;if(k==="trips"||k==="bookings")return KhattiCore.safeId(v.id)&&typeof v.when==="string"&&["done","upcoming"].includes(v.status)&&(KhattiCore.safeId(v.lineId)||KhattiCore.safeId(v.holId));if(k==="holPosts"||k==="holReqs")return KhattiCore.safeId(v.id)&&[v.from,v.to,v.date,v.dlabel].every(x=>typeof x==="string")&&!!COMP[v.comp]&&KhattiCore.integer(v.seats,1,60)&&(k!=="holPosts"||(KhattiCore.time(v.time)&&KhattiCore.integer(v.price,0,10000000)&&KhattiCore.integer(v.free,0,v.seats)));return true});return parsed}catch(e){return f}},
set(k,v){try{localStorage.setItem("khatti_demo_v1_"+k,JSON.stringify(v))}catch(e){this.toast("تعذّر حفظ البيانات المحلية. تحقق من مساحة التخزين وإعدادات المتصفح.");throw new Error("تعذر الحفظ المحلي")}},
line(id){const l=LINES.find(x=>x.id===id);if(!l)return null;const e=this.get("lineEdits",{})[id];if(!KhattiCore.record(e))return {...l};
if(!COMP[e.comp]||!KhattiCore.time(e.go)||!KhattiCore.time(e.back)||!KhattiCore.integer(e.seats,1,60)||!KhattiCore.integer(e.free,0,e.seats)||!KhattiCore.integer(e.price,0,10000000)||typeof e.vehicle!=="string"||!Array.isArray(e.pickups)||!e.pickups.every(p=>typeof p==="string"))return {...l};
return {...l,comp:e.comp,go:e.go,back:e.back,seats:e.seats,free:e.free,price:e.price,pickups:e.pickups,vehicle:e.vehicle}},
fmt:n=>Number(n).toLocaleString("en")+" د.ع",
comp:c=>COMP[c]||c,
page(t,back){document.title=t+" — خطّي";document.body.insertAdjacentHTML("afterbegin",`<header class="app"><a class="bk" href="${this.esc(back)}">→</a><h1>${t}</h1><span class="logo">خطّي</span></header>`)},
toast(m,ms=2600){let t=$("#toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t)}t.textContent=m;t.style.display="block";clearTimeout(t._x);t._x=setTimeout(()=>t.style.display="none",ms)},
stars(r){let s="";for(let i=1;i<=5;i++)s+=i<=Math.round(r)?"★":"☆";return `<span class="stars">${s}</span>`},
badge(c){const cls={girls:"b-g",boys:"b-b",mixed:"b-m"}[c];return `<span class="badge ${cls}">${COMP[c]}</span>`},
trusted(l){return l.trusted?` <span class="trusted">🧪 شارة ثقة تجريبية</span>`:""},
lineCard(l){return `<a class="card linecard" href="line.html?id=${l.id}"><div class="top">${this.badge(l.comp)}${this.trusted(l)}</div><div class="route">${K.esc(l.from)} ← ${K.esc(l.to)}</div><div class="mut">${K.esc(l.driver)} • ${K.esc(l.vehicle)} • ذهاب ${K.esc(l.go)} / إياب ${K.esc(l.back)}</div><div class="meta"><span>${this.stars(l.rating)} ${l.rating} (${l.rc})</span><span>💺 ${l.free} مقعدًا</span><span>${this.fmt(l.price)}/شهر</span></div></a>`},
map(id,center,zoom=12){const el=document.getElementById(id);if(!el)return null;
 const fb=()=>{el.innerHTML='<div class="mapfb">تعذّر تحميل الخريطة — تحقق من الاتصال بالإنترنت</div>'};
 if(typeof L==="undefined"){fb();return null}
 try{const m=L.map(id,{zoomControl:true}).setView(center,zoom);
 L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).on("tileerror",()=>this.toast("تعذّر تحميل بلاطات الخريطة؛ تحقق من الإنترنت")).addTo(m);
 setTimeout(()=>m.invalidateSize(),300);return m}catch(e){fb();return null}},
sim(m,route,onEv){ /* محاكاة باص متحرك */
 const pts=[];for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];for(let k=1;k<=14;k++)pts.push([a[0]+(b[0]-a[0])*k/14,a[1]+(b[1]-a[1])*k/14])}
 try{
 L.polyline(route,{color:"#123a5c",weight:4}).addTo(m);
 L.marker(route[0]).addTo(m).bindPopup("نقطة الانطلاق");
 L.marker(route[route.length-1]).addTo(m).bindPopup("الوجهة");
 const bus=L.marker(pts[0],{icon:L.divIcon({className:"bus",html:"🚌",iconSize:[30,30],iconAnchor:[15,15]})}).addTo(m);
 let i=0;const iv=setInterval(()=>{i++;if(i>=pts.length){clearInterval(iv);onEv&&onEv("done",0);return}bus.setLatLng(pts[i]);onEv&&onEv("tick",1-i/pts.length)},900);
 return ()=>clearInterval(iv)}catch(e){return ()=>{}}},
dist:(a,b)=>KhattiCore.dist(a,b),
esc:s=>KhattiCore.esc(s)
};
/* رحلات العطل (§3.11) + أدوات الحساب (§3.12) */
Object.assign(K,{
hol(id){return HOLIDAYS.concat(this.get("holPosts",[])).find(x=>x.id===id)},
holFree(h){if(!h)return 0;const o=this.get("holSeats",{})[h.id];return KhattiCore.integer(o,0,h.seats)?Number(o):h.free},
holCard(h,bookFn){const free=this.holFree(h);
return `<div class="card"><div class="row">${this.badge(h.comp)}${h.trusted?` <span class="trusted">🧪 شارة ثقة تجريبية</span>`:""}<span class="grow"></span><span class="mut">🎉 رحلة لمرة واحدة</span></div>
<div class="route" style="font-weight:800;margin:6px 0">${this.esc(h.from)} ← ${this.esc(h.to)}</div>
<div class="mut">📅 ${this.esc(h.dlabel)} — 🕗 ${this.esc(h.time)} • ${this.esc(h.driver)} ${h.rc?this.stars(h.rating)+" "+h.rating+" ("+h.rc+")":"🆕 سائق جديد"}</div>
${h.note?`<div class="mut" style="margin-top:4px">📝 ${this.esc(h.note)}</div>`:""}
<div class="row" style="margin-top:8px"><span>💺 <b>${free}</b> مقعدًا شاغرًا</span><span class="grow"></span><b style="color:var(--navy)">${this.fmt(h.price)}<span class="mut">/مقعد</span></b></div>
${free>0?`<button class="btn btn-a" onclick="${bookFn}('${encodeURIComponent(h.id)}')">احجز مقعدًا ✓</button>`:`<div class="danger-note" style="margin:10px 0 0">اكتملت المقاعد لهذه الرحلة</div>`}</div>`},
holMatch(an,rq){return an.from===rq.from&&an.to===rq.to&&an.date===rq.date&&(rq.comp==="mixed"||an.comp==="mixed"||an.comp===rq.comp)},
tripLine(t){return t.holId?this.hol(t.holId):this.line(t.lineId)},
pname(){const m=this.get("me",null);return m?m.name:ME.name},
dname(){const d=this.get("driver",null);return d?d.name:MYDRIVER.name},
pushHolNotif(msg,link){const n=this.holNotifs();if(n.some(x=>x.msg===msg))return;n.unshift({msg,link,d:"الآن"});this.set("holNotifs",n)},
holNotifs(){return this.get("holNotifs",[])},
holBanner(){const n=this.get("holNotifs",[]);if(!n.length)return;const app=document.getElementById("app");if(!app)return;
const box=document.createElement("div");
box.innerHTML=n.map((x,i)=>`<div class="alert ok" style="margin-bottom:8px;cursor:pointer" data-i="${i}"><b>🔔 ${this.esc(x.msg)}</b><small>${this.esc(x.d)} — اضغط للانتقال ✕</small></div>`).join("");
box.addEventListener("click",e=>{const a=e.target.closest(".alert");if(!a)return;const i=+a.dataset.i;
const cur=this.get("holNotifs",[]);const rm=cur.splice(i,1)[0];this.set("holNotifs",cur);a.remove();
if(rm&&["holiday.html","holiday-post.html"].includes(rm.link))location.href=rm.link==="holiday.html"?"../passenger/holiday.html":"../driver/holiday-post.html"});
app.prepend(box)}
});

/* بوابة محاكاة محلية فقط؛ لا تُعد مصادقة أو صلاحيات أمنية. */
K.access=function(){const p=location.pathname;const driver=p.includes("/driver/"),passenger=p.includes("/passenger/");if(!driver&&!passenger)return true;const account=this.get(driver?"driver":"me",null);if(!account||!KhattiCore.name(account.name)||(driver&&!account.verified)){location.replace("../register.html?role="+(driver?"driver":"passenger"));return false}return true};
const baseLine=K.line.bind(K);
K.line=function(id){const l=baseLine(id);if(!l)return null;const used=this.get("bookings",[]).filter(b=>b.lineId===id&&b.status==="upcoming").length;return {...l,free:Math.max(0,l.free-used)}};
K.missing=function(){document.querySelector("#app").innerHTML='<div class="bigempty">العنصر غير موجود أو حُذف من هذا العرض التجريبي.<br><a class="btn btn-p" href="'+(location.pathname.includes("/driver/")?'index.html':'search.html')+'">عودة</a></div>'};
try{seedDemo()}catch(e){/* يبقى العرض متاحًا عند حظر التخزين */}
document.addEventListener("DOMContentLoaded",()=>{
 const main=document.querySelector("main");if(main){const n=document.createElement("div");n.className="note";n.id="demo-notice";n.textContent="🧪 عرض تجريبي محلي: لا توثيق أمني أو حجز فعلي أو دفع أو تتبع حقيقي. لا تُرسل الرسائل أو البلاغات أو الاستغاثات لأي جهة. لا تدخل بيانات شخصية حقيقية.";main.before(n)}
});
window.addEventListener("error",e=>K.toast(e.message.includes("تعذر الحفظ المحلي")?"تعذّر الحفظ المحلي؛ لم تكتمل العملية. تحقق من التخزين.":"تعذّر إكمال العملية. أعد المحاولة أو ارجع للصفحة السابقة."));

/* حفظ مجموعة تغييرات محلية مع استرجاع القيم السابقة إذا فشل أي جزء. */
K.commit=function(entries){const old={};try{for(const key of Object.keys(entries))old[key]=localStorage.getItem("khatti_demo_v1_"+key);for(const [key,value] of Object.entries(entries))localStorage.setItem("khatti_demo_v1_"+key,JSON.stringify(value))}catch(error){try{for(const [key,value] of Object.entries(old)){if(value===null)localStorage.removeItem("khatti_demo_v1_"+key);else localStorage.setItem("khatti_demo_v1_"+key,value)}}catch(_){}throw new Error("تعذر الحفظ المحلي")}};
