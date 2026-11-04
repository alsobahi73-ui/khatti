const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/core');
test('pin distance outranks trust; ties prefer trust without mutating fixtures',()=>{
 const a=[{id:'far',route:[[34,44]],trusted:true,rating:5},{id:'near',route:[[33,44]],trusted:false,rating:3}];
 assert.equal(C.sortLines(a,[33,44])[0].id,'near');assert.equal(C.sortLines(a)[0].id,'far');assert.equal(a[0]._d,undefined);
 assert.equal(C.dist([33,44],[33,44]),0);assert.equal(C.dist([100,0],[0,0]),Infinity);
});
test('validation rejects fractional, nonfinite, empty values and malformed phone/time',()=>{
 for(const n of ['',0,-1,1.5,Infinity,'abc',61])assert.equal(C.integer(n,1,60),false);
 assert.ok(C.integer('14',1,60));assert.ok(C.phone('0770 000 0000'));assert.ok(!C.phone('123'));
 assert.ok(C.time('23:59'));assert.ok(!C.time('24:00'));assert.ok(!C.name(' '));
});
test('departure expiry uses Iraq offset and validates calendar dates',()=>{
 const now=Date.parse('2026-10-15T20:00:00Z');
 assert.ok(C.future('2026-10-16','00:01',now));assert.ok(!C.future('2026-10-15','22:59',now));
 assert.ok(!C.future('2026-02-30','12:00',now));assert.ok(!C.future('x','12:00',now));
});
test('report eligibility matches completed trip and selected service',()=>{
 const trips=[{id:1,lineId:'l1',status:'done'},{id:2,lineId:'l2',status:'done'},{id:3,holId:'h1',status:'done'},{id:4,lineId:'l1',status:'upcoming'}];
 assert.deepEqual(C.reportTrips(trips,'l1',null).map(t=>t.id),[1]);assert.deepEqual(C.reportTrips(trips,null,'h1').map(t=>t.id),[3]);
 assert.ok(C.canRate(trips[0]));assert.ok(!C.canRate({...trips[0],rated:true}));assert.ok(!C.canRate(trips[3]));
});
test('HTML escaping covers quoted attributes as well as elements',()=>assert.equal(C.esc('"\'><img>&'),'&quot;&#39;&gt;&lt;img&gt;&amp;'));
test('inTripWindow allows only [go - 60m, back + 30m] inclusive on the same day',()=>{
 assert.equal(C.inTripWindow('07:00','14:30','05:59'),false);
 assert.equal(C.inTripWindow('07:00','14:30','06:00'),true);
 assert.equal(C.inTripWindow('07:00','14:30','10:15'),true);
 assert.equal(C.inTripWindow('07:00','14:30','15:00'),true);
 assert.equal(C.inTripWindow('07:00','14:30','15:01'),false);
 assert.equal(C.inTripWindow('07:00','14:30',new Date('2026-10-15T05:59:00+03:00')),false);
 assert.equal(C.inTripWindow('07:00','14:30',new Date('2026-10-15T06:00:00+03:00')),true);
 assert.equal(C.inTripWindow('07:00','14:30',new Date('2026-10-15T11:00:00+03:00')),true);
 assert.equal(C.inTripWindow('07:00','14:30',new Date('2026-10-15T15:00:00+03:00')),true);
 assert.equal(C.inTripWindow('07:00','14:30',new Date('2026-10-15T15:01:00+03:00')),false);
 assert.equal(C.inTripWindow('invalid','14:30','08:00'),false);
});
test('canRevealRating enforces strict mutual-rating blind rule and isTrustedDriver requires verified with rating >= 4.5',()=>{
 const now=Date.parse('2026-10-15T12:00:00+03:00');
 assert.equal(C.canRevealRating(true,true,'2026-10-15T10:00:00+03:00',now),true);
 assert.equal(C.canRevealRating(true,true),true);
 assert.equal(C.canRevealRating(true,false,'2026-10-14T13:00:00+03:00',now),false);
 assert.equal(C.canRevealRating(false,true,'2026-10-14T13:00:00+03:00',now),false);
 assert.equal(C.canRevealRating(true,false,'2026-10-13T12:00:00+03:00',now),false);
 assert.equal(C.canRevealRating(false,false,'2026-10-13T11:59:59+03:00',now),false);
 assert.equal(C.canRevealRating(true,false,'',now),false);
 assert.equal(C.canRevealRating(false,true,'invalid',now),false);
 assert.equal(C.isTrustedDriver({verified:true,rating:4.5}),true);
 assert.equal(C.isTrustedDriver({verified:true,rating:4.9}),true);
 assert.equal(C.isTrustedDriver({verified:false,trusted:true,rating:4.9}),false);
 assert.equal(C.isTrustedDriver({verified:true,rating:4.4}),false);
});
test('completeLineTrips marks matching line upcoming bookings and trips as done without mutating inputs',()=>{
 const bookings=[
  {id:'b1',lineId:'l1',status:'upcoming',seats:['مقعد 1']},
  {id:'b2',lineId:'l2',status:'upcoming',seats:['مقعد 2']},
  {id:'b3',lineId:'l1',status:'done',seats:['مقعد 3']}
 ];
 const trips=[
  {id:'b1',lineId:'l1',status:'upcoming',rated:false},
  {id:'b2',lineId:'l2',status:'upcoming',rated:false},
  {id:'t_hol',holId:'h1',status:'upcoming',rated:false}
 ];
 const res=C.completeLineTrips('l1',bookings,trips);
 assert.equal(bookings[0].status,'upcoming');
 assert.equal(trips[0].status,'upcoming');
 assert.equal(res.bookings[0].status,'done');
 assert.equal(res.bookings[1].status,'upcoming');
 assert.equal(res.bookings[2].status,'done');
 assert.equal(res.completedBookings.length,1);
 assert.equal(res.completedBookings[0].id,'b1');
 assert.equal(res.trips[0].status,'done');
 assert.equal(res.trips[1].status,'upcoming');
 assert.equal(res.trips[2].status,'upcoming');
 assert.ok(C.canRate(res.trips[0]));
 assert.deepEqual(C.reportTrips(res.trips,'l1',null).map(t=>t.id),['b1']);
});

