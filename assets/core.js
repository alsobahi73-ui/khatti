/* منطق مستقل عن العرض وبيانات المحاكاة؛ لا يمثل خدمات إنتاجية. */
(function(root){
const Core={
esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))},
integer(v,min,max){return String(v).trim()!==""&&Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max},
localPhone(v){const digits=String(v).replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[\s()-]/g,'');const local=digits.startsWith('+964')?'0'+digits.slice(4):digits;return /^07[3-9]\d{8}$/.test(local)?local:null},
phone(v){return this.localPhone(v)!==null},
name(v){return typeof v==="string"&&v.trim().length>=2&&v.trim().length<=100},
time(v){return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)},
point(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180},
dist(a,b){if(!this.point(a)||!this.point(b))return Infinity;const rad=Math.PI/180,dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;const s=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,s))))},
sortLines(lines,pin){const ranked=lines.map(l=>({...l,...(this.point(pin)?{_d:this.dist(pin,l.route?.[0])}:{})}));return ranked.sort((a,b)=>(this.point(pin)?a._d-b._d:0)||(Number(b.trusted)-Number(a.trusted))||(b.rating-a.rating)||a.id.localeCompare(b.id))},
today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Baghdad",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())},
future(date,time="23:59",now=Date.now()){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!this.time(time))return false;const d=new Date(date+"T"+time+":00+03:00");return Number.isFinite(+d)&&new Date(date+"T12:00:00Z").toISOString().slice(0,10)===date&&+d>now},
canRate(t){return !!t&&t.status==="done"&&!t.rated},
record(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)},
safeId(v){return typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v)},
reportTrips(trips,id,hol){return trips.filter(t=>t.status==="done"&&(hol?t.holId===hol:!t.holId&&t.lineId===id))}
};
if(typeof module!=="undefined"&&module.exports)module.exports=Core;
else root.KhattiCore=Core;
})(typeof globalThis!=="undefined"?globalThis:this);
