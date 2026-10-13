const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('pack includes registration and every local static link, stylesheet, script, and dynamic page target resolves',()=>{
 const files=walk('www');assert.ok(files.includes('www/register.html'));
 for(const f of files.filter(f=>f.endsWith('.html'))){const s=fs.readFileSync(f,'utf8');
  for(const match of s.matchAll(/(?:src|href)=["']([^"']+)["']/g)){const href=match[1];if(/^(https?:|#|\$)/.test(href)||href.includes('${'))continue;assert.ok(fs.existsSync(path.resolve(path.dirname(f),href.split(/[?#]/)[0])),f+': '+href);}
  for(const [i,m] of [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries())assert.doesNotThrow(()=>new vm.Script(m[1]),f+' inline '+i);
 }
 for(const f of files.filter(f=>f.endsWith('.js')))assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(f,'utf8')),f);
});
