import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../../server/db.ts';
import { createApp } from '../../server/app.ts';
import { phone } from '../../server/security.ts';

test('persistent server registration and authorization',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'khatti-auth-'));
 let store=await openStore({dataDir:path.join(dir,'db')});
 let clock=Date.now(), serial=0;const origin='http://127.0.0.1:4180';
 const codes=new Map<string,string>();
 const options={store,origin,secret:'a'.repeat(48),privateDir:path.join(dir,'documents'),reviewerToken:'reviewer-test-key',clock:()=>clock,sms:{mode:'test' as const,async send(x:{challengeId:string;phone:string;code:string}){codes.set(x.challengeId,x.code)}}};
 let app=await createApp(options);
 const call=(method:any,url:string,body?:any,session?:any,extra:any={})=>app.inject({method,url,payload:body,remoteAddress:'127.0.0.'+(++serial%200+1),headers:{origin,...(session?{cookie:session.cookie,'x-csrf-token':session.csrf}:{}),...extra}});
 const challenge=async(phoneNumber:string,role='passenger')=>{const r=await call('POST','/v1/auth/otp/request',{name:'عميل اختبار',phone:phoneNumber,role,consent:true});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().code,undefined);return r.json().challengeId as string};
 const verify=async(id:string)=>{const r=await call('POST','/v1/auth/otp/verify',{challengeId:id,code:codes.get(id)});assert.equal(r.statusCode,200,r.body);return {cookie:r.cookies[0].name+'='+r.cookies[0].value,csrf:r.json().csrfToken,user:r.json().user,raw:r.cookies[0].value,response:r}};
 let passenger:any,driver:any,documentId:string;
 try{
 await t.test('normalizes Iraqi phone including Arabic numerals',()=>{assert.equal(phone('٠٧٧٠٠٠٠٠٠٠٠'),'+9647700000000');assert.equal(phone('+964 770 000 0000'),'+9647700000000');assert.equal(phone('123'),null)});
 await t.test('validates server fields, consent and rejects privilege injection',async()=>{
  for(const body of [{name:' ',phone:'07700000000',role:'passenger',consent:true},{name:'عميل',phone:'123',role:'passenger',consent:true},{name:'عميل',phone:'07700000000',role:'reviewer',consent:true},{name:'عميل',phone:'07700000000',role:'passenger',consent:false},{name:'عميل',phone:'07700000000',role:'passenger',consent:true,verified:true}])assert.equal((await call('POST','/v1/auth/otp/request',body)).statusCode,400);
  assert.equal((await store.query('SELECT count(*)::int AS n FROM users')).rows[0].n,0);
 });
 await t.test('requires correct OTP once, saves account and hashes session tokens',async()=>{
  const id=await challenge('07700000000');assert.equal((await call('POST','/v1/auth/otp/verify',{challengeId:id,code:'000000'})).statusCode,400);
  passenger=await verify(id);assert.equal(passenger.user.phone,'+9647700000000');assert.deepEqual(passenger.user.roles,['passenger']);assert.match(passenger.response.headers['set-cookie'] as string,/HttpOnly/);assert.match(passenger.response.headers['set-cookie'] as string,/SameSite=Strict/);
  assert.equal((await call('POST','/v1/auth/otp/verify',{challengeId:id,code:codes.get(id)})).statusCode,400);
  assert.notEqual((await store.query('SELECT token_digest FROM sessions')).rows[0].token_digest,passenger.raw);
 });
 await t.test('cooldown and failed attempts are enforced in database',async()=>{
  assert.equal((await call('POST','/v1/auth/otp/request',{name:'عميل',phone:'07700000000',role:'passenger',consent:true})).statusCode,429);
  const id=await challenge('07700000001');for(let i=0;i<5;i++)assert.equal((await call('POST','/v1/auth/otp/verify',{challengeId:id,code:'000000'})).statusCode,400);
  assert.equal((await call('POST','/v1/auth/otp/verify',{challengeId:id,code:codes.get(id)})).statusCode,400);
 });
 await t.test('expired and superseded challenges cannot create accounts',async()=>{
  const expired=await challenge('07700000002');clock+=300001;assert.equal((await call('POST','/v1/auth/otp/verify',{challengeId:expired,code:codes.get(expired)})).statusCode,400);
  const first=await challenge('07700000003');clock+=60001;await challenge('07700000003');assert.equal((await call('POST','/v1/auth/otp/verify',{challengeId:first,code:codes.get(first)})).statusCode,400);
 });
 await t.test('CSRF/origin and authenticated ownership are enforced',async()=>{
  assert.equal((await call('GET','/v1/me')).statusCode,401);
  assert.equal((await call('PATCH','/v1/me',{name:'جديد'},passenger,{'x-csrf-token':'wrong'})).statusCode,403);
  assert.equal((await call('PATCH','/v1/me',{name:'جديد'},passenger,{origin:'https://evil.example'})).statusCode,403);
  assert.equal((await call('PATCH','/v1/me',{name:'جديد',verified:true},passenger)).statusCode,400);
  assert.equal((await call('PATCH','/v1/me',{name:'اسم محفوظ'},passenger)).statusCode,200);
 });
 await t.test('new device login returns same user without overwriting stored name',async()=>{
  const second=await verify(await challenge('07700000000'));assert.equal(second.user.id,passenger.user.id);assert.equal(second.user.name,'اسم محفوظ');assert.equal((await store.query('SELECT count(*)::int AS n FROM users')).rows[0].n,1);
 });
 await t.test('driver upload validates actual image, protects file and requires manual review',async()=>{
  driver=await verify(await challenge('07700000004','driver'));
  assert.equal((await call('POST','/v1/driver/document-uploads',{imageBase64:Buffer.from('not an image').toString('base64')},driver)).statusCode,400);
  const image=await sharp({create:{width:4,height:4,channels:3,background:'white'}}).png().toBuffer();
  assert.equal((await call('POST','/v1/driver/document-uploads',{imageBase64:image.toString('base64')},passenger)).statusCode,403);
  const upload=await call('POST','/v1/driver/document-uploads',{imageBase64:image.toString('base64')},driver);assert.equal(upload.statusCode,200,upload.body);documentId=upload.json().documentId;
  assert.equal((await call('GET','/v1/driver/documents/'+documentId,undefined,passenger)).statusCode,404);
  assert.equal((await call('GET','/v1/driver/documents/'+documentId)).statusCode,401);
  const file=await call('GET','/v1/driver/documents/'+documentId,undefined,driver);assert.equal(file.statusCode,200);assert.equal((await sharp(file.rawPayload).metadata()).format,'jpeg');
  const submission=await call('POST','/v1/driver/submissions',{vehicleType:'هايس',plate:'اختبار 1',year:2020,seats:14,documentId},driver);assert.equal(submission.statusCode,200,submission.body);assert.equal(submission.json().user.driver.review_status,'pending_review');
 });
 await t.test('only local operator can review and decision is audited once',async()=>{
  const url='/v1/internal/driver-reviews/'+driver.user.id+'/decision';const body={decision:'approved',reason:'فحص اختبار يدوي'};
  assert.equal((await call('POST',url,body,driver)).statusCode,403);
  assert.equal((await call('POST',url,body,undefined,{authorization:'Bearer reviewer-test-key'})).statusCode,200);
  assert.equal((await call('POST',url,body,undefined,{authorization:'Bearer reviewer-test-key'})).statusCode,409);
  assert.equal((await store.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n,1);
  assert.equal((await call('GET','/v1/me',undefined,driver)).json().user.driver.review_status,'approved');
 });
 await t.test('logout revokes cookie while account remains in database',async()=>{
  assert.equal((await call('POST','/v1/auth/logout',{},passenger)).statusCode,200);assert.equal((await call('GET','/v1/me',undefined,passenger)).statusCode,401);
  assert.equal((await store.query('SELECT count(*)::int AS n FROM users WHERE id=$1',[passenger.user.id])).rows[0].n,1);
 });
 await t.test('SMS failure creates no account or usable challenge',async()=>{
  const broken=await createApp({...options,sms:{mode:'test',async send(){throw new Error('provider down')}}});
  try{const result=await broken.inject({method:'POST',url:'/v1/auth/otp/request',headers:{origin},payload:{name:'اختبار',phone:'07700000005',role:'passenger',consent:true}});assert.equal(result.statusCode,503);assert.equal((await store.query('SELECT count(*)::int AS n FROM users WHERE phone_e164=$1',['+9647700000005'])).rows[0].n,0);assert.ok((await store.query('SELECT consumed_at FROM auth_challenges WHERE phone_e164=$1',['+9647700000005'])).rows[0].consumed_at)}finally{await broken.close()}
 });
 await t.test('accounts and driver documents persist after database and server restart',async()=>{
  await app.close();await store.close();store=await openStore({dataDir:path.join(dir,'db')});app=await createApp({...options,store});
  const me=await call('GET','/v1/me',undefined,driver);assert.equal(me.statusCode,200,me.body);assert.equal(me.json().user.driver.review_status,'approved');assert.equal((await call('GET','/v1/driver/documents/'+documentId,undefined,driver)).statusCode,200);
 });
 await t.test('concurrent verification consumes a challenge exactly once',async()=>{
  const id=await challenge('07700000006');const results=await Promise.all([call('POST','/v1/auth/otp/verify',{challengeId:id,code:codes.get(id)}),call('POST','/v1/auth/otp/verify',{challengeId:id,code:codes.get(id)})]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,400]);assert.equal((await store.query('SELECT count(*)::int AS n FROM users WHERE phone_e164=$1',['+9647700000006'])).rows[0].n,1);
 });
 await t.test('expired session no longer exposes account data',async()=>{
  clock+=8*86400000;assert.equal((await call('GET','/v1/me',undefined,driver)).statusCode,401);
 });
 await t.test('production refuses test authentication startup',async()=>{await assert.rejects(createApp({...options,store,production:true}),/Production launch is disabled/)});
 }finally{await app.close();await store.close();await rm(dir,{recursive:true,force:true})}
});
