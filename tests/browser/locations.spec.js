const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
 await page.route('https://unpkg.com/**',r=>r.abort());await page.goto('/');await page.evaluate(()=>K.set('me',{name:'راكب اختبار'}));await page.goto('/passenger/search.html');
});
test('all governorates are selectable and cities cascade without stale Baghdad options',async({page})=>{
 await expect(page.locator('#gov option')).toHaveCount(19);
 await page.locator('#area').selectOption('المنصور');await page.locator('#gov').selectOption('البصرة');await expect(page.locator('#area')).toHaveValue('');await expect(page.locator('#area option')).toContainText(['كل المدن والمناطق','البصرة','الزبير']);await expect(page.locator('#area')).not.toContainText('المنصور');await expect(page.locator('#city-hint')).toContainText('البصرة');await expect(page.locator('#uni')).toBeDisabled();await expect(page.locator('.linecard')).toHaveCount(0);
 await page.locator('#gov').selectOption('نينوى');await expect(page.locator('#area')).toContainText('الموصل');await expect(page.locator('#area')).not.toContainText('الزبير');
 await page.locator('#gov').selectOption('حلبجة');await expect(page.locator('#area')).toContainText('حلبجة');await page.locator('#area').selectOption('خورمال');await expect(page.locator('#notify')).toBeVisible();
 await page.locator('#reset-search').click();await expect(page.locator('#gov')).toHaveValue('بغداد');await expect(page.locator('#area')).toHaveValue('');await expect(page.locator('#uni')).toBeEnabled();await expect(page.locator('.linecard')).toHaveCount(6);
});
test('chosen governorate and its city survive reload and are saved in notification requests',async({page})=>{
 await page.locator('#gov').selectOption('ذي قار');await page.locator('#area').selectOption('الشطرة');await page.reload();await expect(page.locator('#gov')).toHaveValue('ذي قار');await expect(page.locator('#area')).toHaveValue('الشطرة');await page.locator('#notifybtn').click();const request=await page.evaluate(()=>K.get('requests',[]).at(-1));expect(request.gov).toBe('ذي قار');expect(request.area).toBe('الشطرة');
 await page.locator('#gov').selectOption('النجف');await expect(page.locator('#area')).toHaveValue('');await expect(page.locator('#area')).toContainText('الكوفة');
});
test('legacy Mosul filters migrate to Nineveh and invalid city is discarded',async({page})=>{
 await page.evaluate(()=>sessionStorage.setItem('khatti_search_filters',JSON.stringify({gov:'الموصل',area:'الموصل'})));await page.reload();await expect(page.locator('#gov')).toHaveValue('نينوى');await expect(page.locator('#area')).toHaveValue('الموصل');
 await page.evaluate(()=>sessionStorage.setItem('khatti_search_filters',JSON.stringify({gov:'البصرة',area:'المنصور',uni:'جامعة بغداد'})));await page.reload();await expect(page.locator('#gov')).toHaveValue('البصرة');await expect(page.locator('#area')).toHaveValue('');await expect(page.locator('#uni')).toHaveValue('');
});
