/* وحدة المصادقة السحابية لتطبيق خطّي (Khatti Auth via Supabase GoTrue REST)
 * تعمل مباشرة عبر fetch على مسارات /auth/v1/* دون أي اعتماد خارجي (لا supabase-js).
 * تحفظ الجلسة في localStorage بالمفتاح khatti_demo_v1_auth بصيغة:
 * { access_token, refresh_token, expires_at, user: { id, email, role } }
 */
(function(root){
  const CFG_KEY = "khatti_supabase_config_v1";
  const AUTH_KEY = "khatti_demo_v1_auth";
  const EXPIRY_MARGIN_SEC = 60;

  const KhattiAuth = {
    CFG_KEY,
    AUTH_KEY,

    getConfig(){
      try {
        if(typeof root.KhattiCloud !== "undefined" && root.KhattiCloud && typeof root.KhattiCloud.getConfig === "function"){
          return root.KhattiCloud.getConfig();
        }
        const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CFG_KEY) : null;
        if(!raw) return { url: "", key: "" };
        const parsed = JSON.parse(raw);
        return {
          url: String(parsed?.url || "").trim().replace(/\/+$/, ""),
          key: String(parsed?.key || "").trim()
        };
      } catch(e){
        return { url: "", key: "" };
      }
    },

    isConfigured(){
      const cfg = this.getConfig();
      return Boolean(cfg.url && cfg.url.startsWith("https://") && cfg.key && cfg.key.length > 20);
    },

    /* التحقق من صلاحية الجلسة: صالحة إذا كان انتهاؤها بعد الآن بـ 60 ثانية على الأقل */
    isSessionValid(session, nowMs = Date.now()){
      if(!session || typeof session !== "object") return false;
      const token = String(session.access_token || "").trim();
      if(!token) return false;
      const exp = Number(session.expires_at);
      if(!Number.isFinite(exp) || exp <= 0) return false;
      const nowNum = Number(nowMs);
      if(!Number.isFinite(nowNum)) return false;
      // دعم كل من الثواني (Unix seconds) والملّي ثانية (ms)
      const expSec = exp >= 1e11 ? exp / 1000 : exp;
      const nowSec = nowNum >= 1e11 ? nowNum / 1000 : nowNum;
      return (expSec - nowSec) >= EXPIRY_MARGIN_SEC;
    },

    /* تطبيع استجابة GoTrue إلى صيغة الجلسة الموحدة */
    normalizeSession(raw, fallbackMeta = {}){
      if(!raw || typeof raw !== "object" || !raw.access_token) return null;
      const u = (raw.user && typeof raw.user === "object") ? raw.user : {};
      const meta = (u.user_metadata && typeof u.user_metadata === "object")
        ? u.user_metadata
        : ((raw.user_metadata && typeof raw.user_metadata === "object")
          ? raw.user_metadata
          : ((u.data && typeof u.data === "object") ? u.data : {}));
      const fb = (fallbackMeta && typeof fallbackMeta === "object") ? fallbackMeta : {};
      const role = String(
        meta.role ||
        fb.role ||
        (u.role && u.role !== "authenticated" && u.role !== "anon" ? u.role : "") ||
        "passenger"
      ).trim() || "passenger";

      let expiresAt = Number(raw.expires_at);
      if(!Number.isFinite(expiresAt) || expiresAt <= 0){
        const expiresIn = Number(raw.expires_in);
        expiresAt = Math.floor(Date.now() / 1000) + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600);
      }

      return {
        access_token: String(raw.access_token),
        refresh_token: String(raw.refresh_token || ""),
        expires_at: expiresAt,
        user: {
          id: String(u.id || fb.id || ""),
          email: String(u.email || fb.email || ""),
          role
        }
      };
    },

    readStoredSession(){
      try {
        if(typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(AUTH_KEY);
        if(!raw) return null;
        const parsed = JSON.parse(raw);
        if(!parsed || typeof parsed !== "object" || !parsed.access_token) return null;
        return this.normalizeSession(parsed, parsed.user || {});
      } catch(e){
        return null;
      }
    },

    saveSession(raw, fallbackMeta = {}){
      const session = this.normalizeSession(raw, fallbackMeta);
      if(!session) return null;
      try {
        if(typeof localStorage !== "undefined"){
          localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        }
      } catch(e){}
      return session;
    },

    clearSession(){
      try {
        if(typeof localStorage !== "undefined"){
          localStorage.removeItem(AUTH_KEY);
        }
      } catch(e){}
    },

    /* ترجمة أخطاء GoTrue الشائعة إلى رسائل عربية واضحة */
    translateError(err){
      if(!err) return "حدث خطأ غير متوقع أثناء المصادقة";
      let text = "";
      if(typeof err === "string"){
        text = err;
      } else if(typeof err === "object"){
        text = [
          err.error_code,
          err.code,
          err.error_description,
          err.msg,
          err.message,
          err.error
        ].filter(Boolean).join(" ");
      }
      const lower = String(text || "").toLowerCase();

      if(
        lower.includes("invalid login credentials") ||
        lower.includes("invalid_credentials") ||
        lower.includes("invalid_grant") ||
        lower.includes("invalid email or password") ||
        lower.includes("wrong password") ||
        lower.includes("user not found")
      ){
        return "بيانات دخول خاطئة؛ تحقق من البريد الإلكتروني وكلمة المرور";
      }

      if(
        lower.includes("email not confirmed") ||
        lower.includes("email_not_confirmed") ||
        lower.includes("unconfirmed")
      ){
        return "البريد غير مؤكّد بعد؛ تفقد بريدك الإلكتروني لتأكيد الحساب";
      }

      if(
        lower.includes("user already registered") ||
        lower.includes("user_already_exists") ||
        lower.includes("already registered") ||
        lower.includes("already been registered") ||
        lower.includes("email_exists") ||
        lower.includes("duplicate")
      ){
        return "بريد مسجّل مسبقًا؛ جرّب تسجيل الدخول بدلاً من إنشاء حساب";
      }

      if(
        lower.includes("weak_password") ||
        lower.includes("weak password") ||
        lower.includes("password should be at least") ||
        lower.includes("password is too short") ||
        lower.includes("at least 6 characters") ||
        lower.includes("at least 8 characters")
      ){
        return "كلمة مرور ضعيفة؛ يجب أن تتكون من 6 أحرف على الأقل";
      }

      return "تعذّرت عملية المصادقة؛ تحقق من البيانات أو الاتصال وحاول مجددًا";
    },

    /* بناء ترويسات المصادقة: تعيد apikey دائمًا + Authorization Bearer عند وجود جلسة */
    authHeaders(extra = {}){
      const cfg = this.getConfig();
      const headers = { apikey: String(cfg.key || "") };
      const session = this.readStoredSession();
      if(session && session.access_token){
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      if(extra && typeof extra === "object"){
        Object.assign(headers, extra);
      }
      return headers;
    },

    /* حذف phone من الخط إلا إذا كان معرّف مستخدم الجلسة يساوي line.driver_id */
    stripLinePhone(line, session = undefined){
      if(!line || typeof line !== "object") return line;
      const copy = { ...line };
      const activeSession = session === undefined ? this.readStoredSession() : session;
      const userId = String(activeSession?.user?.id || "").trim();
      const driverId = String(copy.driver_id ?? copy.driverId ?? "").trim();
      if(!userId || !driverId || userId !== driverId){
        delete copy.phone;
      }
      return copy;
    },

    /* تسجيل حساب جديد: POST {url}/auth/v1/signup مع {email, password, data:{name, role}} */
    async signUp(emailOrOpts, password, metaOrName, maybeRole){
      let email = "";
      let pwd = "";
      let name = "";
      let role = "passenger";

      if(emailOrOpts && typeof emailOrOpts === "object"){
        email = String(emailOrOpts.email || "").trim();
        pwd = String(emailOrOpts.password || "");
        const d = emailOrOpts.data || emailOrOpts.user_metadata || {};
        name = String(d.name ?? emailOrOpts.name ?? "").trim();
        role = String(d.role ?? emailOrOpts.role ?? "passenger").trim() || "passenger";
      } else {
        email = String(emailOrOpts || "").trim();
        pwd = String(password || "");
        if(metaOrName && typeof metaOrName === "object"){
          name = String(metaOrName.name ?? "").trim();
          role = String(metaOrName.role ?? "passenger").trim() || "passenger";
        } else {
          name = String(metaOrName ?? "").trim();
          role = String(maybeRole ?? "passenger").trim() || "passenger";
        }
      }

      if(!this.isConfigured()){
        return { ok: false, session: null, user: null, needsConfirmation: false, error: "التطبيق غير مكيّف سحابيًا" };
      }

      const cfg = this.getConfig();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/auth/v1/signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.key
          },
          body: JSON.stringify({
            email,
            password: pwd,
            data: { name, role }
          }),
          signal: ctrl.signal
        });

        const data = (res && typeof res.json === "function") ? await res.json().catch(() => ({})) : {};
        if(!res || !res.ok){
          return {
            ok: false,
            session: null,
            user: null,
            needsConfirmation: false,
            error: this.translateError(data)
          };
        }

        if(data && data.access_token){
          const session = this.saveSession(data, { email, role, name });
          return {
            ok: true,
            session,
            user: session ? session.user : null,
            needsConfirmation: false,
            error: null
          };
        }

        const rawUser = (data && data.user && typeof data.user === "object") ? data.user : data;
        const userMeta = rawUser?.user_metadata || { name, role };
        return {
          ok: true,
          session: null,
          user: {
            id: String(rawUser?.id || ""),
            email: String(rawUser?.email || email),
            role: String(userMeta?.role || role || "passenger")
          },
          needsConfirmation: true,
          error: null
        };
      } catch(e){
        return {
          ok: false,
          session: null,
          user: null,
          needsConfirmation: false,
          error: this.translateError(e)
        };
      } finally {
        clearTimeout(timer);
      }
    },

    /* تسجيل الدخول: POST {url}/auth/v1/token?grant_type=password */
    async signIn(emailOrOpts, password){
      const email = (emailOrOpts && typeof emailOrOpts === "object")
        ? String(emailOrOpts.email || "").trim()
        : String(emailOrOpts || "").trim();
      const pwd = (emailOrOpts && typeof emailOrOpts === "object")
        ? String(emailOrOpts.password || "")
        : String(password || "");

      if(!this.isConfigured()){
        return { ok: false, session: null, user: null, error: "التطبيق غير مكيّف سحابيًا" };
      }

      const cfg = this.getConfig();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.key
          },
          body: JSON.stringify({ email, password: pwd }),
          signal: ctrl.signal
        });

        const data = (res && typeof res.json === "function") ? await res.json().catch(() => ({})) : {};
        if(!res || !res.ok || !data || !data.access_token){
          return {
            ok: false,
            session: null,
            user: null,
            error: this.translateError(data)
          };
        }

        const session = this.saveSession(data, { email });
        return {
          ok: true,
          session,
          user: session ? session.user : null,
          error: null
        };
      } catch(e){
        return {
          ok: false,
          session: null,
          user: null,
          error: this.translateError(e)
        };
      } finally {
        clearTimeout(timer);
      }
    },

    /* تجديد الجلسة: POST {url}/auth/v1/token?grant_type=refresh_token */
    async refreshSession(){
      const current = this.readStoredSession();
      if(!current || !current.refresh_token || !this.isConfigured()){
        this.clearSession();
        return null;
      }
      const cfg = this.getConfig();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: cfg.key
          },
          body: JSON.stringify({ refresh_token: current.refresh_token }),
          signal: ctrl.signal
        });
        if(!res || !res.ok){
          this.clearSession();
          return null;
        }
        const data = typeof res.json === "function" ? await res.json().catch(() => null) : null;
        if(!data || !data.access_token){
          this.clearSession();
          return null;
        }
        return this.saveSession(data, current.user || {});
      } catch(e){
        return null;
      } finally {
        clearTimeout(timer);
      }
    },

    /* جلب الجلسة الحالية: صالحة إذا انتهاؤها بعد الآن بـ 60 ثانية على الأقل وإلا جرّب التجديد مرة واحدة */
    async getSession(){
      const current = this.readStoredSession();
      if(!current) return null;
      if(this.isSessionValid(current)) return current;
      return await this.refreshSession();
    },

    /* تسجيل الخروج: POST {url}/auth/v1/logout مع مسح الجلسة المحلية */
    async signOut(){
      const current = this.readStoredSession();
      const cfg = this.getConfig();
      this.clearSession();
      if(!this.isConfigured() || !current || !current.access_token) return true;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch(`${cfg.url}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: cfg.key,
            Authorization: `Bearer ${current.access_token}`
          },
          signal: ctrl.signal
        });
        return Boolean(res && res.ok);
      } catch(e){
        return false;
      } finally {
        clearTimeout(timer);
      }
    }
  };

  if(typeof window !== "undefined") window.KhattiAuth = KhattiAuth;
  root.KhattiAuth = KhattiAuth;
  if(typeof module !== "undefined" && module.exports) module.exports = KhattiAuth;
})(typeof globalThis !== "undefined" ? globalThis : this);
