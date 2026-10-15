/* ينسخ ملفات الويب إلى www/ لتغليفها بـ Capacitor — يعمل على أي نظام */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = path.join(root, "www");
const items = ["index.html", "manifest.json", "register.html", "support.html", "assets", "passenger", "driver", "parent"];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
function cp(s, d) {
  const st = fs.statSync(s);
  if (st.isDirectory()) { fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(s)) cp(path.join(s, f), path.join(d, f)); }
  else fs.copyFileSync(s, d);
}
for (const it of items) cp(path.join(root, it), path.join(out, it));
console.log("www/ ready ✓ — " + items.length + " entries packed");
