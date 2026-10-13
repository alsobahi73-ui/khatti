# بناء تطبيق «خَطّي» للموبايل — دليل خطوة بخطوة

نفس كود الويب الموجود في هذا المستودع يُغلَّف بـ **Capacitor** داخل WebView لإنتاج تطبيق موبايل أصلي — **لا يُعاد كتابة أي كود**. نسخة الويب تبقى PWA كما هي (رابط الأهل يعمل من المتصفح بلا تثبيت).

> ⚠️ لا تُنفَّذ هذه الخطوات هنا — فقط على حاسوبك.

## 0. المتطلبات المشتركة (المنصتان)

1. ثبّت **Node.js LTS** من: https://nodejs.org
2. افتح Terminal/CMD داخل مجلد المشروع (`khatti/`) ونفّذ:
   ```bash
   npm install
   npm run web:pack
   ```
   الأمر الثاني ينسخ ملفات الويب إلى مجلد `www/` (وهو ما يقرأه Capacitor عبر `webDir`).

## 1. أندرويد (Android) — يعمل على Windows/Mac/Linux

**المتطلب:** [Android Studio](https://developer.android.com/studio) مثبّت (يأتي مع Android SDK).

```bash
npx cap add android      # أول مرة فقط — ينشئ مجلد android/
npm run mobile:sync      # ينسخ www/ ويحدّث الإضافات
npx cap open android      # يفتح المشروع في Android Studio
```

داخل Android Studio:
- **للتجربة:** زر ▶️ Run على محاكي أو جهاز حقيقي.
- **لملف APK للتجربة:** قائمة `Build ← Build App Bundle(s) / APK(s) ← Build APK(s)` — ستجد الملف في `android/app/build/outputs/apk/debug/`.
- **للنشر على Google Play (ملف AAB موقَّع):** `Build ← Generate Signed App Bundle / APK` — ستحتاج إنشاء مفتاح توقيع (keystore) أول مرة من نفس النافذة.

## 2. آيفون (iOS) — ⚠️ يتطلب جهاز Mac فقط

> **تنبيه واضح:** ملف الـ **IPA** الخاص بآيفون **لا يُبنى إلا على جهاز Mac** مثبّت عليه **Xcode**. لا توجد طريقة رسمية لبنائه على Windows أو Linux.

**المتطلبات:** جهاز Mac + [Xcode](https://developer.apple.com/xcode/) من App Store + حساب **Apple Developer** (مدفوع، 99$/سنة) للنشر على App Store — أما التجربة على جهازك الشخصي فتكفيها Apple ID عادية.

```bash
npx cap add ios          # أول مرة فقط — على الـ Mac حصرًا
npm run mobile:sync
npx cap open ios          # يفتح المشروع في Xcode
```

داخل Xcode:
1. اختر المشروع ← تبويب **Signing & Capabilities** ← فعّل **Automatically manage signing** واختر الـ Team الخاص بحسابك.
2. **للتجربة على آيفونك:** وصّل الجهاز بالـ Mac واختره من قائمة الأجهزة ثم زر ▶️ Run.
3. **لملف IPA (للنشر أو التوزيع):** من القائمة `Product ← Archive` — بعد انتهاء الأرشفة تفتح نافذة Organizer ← `Distribute App` ← اختر `App Store Connect` (للنشر) أو `Ad Hoc` (للتوزيع المحدود).

## 3. بعد أي تعديل على ملفات الويب

```bash
npm run mobile:sync
```
ثم أعد البناء من Android Studio / Xcode — لا حاجة لإعادة `add`.

## 4. ملاحظات تقنية

- كل مسارات الأصول في المشروع **نسبية** (`assets/…`, `../assets/…`) — يعمل داخل WebView بلا خادم، ولا شيء يعتمد على `http://localhost`.
- `localStorage` يعمل داخل WebView بشكل طبيعي — بيانات العرض التجريبي محفوظة محليًا.
- الخرائط (Leaflet + OpenStreetMap) تحتاج إنترنت داخل التطبيق — مع صندوق بديل أنيق عند انقطاعه.
- معرّف التطبيق: `iq.khatti.app` — غيّره من `capacitor.config.json` إذا أردت معرّفًا آخر قبل أول `add`.
