/* محرك المنطق والخدمات والمكونات الأساسية المشتركة لمنصة خطي v0.2 */
(function(root){
  const Core={
    esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))},
    integer(v,min,max){return String(v??"").trim()!==""&&Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max},
    phone(v){return /^07\d{9}$/.test(String(v??"").replace(/\s/g,""))},
    name(v){return typeof v==="string"&&v.trim().length>=2&&v.trim().length<=100},
    time(v){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v??""))},
    point(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180},
    dist(a,b){if(!this.point(a)||!this.point(b))return Infinity;const rad=Math.PI/180,dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;const s=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,s))))},
    sortLines(lines,pin){const ranked=lines.map(l=>({...l,...(this.point(pin)?{_d:this.dist(pin,Array.isArray(l.route)?l.route[0]:null)}:{})}));return ranked.sort((a,b)=>(this.point(pin)?a._d-b._d:0)||(Number(b.trusted)-Number(a.trusted))||(b.rating-a.rating)||a.id.localeCompare(b.id))},
    today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Baghdad",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())},
    inTripWindow(go,back,now=new Date()){
      if(!this.time(go)||!this.time(back))return false;
      const [gh,gm]=String(go).split(":").map(Number);
      const [bh,bm]=String(back).split(":").map(Number);
      const goMin=gh*60+gm,backMin=bh*60+bm;
      if(goMin>backMin)return false;
      let nowMin;
      if(typeof now==="string"&&this.time(now.trim())){
        const [nh,nm]=now.trim().split(":").map(Number);
        nowMin=nh*60+nm;
      }else{
        const d=now instanceof Date?now:new Date(now);
        if(!Number.isFinite(+d))return false;
        const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Baghdad",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d);
        const hh=Number(parts.find(p=>p.type==="hour")?.value??d.getHours())%24;
        const mm=Number(parts.find(p=>p.type==="minute")?.value??d.getMinutes());
        nowMin=hh*60+mm;
      }
      return nowMin>=goMin-60&&nowMin<=backMin+30;
    },
    future(date,time="23:59",now=Date.now()){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!this.time(time))return false;const d=new Date(date+"T"+time+":00+03:00");return Number.isFinite(+d)&&new Date(date+"T12:00:00Z").toISOString().slice(0,10)===date&&+d>now},
    canRate(t){return Boolean(t)&&t.status==="done"&&!t.rated},
    canRevealRating(myRated,otherRated){
      return Boolean(myRated)&&Boolean(otherRated);
    },
    /* عتبة 4.5 مؤقتة لأن المرجع (PROMPT.md) اشترط تقييماً عالياً دون تحديد رقم */
    isTrustedDriver(line){
      if(!this.record(line)||!line.verified)return false;
      if(Number(line.violations)>0)return false;
      const r=Number(line.rating);
      return Number.isFinite(r)&&r>=4.5;
    },
    record(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)},
    safeId(v){return typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v)},
    reportTrips(trips,id,hol){return (Array.isArray(trips)?trips:[]).filter(t=>t&&t.status==="done"&&(hol?t.holId===hol:!t.holId&&t.lineId===id))},
    completeLineTrips(a,b,c){
      let lineId,bookings,trips;
      if(typeof a==="string"){lineId=a;bookings=b;trips=c;}
      else if(Array.isArray(a)&&typeof b==="string"&&c===undefined){bookings=a;trips=[];lineId=b;}
      else{bookings=a;trips=b;lineId=c;}
      const targetId=String(lineId??"");
      const completedBookings=[];
      const nextBookings=(Array.isArray(bookings)?bookings:[]).map(item=>{
        if(!this.record(item))return item;
        if(item.lineId===targetId&&item.status==="upcoming"){
          const updated={...item,status:"done"};
          completedBookings.push(updated);
          return updated;
        }
        return {...item};
      });
      const nextTrips=(Array.isArray(trips)?trips:[]).map(item=>{
        if(!this.record(item))return item;
        if(item.lineId===targetId){
          return {...item,status:"done"};
        }
        return {...item};
      });
      return {bookings:nextBookings,trips:nextTrips,completedBookings};
    },
    getDeviceId(){
      const key="khatti_demo_v1_device_id";
      try{
        if(typeof localStorage!=="undefined"){
          const existing=String(localStorage.getItem(key)||"").trim().replace(/^"|"$/g,"").toLowerCase();
          if(/^[0-9a-f]{16}$/.test(existing))return existing;
        }
      }catch(e){}
      let id="";
      if(typeof crypto!=="undefined"&&crypto&&typeof crypto.getRandomValues==="function"){
        const bytes=new Uint8Array(8);
        crypto.getRandomValues(bytes);
        id=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
      }else{
        id=Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join("");
      }
      try{
        if(typeof localStorage!=="undefined")localStorage.setItem(key,id);
      }catch(e){}
      return id;
    },
    parentCode(phone){const clean=String(phone??"").replace(/\D/g,"");return "KH-"+(clean.slice(-4)||"4829")},
    clusterRequests(reqs){
      const map={};
      for(const r of (Array.isArray(reqs)?reqs:[])){
        if(!r)continue;
        const from=String(r.from||r.area||"").trim();
        const to=String(r.to||r.dest||"").trim();
        if(!from||!to)continue;
        const key=from+"__"+to;
        if(!map[key])map[key]={from,to,totalSeats:0,requests:0,notes:[]};
        const seats=r.seats??r.count??1;
        if(!this.integer(seats,1,60))continue;
        map[key].totalSeats+=Number(seats);
        map[key].requests+=1;
        if(r.note)map[key].notes.push(r.note);
      }
      return Object.values(map).sort((a,b)=>b.totalSeats-a.totalSeats);
    }
  };
  if(typeof module!=="undefined"&&module.exports)module.exports=Core;
  else root.KhattiCore=Core;
})(typeof globalThis!=="undefined"?globalThis:this);
