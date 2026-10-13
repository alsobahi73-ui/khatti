const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function account(page,driver=true){await page.addInitScript(driver=>{
 if(!localStorage.getItem('khatti_demo_v1_me'))localStorage.setItem('khatti_demo_v1_me',JSON.stringify({name:'راكب تجريبي'}));
 if(driver)localStorage.setItem('khatti_demo_v1_driver',JSON.stringify({name:'سائق تجريبي',verified:true}));
},driver);}
test.beforeEach(async({page})=>{await page.route('https://unpkg.com/**',r=>r.abort());});
test('every packaged page runs with offline map fallback and no page errors',async({page})=>{
 await account(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const path of ['index.html','register.html',...['passenger','driver','parent'].flatMap(d=>fs.readdirSync('www/'+d).filter(f=>f.endsWith('.html')).map(f=>d+'/'+f))]){
  await page.goto('/'+path);await expect(page.locator('#demo-notice')).toBeVisible();
 }
 expect(errors).toEqual([]);
});
test('missing IDs produce recoverable screen on all line pages',async({page})=>{
 await account(page);for(const name of ['line','booking','tracking','chat','report']){await page.goto('/passenger/'+name+'.html?id=missing');await expect(page.locator('#app')).toContainText('العنصر غير موجود');}
});
test('registration is in package; direct role pages require simulated account',async({page})=>{
 await page.goto('/passenger/search.html');await expect(page).toHaveURL(/register.html\?role=passenger/);
 await page.locator('#pname').fill('راكب تجريبي');await page.locator('#pphone').fill('123');await page.locator('#psend').click();await expect(page.locator('#toast')).toContainText('رقم الهاتف');
 await page.locator('#pphone').fill('07700000000');await page.locator('#psend').click();await expect(page.locator('#toast')).toContainText('لم يُرسل');
 await page.locator('#pcode').fill('1234');await page.locator('#pverify').click();await page.locator('#pname').fill('اسم آخر');await page.locator('#pdone').click();await expect(page.locator('#toast')).toContainText('أعد محاكاة');
});
test('booking rejects bad input then creates one explicitly local trip',async({page})=>{
 await account(page);await page.goto('/passenger/booking.html?id=l1');await page.locator('#ok').click();await expect(page.locator('#toast')).toContainText('رقمًا عراقيًا');
 await page.locator('#ph').fill('07700000000');await page.locator('[data-p=zain]').click();await page.locator('#ok').click();await expect(page.locator('#toast')).toContainText('لا حجز فعلي ولا دفع');await expect(page.locator('#ok')).toBeDisabled();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('khatti_demo_v1_bookings')).length)).toBe(1);
});
test('SOS states that nothing was sent',async({page})=>{
 await account(page);await page.goto('/passenger/tracking.html?id=l1');await page.locator('#sos').click();await expect(page.locator('#toast')).toContainText('لم تُرسل استغاثة');await expect(page.locator('#feed')).toContainText('لم يُرسل موقع');
});
test('unrelated completed trip cannot support a report',async({page})=>{
 await account(page);await page.goto('/passenger/report.html?id=l2');await page.locator('#txt').fill('وصف تجريبي');await page.locator('#send').click();await expect(page.locator('#toast')).toContainText('لا توجد رحلة مكتملة مطابقة');
});
test('quoted name stays text and invalid line edits are rejected',async({page})=>{
 await account(page);await page.goto('/');await page.evaluate(()=>localStorage.setItem('khatti_demo_v1_me',JSON.stringify({name:'"><img src=x onerror=alert(1)>'})));
 await page.goto('/passenger/booking.html?id=l1');expect(await page.locator('#nm').inputValue()).toBe('\"><img src=x onerror=alert(1)>');await expect(page.locator('img')).toHaveCount(0);
 await page.goto('/driver/line-edit.html');await page.locator('#seats').fill('1.5');await page.locator('#save').click();await expect(page.locator('#toast')).toContainText('تحقق من المقاعد');
});
test('pin selection in Leaflet keeps nearest line first and retains distance note',async({page})=>{
 await account(page);
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',r=>r.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'application/javascript'}));
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',r=>r.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.goto('/passenger/search.html');await expect(page.locator('.linecard').first()).toHaveAttribute('href','line.html?id=l4');
 await page.evaluate(()=>{const create=L.map;L.map=function(...args){window.testMap=create.apply(this,args);return window.testMap}});
 await page.locator('#pinmode').click();
 await page.evaluate(()=>window.testMap.fire('click',{latlng:L.latLng(33.298,44.423)}));
 await expect(page.locator('#results .note')).toContainText('مرتبة حسب القرب');
 await expect(page.locator('.linecard').first()).toHaveAttribute('href','line.html?id=l5');
});
test('role picker and holiday inline buttons remain usable',async({page})=>{
 await page.goto('/register.html');await page.getByRole('button',{name:'🧑‍🎓 راكب',exact:true}).click();await expect(page.locator('#pname')).toBeVisible();
 await account(page);await page.goto('/passenger/holiday.html');
 // Create a future local fixture so expiry never makes this test date-dependent.
 await page.evaluate(()=>K.set('holPosts',[{id:'future',from:'المنصور',to:'جامعة بغداد',date:'2099-10-16',time:'12:00',dlabel:'تاريخ تجريبي',free:2,seats:2,price:5000,comp:'mixed',driver:'تجريبي',rating:0,rc:0}]));
 await page.reload();await page.getByRole('button',{name:'احجز مقعدًا ✓',exact:true}).last().click();await expect(page.locator('#bkok')).toBeVisible();
 await page.locator('#bkok').click();await expect(page.locator('#toast')).toContainText('لا حجز فعلي أو دفع');
});
test('malformed local records are ignored and storage failures never report success',async({page})=>{
 await account(page);await page.goto('/');await page.evaluate(()=>{K.set('trips',[null,{}, {id:'missing',lineId:'gone',when:'اليوم',status:'done'}]);K.set('lineEdits',{l1:{vehicle:'bad'}})});
 await page.goto('/passenger/trips.html');await expect(page.locator('#app')).toContainText('لا توجد رحلات');
 await page.goto('/passenger/booking.html?id=l1');await page.locator('#ph').fill('07700000000');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.endsWith('_trips'))throw new DOMException('full','QuotaExceededError');return original.call(this,k,v)}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#ok').click();await expect(page.locator('#toast')).toContainText('لم تكتمل العملية');
 expect(await page.evaluate(()=>K.get('bookings',[]).length)).toBe(0);expect(errors).toEqual(['تعذر الحفظ المحلي']);
});
test('stopping parent simulation cancels delayed notifications',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/parent/index.html');await page.locator('#simB').click();await page.waitForTimeout(1700);await expect(page.locator('#state')).toContainText('لا توجد رحلة نشطة');expect(errors).toEqual([]);
});
test('full line cannot be booked even through a direct URL',async({page})=>{
 await account(page);await page.goto('/');await page.evaluate(()=>K.set('bookings',Array.from({length:6},(_,i)=>({id:'b'+i,lineId:'l1',when:'اليوم',status:'upcoming'}))));
 await page.goto('/passenger/booking.html?id=l1');await page.locator('#ph').fill('07700000000');await page.locator('#ok').click();await expect(page.locator('#toast')).toContainText('لا توجد مقاعد');
});
