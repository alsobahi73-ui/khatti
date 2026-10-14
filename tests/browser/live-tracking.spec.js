const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.route('https://unpkg.com/**',r=>r.abort())});
test('offline tracking loads, moves, pauses and reports simulated SOS without errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/passenger/live-tracking.html');
 await expect(page.locator('#app')).toContainText('عرض تجريبي');await expect(page.locator('#fallback-svg')).toBeVisible();
 const first=await page.locator('#coords-bar').textContent();await expect.poll(()=>page.locator('#coords-bar').textContent()).not.toBe(first);
 await page.locator('#btn-toggle-sim').click();const paused=await page.locator('#coords-bar').textContent();await page.waitForTimeout(1100);await expect(page.locator('#coords-bar')).toHaveText(paused);
 await page.locator('#btn-walk-stop').click();await expect(page.locator('#coords-bar')).not.toHaveText(paused);
 await page.locator('#sos').click();await expect(page.locator('#toast')).toContainText('لم يتم إرسال');expect(errors).toEqual([]);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('live_pos')))).toEqual([]);
});
test('unknown line is recoverable',async({page})=>{await page.goto('/passenger/live-tracking.html?id=missing');await expect(page.locator('#app')).toContainText('الخط غير موجود');await expect(page.locator('#app a')).toHaveAttribute('href','search.html')});
test('GPS refusal resets controls and clears watch',async({page})=>{
 await page.addInitScript(()=>{window.cleared=[];Object.defineProperty(navigator,'geolocation',{value:{watchPosition:(ok,fail)=>{setTimeout(()=>fail({code:1}),10);return 7},clearWatch:id=>window.cleared.push(id)}})});
 await page.goto('/passenger/live-tracking.html');await page.locator('#btn-my-gps').click();await expect(page.locator('#gps-status')).toContainText('رُفض');await expect(page.locator('#btn-my-gps')).toContainText('تفعيل');expect(await page.evaluate(()=>window.cleared)).toContain(7);
});
test('GPS stays fixed during simulation ticks, is not saved and stops on exit',async({page})=>{
 await page.addInitScript(()=>{window.cleared=[];Object.defineProperty(navigator,'geolocation',{value:{watchPosition:(ok)=>{setTimeout(()=>ok({coords:{latitude:33.31,longitude:44.41}}),10);return 9},clearWatch:id=>window.cleared.push(id)}})});
 await page.goto('/passenger/live-tracking.html');await page.locator('#btn-my-gps').click();await expect(page.locator('#gps-status')).toContainText('معروض محليًا');const coords=await page.locator('#coords-bar').textContent();await page.waitForTimeout(1200);await expect(page.locator('#coords-bar')).toHaveText(coords);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('live_pos')))).toEqual([]);
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));expect(await page.evaluate(()=>window.cleared)).toContain(9);
});
