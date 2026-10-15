/* وحدة الربط السحابي المجاني لتطبيق خطّي (Khatti Cloud & Realtime Sync via Supabase)
 * تعمل تلقائياً مع الباقة المجانية لـ Supabase لبث إحداثيات السائق والراكب، الحضور، والتنبيهات بين الهواتف،
 * وتعود تلقائياً إلى التخزين المحلي (LocalStorage) في حال عدم إدخال مفاتيح السحابة بعد.
 */
(function(root){
  const CFG_KEY = "khatti_supabase_config_v1";

  const KhattiCloud = {
    client: null,
    channel: null,
    deferredInstallPrompt: null,

    getConfig(){
      try {
        const raw = localStorage.getItem(CFG_KEY);
        return raw ? JSON.parse(raw) : { url: "", key: "" };
      } catch(e){ return { url: "", key: "" }; }
    },

    saveConfig(url, key){
      const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
      const cleanKey = String(key || "").trim();
      localStorage.setItem(CFG_KEY, JSON.stringify({ url: cleanUrl, key: cleanKey }));
      return this.init();
    },

    isConfigured(){
      const cfg = this.getConfig();
      return Boolean(cfg.url && cfg.url.startsWith("https://") && cfg.key && cfg.key.length > 20);
    },

    async init(){
      const cfg = this.getConfig();
      if(!this.isConfigured()) return false;
      try {
        const res = await fetch(`${cfg.url}/rest/v1/khatti_lines?select=id&limit=1`, {
          headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
        });
        return res.ok;
      } catch(e){ return false; }
    },

    /* إرسال الموقع اللحظي للسائق أو الراكب إلى سحابة Supabase */
    async pushLocation(lineId, role, name, lat, lng, speed=0){
      if(!this.isConfigured()) return false;
      const cfg = this.getConfig();
      const rowId = `${lineId}_${role}_${role === 'driver' ? 'main' : 'pax'}`;
      try {
        await fetch(`${cfg.url}/rest/v1/khatti_live_locations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            id: rowId,
            line_id: lineId,
            user_role: role,
            user_name: name,
            lat: Number(lat),
            lng: Number(lng),
            speed: Number(speed) || 0,
            updated_at: new Date().toISOString()
          })
        });
        return true;
      } catch(e){ return false; }
    },

    /* جلب أحدث مواقع السائق والركاب على الخط من السحابة */
    async pullLocations(lineId="l1"){
      if(!this.isConfigured()) return null;
      const cfg = this.getConfig();
      try {
        const res = await fetch(`${cfg.url}/rest/v1/khatti_live_locations?line_id=eq.${encodeURIComponent(lineId)}&select=*`, {
          headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
        });
        if(!res.ok) return null;
        return await res.json();
      } catch(e){ return null; }
    },

    /* مزامنة حالة حضور/غياب أو صعود الطالب سحابياً */
    async pushAttendance(student, lineId="l1", tripDate="2026-10-15"){
      if(!this.isConfigured() || !student) return false;
      const cfg = this.getConfig();
      try {
        await fetch(`${cfg.url}/rest/v1/khatti_attendance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            student_id: student.id,
            line_id: lineId,
            student_name: student.name,
            stop_name: student.stop,
            parent_code: student.code,
            status: student.status,
            trip_date: tripDate,
            updated_at: new Date().toISOString()
          })
        });
        return true;
      } catch(e){ return false; }
    }
  };

  if(typeof window !== "undefined"){
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      KhattiCloud.deferredInstallPrompt = e;
    });
  }

  if(typeof module !== "undefined" && module.exports) module.exports = KhattiCloud;
  else root.KhattiCloud = KhattiCloud;
})(typeof globalThis !== "undefined" ? globalThis : this);