test('pure helpers: atomic booking payload, rating reveal from myRating + otherFlag, session name derivation, absence path selection, and student parent_code resolution',()=>{
 // 1. H4: buildAtomicBookingPayload builds RPC parameters and never accepts client user_id
 const Cloud = require('../assets/cloud');
 const payload = Cloud.buildAtomicBookingPayload({
  id: 'ignored_client_id',
  user_id: 'spoofed_uid',
  userId: 'spoofed_uid_2',
  lineId: 'l1',
  passengerName: 'زينب علي',
  phone: '07701234567',
  plan: 'شهري كامل (5 أيام)',
  seats: ['مقعد 1', 'مقعد 2'],
  pickup: 'تقاطع الكرادة',
  returnShift: '16:00',
  payment: { method: 'zaincash', status: 'pending', ref: 'ZC-999' }
 });
 assert.deepEqual(payload, {
  p_line_id: 'l1',
  p_passenger_name: 'زينب علي',
  p_phone: '07701234567',
  p_plan_label: 'شهري كامل (5 أيام)',
  p_seats: ['مقعد 1', 'مقعد 2'],
  p_pickup: 'تقاطع الكرادة',
  p_return_shift: '16:00',
  p_pay_method: 'zaincash',
  p_pay_status: 'pending',
  p_pay_ref: 'ZC-999'
 });
 assert.equal('user_id' in payload, false);
 assert.equal('p_user_id' in payload, false);

 // 2. M2: resolveRatingReveal determines reveal strictly from (myRating exists + otherPartyFlag === true)
 assert.equal(C.resolveRatingReveal(true, true), true);
 assert.equal(C.resolveRatingReveal(true, false), false);
 assert.equal(C.resolveRatingReveal(false, true), false);
 assert.equal(C.resolveRatingReveal({ stars: 5, comment: 'ممتاز' }, true), true);
 assert.equal(C.resolveRatingReveal({ stars: 5 }, false), false);
 assert.equal(C.resolveRatingReveal(null, true), false);

 // 3. H5: passengerNameFromSession derives from user_metadata.name, user.name, or email prefix
 assert.equal(C.passengerNameFromSession({
  user: { id: 'u1', email: 'sara@khatti.iq', user_metadata: { name: 'سارة جاسم' } }
 }, 'افتراضي'), 'سارة جاسم');
 assert.equal(C.passengerNameFromSession({
  user: { id: 'u2', email: 'mustafa.iq@khatti.iq', name: 'مصطفى كريم' }
 }, 'افتراضي'), 'مصطفى كريم');
 assert.equal(C.passengerNameFromSession({
  user: { id: 'u3', email: 'ali.hussein@khatti.iq' }
 }, 'افتراضي'), 'ali.hussein');
 assert.equal(C.passengerNameFromSession(null, 'أحمد علي'), 'أحمد علي');

 // 4. M3: selectAttendanceSyncAction chooses mark_absent for absent in cloud mode
 assert.equal(C.selectAttendanceSyncAction('absent', true), 'mark_absent');
 assert.equal(C.selectAttendanceSyncAction('waiting', true), 'push_attendance');
 assert.equal(C.selectAttendanceSyncAction('boarded', true), 'push_attendance');
 assert.equal(C.selectAttendanceSyncAction('absent', false), 'local');

 // 5. M4: resolveStudentParentCode takes parent_code from student attendance/booking record, never driver phone
 assert.equal(C.resolveStudentParentCode({ code: 'KH-9012' }, { phone: '07701112233' }, { code: 'KH-0001' }), 'KH-9012');
 assert.equal(C.resolveStudentParentCode(null, { phone: '07705556677' }, { code: 'KH-0001' }), 'KH-6677');
 assert.equal(C.resolveStudentParentCode(null, {}, { parentCode: 'KH-3341' }), 'KH-3341');
 assert.equal(C.resolveStudentParentCode(null, null, null), 'KH-4829');
});

