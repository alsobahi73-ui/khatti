/* Server-backed account UI; session cookie is HttpOnly, no customer data in localStorage. */
window.KhattiAuth = (() => {
 let csrf='', user=null, challenge=null, selectedRole='passenger';
 const escape=s=>KhattiCore.esc(s);
 async function api(url,method='GET',body){
  const response=await fetch('/v1'+url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await response.json()}catch{throw new Error('تعذّر الاتصال بخادم الحسابات')}
  if(!response.ok){const error=new Error(data.error?.message||'تعذّر إكمال العملية');error.status=response.status;throw error}
  if(data.csrfToken)csrf=data.csrfToken;if(data.user)user=data.user;return data;
 }
 const notice='<div class="note">بيئة تطوير: بيانات الحساب محفوظة في قاعدة خادم هذه البيئة. رمز الهاتف للاختبار فقط ولا تُرسل SMS. لا تستخدم بيانات أو وثائق حقيقية. الحجز والدفع والتتبع غير مربوطين بهذا الحساب بعد.</div>';
 function bind(id,handler){const button=document.getElementById(id);if(!button)return;button.onclick=async()=>{button.disabled=true;try{await handler()}catch(e){K.toast(e.message)}finally{button.disabled=false}}}
 function form(){
  document.querySelector('#app').innerHTML=notice+`<div class="card"><h3>التسجيل / الدخول بحساب محفوظ على الخادم</h3>
  <div class="field"><label>نوع الحساب</label><select id="account-role"><option value="passenger">راكب</option><option value="driver">سائق</option></select></div>
  <div class="field"><label>الاسم الكامل</label><input id="account-name" maxlength="100" autocomplete="name"></div>
  <div class="field"><label>رقم الهاتف العراقي</label><input id="account-phone" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="07xxxxxxxxx"></div>
  <label class="radio"><input id="account-consent" type="checkbox"> أوافق على حفظ بيانات الاختبار في خادم التطوير. لا أستخدم بيانات شخصية حقيقية.</label>
  <button class="btn btn-p" id="account-request">طلب رمز اختبار</button></div>`;
  document.getElementById('account-role').value=selectedRole;
  bind('account-request',async()=>{
   const name=document.getElementById('account-name').value,phone=document.getElementById('account-phone').value,role=document.getElementById('account-role').value,consent=document.getElementById('account-consent').checked;
   const result=await api('/auth/otp/request','POST',{name,phone,role,consent});selectedRole=role;challenge=result.challengeId;
   document.querySelector('#app').innerHTML=notice+`<div class="card"><h3>رمز اختبار — لا SMS فعلية</h3><div class="mut">أعطِ مشغّل بيئة التطوير معرف الطلب للحصول على الرمز:</div><code id="account-challenge">${escape(challenge)}</code><div class="field"><label>الرمز (6 أرقام، صالح لخمس دقائق)</label><input id="account-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><button class="btn btn-p" id="account-verify">تحقق واحفظ الحساب</button><button class="btn btn-g" id="account-back">العودة</button></div>`;
   bind('account-back',async()=>form());bind('account-verify',async()=>{await api('/auth/otp/verify','POST',{challengeId:challenge,code:document.getElementById('account-code').value});await dashboard()});
  });
 }
 async function dashboard(){
  await api('/me');const driver=user.roles.includes('driver'),profile=user.driver;
  document.querySelector('#app').innerHTML=notice+`<div class="card"><h3>حساب محفوظ على الخادم</h3><div id="account-summary"><b>${escape(user.name)}</b><div dir="ltr">${escape(user.phone)}</div><div>${user.roles.map(escape).join(' / ')}</div></div>
  <div class="field"><label>تعديل الاسم</label><input id="account-edit-name" maxlength="100" value="${escape(user.name)}"></div><button class="btn btn-g" id="account-save-name">حفظ الاسم</button><button class="btn btn-g" id="account-add-role">التسجيل بدور آخر / الدخول برقم آخر</button><button class="btn btn-g" id="account-logout">تسجيل خروج دون حذف الحساب</button></div>
  ${driver?`<div class="card"><h3>توثيق السائق</h3><div id="account-review-status">${profile?({pending_review:'قيد المراجعة — لا نشر قبل قرار المراجع',approved:'قُبل الطلب من مشغّل بيئة الاختبار؛ لا شارة ثقة تلقائية',rejected:'رُفض الطلب: '+escape(profile.review_reason||'')})[profile.review_status]:'أكمل بيانات المركبة وأرفق صورة تجريبية للمراجعة'}</div>
  <div class="field"><label>نوع المركبة</label><select id="account-vehicle"><option>كوستر</option><option>هايس</option><option>باص صغير</option><option>سيدان</option></select></div>
  <div class="field"><label>رقم اللوحة التجريبي</label><input id="account-plate" maxlength="30" value="${escape(profile?.plate||'')}"></div>
  <div class="field"><label>سنة الصنع</label><input id="account-year" type="number" min="1990" max="${new Date().getFullYear()}" value="${profile?.vehicle_year||2020}"></div>
  <div class="field"><label>المقاعد</label><input id="account-seats" type="number" min="4" max="60" value="${profile?.seats||14}"></div>
  <div class="field"><label>صورة إجازة تجريبية فقط (JPEG/PNG/WebP، حتى 5 ميغابايت)</label><input id="account-license" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="btn btn-p" id="account-submit-driver">حفظ وإرسال طلب المراجعة لخادم الاختبار</button></div>`:''}`;
  if(driver&&profile)document.getElementById('account-vehicle').value=profile.vehicle_type;
  bind('account-save-name',async()=>{await api('/me','PATCH',{name:document.getElementById('account-edit-name').value});await dashboard();K.toast('حُفظ الاسم في قاعدة الخادم')});
  bind('account-logout',async()=>{await api('/auth/logout','POST',{});csrf='';user=null;form();K.toast('انتهت الجلسة؛ الحساب ما زال محفوظًا')});
  bind('account-add-role',async()=>{selectedRole=driver?'passenger':'driver';form()});
  bind('account-submit-driver',async()=>{
   const file=document.getElementById('account-license').files[0];if(!file||file.size>5*1024*1024)throw new Error('اختر صورة تجريبية حتى 5 ميغابايت');
   const imageBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('تعذّر قراءة الصورة'));reader.readAsDataURL(file)});
   const uploaded=await api('/driver/document-uploads','POST',{imageBase64});
   await api('/driver/submissions','POST',{vehicleType:document.getElementById('account-vehicle').value,plate:document.getElementById('account-plate').value,year:Number(document.getElementById('account-year').value),seats:Number(document.getElementById('account-seats').value),documentId:uploaded.documentId});
   await dashboard();K.toast('حُفظت البيانات والوثيقة؛ الطلب قيد المراجعة');
  });
 }
 return {async mount(){K.page('التسجيل وحسابي','index.html');selectedRole=new URLSearchParams(location.search).get('role')==='driver'?'driver':'passenger';try{await dashboard()}catch(e){if(e.status===401)form();else{document.querySelector('#app').innerHTML=notice+'<div class="danger-note">تعذّر تحميل الحساب. أعد فتح الصفحة عند عودة الاتصال.</div>';K.toast(e.message)}}}};
})();
