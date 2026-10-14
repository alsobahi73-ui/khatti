const {test}=require('node:test');
const assert=require('node:assert/strict');
const locations=require('../assets/locations');
test('all 19 Iraqi governorates have distinct names, valid centers and city selections',()=>{
 const expected=['بغداد','البصرة','نينوى','أربيل','النجف','كربلاء','بابل','الأنبار','ديالى','كركوك','صلاح الدين','واسط','ميسان','ذي قار','المثنى','القادسية','دهوك','السليمانية','حلبجة'];
 assert.deepEqual(new Set(locations.map(g=>g.name)),new Set(expected));assert.equal(locations.length,19);
 for(const g of locations){assert.ok(g.cities.length>0,g.name);assert.equal(new Set(g.cities).size,g.cities.length,g.name);assert.ok(g.cities.every(city=>typeof city==='string'&&city.trim()===city&&city.length>1));assert.ok(g.center[0]>=29&&g.center[0]<=38&&g.center[1]>=38&&g.center[1]<=49,g.name)}
 assert.ok(locations.find(g=>g.name==='نينوى').cities.includes('الموصل'));assert.ok(!locations.some(g=>g.name==='الموصل'));
});
