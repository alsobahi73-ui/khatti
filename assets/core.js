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
    future(date,time="23:59",now=Date.now()){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!this.time(time))return false;const d=new Date(date+"T"+time+":00+03:00");return Number.isFinite(+d)&&new Date(date+"T12:00:00Z").toISOString().slice(0,10)===date&&+d>now},
    canRate(t){return Boolean(t)&&t.status==="done"&&!t.rated},
    record(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)},
    safeId(v){return typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v)},
    reportTrips(trips,id,hol){return (Array.isArray(trips)?trips:[]).filter(t=>t&&t.status==="done"&&(hol?t.holId===hol:!t.holId&&t.lineId===id))},
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
        map[key].totalSeats+=Number(r.seats||r.count||1);
        map[key].requests+=1;
        if(r.note)map[key].notes.push(r.note);
      }
      return Object.values(map).sort((a,b)=>b.totalSeats-a.totalSeats);
    }
  };
  if(typeof module!=="undefined"&&module.exports)module.exports=Core;
  else root.KhattiCore=Core;
})(typeof globalThis!=="undefined"?globalThis:this);