test('Slice 3 pure logic: chatChannelKey, canChatInWindow gate, filterLines (maxPrice & minRating), availability banner decision, demand counts, and line update broadcast message',()=>{
 // 1. مفتاح القناة (line_id + trip_date)
 assert.equal(C.chatChannelKey('l1','2026-11-04'),'l1:2026-11-04');
 assert.equal(C.chatChannelKey('  l2 ','2026-10-15'),'l2:2026-10-15');
 assert.match(C.chatChannelKey('l1'),/^l1:\d{4}-\d{2}-\d{2}$/);
 assert.equal(C.chatChannelKey('','2026-11-04'),'');
 assert.equal(C.chatChannelKey('l1','invalid-date'),'');

 // 2. بوابة نافذة الرحلة للمحادثة (canChatInWindow)
 const line={id:'l1',go:'07:00',back:'14:30'};
 assert.equal(C.canChatInWindow(line,'05:59'),false);
 assert.equal(C.canChatInWindow(line,'06:00'),true);
 assert.equal(C.canChatInWindow(line,'11:30'),true);
 assert.equal(C.canChatInWindow(line,'15:00'),true);
 assert.equal(C.canChatInWindow(line,'15:01'),false);
 assert.equal(C.canChatInWindow('07:30','15:00','06:30'),true);
 assert.equal(C.canChatInWindow('07:30','15:00','06:29'),false);

 // 3. منطق الفلاتر (filterLines: area, uni, comp, maxPrice, minRating) دون تعديل المدخلات
 const sampleLines=[
  {id:'l1',from:'الكرادة',to:'جامعة بغداد (الجادرية)',comp:'girls',price:60000,rating:4.9,free:11},
  {id:'l2',from:'المنصور',to:'الجامعة المستنصرية',comp:'mixed',price:80000,rating:4.8,free:2},
  {id:'l3',from:'الكرادة',to:'الجامعة المستنصرية',comp:'boys',price:50000,rating:4.2,free:0}
 ];
 assert.equal(C.filterLines(sampleLines,{}).length,3);
 assert.deepEqual(C.filterLines(sampleLines,{maxPrice:60000}).map(x=>x.id),['l1','l3']);
 assert.deepEqual(C.filterLines(sampleLines,{maxPrice:'55000'}).map(x=>x.id),['l3']);
 assert.deepEqual(C.filterLines(sampleLines,{minRating:4.8}).map(x=>x.id),['l1','l2']);
 assert.deepEqual(C.filterLines(sampleLines,{minRating:'4.85'}).map(x=>x.id),['l1']);
 assert.deepEqual(C.filterLines(sampleLines,{maxPrice:70000,minRating:4.5}).map(x=>x.id),['l1']);
 assert.deepEqual(C.filterLines(sampleLines,{area:'الكرادة',maxPrice:60000,minRating:4.5}).map(x=>x.id),['l1']);
 assert.deepEqual(C.filterLines(sampleLines,{comp:'mixed',maxPrice:'',minRating:''}).map(x=>x.id),['l2']);

 // 4. قرار شريط التوفر (shouldShowAvailabilityBanner & getAvailabilityBanners) وعدد الطلبات على خطوط السائق
 const reqs=[
  {id:'l1:u1',line_id:'l1',user_id:'u1'},
  {id:'l3:u1',line_id:'l3',user_id:'u1'},
  {id:'l1:u2',line_id:'l1',user_id:'u2'}
 ];
 // l1 has free=11 (>0) and user u1 has a request -> true
 assert.equal(C.shouldShowAvailabilityBanner(sampleLines[0],reqs,'u1'),true);
 // l3 has free=0 -> false even though u1 has a request
 assert.equal(C.shouldShowAvailabilityBanner(sampleLines[2],reqs,'u1'),false);
 // l2 has free=2 (>0) but no request -> false
 assert.equal(C.shouldShowAvailabilityBanner(sampleLines[1],reqs,'u1'),false);
 // different user u3 has no request on l1 -> false
 assert.equal(C.shouldShowAvailabilityBanner(sampleLines[0],reqs,'u3'),false);

 const banners=C.getAvailabilityBanners(sampleLines,reqs,'u1');
 assert.equal(banners.length,1);
 assert.equal(banners[0].lineId,'l1');
 assert.match(banners[0].msg,/^أصبحت مقاعد متاحة على خط الكرادة ← جامعة بغداد \(الجادرية\)$/);

 const counts=C.countLineNotifyRequests(sampleLines,reqs);
 assert.deepEqual(counts.map(c=>({lineId:c.lineId,count:c.count})),[
  {lineId:'l1',count:2},
  {lineId:'l2',count:0},
  {lineId:'l3',count:1}
 ]);

 // 5. نص تنبيه تعديل الخط
 assert.equal(C.buildLineUpdateBroadcastMsg({from:'الكرادة',to:'الجادرية'}),'تم تعديل خط الكرادة ← الجادرية');
});

