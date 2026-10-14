/* Server-backed account UI; session cookie is HttpOnly, no customer data in localStorage. */
window.KhattiAuth = (() => {
 let csrf='', user=null, challenge=null, selectedRole='passenger', identity={name:'',phone:'',consent:false}, resendAt=0, flushDraft=async()=>{}, draftTimer;
 const escape=s=>KhattiCore.esc(s);
 async function api(url,method='GET',body){
  if(!navigator.onLine)throw new Error('الاتصال غير متاح؛ مدخلاتك باقية. أعد المحاولة عند عودته');
  let response;try{response=await fetch('/v1'+url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}catch{throw new Error('تعذّر الاتصال بالخادم ولم يتأكد الحفظ. مدخلاتك باقية؛ راجع حسابك عند عودة الاتصال')}
  let data;try{data=await response.json()}catch{throw new Error('تعذّر الاتصال بخادم الحسابات')}
  if(!response.ok){const error=new Error(data.error?.message||'تعذّر إكمال العملية');error.status=response.status;throw error}
  if(data.csrfToken)csrf=data.csrfToken;if(data.user)user=data.user;return data;
 }
 const notice='<div class="note">بيئة تطوير: بيانات الحساب محفوظة في قاعدة خادم هذه البيئة. رمز الهاتف للاختبار فقط ولا تُرسل SMS. لا تستخدم بيانات أو وثائق حقيقية. الحجز والدفع والتتبع غير مربوطين بهذا الحساب بعد.</div>';
 function bind(id,handler){const button=document.getElementById(id);if(!button)return;button.onclick=async()=>{button.disabled=true;Journey.clear();try{await handler()}catch(e){Journey.error(e.message)}finally{if(button.isConnected)button.disabled=false}}}
 function form(){
  document.querySelector('#app').innerHTML=notice+Journey.steps(['بياناتك','رمز التحقق'],0)+`<div class="card"><h3>التسجيل / الدخول بحساب محفوظ على الخادم</h3>
  <div class="field"><label for="account-role">نوع الحساب</label><select id="account-role"><option value="passenger">راكب</option><option value="driver">سائق</option></select></div>
  <div class="field"><label for="account-name">الاسم الكامل</label><input id="account-name" maxlength="100" autocomplete="name" value="${escape(identity.name)}"></div>
  <div class="field"><label for="account-phone">رقم الهاتف العراقي</label><input id="account-phone" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="07xxxxxxxxx" value="${escape(identity.phone)}"></div>
  <label class="radio"><input id="account-consent" type="checkbox" ${identity.consent?'checked':''}> أوافق على حفظ بيانات الاختبار في خادم التطوير. لا أستخدم بيانات شخصية حقيقية.</label>
  <button class="btn btn-p" id="account-request">طلب رمز اختبار</button></div>`;
  document.getElementById('account-role').value=selectedRole;
  bind('account-request',async()=>{
   identity={name:document.getElementById('account-name').value,phone:document.getElementById('account-phone').value,consent:document.getElementById('account-consent').checked};selectedRole=document.getElementById('account-role').value;
   if(!KhattiCore.name(identity.name)){Journey.error('أدخل اسمًا بين حرفين و100 حرف','account-name');return}
   if(!KhattiCore.phone(identity.phone)){Journey.error('أدخل رقم هاتف عراقيًا صحيحًا','account-phone');return}
   if(!identity.consent){Journey.error('وافق على حفظ بيانات الاختبار للمتابعة','account-consent');return}
   await requestCode();codeForm();
  });
 }
 async function requestCode(){const result=await api('/auth/otp/request','POST',{...identity,role:selectedRole});challenge=result.challengeId;resendAt=Date.now()+60000}
 function codeForm(){
  document.querySelector('#app').innerHTML=notice+Journey.steps(['بياناتك','رمز التحقق'],1)+`<div class="card"><h3>رمز اختبار — لا SMS فعلية</h3><p class="mut">الرقم المدخل: <b dir="ltr">${escape(identity.phone)}</b></p><div class="mut">أعطِ مشغّل بيئة التطوير معرف الطلب للحصول على الرمز:</div><code id="account-challenge">${escape(challenge)}</code><div class="field"><label for="account-code">الرمز (6 أرقام، صالح لخمس دقائق)</label><input id="account-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><button class="btn btn-p" id="account-verify">تحقق واحفظ الحساب</button><button class="btn btn-g" id="account-resend">إعادة طلب الرمز</button><button class="btn btn-g" id="account-back">تعديل الرقم</button></div>`;
  bind('account-back',async()=>form());
  bind('account-resend',async()=>{await requestCode();codeForm()});Journey.cooldown(document.getElementById('account-resend'),resendAt);
  bind('account-verify',async()=>{const code=document.getElementById('account-code').value;if(!/^\d{6}$/.test(code)){Journey.error('أدخل الرمز المكون من ستة أرقام','account-code');return}await api('/auth/otp/verify','POST',{challengeId:challenge,code});identity={name:'',phone:'',consent:false};await dashboard()});Journey.focus();
 }
 async function dashboard(){
  clearTimeout(draftTimer);await flushDraft();flushDraft=async()=>{};
  await api('/me');const driver=user.roles.includes('driver'),profile=user.driver;
  const draft=driver?(await api('/driver/draft')).draft:null;
  document.querySelector('#app').innerHTML=notice+`<div class="card"><h3>حساب محفوظ على الخادم</h3><div id="account-summary"><b>${escape(user.name)}</b><div dir="ltr">${escape(user.phone)}</div><div>${user.roles.map(escape).join(' / ')}</div></div>
  <div class="field"><label for="account-edit-name">تعديل الاسم</label><input id="account-edit-name" maxlength="100" value="${escape(user.name)}"></div><button class="btn btn-g" id="account-save-name">حفظ الاسم</button><button class="btn btn-g" id="account-add-role">التسجيل بدور آخر / الدخول برقم آخر</button><button class="btn btn-g" id="account-logout">تسجيل خروج دون حذف الحساب</button></div>
  ${driver?`<div class="card">${Journey.steps(['المركبة','الإجازة والمراجعة'],0)}<h3>توثيق السائق</h3><div id="account-review-status">${profile?({pending_review:'قيد المراجعة — لا نشر قبل قرار المراجع',approved:'قُبل الطلب من مشغّل بيئة الاختبار؛ لا شارة ثقة تلقائية',rejected:'رُفض الطلب: '+escape(profile.review_reason||'')})[profile.review_status]:'أكمل بيانات المركبة وأرفق صورة تجريبية للمراجعة'}</div>
  <div id="driver-vehicle-step"><div class="field"><label for="account-vehicle">نوع المركبة</label><select id="account-vehicle"><option>كوستر</option><option>هايس</option><option>باص صغير</option><option>سيدان</option></select></div>
  <div class="field"><label for="account-plate">رقم اللوحة التجريبي</label><input id="account-plate" maxlength="30" value="${escape(draft?.plate??profile?.plate??'')}"></div>
  <div class="field"><label for="account-year">سنة الصنع</label><input id="account-year" type="number" min="1990" max="${new Date().getFullYear()}" value="${escape(draft?.year??profile?.vehicle_year??2020)}"></div>
  <div class="field"><label for="account-seats">المقاعد</label><input id="account-seats" type="number" min="4" max="60" value="${escape(draft?.seats??profile?.seats??14)}"></div>
  <p id="driver-draft-status" class="mut" role="status">${draft?'تم استرجاع مسودة المركبة من حسابك':'تُحفظ بيانات المركبة في حسابك عند تعديلها؛ الصورة لا تُحفظ كمسودة'}</p><button class="btn btn-p" id="driver-next">التالي: صورة الإجازة</button><button class="btn btn-g" id="driver-save-later">حفظ والمتابعة لاحقًا</button></div><div id="driver-license-step" hidden><h3>صورة الإجازة ومراجعة الطلب</h3><div id="driver-review-summary"></div><div class="field"><label for="account-license">صورة إجازة تجريبية فقط (JPEG/PNG/WebP، حتى 5 ميغابايت)</label><input id="account-license" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="btn btn-p" id="account-submit-driver">حفظ وإرسال طلب المراجعة لخادم الاختبار</button><button class="btn btn-g" id="driver-back">تعديل بيانات المركبة</button></div></div>`:''}`;
  if(driver)document.getElementById('account-vehicle').value=draft?.vehicleType||profile?.vehicle_type||'كوستر';
  if(driver)driverJourney();
  bind('account-save-name',async()=>{await api('/me','PATCH',{name:document.getElementById('account-edit-name').value});await dashboard();K.toast('حُفظ الاسم في قاعدة الخادم')});
  bind('account-logout',async()=>{await flushDraft();await api('/auth/logout','POST',{});csrf='';user=null;flushDraft=async()=>{};form();K.toast('انتهت الجلسة؛ الحساب ما زال محفوظًا')});
  bind('account-add-role',async()=>{await flushDraft();flushDraft=async()=>{};clearTimeout(draftTimer);selectedRole=driver?'passenger':'driver';identity={name:'',phone:'',consent:false};form()});
  let uploadedDocumentId=null,uploadedFile=null;
  bind('account-submit-driver',async()=>{
   if(!validVehicle())return;
   const file=document.getElementById('account-license').files[0];if(!file||file.size>5*1024*1024)throw new Error('اختر صورة تجريبية حتى 5 ميغابايت');
   const imageBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('تعذّر قراءة الصورة'));reader.readAsDataURL(file)});
   if(uploadedFile!==file){const uploaded=await api('/driver/document-uploads','POST',{imageBase64});uploadedDocumentId=uploaded.documentId;uploadedFile=file}
   await api('/driver/submissions','POST',{vehicleType:document.getElementById('account-vehicle').value,plate:document.getElementById('account-plate').value,year:Number(document.getElementById('account-year').value),seats:Number(document.getElementById('account-seats').value),documentId:uploadedDocumentId});
   flushDraft=async()=>{};clearTimeout(draftTimer);await dashboard();K.toast('حُفظت البيانات والوثيقة؛ الطلب قيد المراجعة');
  });
 }
 function vehicle(){return {vehicleType:document.getElementById('account-vehicle').value,plate:document.getElementById('account-plate').value,year:document.getElementById('account-year').value,seats:document.getElementById('account-seats').value}}
 function validVehicle(){const value=vehicle();if(!value.plate.trim()){Journey.error('أدخل رقم اللوحة','account-plate');return false}if(!KhattiCore.integer(value.year,1990,new Date().getFullYear())){Journey.error('تحقق من سنة الصنع','account-year');return false}if(!KhattiCore.integer(value.seats,4,60)){Journey.error('عدد المقاعد الصحيح بين 4 و60','account-seats');return false}return true}
 function driverJourney(){
  let last=JSON.stringify(vehicle()),queue=Promise.resolve();
  const status=()=>document.getElementById('driver-draft-status');
  const save=async()=>{clearTimeout(draftTimer);const value=vehicle(),serialized=JSON.stringify(value);if(serialized===last)return queue;queue=queue.catch(()=>{}).then(async()=>{try{await api('/driver/draft','PUT',value);last=serialized;if(status())status().textContent=JSON.stringify(vehicle())===serialized?'حُفظت مسودة المركبة في حسابك؛ يمكنك العودة لاحقًا':'تغييرات أحدث لم يتأكد حفظها بعد…'}catch(error){if(status())status().textContent='لم يتأكد حفظ التغييرات؛ مدخلاتك باقية. أعد المحاولة عند عودة الاتصال';throw error}});return queue};
  flushDraft=save;
  document.querySelector('#driver-vehicle-step').addEventListener('input',()=>{if(status())status().textContent='تغييرات غير محفوظة بعد…';clearTimeout(draftTimer);draftTimer=setTimeout(()=>void save().catch(()=>{}),500)});
  bind('driver-next',async()=>{if(!validVehicle())return;await save();document.getElementById('driver-vehicle-step').hidden=true;document.getElementById('driver-license-step').hidden=false;const v=vehicle();document.getElementById('driver-review-summary').textContent=v.vehicleType+' • '+v.plate+' • '+v.year+' • '+v.seats+' مقعدًا';setDriverStep(1);document.getElementById('account-license').focus()});
  bind('driver-back',async()=>{document.getElementById('driver-license-step').hidden=true;document.getElementById('driver-vehicle-step').hidden=false;setDriverStep(0);document.getElementById('account-plate').focus()});
  bind('driver-save-later',async()=>{last='';await save();K.toast('حُفظت المسودة؛ أكملها لاحقًا من حسابك')});

 }
 function setDriverStep(step){const list=document.querySelector('#account-review-status').parentElement.querySelector('.journey-steps');if(list)list.outerHTML=Journey.steps(['المركبة','الإجازة والمراجعة'],step)}
 window.addEventListener('online',()=>{if(document.getElementById('driver-vehicle-step'))void flushDraft().catch(()=>{})});
 return {async mount(){K.page('التسجيل وحسابي','index.html');selectedRole=new URLSearchParams(location.search).get('role')==='driver'?'driver':'passenger';try{await dashboard()}catch(e){if(e.status===401)form();else{document.querySelector('#app').innerHTML=notice+'<div class="danger-note">تعذّر تحميل الحساب. أعد فتح الصفحة عند عودة الاتصال.</div>';K.toast(e.message)}}}};
})();
