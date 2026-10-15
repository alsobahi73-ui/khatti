/* تطبيق خطّي - كود التشغيل الرئيسي v0.2 (شامل الميزات الذكية وتجربة المستخدم) */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const K={
  get(k,f){
    try{
      const v=localStorage.getItem("khatti_demo_v1_"+k);
      if(v===null)return f;
      const parsed=JSON.parse(v);
      if(f!==undefined&&f!==null&&(Array.isArray(f)?!Array.isArray(parsed):typeof parsed!==typeof f||parsed===null))return f;
      if(k==="me"||k==="driver"){
        if(!KhattiCore.record(parsed)||!KhattiCore.name(parsed.name))return f;
        if(k==="driver"&&!parsed.verified&&!KhattiCore.record(parsed.vehicle)&&typeof parsed.vehicle!=="string")return f;
      }
      if(Array.isArray(parsed)){
        return parsed.filter(v=>{
          if(!KhattiCore.record(v))return false;
          if(k==="trips"||k==="bookings"){
            return (!Array.isArray(v.seats)||(v.seats.length>0&&v.seats.length<=60&&new Set(v.seats).size===v.seats.length&&v.seats.every(x=>typeof x==="string"&&/^مقعد \d{1,2}$/.test(x))))&&KhattiCore.safeId(v.id)&&typeof v.when==="string"&&["done","upcoming"].includes(v.status)&&(KhattiCore.safeId(v.lineId)||KhattiCore.safeId(v.holId));
          }
          if(k==="holPosts"||k==="holReqs"){
            const dlabel=typeof v.dlabel==="string"&&v.dlabel?v.dlabel:(typeof v.date==="string"?v.date:"");
            const free=v.free!==undefined?v.free:v.seats;
            return KhattiCore.safeId(v.id)&&[v.from,v.to,v.date,dlabel].every(x=>typeof x==="string")&&!!COMP[v.comp]&&KhattiCore.integer(v.seats,1,60)&&(k!=="holPosts"||(KhattiCore.time(v.time)&&KhattiCore.integer(v.price,0,10000000)&&KhattiCore.integer(free,0,v.seats)));
          }
          return true;
        });
      }
      return parsed;
    }catch(e){return f}
  },
  set(k,v){
    try{localStorage.setItem("khatti_demo_v1_"+k,JSON.stringify(v))}
    catch(e){this.toast("تعذّر الحفظ المحلي؛ لم تكتمل العملية.");throw new Error("تعذر الحفظ المحلي")}
  },
  line(id){
    const l=(typeof LINES!=="undefined"?LINES:[]).find(x=>x.id===id);
    if(!l)return null;
    const e=this.get("lineEdits",{})[id]||this.get("line_"+id,null);
    let merged={...l};
    if(KhattiCore.record(e)){
      if(typeof e.from==="string"&&e.from.trim())merged.from=e.from.trim();
      if(typeof e.to==="string"&&e.to.trim())merged.to=e.to.trim();
      if(COMP[e.comp])merged.comp=e.comp;
      if(KhattiCore.time(e.go))merged.go=e.go;
      if(KhattiCore.time(e.back))merged.back=e.back;
      if(KhattiCore.integer(e.seats,1,60))merged.seats=Number(e.seats);
      if(KhattiCore.integer(e.free,0,merged.seats))merged.free=Number(e.free);
      if(KhattiCore.integer(e.price,0,10000000))merged.price=Number(e.price);
      if(typeof e.vehicle==="string"&&e.vehicle.trim())merged.vehicle=e.vehicle.trim();
      if(Array.isArray(e.pickups)&&e.pickups.every(p=>typeof p==="string"))merged.pickups=e.pickups;
      if(Array.isArray(e.comments))merged.comments=e.comments.filter(KhattiCore.record);
    }
    const savedComments=this.get("myComments",{})[id];
    if(Array.isArray(savedComments))merged.comments=savedComments.filter(KhattiCore.record);
    return merged;
  },
  fmt:n=>Number(n).toLocaleString("en")+" د.ع",
  comp:c=>COMP[c]||c,
  currentRole(){
    const p=location.pathname;
    if(p.includes("/driver/"))return "driver";
    if(p.includes("/parent/"))return "parent";
    if(p.includes("/passenger/"))return "passenger";
    return "home";
  },
  switchRole(role){
    const inSub = location.pathname.includes("/driver/")||location.pathname.includes("/passenger/")||location.pathname.includes("/parent/");
    const prefix = inSub ? "../" : "";
    if(role==="driver"){
      if(!this.get("driver",null)?.verified){location.href=prefix+"register.html?role=driver";return;}
      location.href=prefix+"driver/index.html";
    }else if(role==="parent"){
      location.href=prefix+"parent/index.html";
    }else if(role==="passenger"){
      if(!this.get("me",null)){location.href=prefix+"register.html?role=passenger";return;}
      location.href=prefix+"passenger/search.html";
    }else{
      location.href=prefix+"index.html";
    }
  },
  page(t,back){
    document.title=t+" — خطّي";
    const r=this.currentRole();
    document.body.insertAdjacentHTML("afterbegin",`
      <header class="app">
        ${back?`<a class="bk" aria-label="رجوع" href="${this.esc(back)}">←</a>`:""}
        <h1>${this.esc(t)}</h1>
        <select class="role-switch" aria-label="تبديل الوضع" onchange="K.switchRole(this.value)">
          <option value="passenger" ${r==="passenger"?"selected":""}>👤 وضع الراكب</option>
          <option value="driver" ${r==="driver"?"selected":""}>🚘 وضع السائق</option>
          <option value="parent" ${r==="parent"?"selected":""}>👨‍👩‍👧 ولي الأمر</option>
          <option value="home" ${r==="home"?"selected":""}>🏠 الرئيسية</option>
        </select>
      </header>
    `);
    this.renderBottomNav(r);
  },
  renderBottomNav(role){
    if(role==="home"||$("#khatti-bnav"))return;
    const path=location.pathname;
    let items=[];
    if(role==="passenger"){
      items=[
        {href:"search.html",icon:"🔍",label:"الخطوط",act:path.endsWith("search.html")||path.endsWith("line.html")||path.endsWith("booking.html")},
        {href:"trips.html",icon:"🎟️",label:"اشتراكاتي",act:path.endsWith("trips.html")},
        {href:"tracking.html?id=l1",icon:"📍",label:"التتبع الحي",act:path.endsWith("tracking.html")},
        {href:"holiday.html",icon:"🎉",label:"خط العطلة",act:path.endsWith("holiday.html")}
      ];
    }else if(role==="driver"){
      items=[
        {href:"index.html",icon:"🏠",label:"لوحتي",act:path.endsWith("index.html")},
        {href:"line-edit.html",icon:"⚙️",label:"إعداد الخط",act:path.endsWith("line-edit.html")},
        {href:"broadcast.html",icon:"📢",label:"التنبيهات",act:path.endsWith("broadcast.html")},
        {href:"holiday-post.html",icon:"🎉",label:"رحلات العطلة",act:path.endsWith("holiday-post.html")},
        {href:"ratings.html",icon:"⭐",label:"التقييمات",act:path.endsWith("ratings.html")}
      ];
    }else if(role==="parent"){
      items=[
        {href:"index.html",icon:"👨‍👩‍👧",label:"متابعة الأبناء",act:true},
        {href:"../passenger/tracking.html?id=l1",icon:"📍",label:"خريطة الحافلة",act:false},
        {href:"../support.html",icon:"💬",label:"الدعم",act:false}
      ];
    }
    if(!items.length)return;
    const nav=document.createElement("nav");
    nav.id="khatti-bnav";
    nav.className="bottom-nav";
    nav.innerHTML=items.map(it=>`<a href="${it.href}" class="${it.act?'active':''}"><i>${it.icon}</i><span>${it.label}</span></a>`).join("");
    document.body.appendChild(nav);
  },
  toast(m,ms=2800){
    let t=$("#toast");
    if(!t){t=document.createElement("div");t.id="toast";t.className="toast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");t.setAttribute("aria-atomic","true");document.body.appendChild(t)}
    t.textContent=m;
    t.style.display="block";
    clearTimeout(t._x);
    t._x=setTimeout(()=>{t.style.display="none"},ms);
  },
  stars(r){
    let s="";
    for(let i=1;i<=5;i++)s+=i<=Math.round(r)?"★":"☆";
    return `<span class="stars">${s}</span>`;
  },
  badge(c){
    if(c==="verified")return `<span class="trusted">🧪 توثيق تجريبي</span>`;
    const cls={girls:"b-g",boys:"b-b",mixed:"b-m"}[c]||"b-m";
    return `<span class="badge ${cls}">${this.esc(COMP[c]||c)}</span>`;
  },
  trusted(l){
    const isTrusted=KhattiCore.record(l)?Boolean(l.trusted||l.verified):Boolean(l);
    return isTrusted?`<span class="trusted">🧪 توثيق تجريبي</span>`:"";
  },
  lineCard(l){
    return `<a class="card linecard" href="line.html?id=${this.esc(l.id)}"><div class="top">${this.badge(l.comp)}${this.trusted(l)}</div><div class="route">${this.esc(l.from)} ← ${this.esc(l.to)}</div><div class="mut">${this.esc(l.driver||l.driverName||"")} • ${this.esc(l.vehicle||l.type||"")} • 🚦 ${this.esc(l.go||"07:00")} / 🏁 ${this.esc(l.back||"14:30")}</div><div class="meta"><span>${this.stars(l.rating)} ${l.rating} (${l.rc||0})</span><span>💺 ${l.free} مقاعد شاغرة</span><span>${this.fmt(l.price)}/شهر</span></div></a>`;
  },
  stepperHTML(l,activeIdx=0){
    const stops=Array.isArray(l.pickups)&&l.pickups.length?l.pickups:[`نقطة تجمع ${l.from}`,"الساحة الرئيسية",`بوابة ${l.to}`];
    const baseHour=parseInt((l.go||"07:00").split(":")[0],10)||7;
    const baseMin=parseInt((l.go||"07:00").split(":")[1],10)||0;
    return `<div class="stepper">`+stops.map((s,idx)=>{
      const totalMin=baseHour*60+baseMin+idx*12;
      const hh=String(Math.floor(totalMin/60)%24).padStart(2,"0");
      const mm=String(totalMin%60).padStart(2,"0");
      return `<div class="step-item ${idx<=activeIdx?'done':''}"><div class="step-time">🕒 ${hh}:${mm} ص</div><div class="step-name">${this.esc(s)}</div></div>`;
    }).join("")+`</div>`;
  },
  /* إدارة الحضور والغياب اليومي وتأكيد الصعود (Check-in / Skip Today) */
  attendance(lineId="l1"){
    const today=KhattiCore.today();
    const key="att_"+lineId+"_"+today;
    const saved=this.get(key,null);
    if(Array.isArray(saved))return saved.filter(s=>KhattiCore.record(s)&&KhattiCore.safeId(s.id)&&KhattiCore.name(s.name)&&["waiting","absent","boarded","arrived"].includes(s.status));
    const me=this.get("me",{name:"أحمد علي",phone:"07701112233"});
    const initial=[
      {id:"st_1",name:me.name||"أحمد علي",stop:"تقاطع الكرادة",status:"waiting",code:KhattiCore.parentCode(me.phone)},
      {id:"st_2",name:"سارة محمود",stop:"ساحة الحرية",status:"waiting",code:"KH-9012"},
      {id:"st_3",name:"مصطفى حيدر",stop:"الجادرية",status:"waiting",code:"KH-3341"}
    ];
    this.set(key,initial);
    return initial;
  },
  setStudentStatus(lineId,studentId,status){
    if(!["waiting","absent","boarded","arrived"].includes(status)||!this.line(lineId))throw new Error("حالة حضور غير صالحة");
    const today=KhattiCore.today();
    const key="att_"+lineId+"_"+today;
    const list=this.attendance(lineId).map(s=>s.id===studentId?{...s,status,updatedAt:new Date().toLocaleTimeString("ar-IQ",{hour:"2-digit",minute:"2-digit"})}:s);
    const target=list.find(s=>s.id===studentId);
    if(!target)throw new Error("الطالب غير موجود");
    if(target){
      const labels={
        absent:`تم تسجيل غياب (${target.name}) عن رحلة اليوم — لن ينتظرك السائق صباحاً`,
        waiting:`تمت إعادة حالة (${target.name}) إلى حاضر في رحلة اليوم`,
        boarded:`✅ صعد الطالب (${target.name}) إلى الحافلة الآن`,
        arrived:`🎓 وصل الطالب (${target.name}) إلى الوجهة بأمان`
      };
      const msg=labels[status]||"تم تحديث حالة الطالب";
      const broadcasts=this.get("broadcasts",[]);
      const now=new Date().toLocaleTimeString("ar-IQ",{hour:"2-digit",minute:"2-digit"});
      broadcasts.unshift({id:"b_"+Date.now(),msg,t:msg,time:now,d:now});
      this.commit({[key]:list,broadcasts});
      this.toast("محاكاة محلية: "+msg+"؛ لم يُرسل إشعار");
    }
    return list;
  },
  map(id,center,zoom=12){
    const el=document.getElementById(id);
    if(!el)return null;
    const fb=()=>{el.innerHTML='<div class="mapfb" id="map-fallback">تعذّر تحميل الخريطة؛ تحقق من الاتصال بالإنترنت</div>'};
    if(typeof L==="undefined"){fb();return null}
    try{
      const m=L.map(id,{zoomControl:true}).setView(center,zoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).on("tileerror",()=>this.toast("تعذر تحميل خريطة الشارع")).addTo(m);
      setTimeout(()=>m.invalidateSize(),300);
      return m;
    }catch(e){fb();return null}
  },
  sim(m,route,onEv){
    if(!m||!Array.isArray(route)||route.length<2)return ()=>{};
    const pts=[];
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i];
      for(let k=1;k<=14;k++)pts.push([a[0]+(b[0]-a[0])*k/14,a[1]+(b[1]-a[1])*k/14]);
    }
    try{
      L.polyline(route,{color:"#123a5c",weight:4}).addTo(m);
      L.marker(route[0]).addTo(m).bindPopup("الانطلاق");
      L.marker(route[route.length-1]).addTo(m).bindPopup("الوصول");
      const bus=L.marker(pts[0],{icon:L.divIcon({className:"mapbus",html:"🚌",iconSize:[30,30],iconAnchor:[15,15]})}).addTo(m);
      let i=0,alerted=false;
      const iv=setInterval(()=>{
        i++;
        if(i>=pts.length){clearInterval(iv);onEv&&onEv("done",0);return}
        bus.setLatLng(pts[i]);
        const rem=1-i/pts.length;
        if(!alerted&&rem<=0.35){
          alerted=true;
          this.toast("🔔 محاكاة تنبيه اقتراب؛ لا يوجد تتبع لحافلة حقيقية");
        }
        onEv&&onEv("tick",rem);
      },900);
      return ()=>clearInterval(iv);
    }catch(e){return ()=>{}}
  },
  dist:(a,b)=>KhattiCore.dist(a,b),
  esc:s=>KhattiCore.esc(s),
  /* §3.14.1+8 — رمز صعود QR/PIN */
  qrbox(pin){pin=/^\d{4,6}$/.test(String(pin))?String(pin):"----";let c="";for(let i=0;i<81;i++){c+=`<i class="${(pin.charCodeAt(i%pin.length)*7+i*13)%3===0?"on":""}"></i>`}return `<div class="qrbox">${c}</div><div class="pinbig">${this.esc(pin.split("").join(" "))}</div>`},
  pphone(){const m=this.get("me",null);return m&&m.phone?m.phone:""},
  /* §3.14.3 — قاموس كردي (سوراني) للواجهة الرئيسية */
  dict:{
demoNotice:"🧪 وەشانێکی تاقیکاری — هەموو داتا و کەس و ژمارەکان خەیاڵین بۆ پیشاندان",
kuNote:"وەرگێڕانی کوردی لە پەرەپێدانە",
brand:"خەتتی",
gate:"🔒 هەژماری سەرنشین تۆماربکە بۆ بینینی هێڵەکان",
gates:"هێڵەکان تەنها بۆ تۆمارکراوان پیشان دەدرێن — بە خۆڕایی تۆماربکە",
gateBtn:"وەک سەرنشین تۆماربکە ←",
pxT:"سەرنشین و خوێندکار",pxS:"بەشداری مانگانە بکە و کورسییەکەت بگرە",
drT:"شۆفێرانی هێڵ",drS:"ئامادەبوونی ڕۆژانە بەڕێوەببە و گەشت بلاوبکەرەوە",
parT:"دەروازەی دایک و باوک",parS:"بە کۆدی خوێندکار بمێنەرەوە لەگەڵ منداڵەکەت",
heroH:"خەتتی",heroP:"پلاتفۆرمی هێڵە ڕاستەوخۆکان — پاس و ئۆتۆمبێلی هێڵ<br>بەشداری مانگانەی نەرم • شوێنپێهەڵگرتنی زیندوو بۆ خێزان",
navPx:"چوونەژوورەوەی سەرنشین",navDr:"هەژماری شۆفێر",navPar:"دایک و باوک",navSup:"پشتگیری"
}};

