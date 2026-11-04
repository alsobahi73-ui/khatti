/* وحدة الربط السحابي المجاني لتطبيق خطّي (Khatti Cloud via Supabase REST)
 * ملاحظة معمارية: التتبع والمزامنة يعتمدان على الاستطلاع الدوري كل 15 ثانية فقط (HTTP Polling)؛
 * لا يوجد أي اشتراك Realtime حي عبر WebSockets؛ التتبع استطلاع HTTP فقط.
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

    /* H4: بناء حمولة الحجز الذري دون تمرير user_id من العميل (يؤخذ من auth.uid() خادميًا) */
    buildAtomicBookingPayload(booking){
      const b = (booking && typeof booking === "object") ? booking : {};
      const pay = (b.payment && typeof b.payment === "object") ? b.payment : {};
      return {
        p_line_id: String(b.line_id ?? b.lineId ?? "").trim(),
        p_passenger_name: String(b.passenger_name ?? b.passengerName ?? b.name ?? "").trim(),
        p_phone: String(b.phone ?? "").trim(),
        p_plan_label: String(b.plan_label ?? b.planLabel ?? b.plan ?? "").trim(),
        p_seats: Array.isArray(b.seats) ? b.seats : [],
        p_pickup: String(b.pickup ?? "").trim(),
        p_return_shift: String(b.return_shift ?? b.returnShift ?? "14:30").trim() || "14:30",
        p_pay_method: String(pay.method ?? b.pay_method ?? "cash").trim() || "cash",
        p_pay_status: String(pay.status ?? b.pay_status ?? "pending").trim() || "pending",
        p_pay_ref: String(pay.ref ?? b.pay_ref ?? "").trim()
      };
    },

    /* H4: إنشاء حجز ذري سحابيًا عبر دالة create_booking_atomic (يعيد معرّف الحجز أو null عند عدم الكفاية) */
    async createBookingAtomic(booking){
      if(!this.isConfigured() || !booking || typeof booking !== "object") return null;
      const payload = this.buildAtomicBookingPayload(booking);
      if(!payload.p_line_id || !Array.isArray(payload.p_seats) || payload.p_seats.length < 1) return null;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/rpc/create_booking_atomic`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        if(!res || !res.ok) return null;
        if(typeof res.json === "function"){
          const data = await res.json();
          return (typeof data === "string" && data.trim()) ? data.trim() : null;
        }
        return null;
      } catch(e){ return null; }
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

    /* إصلاح أمني (أ-1): عرض الأهل عبر دالة خادمية بكود الطالب بدل قراءة جدول المواقع العام */
    async getParentView(parentCode){
      const code = String(parentCode ?? "").trim().toUpperCase();
      if(!this.isConfigured() || !code) return null;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/rpc/get_parent_view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_parent_code: code })
        });
        if(!res || !res.ok) return null;
        const rows = await res.json();
        if(Array.isArray(rows) && rows.length > 0) return rows[0];
        return null;
      } catch(e){ return null; }
    },

    /* إصلاح أمني (أ-1): موقع سائق خط الطالب عبر دالة خادمية بكود الطالب */
    async getParentDriverLocation(parentCode){
      const code = String(parentCode ?? "").trim().toUpperCase();
      if(!this.isConfigured() || !code) return null;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/rpc/get_driver_location_for_parent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_parent_code: code })
        });
        if(!res || !res.ok) return null;
        const rows = await res.json();
        if(Array.isArray(rows) && rows.length > 0) return rows[0];
        return null;
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
      /* إصلاح أمني (أ-2): إنشاء الخط للسائقين المعتمدين فقط؛ الموافقة من الإدارة عبر لوحة التحكم */
      const profile = await this.getDriverProfile(driverId);
      if(!profile || profile.status !== "approved") return false;
      const cfg = this.getConfig();
      const existingId = (!line._new && !line.isNew) ? String(line.id ?? "").trim() : "";
      const lineId = existingId || `l_${Date.now().toString(36)}`;
      const seatsNum = Number(line.seats);
      const seats = Number.isFinite(seatsNum) && seatsNum > 0 ? Math.trunc(seatsNum) : 14;
      const freeNum = Number(line.free);
      const free = Number.isFinite(freeNum) && freeNum >= 0 ? Math.min(Math.trunc(freeNum), seats) : seats;
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
        const ok = Boolean(res && res.ok);
        if(ok && !line.id) line.id = lineId;
        return ok;
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

    /* حفظ ملف السائق: إدراج أول بحالة pending؛ إعادة الحفظ دون مساس بالحالة (إصلاح ل-9: قفل الحالة كان يرفض إعادة حفظ المعتمد) */
    async saveDriverProfile(profile){
      if(!this.isConfigured() || !profile || typeof profile !== "object") return false;
      const uid = String(profile.user_id || profile.userId || this._getSessionUserId() || "").trim();
      if(!uid) return false;
      const cfg = this.getConfig();
      const base = {
        user_id: uid,
        name: String(profile.name || "").trim(),
        phone: String(profile.phone || "").trim(),
        licence_file: String(profile.licence_file ?? profile.lic ?? "").trim()
      };
      try {
        const existing = await this.getDriverProfile(uid);
        if(existing){
          const res = await this._request(`${cfg.url}/rest/v1/khatti_driver_profiles?user_id=eq.${encodeURIComponent(uid)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(base)
          });
          return Boolean(res && res.ok);
        }
        const res = await this._request(`${cfg.url}/rest/v1/khatti_driver_profiles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({ ...base, status: "pending" })
        });
        return Boolean(res && res.ok);
      } catch(e){ return false; }
    },

    /* مزامنة حالة حضور/غياب أو صعود الطالب سحابياً */
    async pushAttendance(student, lineId="l1", tripDate="2026-10-15"){
      if(!this.isConfigured() || !student) return false;
      const cfg = this.getConfig();
      const payload = {
        student_id: student.id,
        line_id: lineId,
        student_name: student.name,
        stop_name: student.stop,
        parent_code: student.parent_code ?? student.code,
        status: student.status,
        trip_date: tripDate,
        updated_at: new Date().toISOString()
      };
      const uid = String(student.user_id || student.userId || this._getSessionUserId() || "").trim();
      if(uid) payload.user_id = uid;
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_attendance?on_conflict=student_id,trip_date,line_id`, {
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

    /* M3: تسجيل غياب الراكب عبر دالة mark_absent الخادمية الآمنة */
    async markAbsent(lineId="l1", studentId="st_1", tripDate){
      const cleanLineId = String(lineId ?? "").trim();
      const cleanStudentId = String(studentId ?? "").trim();
      const cleanDate = String(
        tripDate || (typeof KhattiCore !== "undefined" && KhattiCore && typeof KhattiCore.today === "function" ? KhattiCore.today() : "2026-10-15")
      ).trim();
      if(!this.isConfigured() || !cleanLineId || !cleanStudentId || !cleanDate) return false;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/rpc/mark_absent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            p_line_id: cleanLineId,
            p_student_id: cleanStudentId,
            p_trip_date: cleanDate
          })
        });
        if(!res || !res.ok) return false;
        if(typeof res.json === "function"){
          const data = await res.json();
          return Boolean(data);
        }
        return true;
      } catch(e){ return false; }
    },

    /* مزامنة لوحة السائق سحابياً: تحديث صف حجز موجود فقط (PATCH) — لا إدراج جديد، حتى لا تتكرر الحجوزات أو تُنشأ دون خصم مقاعد (إصلاح أ-3) */
    async pushBooking(booking){
      if(!this.isConfigured() || !booking || typeof booking !== "object") return false;
      const bookingId = String(booking.id ?? "").trim();
      if(!bookingId) return false;
      const cfg = this.getConfig();
      const pay = booking.payment && typeof booking.payment === "object" ? booking.payment : {};
      const payload = {
        status: String(booking.status ?? "upcoming"),
        pay_method: String(pay.method ?? booking.pay_method ?? "cash"),
        pay_status: String(pay.status ?? booking.pay_status ?? "pending"),
        pay_ref: String(pay.ref ?? booking.pay_ref ?? "")
      };
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_bookings?id=eq.${encodeURIComponent(bookingId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        if(!res || !res.ok) return false;
        if(typeof res.json === "function"){
          const data = await res.json();
          if(Array.isArray(data)) return data.length > 0;
        }
        return true;
      } catch(e){ return false; }
    },

    /* M2: مزامنة تقييم الرحلة (راكب أو سائق) سحابياً في جدول khatti_ratings مع ضبط rater_user_id من الجلسة */
    async pushRating(rating){
      if(!this.isConfigured() || !rating || typeof rating !== "object") return false;
      const tripId = String(rating.tripId ?? rating.trip_id ?? "").trim();
      const role = String(rating.role ?? rating.rater_role ?? "").trim();
      if(!tripId || !role) return false;
      const cfg = this.getConfig();
      const raterUserId = String(this._getSessionUserId() || rating.rater_user_id || rating.raterUserId || "").trim();
      const payload = {
        id: `${tripId}:${role}`,
        trip_id: tripId,
        line_id: String(rating.lineId ?? rating.line_id ?? ""),
        rater_role: role,
        stars: Number(rating.stars),
        comment: String(rating.comment ?? ""),
        rater_user_id: raterUserId || null
      };
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_ratings`, {
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

    /* M2: التحقق من وجود تقييم الطرف المقابل عبر دالة has_other_rating الخادمية */
    async hasOtherRating(tripId, role){
      const cleanTripId = String(tripId ?? "").trim();
      const cleanRole = String(role ?? "").trim();
      if(!this.isConfigured() || !cleanTripId || !cleanRole) return false;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/rpc/has_other_rating`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ p_trip_id: cleanTripId, p_role: cleanRole })
        });
        if(!res || !res.ok) return false;
        if(typeof res.json === "function"){
          const data = await res.json();
          return Boolean(data);
        }
        return false;
      } catch(e){ return false; }
    },

    /* 1. المحادثة السحابية الجماعية للرحلة: إرسال رسالة (قناة = line_id + trip_date) — الهوية والدور يُفرضان خادميًا عبر Trigger (إصلاح م-8) */
    async pushChatMessage(input, roleArg, nameArg, msgArg, tripDateArg){
      if(!this.isConfigured()) return false;
      let lineId = "", tripDate = "", senderRole = "", senderName = "", msg = "", customId = "";
      if(input && typeof input === "object"){
        lineId = String(input.line_id ?? input.lineId ?? "").trim();
        tripDate = String(input.trip_date ?? input.tripDate ?? "").trim();
        senderRole = String(input.sender_role ?? input.senderRole ?? input.role ?? "passenger").trim();
        senderName = String(input.sender_name ?? input.senderName ?? input.name ?? "").trim();
        msg = String(input.msg ?? input.t ?? input.text ?? "").trim();
        customId = String(input.id ?? "").trim();
      } else {
        lineId = String(input ?? "").trim();
        senderRole = String(roleArg ?? "passenger").trim();
        senderName = String(nameArg ?? "").trim();
        msg = String(msgArg ?? "").trim();
        tripDate = String(tripDateArg ?? "").trim();
      }
      if(!tripDate){
        tripDate = (typeof KhattiCore !== "undefined" && KhattiCore && typeof KhattiCore.today === "function")
          ? KhattiCore.today()
          : new Date().toISOString().slice(0, 10);
      }
      if(!lineId || !tripDate || !msg || !["passenger", "driver"].includes(senderRole)) return false;
      const senderUserId = this._getSessionUserId();
      if(!senderUserId) return false;
      const cfg = this.getConfig();
      const payload = {
        id: customId || `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        line_id: lineId,
        trip_date: tripDate,
        sender_role: senderRole,
        sender_name: senderName || (senderRole === "driver" ? "السائق" : "راكب"),
        sender_user_id: senderUserId,
        msg
      };
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_chat_messages`, {
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

    /* 1. المحادثة السحابية الجماعية للرحلة: جلب رسائل قناة (line_id + trip_date) (يُستطلع كل 15 ثانية داخل نافذة الرحلة فقط) */
    async pullChatMessages(lineId, tripDate){
      const cleanLineId = String(lineId ?? "").trim();
      const cleanDate = String(
        tripDate || (typeof KhattiCore !== "undefined" && KhattiCore && typeof KhattiCore.today === "function" ? KhattiCore.today() : new Date().toISOString().slice(0, 10))
      ).trim();
      if(!this.isConfigured() || !cleanLineId || !cleanDate) return [];
      const cfg = this.getConfig();
      try {
        const res = await this._request(
          `${cfg.url}/rest/v1/khatti_chat_messages?line_id=eq.${encodeURIComponent(cleanLineId)}&trip_date=eq.${encodeURIComponent(cleanDate)}&order=created_at.asc&select=*`
        );
        if(!res || !res.ok) return [];
        const rows = await res.json();
        if(!Array.isArray(rows)) return [];
        const myUid = this._getSessionUserId();
        return rows.filter(r => r && typeof r === "object").map(r => {
          const created = r.created_at ? new Date(r.created_at) : null;
          const timeStr = (created && Number.isFinite(+created))
            ? created.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })
            : String(r.time ?? "الآن");
          return {
            id: String(r.id ?? ""),
            line_id: String(r.line_id ?? cleanLineId),
            trip_date: String(r.trip_date ?? cleanDate),
            sender_role: String(r.sender_role ?? "passenger"),
            sender_name: String(r.sender_name ?? ""),
            sender_user_id: r.sender_user_id ? String(r.sender_user_id) : null,
            msg: String(r.msg ?? ""),
            t: String(r.msg ?? ""),
            time: timeStr,
            created_at: r.created_at || null,
            me: Boolean(myUid && r.sender_user_id && String(r.sender_user_id) === myUid)
          };
        });
      } catch(e){ return []; }
    },

    /* 2. تنبيه التوفر: تسجيل طلب تنبيه عند توفر مقاعد في جدول khatti_notify_requests
     * ملاحظة: التنبيه داخل التطبيق فقط في هذه الشريحة؛ لا رسائل SMS أو واتساب لأنها تحتاج مزودًا خارجيًا.
     */
    async pushNotifyRequest(input){
      if(!this.isConfigured()) return false;
      const lineId = (input && typeof input === "object")
        ? String(input.line_id ?? input.lineId ?? "").trim()
        : String(input ?? "").trim();
      const userId = this._getSessionUserId();
      if(!lineId || !userId) return false;
      const customId = (input && typeof input === "object" && input.id) ? String(input.id).trim() : "";
      const cfg = this.getConfig();
      const payload = {
        id: customId || `${lineId}:${userId}`,
        line_id: lineId,
        user_id: userId
      };
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_notify_requests`, {
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

    /* 2. تنبيه التوفر: جلب طلبات التنبيه عند التوفر (للمستخدم الحالي أو لخطوط السائق حسب سياسات RLS) */
    async pullNotifyRequests(lineId){
      if(!this.isConfigured()) return [];
      const cleanLineId = String(lineId ?? "").trim();
      const cfg = this.getConfig();
      const query = cleanLineId
        ? `line_id=eq.${encodeURIComponent(cleanLineId)}&select=*`
        : `select=*`;
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_notify_requests?${query}`);
        if(!res || !res.ok) return [];
        const rows = await res.json();
        if(!Array.isArray(rows)) return [];
        return rows.filter(r => r && typeof r === "object").map(r => ({
          id: String(r.id ?? ""),
          line_id: String(r.line_id ?? ""),
          user_id: String(r.user_id ?? ""),
          created_at: r.created_at || null
        }));
      } catch(e){ return []; }
    },

    /* 4. تنبيه تغيير الخط والتنبيهات العامة: إدراج تنبيه سحابي في جدول khatti_broadcasts */
    async pushBroadcast(input, msgArg, timeLabelArg){
      if(!this.isConfigured()) return false;
      let lineId = "", msg = "", timeLabel = "", customId = "";
      if(input && typeof input === "object"){
        lineId = String(input.line_id ?? input.lineId ?? "l1").trim() || "l1";
        msg = String(input.msg ?? input.t ?? "").trim();
        timeLabel = String(input.time_label ?? input.timeLabel ?? input.time ?? input.d ?? "").trim();
        customId = String(input.id ?? "").trim();
      } else {
        lineId = String(input || "l1").trim() || "l1";
        msg = String(msgArg ?? "").trim();
        timeLabel = String(timeLabelArg ?? "").trim();
      }
      if(!lineId || !msg) return false;
      if(!timeLabel){
        timeLabel = new Date().toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
      }
      const cfg = this.getConfig();
      const payload = {
        id: customId || `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        line_id: lineId,
        msg,
        time_label: timeLabel
      };
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_broadcasts`, {
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

    /* 4. جلب تنبيهات خط معين من جدول khatti_broadcasts */
    async pullBroadcasts(lineId){
      const cleanLineId = String(lineId ?? "").trim();
      if(!this.isConfigured() || !cleanLineId) return [];
      const cfg = this.getConfig();
      try {
        const res = await this._request(
          `${cfg.url}/rest/v1/khatti_broadcasts?line_id=eq.${encodeURIComponent(cleanLineId)}&order=created_at.desc&select=*`
        );
        if(!res || !res.ok) return [];
        const rows = await res.json();
        if(!Array.isArray(rows)) return [];
        return rows.filter(r => r && typeof r === "object").map(r => ({
          id: String(r.id ?? ""),
          line_id: String(r.line_id ?? cleanLineId),
          msg: String(r.msg ?? ""),
          t: String(r.msg ?? ""),
          time_label: String(r.time_label ?? r.time ?? "الآن"),
          time: String(r.time_label ?? r.time ?? "الآن"),
          created_at: r.created_at || null
        }));
      } catch(e){ return []; }
    },

    /* الشريحة 4 (1): التحقق من طريقة الدفع المسموحة لاشتراكات السائقين ('cash','zain','asia') */
    isValidSubscriptionPayMethod(method){
      return typeof method === "string" && ["cash", "zain", "asia"].includes(method.trim());
    },

    /* الشريحة 4 (1): بناء حمولة اشتراك السائق اليدوي بحالة pending دائمًا ودون حساب آلي للمبلغ */
    buildSubscriptionPayload(sub, sessionDriverId){
      if(!sub || typeof sub !== "object" || Array.isArray(sub)) return null;
      const driverId = String(sessionDriverId || sub.driver_id || sub.driverId || "").trim();
      const rawMethod = sub.pay_method !== undefined ? sub.pay_method : (sub.payMethod !== undefined ? sub.payMethod : sub.method);
      const payMethod = (rawMethod === undefined || rawMethod === null || String(rawMethod).trim() === "") ? "cash" : String(rawMethod).trim();
      if(!this.isValidSubscriptionPayMethod(payMethod)) return null;
      const rawMonths = (sub.months !== undefined && sub.months !== null && String(sub.months).trim() !== "") ? sub.months : 1;
      const monthsNum = Number(rawMonths);
      if(!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 36) return null;
      let amount = null;
      const rawAmount = sub.amount;
      if(rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== ""){
        const amtNum = Number(rawAmount);
        if(!Number.isInteger(amtNum) || amtNum < 0 || amtNum > 100000000) return null;
        amount = amtNum;
      }
      const planLabel = String(sub.plan_label ?? sub.planLabel ?? sub.plan ?? "اشتراك سائق شهري").trim() || "اشتراك سائق شهري";
      const payRef = String(sub.pay_ref ?? sub.payRef ?? sub.ref ?? "").trim();
      const customId = String(sub.id ?? "").trim();
      return {
        id: customId || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        driver_id: driverId,
        plan_label: planLabel,
        months: monthsNum,
        amount,
        pay_method: payMethod,
        pay_ref: payRef,
        status: "pending",
        starts_at: null,
        ends_at: null
      };
    },

    /* الشريحة 4 (1): إرسال طلب اشتراك/تجديد سائق إلى جدول khatti_driver_subscriptions بحالة pending */
    async pushSubscription(sub){
      if(!this.isConfigured() || !sub || typeof sub !== "object") return false;
      const driverId = this._getSessionUserId();
      if(!driverId) return false;
      const payload = this.buildSubscriptionPayload(sub, driverId);
      if(!payload || !payload.driver_id) return false;
      const cfg = this.getConfig();
      try {
        const res = await this._request(`${cfg.url}/rest/v1/khatti_driver_subscriptions`, {
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

    /* الشريحة 4 (1): جلب اشتراكات السائق الحالي من جدول khatti_driver_subscriptions */
    async pullMySubscriptions(driverId){
      if(!this.isConfigured()) return [];
      const uid = String(driverId || this._getSessionUserId() || "").trim();
      if(!uid) return [];
      const cfg = this.getConfig();
      try {
        const res = await this._request(
          `${cfg.url}/rest/v1/khatti_driver_subscriptions?driver_id=eq.${encodeURIComponent(uid)}&order=created_at.desc&select=*`
        );
        if(!res || !res.ok) return [];
        const rows = await res.json();
        if(!Array.isArray(rows)) return [];
        return rows.filter(r => r && typeof r === "object").map(r => ({
          id: String(r.id ?? ""),
          driver_id: String(r.driver_id ?? uid),
          plan_label: String(r.plan_label ?? ""),
          months: Number.isInteger(Number(r.months)) ? Number(r.months) : 1,
          amount: (r.amount !== null && r.amount !== undefined && r.amount !== "" && Number.isFinite(Number(r.amount))) ? Number(r.amount) : null,
          pay_method: String(r.pay_method ?? "cash"),
          pay_ref: String(r.pay_ref ?? ""),
          status: String(r.status ?? "pending"),
          starts_at: r.starts_at || null,
          ends_at: r.ends_at || null,
          created_at: r.created_at || null
        }));
      } catch(e){ return []; }
    },

    /* الشريحة 4 (2): تنسيق حمولة تقرير الخطأ الداخلي */
    formatErrorReport(pageOrObj, messageArg, detailsArg, userIdArg){
      let page = "", message = "", detailsRaw = "", userId = "", customId = "";
      if(pageOrObj && typeof pageOrObj === "object" && !Array.isArray(pageOrObj) && !(pageOrObj instanceof Error)){
        page = String(pageOrObj.page ?? "").trim();
        const rawMsg = pageOrObj.message ?? pageOrObj.msg ?? "";
        message = rawMsg instanceof Error ? String(rawMsg.message || rawMsg).trim() : String(rawMsg).trim();
        detailsRaw = pageOrObj.details ?? pageOrObj.detail ?? "";
        userId = String(userIdArg ?? pageOrObj.user_id ?? pageOrObj.userId ?? "").trim();
        customId = String(pageOrObj.id ?? "").trim();
      } else {
        page = String(pageOrObj ?? "").trim();
        message = messageArg instanceof Error ? String(messageArg.message || messageArg).trim() : String(messageArg ?? "").trim();
        detailsRaw = detailsArg ?? "";
        userId = String(userIdArg ?? "").trim();
      }
      if(!message) return null;
      let details = "";
      if(detailsRaw instanceof Error){
        details = String(detailsRaw.stack || detailsRaw.message || detailsRaw).trim();
      } else if(detailsRaw !== null && typeof detailsRaw === "object"){
        try { details = JSON.stringify(detailsRaw); } catch(e){ details = String(detailsRaw); }
      } else {
        details = String(detailsRaw ?? "").trim();
      }
      if(!page && typeof location !== "undefined" && location && location.pathname){
        page = String(location.pathname).trim();
      }
      return {
        id: customId || `er_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        user_id: userId || null,
        page: page || "/",
        message: message.slice(0, 500),
        details: details.slice(0, 4000)
      };
    },

    /* الشريحة 4 (2): إرسال تقرير خطأ إلى جدول khatti_error_reports عند التكييف مع تجاهل الفشل بصمت تام */
    async reportError(page, message, details){
      try {
        if(!this.isConfigured()) return false;
        const userId = this._getSessionUserId();
        const payload = this.formatErrorReport(page, message, details, userId);
        if(!payload || !payload.message) return false;
        const cfg = this.getConfig();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        try {
          const headers = this._buildHeaders({
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates"
          });
          const res = await fetch(`${cfg.url}/rest/v1/khatti_error_reports`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: ctrl.signal
          });
          return Boolean(res && res.ok);
        } finally {
          clearTimeout(timer);
        }
      } catch(e){
        return false;
      }
    }
  };

  if(typeof window !== "undefined") window.KhattiCloud = KhattiCloud;
  root.KhattiCloud = KhattiCloud;
  if(typeof module !== "undefined" && module.exports) module.exports = KhattiCloud;
})(typeof globalThis !== "undefined" ? globalThis : this);
