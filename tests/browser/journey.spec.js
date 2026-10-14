const {test,expect}=require('@playwright/test');
test.use({viewport:{width:390,height:844}});
test.beforeEach(async({page})=>{await page.route('https://unpkg.com/**',route=>route.abort())});
async function identity(page,role='passenger'){
 await page.goto('/register.html?role='+role);const prefix=role==='driver'?'d':'p';
 await page.locator('#'+prefix+'name').fill('مستخدم تجربة');await page.locator('#'+prefix+'phone').fill('٠٧٧٠٠٠٠٠٠٠٠');await page.locator('#'+prefix+'send').click();
 await expect(page.locator('.journey-steps [aria-current=step]')).toContainText('الرمز');await page.locator(role==='driver'?'#vcode':'#pcode').fill('1234');await page.locator(role==='driver'?'#vverify':'#pverify').click();
}
test('passenger completes short registration, search, review and one local booking',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await identity(page);await expect(page.locator('#cname')).not.toBeVisible();await page.locator('#pdone').click();await expect(page).toHaveURL(/passenger\/search.html/);
 await page.locator('#uni').selectOption('جامعة بغداد');await page.locator('#area').selectOption('المنصور');await expect(page.locator('.linecard')).toHaveCount(1);await expect(page.locator('.linecard')).toContainText('الالتقاط');await page.locator('.linecard').click();
 await page.getByRole('link',{name:'راجع حجز مقعد تجريبي'}).click();await expect(page.locator('#ph')).toHaveValue('07700000000');await page.locator('#pickup').selectOption({index:1});await page.locator('[data-t=day]').click();await page.locator('#ok').click();
 await expect(page.locator('.journey-summary')).toContainText('مول المنصور');expect(await page.evaluate(()=>K.get('bookings',[]).length)).toBe(0);
 await page.locator('#edit-booking').click();await expect(page.locator('#pickup')).toHaveValue('مول المنصور');await expect(page.locator('input[name=t]:checked')).toBeChecked();await page.locator('#ok').click();
 await page.evaluate(()=>{const confirm=document.getElementById('confirm-booking');confirm.click();confirm.click()});await expect(page.locator('#app')).toContainText('حُفظ الحجز التجريبي محليًا');expect(await page.evaluate(()=>K.get('bookings',[]).length)).toBe(1);
 await page.getByRole('link',{name:'عرض رحلاتي التجريبية'}).click();await expect(page.locator('#app')).toContainText('مقعد يومي');expect(errors).toEqual([]);
});
test('search filters persist in tab, combine price/rating, and can be cleared',async({page})=>{
 await page.goto('/');await page.evaluate(()=>K.set('me',{name:'راكب تجربة'}));await page.goto('/passenger/search.html');await page.locator('#max-price').selectOption('60000');await page.locator('#min-rating').selectOption('4.5');await expect(page.locator('.linecard')).toHaveCount(1);await expect(page.locator('.linecard')).toHaveAttribute('href','line.html?id=l3');
 await page.reload();await expect(page.locator('#max-price')).toHaveValue('60000');await expect(page.locator('.linecard')).toHaveCount(1);await page.locator('#reset-search').click();await expect(page.locator('.linecard')).toHaveCount(6);
 await page.locator('#gov').selectOption('النجف');await expect(page.locator('#result-count')).toContainText('بغداد فقط');await expect(page.locator('#notify')).toBeVisible();
});
test('driver restores vehicle draft after repeating demo verification; no image is stored',async({page})=>{
 await identity(page,'driver');await page.locator('#vplate').fill('مسودة اختبار');await page.locator('#vyear').fill('2022');await page.locator('#demo-save-later').click();await expect(page.locator('#demo-draft-status')).toContainText('حُفظت');
 await identity(page,'driver');await expect(page.locator('#vplate')).toHaveValue('مسودة اختبار');await expect(page.locator('#vyear')).toHaveValue('2022');await expect(page.locator('#vlic')).toHaveCount(0);
 await page.locator('#vehicle-next').click();await expect(page.locator('#vlic')).toBeVisible();const draft=await page.evaluate(()=>K.get('registration_vehicle_draft'));expect(Object.keys(draft).sort()).toEqual(['plate','seats','vehicleType','year']);
 await page.locator('#ddone').click();await expect(page.locator('#journey-error')).toContainText('أرفق صورة');await expect(page.locator('#vlic')).toHaveAttribute('aria-invalid','true');
});
test('stock is checked again after the review screen',async({page})=>{
 await page.goto('/');await page.evaluate(()=>K.set('me',{name:'راكب تجربة',phone:'07700000000'}));await page.goto('/passenger/booking.html?id=l4');await page.locator('#ok').click();await page.evaluate(()=>K.set('bookings',[{id:'a',lineId:'l4',status:'upcoming',when:'اليوم'},{id:'b',lineId:'l4',status:'upcoming',when:'اليوم'}]));
 await page.locator('#confirm-booking').click();await expect(page.locator('#journey-error')).toContainText('نفدت المقاعد');expect(await page.evaluate(()=>K.get('bookings',[]).length)).toBe(2);await expect(page.locator('#confirm-booking')).toBeEnabled();
});
