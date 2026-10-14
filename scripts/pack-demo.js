/* Builds a portable demo, never packages the API, database, secrets or customer data. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.argv[2]||path.join(root,'www','khatti-demo.html'));
const pages=['index.html','register.html',...['passenger','driver','parent'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.html')).map(f=>dir+'/'+f))];
const leafletRoot=path.dirname(require.resolve('leaflet/package.json'));
function dataFile(file){const type=file.endsWith('.png')?'image/png':'image/jpeg';return 'data:'+type+';base64,'+fs.readFileSync(file).toString('base64')}
let leafletCss=fs.readFileSync(path.join(leafletRoot,'dist/leaflet.css'),'utf8').replace(/url\(images\/([^)]*)\)/g,(_,name)=>'url('+dataFile(path.join(leafletRoot,'dist/images',name))+')');
const leafletLicense=fs.readFileSync(path.join(leafletRoot,'LICENSE'),'utf8').replace(/&/g,'&amp;').replace(/</g,'&lt;');
const leafletJs=fs.readFileSync(path.join(leafletRoot,'dist/leaflet.js'),'utf8');
const icons={iconUrl:dataFile(path.join(leafletRoot,'dist/images/marker-icon.png')),iconRetinaUrl:dataFile(path.join(leafletRoot,'dist/images/marker-icon-2x.png')),shadowUrl:dataFile(path.join(leafletRoot,'dist/images/marker-shadow.png'))};
const routeCode=source=>source.replace(/\blocation\./g,'__khattiLocation.').replace(/\bhistory\.replaceState\b/g,'__khattiHistory.replaceState');
function script(source){return '<script>'+source.replace(/<\/script/gi,'<\\/script')+'<\/script>'}
const documents={};
for(const name of pages){
 const folder=path.dirname(path.join(root,name));
 let source=fs.readFileSync(path.join(root,name),'utf8');
 source=source.replace(/<link\b[^>]*rel="manifest"[^>]*>/g,'');
 source=source.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,(_,href)=>'<style>'+(href.startsWith('https://unpkg.com/leaflet@1.9.4/')?leafletCss:fs.readFileSync(path.resolve(folder,href),'utf8'))+'</style>');
 source=source.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,(_,src)=>{
  if(src.startsWith('https://unpkg.com/leaflet@1.9.4/'))return script(leafletJs)+script('L.Icon.Default.mergeOptions('+JSON.stringify(icons)+');');
  const file=path.resolve(folder,src);
  if(!file.startsWith(path.join(root,'assets')+path.sep))throw new Error('Unexpected script path');
  return script(routeCode(fs.readFileSync(file,'utf8')));
 });
 // Redirect the application's own inline routing without patching the native Location object.
 source=source.replace(/<script>([\s\S]*?)<\/script>/g,(_,js)=>script(js.includes('Leaflet 1.9.4')||js.includes('function(t,e)')?js:routeCode(js)));
 source=source.replace(/onclick="([^"]*)"/g,(_,js)=>'onclick="'+routeCode(js)+'"');
 documents[name]=source;
}
const payload=JSON.stringify(documents).replace(/</g,'\\u003c');
const bootstrap=String.raw`
const PAGES=PAYLOAD;
function storage(kind){let native;try{native=window[kind];native.setItem('khatti_portable_probe','1');native.removeItem('khatti_portable_probe')}catch{native=null}
 const prefix='khatti_portable_v1:',memory=new Map();return {persistent:!!native,getItem(key){return native?native.getItem(prefix+key):(memory.get(key)??null)},setItem(key,value){if(native)native.setItem(prefix+key,String(value));else memory.set(key,String(value))},removeItem(key){if(native)native.removeItem(prefix+key);else memory.delete(key)},clear(){if(native){for(let i=native.length-1;i>=0;i--){const k=native.key(i);if(k.startsWith(prefix))native.removeItem(k)}}else memory.clear()},get length(){return native?[...Array(native.length)].filter((_,i)=>native.key(i).startsWith(prefix)).length:memory.size},key(i){return native?[...Array(native.length)].map((_,n)=>native.key(n)).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length))[i]??null:[...memory.keys()][i]??null}}}
const local=storage('localStorage'),session=storage('sessionStorage');
if(!local.persistent)document.getElementById('storage-note').textContent='المتصفح لا يتيح حفظ الملف محليًا؛ البيانات مؤقتة وتزول عند إغلاقه.';
let current='index.html';
function resolve(value,base=current){const url=new URL(value,new URL(base,'https://khatti.invalid/'));if(url.origin!=='https://khatti.invalid'||!PAGES[url.pathname.slice(1)])throw new Error('صفحة غير متاحة في هذه النسخة');return url.pathname.slice(1)+url.search}
function render(route,push=false){try{current=resolve(route,'https://khatti.invalid/');if(push)history.pushState(null,'','#'+encodeURIComponent(current));
 const setup='('+function(route){
  let here=new URL(route,'https://khatti.invalid/');
  Object.defineProperty(window,'localStorage',{value:parent.KhattiPreview.local});Object.defineProperty(window,'sessionStorage',{value:parent.KhattiPreview.session});
  window.__khattiLocation={get pathname(){return here.pathname},get search(){return here.search},get href(){return here.href},set href(value){parent.KhattiPreview.go(value,here.href)},replace(value){parent.KhattiPreview.go(value,here.href,true)},reload(){parent.KhattiPreview.reload()}};
  window.__khattiHistory={replaceState(state,title,value){here=new URL(value,here);parent.KhattiPreview.replace(here.href)}};
  document.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(!a)return;const href=a.getAttribute('href');if(!href||href.startsWith('#'))return;const url=new URL(href,here);if(url.origin==='https://khatti.invalid'){event.preventDefault();parent.KhattiPreview.go(url.href)}else{event.preventDefault();window.open(url.href,'_blank','noopener')}},true);
 }.toString()+')('+JSON.stringify(current)+');';
 const content=PAGES[current.split('?')[0]].replace('<head>','<head><script>'+setup+'<\/script>');document.getElementById('app-frame').srcdoc=content;document.getElementById('preview-error').hidden=true;
 }catch(error){const box=document.getElementById('preview-error');box.hidden=false;box.textContent=error.message}}
window.KhattiPreview={local,session,go(value,base=current,replace=false){try{const target=resolve(value,base);if(replace)history.replaceState(null,'','#'+encodeURIComponent(target));render(target,!replace)}catch(e){const box=document.getElementById('preview-error');box.hidden=false;box.textContent=e.message}},replace(value){current=resolve(value);history.replaceState(null,'','#'+encodeURIComponent(current))},reload(){render(current)}};
document.getElementById('home').onclick=()=>KhattiPreview.go('index.html','https://khatti.invalid/');
document.getElementById('reset').onclick=()=>{if(confirm('مسح بيانات هذه النسخة التجريبية فقط والبدء من جديد؟')){local.clear();session.clear();KhattiPreview.go('index.html','https://khatti.invalid/')}};
window.addEventListener('popstate',()=>{let route='index.html';try{route=decodeURIComponent(location.hash.slice(1))||route}catch{}render(route)});
let first='index.html';try{first=decodeURIComponent(location.hash.slice(1))||first}catch{}render(first);
`.replace('PAYLOAD',()=>payload);
const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>خَطّي — نسخة التجربة</title><style>html,body{margin:0;height:100%;font-family:Tahoma,Arial,sans-serif;background:#f2f5f7;color:#1d2b3a}.shell{height:100%;max-width:480px;margin:auto;display:grid;grid-template-rows:auto 1fr}.preview{padding:10px 12px;background:#123a5c;color:white;font-size:12px;line-height:1.7}.preview b{color:#e09a12;font-size:16px}.preview button{background:white;color:#123a5c;border:0;border-radius:6px;padding:6px 12px;margin-inline-start:6px;cursor:pointer}iframe{border:0;width:100%;height:100%;min-height:0;background:#f2f5f7}#preview-error{background:#fdecea;color:#80251a;padding:8px}summary{cursor:pointer}a{color:inherit}</style></head><body><div class="shell"><header class="preview"><b>خَطّي — نسخة للتجربة</b><button id="home">الرئيسية</button><button id="reset">بدء تجربة جديدة</button><details><summary>طريقة التجربة وحدودها</summary><div>اختر راكبًا أو سائقًا، وأدخل بيانات وهمية. رمز التسجيل أي 4 أرقام. جميع الحجوزات والدفع والتتبع والتوثيق محاكاة. لا تُرسل بيانات لأي سائق أو خدمة طوارئ.</div><div id="storage-note">بيانات التجربة محفوظة على هذا المتصفح فقط وليست حسابات خادمية. الخرائط تحتاج إنترنت؛ باقي شاشات العرض مضمّنة داخل الملف.</div><div>يتضمن Leaflet 1.9.4 بترخيص BSD-2-Clause؛ حقوق النشر محفوظة لمساهميه. الخريطة © OpenStreetMap.</div><details><summary>ترخيص مكتبة الخرائط</summary><pre dir="ltr" style="white-space:pre-wrap;font-size:10px">'+leafletLicense+'</pre></details></details><div id="preview-error" role="alert" hidden></div></header><iframe id="app-frame" title="تطبيق خَطّي التجريبي"></iframe></div>'+script(bootstrap)+'</body></html>';
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,html);
console.log('Portable demo created: '+output+' ('+Buffer.byteLength(html)+' bytes, '+pages.length+' pages)');