Object.assign(K,{
  hol(id){return (typeof HOLIDAYS!=="undefined"?HOLIDAYS:[]).concat(this.get("holPosts",[])).find(x=>x.id==id)},
  holFree(h){
    if(!h)return 0;
    const o=this.get("holSeats",{})[h.id];
    if(KhattiCore.integer(o,0,h.seats))return Number(o);
    if(KhattiCore.integer(h.free,0,h.seats))return Number(h.free);
    return Number(h.seats)||0;
  },
  holCard(h,bookFn){
    const free=this.holFree(h);
    const dlabel=h.dlabel||h.date||"";
    const driver=h.driver||h.driverName||"";
    return `<div class="card"><div class="row">${this.badge(h.comp)}${h.trusted?`<span class="trusted">🧪 توثيق تجريبي</span>`:""}<span class="grow"></span><b>${this.fmt(h.price)}</b></div><div class="route" style="font-weight:800;margin:6px 0">${this.esc(h.from)} ← ${this.esc(h.to)}</div><div class="mut">📅 ${this.esc(dlabel)} — 🕒 ${this.esc(h.time)} • ${this.esc(driver)} ${h.rc?this.stars(h.rating):""}</div>${h.note?`<div class="mut" style="margin-top:4px">📝 ${this.esc(h.note)}</div>`:""}<div class="row" style="margin-top:8px"><span>💺 <b>${free}</b> مقاعد متبقية</span><span class="grow"></span>${free>0?`<button class="btn btn-a" onclick="${bookFn}('${encodeURIComponent(h.id)}')">حجز الآن ✓</button>`:`<button class="btn" disabled>مكتمل</button>`}</div></div>`;
  },
  holMatch(an,rq){return an.from===rq.from&&an.to===rq.to&&an.date===rq.date&&an.comp===rq.comp&&KhattiCore.integer(rq.seats,1,this.holFree(an))&&KhattiCore.future(an.date,an.time)},
  tripLine(t){return t.holId?this.hol(t.holId):this.line(t.lineId)},
  pname(){const m=this.get("me",null);return m?m.name:(typeof ME!=="undefined"?ME.name:"أحمد علي")},
  dname(){const d=this.get("driver",null);return d?d.name:(typeof MYDRIVER!=="undefined"?MYDRIVER.name:"أبو محمد الحسني")},
  pushHolNotif(msg,link){
    const n=this.get("holNotifs",[]);
    if(n.some(x=>x.msg===msg))return;
    n.unshift({msg,link,d:"الآن"});
    this.set("holNotifs",n);
  },
  holNotifs(){return this.get("holNotifs",[])},
  holBanner(){
    const n=this.get("holNotifs",[]);
    if(!n.length)return;
    const app=document.getElementById("app");
    if(!app)return;
    const box=document.createElement("div");
    box.innerHTML=n.map((x,i)=>`<div class="alert ok" style="margin-bottom:8px;cursor:pointer" data-i="${i}">🔔 ${this.esc(x.msg)}</div>`).join("");
    box.addEventListener("click",e=>{
      const a=e.target.closest(".alert");
      if(!a)return;
      const i=+a.dataset.i;
      const cur=this.get("holNotifs",[]);
      const rm=cur.splice(i,1)[0];
      this.set("holNotifs",cur);
      a.remove();
      if(rm&&["holiday.html","holiday-post.html"].includes(rm.link)){
        location.href=rm.link==="holiday.html"?"../passenger/holiday.html":"../driver/holiday-post.html";
      }
    });
    app.prepend(box);
  }
});

