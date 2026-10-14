const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.route('https://unpkg.com/**',r=>r.abort());await page.addInitScript(()=>localStorage.setItem('khatti_demo_v1_me',JSON.stringify({name:'راكب اختبار'})));await page.goto('/passenger/search.html');await page.locator('#manual-filters summary').click()});
test('published interface exposes all 19 governorates with dependent cities',async({page})=>{
 await expect(page.locator('#gov option')).toHaveCount(19);await page.locator('#area').selectOption('المنصور');await page.locator('#gov').selectOption('البصرة');await expect(page.locator('#area')).toHaveValue('');await expect(page.locator('#area')).toContainText('الزبير');await expect(page.locator('#area')).not.toContainText('المنصور');await expect(page.locator('.linecard')).toHaveCount(0);
 await page.locator('#gov').selectOption('نينوى');await expect(page.locator('#area')).toContainText('الموصل');await page.locator('#gov').selectOption('حلبجة');await expect(page.locator('#area')).toContainText('خورمال');
 await page.locator('#gov').selectOption('بغداد');await expect(page.locator('#area')).toContainText('الكاظمية');await expect(page.locator('.linecard')).toHaveCount(6);
});
test('selected province and city are saved together in the availability request',async({page})=>{
 await page.locator('#gov').selectOption('ذي قار');await page.locator('#area').selectOption('الشطرة');await page.locator('#notifybtn').click();const request=await page.evaluate(()=>K.get('requests',[]).at(-1));expect(request.gov).toBe('ذي قار');expect(request.area).toBe('الشطرة');
});