test('Slice 4 pure logic: isValidSubscriptionPayMethod, buildSubscriptionPayload (manual amount & pending status), and formatErrorReport',()=>{
 // 1. التحقق من طريقة الدفع المسموحة ('cash','zain','asia')
 assert.equal(C.isValidSubscriptionPayMethod('cash'),true);
 assert.equal(C.isValidSubscriptionPayMethod('zain'),true);
 assert.equal(C.isValidSubscriptionPayMethod('asia'),true);
 assert.equal(C.isValidSubscriptionPayMethod(' zain '),true);
 assert.equal(C.isValidSubscriptionPayMethod('zaincash'),false);
 assert.equal(C.isValidSubscriptionPayMethod('asiahawala'),false);
 assert.equal(C.isValidSubscriptionPayMethod('card'),false);
 assert.equal(C.isValidSubscriptionPayMethod(''),false);
 assert.equal(C.isValidSubscriptionPayMethod(null),false);

 // 2. بناء حمولة الاشتراك (buildSubscriptionPayload): حالة pending دائماً ومبلغ يدوي أو null دون أي حساب آلي
 const subWithAmount=C.buildSubscriptionPayload({
  id:'sub_custom_1',
  driver_id:'spoofed_driver',
  plan_label:'اشتراك سائق فصلي',
  months:3,
  amount:50000,
  pay_method:'zain',
  pay_ref:'ZN-7788',
  status:'confirmed'
 },'drv-session-uuid');
 assert.deepEqual(subWithAmount,{
  id:'sub_custom_1',
  driver_id:'drv-session-uuid',
  plan_label:'اشتراك سائق فصلي',
  months:3,
  amount:50000,
  pay_method:'zain',
  pay_ref:'ZN-7788',
  status:'pending',
  starts_at:null,
  ends_at:null
 });

 // ترك المبلغ فارغاً يبقيه null دون ضرب الأشهر أو اختراع سعر
 const subBlankAmount=C.buildSubscriptionPayload({
  plan_label:'اشتراك سائق شهري',
  months:6,
  amount:'',
  pay_method:'asia',
  pay_ref:'AS-1122'
 },'drv-session-uuid');
 assert.equal(subBlankAmount.months,6);
 assert.equal(subBlankAmount.amount,null);
 assert.equal(subBlankAmount.pay_method,'asia');
 assert.equal(subBlankAmount.status,'pending');
 assert.match(subBlankAmount.id,/^sub_/);

 // رفض طريقة دفع غير مسموحة أو أشهر غير صالحة
 assert.equal(C.buildSubscriptionPayload({plan_label:'شهري',months:1,pay_method:'bitcoin'},'drv-1'),null);
 assert.equal(C.buildSubscriptionPayload({plan_label:'شهري',months:0,pay_method:'cash'},'drv-1'),null);
 assert.equal(C.buildSubscriptionPayload({plan_label:'شهري',months:1,amount:-100,pay_method:'cash'},'drv-1'),null);

 // 3. تنسيق تقرير الخطأ (formatErrorReport)
 const rep1=C.formatErrorReport('/driver/index.html','فشل مزامنة الخطوط',new Error('HTTP 503 Service Unavailable'),'uid-123');
 assert.equal(rep1.page,'/driver/index.html');
 assert.equal(rep1.message,'فشل مزامنة الخطوط');
 assert.equal(rep1.user_id,'uid-123');
 assert.match(rep1.details,/HTTP 503 Service Unavailable/);
 assert.match(rep1.id,/^er_/);

 const repObj=C.formatErrorReport({
  id:'er_fixed_1',
  page:'/passenger/booking.html',
  message:'تعذّر الحجز السحابي',
  details:{code:'PGRST301',status:401},
  user_id:'uid-999'
 });
 assert.deepEqual(repObj,{
  id:'er_fixed_1',
  user_id:'uid-999',
  page:'/passenger/booking.html',
  message:'تعذّر الحجز السحابي',
  details:'{"code":"PGRST301","status":401}'
 });

 // رسالة فارغة تعيد null
 assert.equal(C.formatErrorReport('/index.html','   ','details'),null);
});
