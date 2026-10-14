const {test,expect}=require('@playwright/test');
const {spawn}=require('node:child_process');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const path=require('node:path'),os=require('node:os');
let server,data;
test.beforeAll(async()=>{
 data=await mkdtemp(path.join(os.tmpdir(),'khatti-browser-'));
 server=spawn(process.execPath,['--import','tsx','server/main.ts'],{cwd:process.cwd(),env:{...process.env,PORT:'4182',KHATTI_DATA_DIR:data,DATABASE_URL:'',NODE_ENV:'test',SMS_MODE:'test'},stdio:'pipe'});
 let failures='';server.stderr.on('data',chunk=>failures+=chunk.toString());
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Server startup failed: '+failures);try{if((await fetch('http://127.0.0.1:4182/v1/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
 expect(ready).toBe(true);
});
test.afterAll(async()=>{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve))}if(data)await rm(data,{recursive:true,force:true})});
async function register(page,phone,role='passenger'){
 await page.goto('/register.html?role='+role);await page.locator('#account-name').fill('حساب اختبار خادمي');await page.locator('#account-phone').fill(phone);await page.locator('#account-consent').check();await page.locator('#account-request').click();
 const id=await page.locator('#account-challenge').textContent();const otp=JSON.parse(await readFile(path.join(data,'test-inbox',id+'.json'),'utf8')).code;
 await page.locator('#account-code').fill(otp);await page.locator('#account-verify').click();await expect(page.locator('#account-summary')).toContainText('حساب اختبار خادمي');
}
test('server account survives reload and local storage clearing; logout retains customer',async({page,context})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await register(page,'07700000101');await expect(page.locator('#app')).toContainText('بيانات الحساب محفوظة');
 expect(await page.evaluate(()=>localStorage.length)).toBe(0);expect(await page.evaluate(()=>document.cookie)).not.toContain('khatti_session');
 const cookies=await context.cookies();expect(cookies.find(c=>c.name==='khatti_session').httpOnly).toBe(true);
 await page.locator('#account-edit-name').fill('اسم محفوظ على الخادم');await page.locator('#account-save-name').click();await expect(page.locator('#account-summary')).toContainText('اسم محفوظ');
 await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.locator('#account-summary')).toContainText('اسم محفوظ');
 const tab=await context.newPage();await tab.goto('/register.html');await expect(tab.locator('#account-summary')).toContainText('اسم محفوظ');await tab.close();
 await page.locator('#account-logout').click();await expect(page.locator('#account-request')).toBeVisible();await expect(page.locator('#toast')).toContainText('الحساب ما زال محفوظًا');
 const response=await page.request.get('/v1/me');expect(response.status()).toBe(401);expect(errors).toEqual([]);
});
test('driver image is uploaded privately and acceptance cannot be simulated from UI',async({page})=>{
 await register(page,'07700000102','driver');await page.locator('#account-plate').fill('اختبار 123');
 const sharp=require('sharp');const image=await sharp({create:{width:4,height:4,channels:3,background:'white'}}).png().toBuffer();
 await page.locator('#account-license').setInputFiles({name:'test.png',mimeType:'image/png',buffer:image});await page.locator('#account-submit-driver').click();await expect(page.locator('#account-review-status')).toContainText('قيد المراجعة');
 await page.reload();await expect(page.locator('#account-review-status')).toContainText('قيد المراجعة');await expect(page.locator('#simok')).toHaveCount(0);
 await page.goto('/driver/index.html');await expect(page.locator('#app')).toContainText('غير مرتبطة بالخادم');
 const privateFile=await page.request.get('/.local-auth/auth-key');expect([403,404]).toContain(privateFile.status());
});
