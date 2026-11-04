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
      const hasMine=this.record(myRated)?Boolean(myRated.rated||(Number(myRated.stars??myRated.s)>=1&&Number(myRated.stars??myRated.s)<=5)):Boolean(myRated);
      const hasOther=this.record(otherRated)?Boolean(otherRated.otherRated||otherRated.hasOther||(Number(otherRated.stars??otherRated.s)>=1&&Number(otherRated.stars??otherRated.s)<=5)):Boolean(otherRated);
      return hasMine&&hasOther;
    },
    resolveRatingReveal(myRated,hasOtherRatingFlag){
      return this.canRevealRating(myRated,Boolean(hasOtherRatingFlag));
    },
    buildAtomicBookingPayload(booking){
      const b=this.record(booking)?booking:{};
      const pay=this.record(b.payment)?b.payment:{};
      return {
        p_line_id:String(b.line_id??b.lineId??"").trim(),
        p_passenger_name:String(b.passenger_name??b.passengerName??b.name??"").trim(),
        p_phone:String(b.phone??"").trim(),
        p_plan_label:String(b.plan_label??b.planLabel??b.plan??"").trim(),
        p_seats:Array.isArray(b.seats)?b.seats:[],
        p_pickup:String(b.pickup??"").trim(),
        p_return_shift:String(b.return_shift??b.returnShift??"14:30").trim()||"14:30",
        p_pay_method:String(pay.method??b.pay_method??"cash").trim()||"cash",
        p_pay_status:String(pay.status??b.pay_status??"pending").trim()||"pending",
        p_pay_ref:String(pay.ref??b.pay_ref??"").trim()
      };
    },
    passengerNameFromSession(session,fallback=""){
      if(!this.record(session))return fallback;
      const u=this.record(session.user)?session.user:session;
      const meta=this.record(u.user_metadata)?u.user_metadata:(this.record(session.user_metadata)?session.user_metadata:(this.record(u.data)?u.data:{}));
      const rawName=String(meta.name??meta.full_name??u.name??u.full_name??session.name??"").trim();
      if(rawName)return rawName;
      const email=String(u.email??session.email??"").trim();
      if(email){
        const atIdx=email.indexOf("@");
        const prefix=(atIdx>0?email.slice(0,atIdx):email).trim();
        if(prefix)return prefix;
      }
      return fallback;
    },
    selectAttendanceSyncAction(status,isCloudConfigured=true){
      if(!isCloudConfigured)return "local";
      const st=String(status??"").trim();
      if(st==="absent")return "mark_absent";
      if(st==="waiting"||st==="boarded"||st==="arrived")return "push_attendance";
      return "local";
    },
    resolveStudentParentCode(attRecord,bookingRecord,localStudent){
      if(this.record(attRecord)){
        const attCode=String(attRecord.parent_code??attRecord.code??"").trim();
        if(attCode)return attCode;
      }
      if(this.record(bookingRecord)){
        const bkCode=String(bookingRecord.parent_code??bookingRecord.parentCode??bookingRecord.code??"").trim();
        if(bkCode)return bkCode;
        const bkPhone=String(bookingRecord.phone??"").replace(/\D/g,"");
        if(bkPhone.length>=4)return this.parentCode(bkPhone);
      }
      if(this.record(localStudent)){
        const locCode=String(localStudent.parent_code??localStudent.parentCode??localStudent.code??"").trim();
        if(locCode)return locCode;
      }
      return "KH-4829";
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
    },
    chatChannelKey(lineId,tripDate){
      const cleanLine=String(lineId??"").trim();
      const cleanDate=String(tripDate===undefined?this.today():tripDate??"").trim();
      if(!cleanLine||!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate))return "";
      return `${cleanLine}:${cleanDate}`;
    },
    canChatInWindow(lineOrGo,backOrNow,nowArg){
      if(this.record(lineOrGo)){
        const go=lineOrGo.go||lineOrGo.go_time||"07:00";
        const back=lineOrGo.back||lineOrGo.back_time||"14:30";
        return this.inTripWindow(go,back,backOrNow===undefined?new Date():backOrNow);
      }
      return this.inTripWindow(lineOrGo,backOrNow,nowArg===undefined?new Date():nowArg);
    },
    filterLines(lines,filters={}){
      const list=Array.isArray(lines)?lines:[];
      const f=this.record(filters)?filters:{};
      const area=String(f.area??f.from??"").trim();
      const uni=String(f.to??f.uni??"").trim();
      const comp=String(f.comp??"").trim();
      const rawMaxPrice=f.maxPrice!==undefined&&f.maxPrice!==null?String(f.maxPrice).trim():"";
      const hasMaxPrice=rawMaxPrice!==""&&Number.isFinite(Number(rawMaxPrice))&&Number(rawMaxPrice)>=0;
      const maxPrice=hasMaxPrice?Number(rawMaxPrice):Infinity;
      const rawMinRating=f.minRating!==undefined&&f.minRating!==null?String(f.minRating).trim():"";
      const hasMinRating=rawMinRating!==""&&Number.isFinite(Number(rawMinRating))&&Number(rawMinRating)>0;
      const minRating=hasMinRating?Number(rawMinRating):0;

      return list.filter(l=>{
        if(!this.record(l))return false;
        if(area&&String(l.from??l.from_area??"")!==area)return false;
        if(uni&&String(l.to??l.to_dest??"")!==uni)return false;
        if(comp&&String(l.comp??"")!==comp)return false;
        if(hasMaxPrice&&Number(l.price)>maxPrice)return false;
        if(hasMinRating&&Number(l.rating)<minRating)return false;
        return true;
      });
    },
    /* التنبيه داخل التطبيق فقط في هذه الشريحة؛ لا رسائل SMS أو واتساب لأنها تحتاج مزودًا خارجيًا */
    shouldShowAvailabilityBanner(line,notifyRequests,userId){
      if(!this.record(line))return false;
      const lineId=String(line.id??"").trim();
      const free=Number(line.free);
      if(!lineId||!Number.isFinite(free)||free<=0)return false;
      const reqs=Array.isArray(notifyRequests)?notifyRequests:[];
      const cleanUid=String(userId??"").trim();
      return reqs.some(r=>{
        if(typeof r==="string")return r.trim()===lineId;
        if(!this.record(r))return false;
        const rLineId=String(r.line_id??r.lineId??"").trim();
        if(rLineId!==lineId)return false;
        const rUid=String(r.user_id??r.userId??"").trim();
        if(cleanUid&&rUid&&rUid!==cleanUid)return false;
        return true;
      });
    },
    getAvailabilityBanners(lines,notifyRequests,userId){
      const list=Array.isArray(lines)?lines:[];
      return list
        .filter(l=>this.shouldShowAvailabilityBanner(l,notifyRequests,userId))
        .map(l=>{
          const from=String(l.from??l.from_area??"").trim();
          const to=String(l.to??l.to_dest??"").trim();
          const free=Number(l.free);
          return {
            lineId:String(l.id??"").trim(),
            from,
            to,
            free,
            msg:`أصبحت مقاعد متاحة على خط ${from} ← ${to}`
          };
        });
    },
    countLineNotifyRequests(lines,notifyRequests){
      const list=Array.isArray(lines)?lines:[];
      const reqs=Array.isArray(notifyRequests)?notifyRequests:[];
      return list.filter(l=>this.record(l)&&String(l.id??"").trim()!=="").map(l=>{
        const lineId=String(l.id).trim();
        const count=reqs.filter(r=>{
          if(typeof r==="string")return r.trim()===lineId;
          if(!this.record(r))return false;
          return String(r.line_id??r.lineId??"").trim()===lineId;
        }).length;
        return {
          lineId,
          from:String(l.from??l.from_area??""),
          to:String(l.to??l.to_dest??""),
          count
        };
      });
    },
    buildLineUpdateBroadcastMsg(line){
      if(!this.record(line))return "تم تعديل خط";
      const from=String(line.from??line.from_area??"").trim();
      const to=String(line.to??line.to_dest??"").trim();
      return (from&&to)?`تم تعديل خط ${from} ← ${to}`:"تم تعديل خط";
    }
  };
  if(typeof module!=="undefined"&&module.exports)module.exports=Core;
  else root.KhattiCore=Core;
})(typeof globalThis!=="undefined"?globalThis:this);
