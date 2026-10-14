import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Store, Sql } from './db.ts';
import type { SmsSender } from './sms.ts';
import { token, digest, mac, equal, phone } from './security.ts';
export interface Options { store: Store; sms: SmsSender; secret: string; origin: string; privateDir: string; reviewerToken?: string; staticDir?: string; clock?: () => number; production?: boolean }
class HttpError extends Error { statusCode: number; code: string; constructor(status: number, code: string, message: string) { super(message); this.statusCode = status; this.code = code } }
const fail = (status: number, code: string, message: string): never => { throw new HttpError(status, code, message) };
const object = (properties: any, required: string[]) => ({ type: 'object', additionalProperties: false, properties, required });
const str = (minLength = 1, maxLength = 100) => ({ type: 'string', minLength, maxLength });
export async function createApp(o: Options) {
 if (o.secret.length < 32) throw new Error('AUTH_SECRET must have at least 32 characters');
 if (o.production) throw new Error('Production launch is disabled: live SMS, infrastructure and security acceptance must be completed first');
 const app = Fastify({ logger: false, bodyLimit: 16384, ajv: { customOptions: { removeAdditional: false } }, trustProxy: false });
 const now = () => (o.clock || Date.now)();
 const iso = (time: number) => new Date(time).toISOString();
 await app.register(cookie);
 await app.register(rateLimit, { max: 100, timeWindow: '1 minute', allowList: req=>!req.url.startsWith('/v1/') });
 app.addHook('onRequest', async (req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
  if (req.url.startsWith('/v1/')) {
   reply.header('Cache-Control', 'no-store');
   if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== o.origin) fail(403, 'ORIGIN_DENIED', 'مصدر الطلب غير مسموح');
  }
 });
 app.setErrorHandler((error: any, req, reply) => {
  const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  reply.code(status).send({ error: { code: error.validation ? 'INVALID_INPUT' : status === 500 ? 'INTERNAL_ERROR' : error.code || 'REQUEST_FAILED', message: error.validation ? 'تحقق من المدخلات المطلوبة' : status === 500 ? 'تعذّر إكمال العملية؛ أعد المحاولة' : error.message, request_id: req.id } });
 });
 const sessions = new WeakMap<FastifyRequest, { userId: string; raw: string }>();
 async function auth(req: FastifyRequest) {
  const raw = req.cookies.khatti_session || '';
  const result = await o.store.query('SELECT user_id FROM sessions WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>$2', [digest(raw), iso(now())]);
  if (!raw || !result.rows[0]) fail(401, 'AUTH_REQUIRED', 'سجّل الدخول أولًا');
  const value = { userId: result.rows[0].user_id as string, raw }; sessions.set(req, value); return value;
 }
 async function mutate(req: FastifyRequest) {
  const session = await auth(req);
  if (!equal(String(req.headers['x-csrf-token'] || ''), mac(o.secret, 'csrf:' + session.raw))) fail(403, 'CSRF_DENIED', 'أعد فتح الصفحة ثم حاول مجددًا');
  return session;
 }
 async function reviewer(req: FastifyRequest) {
  if (!o.reviewerToken || !equal(String(req.headers.authorization || ''), 'Bearer ' + o.reviewerToken)) fail(403, 'REVIEWER_REQUIRED', 'غير مخوّل للمراجعة');
 }
 async function view(db: Sql, userId: string) {
  const u = (await db.query('SELECT id,full_name,phone_e164,phone_verified_at,privacy_version FROM users WHERE id=$1', [userId])).rows[0];
  const roles = (await db.query('SELECT role FROM user_roles WHERE user_id=$1 ORDER BY role', [userId])).rows.map(x => x.role);
  const driver = (await db.query('SELECT vehicle_type,plate,vehicle_year,seats,document_id,review_status,review_reason FROM driver_profiles WHERE user_id=$1', [userId])).rows[0] || null;
  return { id: u.id, name: u.full_name, phone: u.phone_e164, phoneVerifiedAt: u.phone_verified_at, privacyVersion: u.privacy_version, roles, driver };
 }
 app.get('/v1/health', async () => { await o.store.query('SELECT 1'); return { status: 'ok', smsMode: o.sms.mode, productionReady: false } });
 app.post('/v1/auth/otp/request', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { body: object({ name: str(2), phone: str(8, 30), role: { enum: ['passenger', 'driver'] }, consent: { const: true } }, ['name','phone','role','consent']) } }, async (req, reply) => {
  const body = req.body as any, normalized = phone(body.phone);
  if (!normalized || body.name.trim().length < 2) fail(400, 'INVALID_INPUT', 'أدخل اسمًا ورقم هاتف عراقيًا صحيحين');
  const id = randomUUID(), code = String(randomInt(100000, 1000000));
  const limited = await o.store.transaction(async db => {
   await db.query('INSERT INTO phone_limits(phone_e164,last_requested_at,day,requests) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING', [normalized, iso(0), iso(now()).slice(0,10)]);
   const row = (await db.query('SELECT * FROM phone_limits WHERE phone_e164=$1 FOR UPDATE', [normalized])).rows[0];
   const day = new Date(row.day).toISOString().slice(0,10), today = iso(now()).slice(0,10);
   if (now() - new Date(row.last_requested_at).getTime() < 60000 || (day === today && row.requests >= 10)) return true;
   await db.query('UPDATE phone_limits SET last_requested_at=$2,day=$3,requests=$4 WHERE phone_e164=$1', [normalized, iso(now()), today, day === today ? row.requests + 1 : 1]);
   await db.query('UPDATE auth_challenges SET consumed_at=$2 WHERE phone_e164=$1 AND consumed_at IS NULL', [normalized, iso(now())]);
   await db.query('INSERT INTO auth_challenges(id,phone_e164,full_name,role,code_digest,expires_at,privacy_version,consent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, normalized, body.name.trim(), body.role, mac(o.secret, id + ':' + code), iso(now()+300000), 'development-v1', iso(now())]);
   return false;
  });
  if (limited) fail(429, 'OTP_LIMIT', 'انتظر قبل طلب رمز آخر');
  try { await o.sms.send({ challengeId: id, phone: normalized!, code }) } catch {
   await o.store.query('UPDATE auth_challenges SET consumed_at=$2 WHERE id=$1', [id, iso(now())]);
   return reply.code(503).send({ error: { code: 'SMS_UNAVAILABLE', message: 'تعذر إرسال الرمز؛ لم يكتمل التسجيل', request_id: req.id } });
  }
  return { challengeId: id, expiresIn: 300, smsMode: o.sms.mode, message: o.sms.mode === 'test' ? 'اختبار محلي فقط: لم تُرسل SMS. اطلب رمز الاختبار من مشغّل البيئة.' : 'إذا أمكن التسليم سيصلك رمز التحقق' };
 });
 app.post('/v1/auth/otp/verify', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: object({ challengeId: { type: 'string', format: 'uuid' }, code: { type: 'string', pattern: '^\\d{6}$' } }, ['challengeId','code']) } }, async (req, reply) => {
  const { challengeId, code } = req.body as any, raw = token();
  const userId = await o.store.transaction(async db => {
   const challenge = (await db.query('SELECT * FROM auth_challenges WHERE id=$1 FOR UPDATE', [challengeId])).rows[0];
   if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= now() || challenge.attempts >= 5) return null;
   await db.query('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=$1', [challengeId]);
   if (!equal(challenge.code_digest, mac(o.secret, challengeId+':'+code))) return null;
   await db.query('UPDATE auth_challenges SET consumed_at=$2 WHERE id=$1', [challengeId, iso(now())]);
   const existing = (await db.query('INSERT INTO users(id,full_name,phone_e164,phone_verified_at,privacy_version,consent_at) VALUES($1,$2,$3,$4,$5,$4) ON CONFLICT(phone_e164) DO UPDATE SET phone_verified_at=EXCLUDED.phone_verified_at RETURNING id', [randomUUID(),challenge.full_name,challenge.phone_e164,iso(now()),challenge.privacy_version])).rows[0];
   await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING', [existing.id,challenge.role]);
   await db.query('INSERT INTO sessions(token_digest,user_id,expires_at) VALUES($1,$2,$3)', [digest(raw),existing.id,iso(now()+7*86400000)]);
   return existing.id as string;
  });
  if (!userId) fail(400, 'INVALID_OTP', 'الرمز غير صالح أو انتهت صلاحيته');
  reply.setCookie('khatti_session',raw,{ path:'/v1', httpOnly:true, secure:o.origin.startsWith('https://'), sameSite:'strict', maxAge:7*86400 });
  return { user: await view(o.store,userId!), csrfToken:mac(o.secret,'csrf:'+raw), smsMode:o.sms.mode };
 });
 app.get('/v1/me', async req => { const s=await auth(req); return {user:await view(o.store,s.userId),csrfToken:mac(o.secret,'csrf:'+s.raw),smsMode:o.sms.mode} });
 app.patch('/v1/me', { schema:{ body:object({name:str(2)},['name']) } }, async req => {
  const s=await mutate(req), name=(req.body as any).name.trim();if(name.length<2)fail(400,'INVALID_INPUT','أدخل اسمًا صحيحًا');
  await o.store.query('UPDATE users SET full_name=$2 WHERE id=$1',[s.userId,name]);return {user:await view(o.store,s.userId)};
 });
 app.post('/v1/auth/logout', async (req,reply) => {const s=await mutate(req);await o.store.query('UPDATE sessions SET revoked_at=$2 WHERE token_digest=$1',[digest(s.raw),iso(now())]);reply.clearCookie('khatti_session',{path:'/v1'});return {ok:true}});
 app.post('/v1/driver/document-uploads', {bodyLimit: 7*1024*1024, schema:{body:object({imageBase64:str(1,7*1024*1024)},['imageBase64'])}}, async req => {
  const s=await mutate(req);
  const roles=await o.store.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role='driver'",[s.userId]);if(!roles.rows.length)fail(403,'DRIVER_REQUIRED','الحساب ليس حساب سائق');
  const encoded=(req.body as any).imageBase64;if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail(400,'INVALID_IMAGE','صيغة الصورة غير صحيحة');
  const input=Buffer.from(encoded,'base64');if(input.length>5*1024*1024)fail(400,'INVALID_IMAGE','الحد الأقصى للصورة 5 ميغابايت');
  const count=(await o.store.query('SELECT count(*)::int AS n FROM driver_documents WHERE user_id=$1',[s.userId])).rows[0].n;if(count>=5)fail(409,'DOCUMENT_LIMIT','بلغت حد الوثائق في بيئة الاختبار');
  let image:Buffer;
  try {const metadata=await sharp(input,{limitInputPixels:16000000}).metadata();if(!['jpeg','png','webp'].includes(metadata.format||''))throw new Error('format');image=await sharp(input,{limitInputPixels:16000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer()}catch{fail(400,'INVALID_IMAGE','أرفق صورة PNG أو JPEG أو WebP سليمة')}
  const id=randomUUID(), key=id+'.jpg';await mkdir(o.privateDir,{recursive:true,mode:0o700});await writeFile(path.join(o.privateDir,key),image!,{mode:0o600});
  try{await o.store.query('INSERT INTO driver_documents(id,user_id,object_key,content_type,byte_size) VALUES($1,$2,$3,$4,$5)',[id,s.userId,key,'image/jpeg',image!.length])}catch(e){await unlink(path.join(o.privateDir,key)).catch(()=>{});throw e}
  return {documentId:id};
 });
 app.get('/v1/driver/documents/:id', {schema:{params:object({id:{type:'string',format:'uuid'}},['id'])}}, async(req,reply)=>{
  const s=await auth(req), id=(req.params as any).id;const row=(await o.store.query('SELECT object_key FROM driver_documents WHERE id=$1 AND user_id=$2',[id,s.userId])).rows[0];if(!row)fail(404,'NOT_FOUND','الوثيقة غير متاحة');
  return reply.type('image/jpeg').header('Content-Disposition','attachment; filename="license.jpg"').send(await readFile(path.join(o.privateDir,row.object_key)));
 });
 async function draftDriver(req: FastifyRequest,write=false) {
  const session=write?await mutate(req):await auth(req);
  if(!(await o.store.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role='driver'",[session.userId])).rows.length)fail(403,'DRIVER_REQUIRED','الحساب ليس حساب سائق');
  return session;
 }
 app.get('/v1/driver/draft',async req=>{const s=await draftDriver(req);return {draft:(await o.store.query('SELECT vehicle_type AS "vehicleType",plate,vehicle_year AS year,seats FROM driver_drafts WHERE user_id=$1',[s.userId])).rows[0]||null}});
 app.put('/v1/driver/draft',{schema:{body:object({vehicleType:{enum:['كوستر','هايس','باص صغير','سيدان']},plate:{type:'string',maxLength:30},year:{type:'string',maxLength:4,pattern:'^[0-9]*$'},seats:{type:'string',maxLength:2,pattern:'^[0-9]*$'}},['vehicleType','plate','year','seats'])}},async req=>{
  const s=await draftDriver(req,true),b=req.body as any;
  await o.store.query('INSERT INTO driver_drafts(user_id,vehicle_type,plate,vehicle_year,seats) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET vehicle_type=$2,plate=$3,vehicle_year=$4,seats=$5,updated_at=now()',[s.userId,b.vehicleType,b.plate,b.year,b.seats]);
  return {saved:true};
 });
 app.post('/v1/driver/submissions',{schema:{body:object({vehicleType:{enum:['كوستر','هايس','باص صغير','سيدان']},plate:str(1,30),year:{type:'integer',minimum:1990,maximum:new Date().getFullYear()},seats:{type:'integer',minimum:4,maximum:60},documentId:{type:'string',format:'uuid'}},['vehicleType','plate','year','seats','documentId'])}},async req=>{
  const s=await mutate(req),b=req.body as any;if(!b.plate.trim())fail(400,'INVALID_INPUT','أدخل رقم اللوحة');
  await o.store.transaction(async db=>{
   const doc=(await db.query("SELECT d.id FROM driver_documents d JOIN user_roles r ON r.user_id=d.user_id AND r.role='driver' WHERE d.id=$1 AND d.user_id=$2",[b.documentId,s.userId])).rows[0];if(!doc)fail(404,'NOT_FOUND','الوثيقة غير متاحة');
   await db.query("INSERT INTO driver_profiles(user_id,vehicle_type,plate,vehicle_year,seats,document_id,review_status) VALUES($1,$2,$3,$4,$5,$6,'pending_review') ON CONFLICT(user_id) DO UPDATE SET vehicle_type=$2,plate=$3,vehicle_year=$4,seats=$5,document_id=$6,review_status='pending_review',review_reason=NULL,reviewed_by=NULL,reviewed_at=NULL,submitted_at=now()",[s.userId,b.vehicleType,b.plate.trim(),b.year,b.seats,b.documentId]);
   await db.query('DELETE FROM driver_drafts WHERE user_id=$1',[s.userId]);
  });return {user:await view(o.store,s.userId)};
 });
 app.get('/v1/internal/driver-reviews',async req=>{await reviewer(req);return {requests:(await o.store.query("SELECT p.user_id,u.full_name,p.vehicle_type,p.plate,p.review_status,p.document_id FROM driver_profiles p JOIN users u ON u.id=p.user_id WHERE p.review_status='pending_review' ORDER BY p.submitted_at LIMIT 100")).rows}});
 app.get('/v1/internal/driver-reviews/:id/document',{schema:{params:object({id:{type:'string',format:'uuid'}},['id'])}},async(req,reply)=>{await reviewer(req);const row=(await o.store.query('SELECT d.object_key FROM driver_profiles p JOIN driver_documents d ON d.id=p.document_id WHERE p.user_id=$1',[(req.params as any).id])).rows[0];if(!row)fail(404,'NOT_FOUND','الوثيقة غير متاحة');return reply.type('image/jpeg').header('Content-Disposition','attachment; filename="license.jpg"').send(await readFile(path.join(o.privateDir,row.object_key)))});
 app.post('/v1/internal/driver-reviews/:id/decision' ,{schema:{params:object({id:{type:'string',format:'uuid'}},['id']),body:object({decision:{enum:['approved','rejected']},reason:str(3,500)},['decision','reason'])}},async req=>{
  await reviewer(req);const b=req.body as any,id=(req.params as any).id;
  await o.store.transaction(async db=>{const p=(await db.query('SELECT review_status FROM driver_profiles WHERE user_id=$1 FOR UPDATE',[id])).rows[0];if(!p)fail(404,'NOT_FOUND','الطلب غير موجود');if(p.review_status!=='pending_review')fail(409,'ALREADY_REVIEWED','سبق اتخاذ قرار في الطلب');
   await db.query('UPDATE driver_profiles SET review_status=$2,review_reason=$3,reviewed_by=$4,reviewed_at=$5 WHERE user_id=$1',[id,b.decision,b.reason,'local-operator',iso(now())]);
   await db.query('INSERT INTO audit_events(id,actor,action,entity_id,reason) VALUES($1,$2,$3,$4,$5)',[randomUUID(),'local-operator','driver_'+b.decision,id,b.reason]);});return {ok:true};
 });
 app.get('/assets/runtime.js',async(_req,reply)=>reply.header('Cache-Control','no-store').type('application/javascript').send('window.KHATTI_RUNTIME='+JSON.stringify({mode:'server',smsMode:o.sms.mode})+';'));
 if(o.staticDir)await app.register(serveStatic,{root:o.staticDir, dotfiles:'deny'});
 return app;
}
