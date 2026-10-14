import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const [command,id,decision,...reasonParts]=process.argv.slice(2);
const data=path.resolve(process.env.KHATTI_DATA_DIR||'.local-auth');
if(command==='code'){
 if(!id||!/^[a-f0-9-]{36}$/.test(id))throw new Error('Usage: npm run auth:operator -- code <challenge-id>');
 const value=JSON.parse(await readFile(path.join(data,'test-inbox',id+'.json'),'utf8'));
 console.log('LOCAL TEST ONLY; NO SMS SENT. Code: '+value.code);
}else{
 const origin='http://127.0.0.1:'+Number(process.env.PORT||4180);
 const key=(await readFile(path.join(data,'reviewer-key'),'utf8')).trim();
 let route='/v1/internal/driver-reviews',options:RequestInit={headers:{Authorization:'Bearer '+key,Origin:origin}};
 if(command==='document'){
  if(!id||!/^[a-f0-9-]{36}$/.test(id))throw new Error('Supply a driver user UUID');
  const response=await fetch(origin+route+'/'+id+'/document',options);if(!response.ok)throw new Error('Document access failed: '+response.status);
  const destination=path.join(data,'review-'+id+'.jpg');await writeFile(destination,Buffer.from(await response.arrayBuffer()),{mode:0o600});console.log('Saved private review image to '+destination);process.exit(0);
 }else if(command==='review'){
  if(!id||!['approved','rejected'].includes(decision)||reasonParts.join(' ').length<3)throw new Error('Usage: npm run auth:operator -- review <user-id> approved|rejected <reason>');
  route+='/'+encodeURIComponent(id)+'/decision';options={...options,method:'POST',headers:{...options.headers,'Content-Type':'application/json'},body:JSON.stringify({decision,reason:reasonParts.join(' ')})};
 }else if(command!=='pending')throw new Error('Use code, pending, document or review');
 const response=await fetch(origin+route,options);if(!response.ok)throw new Error('Operator request failed: '+response.status);console.log(JSON.stringify(await response.json(),null,2));
}
