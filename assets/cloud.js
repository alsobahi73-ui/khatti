/* وحدة الربط السحابي المجاني لتطبيق خطّي (Khatti Cloud via Supabase REST)
 * ملاحظة معمارية: التتبع والمزامنة يعتمدان على الاستطلاع الدوري كل 15 ثانية فقط (HTTP Polling)؛
 * لا يوجد أي اشتراك Realtime حي عبر WebSockets، ويبقى الحقل channel مساوياً لـ null دائماً.
 * تعود الوحدة تلقائياً إلى التخزين المحلي (LocalStorage) في حال عدم إدخال مفاتيح السحابة بعد.
 */
(function(root){
  const CFG_KEY = "khatti_supabase_config_v1";
  const LINE_SELECT_COLS = "id,driver_id,from_area,to_dest,driver_name,vehicle,plate,comp,price,seats,free,go_time,back_time,rating,rc,trusted,verified,pickups,updated_at";
  const LINE_SELECT_COLS_LEGACY = "id,from_area,to_dest,driver_name,vehicle,plate,comp,price,seats,free,go_time,back_time,rating,rc,trusted,verified,pickups,updated_at";

  function resolveAuth(){
    if(typeof window !== "undefined" && window.KhattiAuth) return window.KhattiAuth;
    if(typeof globalThis !== "undefined" && globalThis.KhattiAuth) return globalThis.KhattiAuth;
    if(root && root.KhattiAuth) return root.KhattiAuth;
    if(typeof require === "function"){
      try { return require("./auth"); } catch(e){}
    }
    return null;
  }

  const KhattiCloud = {
    client: null,
    channel: null, /* لا اشتراك Realtime حي؛ التتبع استطلاع كل 15 ثانية فقط (يبقى null) */
    deferredInstallPrompt: null,
    LINE_SELECT_COLS,

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

    _getSession(){
      const auth = resolveAuth();
      if(auth && typeof auth.readStoredSession === "function"){
        return auth.readStoredSession();
      }
      try {
        const raw = typeof localStorage !== "undefined" ? localStorage.getItem("khatti_demo_v1_auth") : null;
        return raw ? JSON.parse(raw) : null;
      } catch(e){ return null; }
    },

    _getSessionUserId(){
      const sess = this._getSession();
      return sess && sess.user && sess.user.id ? String(sess.user.id).trim() : "";
    },

    _buildHeaders(extra = {}){
      const cfg = this.getConfig();
      const headers = {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`
      };
      const auth = resolveAuth();
      if(auth && typeof auth.authHeaders === "function"){
        const ah = auth.authHeaders();
        if(ah && typeof ah === "object"){
          Object.assign(headers, ah);
        }
      }
      if(extra && typeof extra === "object"){
        Object.assign(headers, extra);
      }
      return headers;
    },

    _redirectToAuth(){
      if(!this.isConfigured()) return;
      if(typeof location !== "undefined" && location){
        const p = String(location.pathname || "");
        if(p.endsWith("/auth.html") || p === "auth.html") return;
        const inSub = p.includes("/driver/") || p.includes("/passenger/") || p.includes("/parent/");
        const target = (inSub ? "../" : "") + "auth.html";
        if(typeof location.replace === "function") location.replace(target);
        else location.href = target;
      }
    },

    /* تنفيذ طلب PostgREST مع مهلة 10 ثوانٍ، وتجديد الجلسة وإعادة المحاولة مرة واحدة عند 401 */
    async _request(url, options = {}){
      const execOnce = async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        try {
          const headers = this._buildHeaders(options.headers || {});
          const fetchOpts = { ...options, headers, signal: ctrl.signal };
          return await fetch(url, fetchOpts);
        } finally {
          clearTimeout(timer);
        }
      };

      let res = await execOnce();
      if(res && res.status === 401){
        const auth = resolveAuth();
        if(auth && typeof auth.refreshSession === "function"){
          try { await auth.refreshSession(); } catch(e){}
        }
        res = await execOnce();
        if(res && res.status === 401 && this.isConfigured()){
          this._redirectToAuth();
        }
      }
      return res;
    },

    getDeviceId(){
      const key = "khatti_demo_v1_device_id";
      try {
        if(typeof localStorage !== "undefined"){
          const existing = String(localStorage.getItem(key) || "").trim().replace(/^"|"$/g, "").toLowerCase();
          if(/^[0-9a-f]{16}$/.test(existing)) return existing;
        }
      } catch(e){}
      let id = "";
      if(typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function"){
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        id = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      } else {
        id = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      }
      try {
        if(typeof localStorage !== "undefined") localStorage.setItem(key, id);
      } catch(e){}
      return id;
    },

    async init(){
      const cfg = this.getConfig();
      if(!this.isConfigured()) return false;
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_lines?select=id&limit=1`);
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* حجز ذري للمقاعد سحابياً عبر دالة reserve_seat في Supabase */
    async reserveSeats(lineId, seats){
      const count = Number(seats);
      if(!this.isConfigured() || !lineId || !Number.isInteger(count) || count <= 0) return false;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/rpc/reserve_seat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ p_line_id: String(lineId), p_seats: count })
        });
        if(!res || !res.ok) return false;
        if(typeof res.json === "function"){
          const data = await res.json();
          return Boolean(data);
        }
        return true;
      } catch(e){ return false; }
    },

    /* إرسال الموقع اللحظي للسائق أو الراكب إلى سحابة Supabase */
    async pushLocation(lineId, role, name, lat, lng, speed=0){
      if(!this.isConfigured()) return false;
      const cfg = this.getConfig();
      const rowId = role === "driver" ? `${lineId}_driver_main` : `${lineId}_pax_${this.getDeviceId()}`;
      const payload = {
        id: rowId,
        line_id: lineId,
        user_role: role,
        user_name: name,
        lat: Number(lat),
        lng: Number(lng),
        speed: Number(speed) || 0,
        updated_at: new Date().toISOString()
      };
      const userId = this._getSessionUserId();
      if(userId) payload.user_id = userId;

      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_live_locations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify(payload)
        });
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* جلب أحدث مواقع السائق والركاب على الخط من السحابة */
    async pullLocations(lineId="l1"){
      if(!this.isConfigured()) return null;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_live_locations?line_id=eq.${encodeURIComponent(lineId)}&select=*`);
        if(!res || !res.ok) return null;
        return await res.json();
      } catch(e){ return null; }
    },

    /* جلب قائمة الخطوط من سحابة Supabase وتحويلها إلى شكل LINES (دون phone إلا لمالك الخط) */
    async fetchLines(){
      if(!this.isConfigured()) return null;
      const cfg = this.getConfig();
      try {
        let res = await this._request(`${cfg.url}/rest/v1/khatti_lines?select=${LINE_SELECT_COLS}`);
        if(res && res.status === 400){
          res = await this._request(`${cfg.url}/rest/v1/khatti_lines?select=${LINE_SELECT_COLS_LEGACY}`);
        }
        if(!res || !res.ok) return null;
        const rows = await res.json();
        if(!Array.isArray(rows)) return null;
        const session = this._getSession();
        const sessionUserId = String(session?.user?.id || "").trim();
        const auth = resolveAuth();

        return rows
          .filter(r => r && typeof r === "object" && String(r.id ?? "").trim() !== "")
          .map(r => {
            const rObj = r;
            const cleanId = String(rObj.id ?? "").trim();
            const driverId = String(rObj.driver_id ?? rObj.driverId ?? "").trim();
            const driver = rObj.driver_name ?? rObj.driver ?? rObj.driverName ?? "";
            const go = String(rObj.go_time ?? rObj.go ?? "07:00");
            const back = String(rObj.back_time ?? rObj.back ?? "14:30");
            const seats = parseInt(rObj.seats, 10);
            const free = parseInt(rObj.free, 10);
            const price = parseInt(rObj.price, 10);
            const rating = parseFloat(rObj.rating);
            const rc = parseInt(rObj.rc, 10);
            const lineObj = {
              id: cleanId,
              driver_id: driverId,
              driverId: driverId,
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
              verified: Boolean(rObj.verified),
              route: Array.isArray(rObj.route) ? rObj.route : [],
              pickups: Array.isArray(rObj.pickups) ? rObj.pickups : [],
              comments: Array.isArray(rObj.comments) ? rObj.comments : [],
              status: String(rObj.status || "active")
            };
            if(auth && typeof auth.stripLinePhone === "function"){
              return auth.stripLinePhone(lineObj, session);
            }
            if(!sessionUserId || !driverId || sessionUserId !== driverId){
              delete lineObj.phone;
            }
            return lineObj;
          });
      } catch(e){ return null; }
    },

    /* إنشاء أو تعديل خط سحابي مع فرض driver_id من الجلسة الحالية دائمًا */
    async pushLine(line){
      if(!this.isConfigured() || !line || typeof line !== "object") return false;
      const sess = this._getSession();
      const driverId = this._getSessionUserId();
      if(!sess || !sess.access_token || !driverId) return false;
      const cfg = this.getConfig();
      const existingId = (!line._new && !line.isNew) ? String(line.id ?? "").trim() : "";
      const lineId = existingId || `l_${Date.now().toString(36)}`;
      const seatsNum = Number(line.seats);
      const seats = Number.isFinite(seatsNum) && seatsNum > 0 ? Math.trunc(seatsNum) : 14;
      const freeNum = Number(line.free);
      const free = Number.isFinite(freeNum) && freeNum >= 0 ? Math.trunc(freeNum) : seats;
      const priceNum = Number(line.price);
      const price = Number.isFinite(priceNum) && priceNum >= 0 ? Math.trunc(priceNum) : 60000;
      const pickups = Array.isArray(line.pickups)
        ? line.pickups.map(p => String(p).trim()).filter(Boolean)
        : (typeof line.pickups === "string"
          ? line.pickups.split(/[،,]/).map(s => s.trim()).filter(Boolean)
          : []);

      const payload = {
        id: lineId,
        driver_id: driverId,
        from_area: String(line.from_area ?? line.from ?? "").trim(),
        to_dest: String(line.to_dest ?? line.to ?? "").trim(),
        driver_name: String(line.driver_name ?? line.driverName ?? line.driver ?? sess.user?.email ?? "سائق").trim() || "سائق",
        phone: String(line.phone ?? "").trim(),
        vehicle: String(line.vehicle ?? line.type ?? "").trim(),
        plate: String(line.plate ?? "").trim(),
        comp: String(line.comp || "mixed").trim() || "mixed",
        price,
        seats,
        free,
        go_time: String(line.go_time ?? line.go ?? "07:00").trim() || "07:00",
        back_time: String(line.back_time ?? line.back ?? "14:30").trim() || "14:30",
        pickups,
        updated_at: new Date().toISOString()
      };

      const isUpdate = Boolean(existingId);
      const url = isUpdate
        ? `${cfg.url}/rest/v1/khatti_lines?id=eq.${encodeURIComponent(existingId)}`
        : `${cfg.url}/rest/v1/khatti_lines`;
      const method = isUpdate ? "PATCH" : "POST";

      try {
        const res = await this._request(url, {
          method,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* حذف خط سحابي (يسمح به السائق المالك فقط حسب سياسة RLS) */
    async deleteLine(lineId){
      const cleanId = String(lineId ?? "").trim();
      if(!this.isConfigured() || !cleanId) return false;
      const sess = this._getSession();
      const driverId = this._getSessionUserId();
      if(!sess || !sess.access_token || !driverId) return false;
      const cfg = this.getConfig();
      try {
        const res = await this._request(
          `${cfg.url}/rest/v1/khatti_lines?id=eq.${encodeURIComponent(cleanId)}`,
          { method: "DELETE" }
        );
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* قراءة صف ملف السائق الخاص بالمستخدم الحالي من جدول khatti_driver_profiles */
    async getDriverProfile(userId){
      if(!this.isConfigured()) return null;
      const uid = String(userId || this._getSessionUserId() || "").trim();
      if(!uid) return null;
      const cfg = this.getConfig();
      try {
        const res = await this._request(
          `${cfg.url}/rest/v1/khatti_driver_profiles?user_id=eq.${encodeURIComponent(uid)}&select=*&limit=1`
        );
        if(!res || !res.ok) return null;
        const rows = await res.json();
        if(Array.isArray(rows) && rows.length > 0 && rows[0] && typeof rows[0] === "object"){
          return rows[0];
        }
        return null;
      } catch(e){ return null; }
    },

    /* حفظ/إرسال ملف السائق في khatti_driver_profiles بالحالة pending */
    async saveDriverProfile(profile){
      if(!this.isConfigured() || !profile || typeof profile !== "object") return false;
      const uid = String(profile.user_id || profile.userId || this._getSessionUserId() || "").trim();
      if(!uid) return false;
      const cfg = this.getConfig();
      const payload = {
        user_id: uid,
        name: String(profile.name || "").trim(),
        phone: String(profile.phone || "").trim(),
        licence_file: String(profile.licence_file ?? profile.lic ?? "").trim(),
        status: "pending"
      };
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_driver_profiles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify(payload)
        });
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* مزامنة حالة حضور/غياب أو صعود الطالب سحابياً */
    async pushAttendance(student, lineId="l1", tripDate="2026-10-15"){
      if(!this.isConfigured() || !student) return false;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_attendance?on_conflict=student_id,trip_date,line_id`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* مزامنة الحجز والاشتراك سحابياً في جدول khatti_bookings */
    async pushBooking(booking){
      if(!this.isConfigured() || !booking || typeof booking !== "object") return false;
      const cfg = this.getConfig();
      const pay = booking.payment && typeof booking.payment === "object" ? booking.payment : {};
      const payload = {
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
      };
      const userId = String(booking.user_id || booking.userId || this._getSessionUserId() || "").trim();
      if(userId) payload.user_id = userId;

      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_bookings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify(payload)
        });
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* مزامنة تقييم الرحلة (راكب أو سائق) سحابياً في جدول khatti_ratings */
    async pushRating(rating){
      if(!this.isConfigured() || !rating || typeof rating !== "object") return false;
      const tripId = String(rating.tripId ?? rating.trip_id ?? "").trim();
      const role = String(rating.role ?? rating.rater_role ?? "").trim();
      if(!tripId || !role) return false;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_ratings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            id: `${tripId}:${role}`,
            trip_id: tripId,
            line_id: String(rating.lineId ?? rating.line_id ?? ""),
            rater_role: role,
            stars: Number(rating.stars),
            comment: String(rating.comment ?? "")
          })
        });
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* جلب تقييمات رحلة معينة من جدول khatti_ratings */
    async pullRatings(tripId){
      const cleanTripId = String(tripId ?? "").trim();
      if(!this.isConfigured() || !cleanTripId) return [];
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_ratings?trip_id=eq.${encodeURIComponent(cleanTripId)}&select=*`);
        if(!res || !res.ok) return [];
        const rows = await res.json();
        if(!Array.isArray(rows)) return [];
        return rows.filter(r => r && typeof r === "object").map(r => ({
          role: String(r.rater_role ?? r.role ?? ""),
          stars: Number(r.stars),
          comment: String(r.comment ?? "")
        }));
      } catch(e){ return []; }
    }
  };

  if(typeof window !== "undefined"){
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      KhattiCloud.deferredInstallPrompt = e;
    });
  }

  if(typeof window !== "undefined") window.KhattiCloud = KhattiCloud;
  root.KhattiCloud = KhattiCloud;
  if(typeof module !== "undefined" && module.exports) module.exports = KhattiCloud;
})(typeof globalThis !== "undefined" ? globalThis : this);
