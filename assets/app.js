/* خطّي — دوال مشتركة */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const K={
get(k,f){try{const v=localStorage.getItem("khatti_"+k);return v!==null?JSON.parse(v):f}catch(e){return f}},
set(k,v){try{localStorage.setItem("khatti_"+k,JSON.stringify(v))}catch(e){}},
line(id){const l=LINES.find(x=>x.id===id);const e=this.get("lineEdits",{})[id];return e?Object.assign({},l,e):Object.assign({},l)},
fmt:n=>Number(n).toLocaleString("en")+" د.ع",
comp:c=>COMP[c]||c,
page(t,back){document.title=t+" — خطّي";document.body.insertAdjacentHTML("afterbegin",`<header class="app"><a class="bk" href="${back}">→</a><h1>${t}</h1><span class="logo">خطّي</span></header>`)},
toast(m,ms=2600){let t=$("#toast");if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t)}t.textContent=m;t.style.display="block";clearTimeout(t._x);t._x=setTimeout(()=>t.style.display="none",ms)},
stars(r){let s="";for(let i=1;i<=5;i++)s+=i<=Math.round(r)?"★":"☆";return `<span class="stars">${s}</span>`},
badge(c){const cls={girls:"b-g",boys:"b-b",mixed:"b-m"}[c];return `<span class="badge ${cls}">${COMP[c]}</span>`},
trusted(l){return l.trusted?` <span class="trusted">✓ سائق موثوق</span>`:""},
lineCard(l){return `<a class="card linecard" href="line.html?id=${l.id}"><div class="top">${this.badge(l.comp)}${this.trusted(l)}</div><div class="route">${l.from} ← ${l.to}</div><div class="mut">${l.driver} • ${l.vehicle} • ذهاب ${l.go} / إياب ${l.back}</div><div class="meta"><span>${this.stars(l.rating)} ${l.rating} (${l.rc})</span><span>💺 ${l.free} مقعدًا</span><span>${this.fmt(l.price)}/شهر</span></div></a>`},
map(id,center,zoom=12){const el=document.getElementById(id);if(!el)return null;
 const fb=()=>{el.innerHTML='<div class="mapfb">تعذّر تحميل الخريطة — تحقق من الاتصال بالإنترنت</div>'};
 if(typeof L==="undefined"){fb();return null}
 try{const m=L.map(id,{zoomControl:true}).setView(center,zoom);
 L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(m);
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
dist(a,b){const R=6371,dLa=(b[0]-a[0])*Math.PI/180,dLo=(b[1]-a[1])*Math.PI/180;const s=Math.sin(dLa/2)**2+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(s))},
esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}
};
/* بيانات تجريبية أولية */
(function(){if(K.get("seeded"))return;K.set("seeded",1);
K.set("trips",[{id:"t1",lineId:"l1",when:"أمس — 07:00",status:"done",rated:false}]);
K.set("bookings",[]);K.set("reports",[]);K.set("requests",[]);K.set("pxRatings",{});
K.set("broadcasts",[{t:"تنبيه: غدًا عطلة رسمية — لا توجد رحلات.",d:"قبل يومين"}]);
K.set("chat_l1",[{me:0,t:"صباح الخير، أنا عند نقطة ساحة الكاظمية",time:"06:52"},{me:1,t:"صباح النور، قادم خلال ٥ دقائق",time:"06:53"}]);
K.set("myComments",{});
})();
