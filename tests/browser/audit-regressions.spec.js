const {test,expect}=require('@playwright/test');
async function accounts(page){await page.addInitScript(()=>{localStorage.setItem('khatti_demo_v1_me',JSON.stringify({name:'راكب اختبار',phone:'07700000000'}));localStorage.setItem('khatti_demo_v1_driver',JSON.stringify({name:'سائق اختبار',verified:true}))})}
test.beforeEach(async({page})=>{await page.route('https://unpkg.com/**',r=>r.abort())});
test('driver access and role switch require a simulated account without silently approving one',async({page})=>{
 await page.goto('/driver/line-edit.html');await expect(page).toHaveURL(/register.html\?role=driver/);
 expect(await page.evaluate(()=>K.get('driver',null))).toBeNull();await page.goto('/');await page.evaluate(()=>K.switchRole('driver'));await expect(page).toHaveURL(/register.html\?role=driver/);expect(await page.evaluate(()=>K.get('driver',null))).toBeNull();
});
test('hostile URL, vehicle text and boarding PIN never execute HTML',async({page})=>{
 await accounts(page);const payload='"><img src=x onerror="window.auditInjected=1">';
 await page.goto('/passenger/chat.html?id='+encodeURIComponent(payload));await expect(page.locator('#app')).toContainText('العنصر غير موجود');expect(await page.evaluate(()=>window.auditInjected)).toBeUndefined();
 await page.goto('/driver/line-edit.html');await page.locator('#vehicle').fill(payload);await page.locator('#save').click();await expect(page.locator('#toast')).toContainText('حُفظت');
 await page.goto('/passenger/search.html');await expect(page.locator('#app img')).toHaveCount(0);await expect(page.locator('.linecard').first()).toBeVisible();expect(await page.evaluate(()=>window.auditInjected)).toBeUndefined();expect(await page.evaluate(p=>K.qrbox(p).includes('<img'),payload)).toBe(false);
});
test('multiple seats are subtracted once and remain stable after editing line',async({page})=>{
 await accounts(page);await page.goto('/passenger/booking.html?id=l1');const before=await page.evaluate(()=>K.line('l1').free);await page.locator('#unit_count').selectOption('2');await page.locator('#ok').click();await expect(page.locator('#ok')).toBeDisabled();expect(await page.evaluate(()=>K.line('l1').free)).toBe(before-2);
 await page.goto('/driver/line-edit.html');await expect(page.locator('#free')).toHaveValue(String(before-2));await page.locator('#save').click();await expect(page.locator('#toast')).toContainText('حُفظت');await page.goto('/driver/line-edit.html');await expect(page.locator('#free')).toHaveValue(String(before-2));
});
test('registration storage failure does not create a successful account',async({page})=>{
 await page.goto('/register.html?role=passenger');await page.locator('#pname').fill('راكب اختبار');await page.locator('#pphone').fill('07700000000');await page.locator('#psend').click();await page.locator('#pcode').fill('1234');await page.locator('#pverify').click();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='khatti_demo_v1_me')throw new DOMException('full','QuotaExceededError');return original.call(this,k,v)}});await page.locator('#pdone').click();await expect(page.locator('#toast')).toContainText('تعذّر');expect(await page.evaluate(()=>K.get('me',null))).toBeNull();await expect(page).toHaveURL(/register.html/);
});
test('successful registration ignores unsafe continuation URL and logout clears app data only',async({page})=>{
 await page.goto('/register.html?role=passenger&next='+encodeURIComponent('javascript:window.auditInjected=1'));
 await page.locator('#pname').fill('راكب اختبار');await page.locator('#pphone').fill('07700000000');await page.locator('#psend').click();await page.locator('#pcode').fill('1234');await page.locator('#pverify').click();await page.locator('#pdone').click();await expect(page).toHaveURL(/passenger\/search.html/);expect(await page.evaluate(()=>window.auditInjected)).toBeUndefined();
 await page.evaluate(()=>{K.set('support_msgs',[{msg:'old private message'}]);localStorage.setItem('unrelated','keep');localStorage.setItem('khatti_me',JSON.stringify({name:'legacy private'}))});await page.goto('/register.html');await page.getByRole('button',{name:'تسجيل خروج',exact:true}).click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('khatti_demo_v1_me'))).toBeNull();expect(await page.evaluate(()=>localStorage.getItem('khatti_demo_v1_support_msgs'))).toBeNull();expect(await page.evaluate(()=>localStorage.getItem('unrelated'))).toBe('keep');expect(await page.evaluate(()=>localStorage.getItem('khatti_me'))).toBeNull();
});
test('rating requires completed matching trip and can be stored only once',async({page})=>{
 await accounts(page);await page.goto('/passenger/rate.html?id=t1');await page.locator('#rstar').selectOption('1');await page.locator('#rok').click();await expect(page.locator('#toast')).toContainText('حُفظ التقييم');expect(await page.evaluate(()=>K.get('ratings',[])[0].stars)).toBe(1);await page.reload();await page.locator('#rok').click();await expect(page.locator('#toast')).toContainText('مرة واحدة');expect(await page.evaluate(()=>K.get('ratings',[]).length)).toBe(1);
 await page.goto('/passenger/report.html?id=l1');await page.locator('#txt').fill('وصف حادث تجريبي مكتمل');await page.locator('#send').click();await expect(page.locator('#toast')).toContainText('لم يُرسل');expect(await page.evaluate(()=>K.get('reports',[])[0].tripId)).toBe('t1');
});
test('driver rejects invalid numeric fields and expired holiday remains unavailable',async({page})=>{
 await accounts(page);await page.goto('/driver/holiday-post.html');await page.locator('#pto').fill('وجهة اختبار');await page.locator('#pdate').fill('2099-10-16');await page.locator('#pseats').fill('999.5');await page.locator('#ppub').click();await expect(page.locator('#toast')).toContainText('المقاعد');expect(await page.evaluate(()=>K.get('holPosts',[]).length)).toBe(0);
 await page.goto('/passenger/holiday.html');await page.evaluate(()=>K.set('holPosts',[{id:'expired',from:'a',to:'b',date:'2000-01-01',time:'07:00',dlabel:'منتهية',free:1,seats:1,price:1,comp:'mixed',driver:'اختبار'}]));await page.reload();await expect(page.locator('#app')).not.toContainText('منتهية');
});
test('core screens remain usable on narrow RTL phone viewports',async({page})=>{
 await accounts(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,390]){await page.setViewportSize({width,height:844});for(const path of ['/','/register.html','/passenger/search.html','/passenger/booking.html?id=l1','/driver/index.html','/parent/index.html']){await page.goto(path);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} at ${width}px`).toBe(true);await expect(page.locator('#demo-notice')).toBeVisible()}}
 expect(errors).toEqual([]);
});
