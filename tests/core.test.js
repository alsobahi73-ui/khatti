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
test('canRevealRating enforces blind 48h rule and isTrustedDriver requires verified with rating >= 4.5',()=>{
 const now=Date.parse('2026-10-15T12:00:00+03:00');
 assert.equal(C.canRevealRating(true,true,'2026-10-15T10:00:00+03:00',now),true);
 assert.equal(C.canRevealRating(true,false,'2026-10-14T13:00:00+03:00',now),false);
 assert.equal(C.canRevealRating(false,true,'2026-10-14T13:00:00+03:00',now),false);
 assert.equal(C.canRevealRating(true,false,'2026-10-13T12:00:00+03:00',now),true);
 assert.equal(C.canRevealRating(false,false,'2026-10-13T11:59:59+03:00',now),true);
 assert.equal(C.isTrustedDriver({verified:true,rating:4.5}),true);
 assert.equal(C.isTrustedDriver({verified:true,rating:4.9}),true);
 assert.equal(C.isTrustedDriver({verified:false,trusted:true,rating:4.9}),false);
 assert.equal(C.isTrustedDriver({verified:true,rating:4.4}),false);
});
