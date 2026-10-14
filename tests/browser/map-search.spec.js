const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.route('https://unpkg.com/**',r=>r.abort());await page.goto('/passenger/search.html')});
test('map fallback keeps manual search available',async({page})=>{
 await expect(page.locator('#gov')).not.toBeVisible();await page.locator('#choose-destination').click();await expect(page.locator('#map-help')).toContainText('تعذّر تحميل');await page.locator('#manual-filters summary').click();await expect(page.locator('#gov option')).toHaveCount(19);
});
test('both endpoints filter and rank demo routes and reset cleanly',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{setPoint('origin',[33.381,44.337]);setPoint('destination',[33.271,44.385])});
 await expect(page.locator('.linecard').first()).toHaveAttribute('href','line.html?id=l1');
 await page.evaluate(()=>setPoint('destination',[36.34,43.13]));await expect(page.locator('.linecard')).toHaveCount(0);
 await page.locator('#notifybtn').click();const request=await page.evaluate(()=>K.get('requests',[]).at(-1));expect(request.destination).toEqual([36.34,43.13]);expect(request.gov).toBeNull();
 await page.locator('#clear-points').click();await expect(page.locator('.linecard')).toHaveCount(6);expect(errors).toEqual([]);
});
test('GPS refusal provides a recoverable message',async({page})=>{
 await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok,fail)=>fail({code:1})},configurable:true}));
 await page.locator('#locate').click();await expect(page.locator('#location-status')).toContainText('لم تسمح');await expect(page.locator('#locate')).toBeEnabled();
});