K.access=function(){
  const p=location.pathname;
  const driver=p.includes("/driver/"),passenger=p.includes("/passenger/");
  if(!driver&&!passenger)return true;
  const account=this.get(driver?"driver":"me",null);
  if(!account||!KhattiCore.name(account.name)||(driver&&!account.verified)){
    location.replace("../register.html?role="+(driver?"driver":"passenger"));
    return false;
  }
  return true;
};
const baseLine=K.line.bind(K);
K.line=function(id){
  const l=baseLine(id);
  if(!l)return null;
  const used=this.get("bookings",[]).filter(b=>b.lineId===id&&b.status==="upcoming").reduce((sum,b)=>sum+(Array.isArray(b.seats)?b.seats.length:1),0);
  const baseFree=KhattiCore.integer(l.free,0,l.seats)?l.free:l.seats;
  return {...l,free:Math.max(0,baseFree-used)};
};
K.missing=function(){
  const el=document.querySelector("#app");
  if(el)el.innerHTML='<div class="bigempty">العنصر غير موجود أو الصفحة المطلوبة غير متوفرة في هذا العرض التجريبي.<br><a class="btn btn-p" href="'+(location.pathname.includes("/driver/")?'index.html':'search.html')+'">الرجوع</a></div>';
};
try{if(typeof seedDemo==="function")seedDemo()}catch(e){}
document.addEventListener("DOMContentLoaded",()=>{
  const main=document.querySelector("main");
  if(main){
    const n=document.createElement("div");
    n.className="note";
    n.id="demo-notice";
    n.textContent=(K.get("lang","ar")==="ku"&&K.dict)?K.dict.demoNotice:"🧪 عرض تجريبي محلي: لا توثيق أمني أو حجز فعلي أو دفع أو تتبع حقيقي. لا تُرسل رسائل أو بلاغات أو استغاثات. لا تدخل بيانات شخصية حقيقية.";
    main.before(n);
  }
  if(typeof navigator!=="undefined"&&"serviceWorker" in navigator){
    const swPath=location.pathname.includes("/driver/")||location.pathname.includes("/passenger/")||location.pathname.includes("/parent/")?"../sw.js":"sw.js";
    navigator.serviceWorker.register(swPath).catch(()=>{});
  }
});
if(typeof window!=="undefined"){
  window.addEventListener("error",e=>K.toast(e.message&&(/تعذر الحفظ|تعذر حفظ|localStorage/.test(e.message))?"تعذّر الحفظ المحلي؛ لم تكتمل العملية. تحقق من التخزين.":"حدث خطأ غير متوقع في المنصة."));
}

K.commit=function(entries){
  const old={};
  try{
    for(const key of Object.keys(entries))old[key]=localStorage.getItem("khatti_demo_v1_"+key);
    for(const [key,value] of Object.entries(entries))localStorage.setItem("khatti_demo_v1_"+key,JSON.stringify(value));
  }catch(error){
    try{
      for(const [key,value] of Object.entries(old)){
        if(value===null)localStorage.removeItem("khatti_demo_v1_"+key);
        else localStorage.setItem("khatti_demo_v1_"+key,value);
      }
    }catch(_){}
    throw new Error("تعذر الحفظ المحلي");
  }
};
