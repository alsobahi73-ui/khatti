import path from 'node:path';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openStore } from './db.ts';
import { createApp } from './app.ts';
import { testSms } from './sms.ts';
import { token } from './security.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=path.resolve(process.env.KHATTI_DATA_DIR || path.join(root,'.local-auth'));
if(process.env.NODE_ENV==='production')throw new Error('Production launch is disabled until live SMS and release acceptance are completed');
if(process.env.SMS_MODE && process.env.SMS_MODE!=='test')throw new Error('No live SMS provider is configured');
await mkdir(data,{recursive:true,mode:0o700});await chmod(data,0o700);
async function privateKey(name:string){const file=path.join(data,name);try{return (await readFile(file,'utf8')).trim()}catch(e:any){if(e.code!=='ENOENT')throw e;const value=token();await writeFile(file,value,{mode:0o600,flag:'wx'});return value}}
const store=await openStore({databaseUrl:process.env.DATABASE_URL,dataDir:path.join(data,'database')});
const port=Number(process.env.PORT||4180);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid PORT');
const origin='http://127.0.0.1:'+port;
const app=await createApp({store,sms:testSms(path.join(data,'test-inbox')),secret:await privateKey('auth-key'),reviewerToken:await privateKey('reviewer-key'),origin,privateDir:path.join(data,'documents'),staticDir:path.join(root,'www')});
let closing=false;async function close(){if(closing)return;closing=true;await app.close();await store.close()}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
try{await app.listen({host:'127.0.0.1',port});console.log('Khatti registration development server started on port '+port+'. TEST SMS ONLY; no public production access.')}catch(e){await close();throw e}
