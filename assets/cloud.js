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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/rest/v1/khatti_lines?select=id&limit=1`, {
          headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
          signal: ctrl.signal
        });
        return res.ok;
      } catch(e){ return false; }
      finally { clearTimeout(timer); }
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

    /* جلب قائمة الخطوط من سحابة Supabase وتحويلها إلى شكل LINES */
    async fetchLines(){
      if(!this.isConfigured()) return null;
      const cfg = this.getConfig();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/rest/v1/khatti_lines?select=*`, {
          headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
          signal: ctrl.signal
        });
        if(!res.ok) return null;
        const rows = await res.json();
        if(!Array.isArray(rows)) return null;
        return rows.map(r => {
          const rObj = r && typeof r === "object" ? r : {};
          const driver = rObj.driver_name ?? rObj.driver ?? rObj.driverName ?? "";
          const go = String(rObj.go_time ?? rObj.go ?? "07:00");
          const back = String(rObj.back_time ?? rObj.back ?? "14:30");
          const seats = parseInt(rObj.seats, 10);
          const free = parseInt(rObj.free, 10);
          const price = parseInt(rObj.price, 10);
          const rating = parseFloat(rObj.rating);
          const rc = parseInt(rObj.rc, 10);
          return {
            id: String(rObj.id ?? ""),
            driverId: String(rObj.driver_id ?? rObj.driverId ?? ""),
            driver: String(driver),
            driverName: String(driver),
            phone: String(rObj.phone ?? ""),
            from: String(rObj.from_area ?? rObj.from ?? ""),
            to: String(rObj.to_dest ?? rObj.to ?? ""),
            go,
            back,
            times: String(rObj.times ?? `${go} — ${back}`),
            vehicle: String(rObj.vehicle ?? ""),
            type: String(rObj.type ?? rObj.vehicle ?? ""),
            plate: String(rObj.plate ?? ""),
            comp: String(rObj.comp || "mixed"),
            price: Number.isFinite(price) ? price : 0,
            seats: Number.isFinite(seats) ? seats : 0,
            free: Number.isFinite(free) ? free : (Number.isFinite(seats) ? seats : 0),
            rating: Number.isFinite(rating) ? rating : 5.0,
            rc: Number.isFinite(rc) ? rc : 0,
            trusted: rObj.trusted === undefined ? true : Boolean(rObj.trusted),
            route: Array.isArray(rObj.route) ? rObj.route : [],
            pickups: Array.isArray(rObj.pickups) ? rObj.pickups : [],
            comments: Array.isArray(rObj.comments) ? rObj.comments : [],
            status: String(rObj.status || "active")
          };
        });
      } catch(e){ return null; }
      finally { clearTimeout(timer); }
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
    },

    /* مزامنة الحجز والاشتراك سحابياً في جدول khatti_bookings */
    async pushBooking(booking){
      if(!this.isConfigured() || !booking || typeof booking !== "object") return false;
      const cfg = this.getConfig();
      const pay = booking.payment && typeof booking.payment === "object" ? booking.payment : {};
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/rest/v1/khatti_bookings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            id: String(booking.id ?? ""),
            line_id: String(booking.line_id ?? booking.lineId ?? ""),
            passenger_name: String(booking.passenger_name ?? booking.passengerName ?? booking.name ?? ""),
            phone: String(booking.phone ?? ""),
            plan_label: String(booking.plan_label ?? booking.planLabel ?? booking.plan ?? ""),
            seats: Array.isArray(booking.seats) ? booking.seats : [],
            pickup: String(booking.pickup ?? ""),
            return_shift: String(booking.return_shift ?? booking.returnShift ?? "14:30"),
            status: String(booking.status ?? "upcoming"),
            pay_method: String(pay.method ?? booking.pay_method ?? "cash"),
            pay_status: String(pay.status ?? booking.pay_status ?? "pending"),
            pay_ref: String(pay.ref ?? booking.pay_ref ?? "")
          }),
          signal: ctrl.signal
        });
        return res ? res.ok !== false : true;
      } catch(e){ return false; }
      finally { clearTimeout(timer); }
    },

    /* مزامنة تقييم الرحلة (راكب أو سائق) سحابياً في جدول khatti_ratings */
    async pushRating(rating){
      if(!this.isConfigured() || !rating || typeof rating !== "object") return false;
      const tripId = String(rating.tripId ?? rating.trip_id ?? "").trim();
      const role = String(rating.role ?? rating.rater_role ?? "").trim();
      if(!tripId || !role) return false;
      const cfg = this.getConfig();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/rest/v1/khatti_ratings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            id: `${tripId}:${role}`,
            trip_id: tripId,
            line_id: String(rating.lineId ?? rating.line_id ?? ""),
            rater_role: role,
            stars: Number(rating.stars),
            comment: String(rating.comment ?? "")
          }),
          signal: ctrl.signal
        });
        return res ? res.ok !== false : true;
      } catch(e){ return false; }
      finally { clearTimeout(timer); }
    },

    /* جلب تقييمات رحلة معينة من جدول khatti_ratings */
    async pullRatings(tripId){
      const cleanTripId = String(tripId ?? "").trim();
      if(!this.isConfigured() || !cleanTripId) return [];
      const cfg = this.getConfig();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/rest/v1/khatti_ratings?trip_id=eq.${encodeURIComponent(cleanTripId)}&select=*`, {
          headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
          signal: ctrl.signal
        });
        if(!res || !res.ok) return [];
        const rows = await res.json();
        if(!Array.isArray(rows)) return [];
        return rows.filter(r => r && typeof r === "object").map(r => ({
          role: String(r.rater_role ?? r.role ?? ""),
          stars: Number(r.stars),
          comment: String(r.comment ?? "")
        }));
      } catch(e){ return []; }
      finally { clearTimeout(timer); }
    }
  };

  if(typeof window !== "undefined"){
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      KhattiCloud.deferredInstallPrompt = e;
    });
  }

  if(typeof window !== "undefined") window.KhattiCloud = KhattiCloud;
  if(typeof module !== "undefined" && module.exports) module.exports = KhattiCloud;
  else root.KhattiCloud = KhattiCloud;
})(typeof globalThis !== "undefined" ? globalThis : this);
