const {test}=require('node:test');
const assert=require('node:assert/strict');
const locations=require('../assets/locations');
test('all 19 Iraqi governorates have distinct names, valid centers and city selections',()=>{
 const expected=['بغداد','البصرة','نينوى','أربيل','النجف','كربلاء','بابل','الأنبار','ديالى','كركوك','صلاح الدين','واسط','ميسان','ذي قار','المثنى','القادسية','دهوك','السليمانية','حلبجة'];
 assert.deepEqual(new Set(locations.map(g=>g.name)),new Set(expected));assert.equal(locations.length,19);
 for(const g of locations){assert.ok(g.cities.length>0,g.name);assert.equal(new Set(g.cities).size,g.cities.length,g.name);assert.ok(g.cities.every(city=>typeof city==='string'&&city.trim()===city&&city.length>1));assert.ok(g.center[0]>=29&&g.center[0]<=38&&g.center[1]>=38&&g.center[1]<=49,g.name)}
 assert.ok(locations.find(g=>g.name==='نينوى').cities.includes('الموصل'));assert.ok(!locations.some(g=>g.name==='الموصل'));
});
test('portable bundle preserves the city catalogue instead of rewriting its local location variable',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'khatti-locations-bundle-'));
 try{
  const output=path.join(directory,'demo.html');execFileSync(process.execPath,[path.resolve('scripts/pack-demo.js'),output]);
  const html=fs.readFileSync(output,'utf8');const match=html.match(/const PAGES=(.*);\nfunction storage/);assert.ok(match);
  const pages=JSON.parse(match[1]);const scripts=[...pages['passenger/search.html'].matchAll(/<script>([\s\S]*?)<\/script>/g)];const source=scripts.map(m=>m[1]).find(code=>code.includes('const locations=['));assert.ok(source);
  const sandbox={};vm.runInNewContext(source,sandbox);assert.equal(sandbox.KhattiLocations.length,19);assert.ok(sandbox.KhattiLocations.find(g=>g.name==='البصرة').cities.includes('الزبير'));assert.ok(sandbox.KhattiLocations.every(g=>g.center.length===2&&g.cities.length>0));
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
