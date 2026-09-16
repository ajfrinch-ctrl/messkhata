# Meal Khata - Full Audit Report
**তারিখ:** 2026-09-16  
**Branch:** arena/01a0aae3-messkhata (base: feature/firebase-realtime)  
**Audited File:** `index.html` (1103 lines, 66KB)  
**Repo Structure:** Single-file app, no package.json, no README, no .gitignore

---

## 0. Executive Summary (সারসংক্ষেপ)

Meal Khata একটি ভালো আইডিয়া এবং UI দরকার অনুযায়ী কাজ করে, কিন্তু **Production-এর জন্য বর্তমান অবস্থায় ঝুঁকিপূর্ণ**।

**Critical P0 - 3 টা:**
1. Firebase Realtime Database সম্পূর্ণ Public — যে কেউ আপনার `messKhata` node পড়তে/মুছতে পারে
2. Stored XSS — সদস্যের নাম বা বাজারের বিবরণে `<img onerror=...>` দিলে সবার ব্রাউজারে execute হবে
3. Reset Bug — "সব ডেটা রিসেট" শুধু localStorage মুছে, Firebase মুছে না, রিফ্রেশ করলে ডেটা ফিরে আসে — আবার উল্টোটা হলে সব ডিভাইসের ডেটা হারিয়ে যাবে

**High P1 - 7 টা:** Data loss on concurrent edit, duplicate rent orphan, inefficient O(n²) grid rendering, no input validation, inline onclick injection, missing SRI/CSP, no auth/multi-tenancy.

**Overall Score:** Security 2/10, Performance 5/10, Maintainability 3/10, Data Integrity 4/10, UX 6/10

---

## 1. Security Audit

### 1.1 [CRITICAL] Firebase Open Rules - Public Database
- **Location:** L980-L1006
```js
databaseURL: "https://messkhata-88e98-default-rtdb.asia-southeast1.firebasedatabase.app"
ref = firebase.database().ref("messKhata")
ref.set(messData) // anyone can overwrite
```
- **Risk:** এই URL জানলেই যে কেউ `curl -X PUT .../messKhata.json -d '{"members":[]}'` দিয়ে পুরো মেসের হিসাব মুছে দিতে পারে। কোনো Authentication, API Key, Rules নেই।
- **Proof:** Browser DevTools > Network এ databaseURL দেখা যায়।
- **Fix:**
  - Firebase Console > Realtime Database > Rules এ:
  ```json
  {
    "rules": {
      ".read": "auth != null",
      ".write": "auth != null",
      "messKhata": {
        "$roomId": {
          ".read": "auth != null && root.child('rooms/'+$roomId+'/members').child(auth.uid).exists()",
          ".write": "auth != null && root.child('rooms/'+$roomId+'/members').child(auth.uid).exists()"
        }
      }
    }
  }
  ```
  - Firebase Auth (Anonymous বা Phone Auth) যোগ করুন
  - প্রতিটি মেসের জন্য unique roomId (যেমন URL hash) ব্যবহার করুন, একটা global `messKhata` নয়

### 1.2 [CRITICAL] Stored XSS via innerHTML
- **Locations:** 
  - L403-L408 `renderMembersList()` => `${m.name}` direct innerHTML
  - L637-L648 bazar table `${b.desc}`, `${memName}`
  - L606 fixed breakdown `${m.name}`
  - L672 summary `${s.name}`
  - L728 bazar grid `${items}` (comma-joined desc)
  - L760 meals grid `${m.name}`
- **Payload Example:** সদস্যের নাম দিন: `<img src=x onerror=alert(document.cookie)>` — এরপর সবাই যেই ট্যাবে ঢুকবে, alert চলবে। WhatsApp share এও একই।
- **Also:** `shareSpecificOnWhatsApp('${memName}', '${displayDt}', '${b.desc.replace(/'/g, "\\'")}', ${b.amount})` — শুধু single quote escape, double quote, backtick, newline, `</script>` escape হয় না। Attribute injection possible.
- **Fix:** 
  ```js
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  ```
  সব innerHTML এ `escapeHtml()` ব্যবহার, আর inline onclick বাদ দিয়ে `addEventListener` + `data-id` ব্যবহার।

### 1.3 [HIGH] No SRI / CSP for CDN
- L71 `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` এবং L73-L74 Firebase SDK — কোনো `integrity` attribute নেই, CDN compromise হলে malicious JS চলবে।
- Tailwind Browser version production-এ ব্যবহার করা উচিত না, এটি runtime এ CSS generate করে, 300KB+ JS।
- **Fix:** Build step যোগ করুন (Vite), Tailwind compile করে static CSS, Firebase SDK npm থেকে import, CSP meta tag:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://www.gstatic.com; connect-src https://*.firebaseio.com https://*.firebasedatabase.app">
  ```

### 1.4 [MEDIUM] localStorage without validation
- L327 `JSON.parse(localStorage.getItem(...))` — যদি user manually localStorage corrupt করে, app crash করবে। try/catch নেই।
- localStorage size limit 5MB, বড় bazarLog এ quota exceed হতে পারে, error handling নেই।

### 1.5 [MEDIUM] WhatsApp Share URL
- `https://api.whatsapp.com/send?text=` ব্যবহার — encodeURIComponent ঠিক আছে, কিন্তু 4000+ char report হলে URL too long হয়ে fail করবে। `navigator.share` API fallback দরকার।

---

## 2. Data Integrity & Logic Bugs

### 2.1 [CRITICAL] resetApp() Firebase মুছে না
- L951-L969:
```js
localStorage.removeItem(...)
messData = {members:[],...}
// saveToLocalStorage() কল করা হয় না!
```
- ফলে local UI খালি দেখায়, কিন্তু Firebase এ পুরনো ডেটা থাকে। রিফ্রেশ করলে পুরনো ডেটা ফিরে আসে। আবার যদি কোনো client এ Firebase sync হয়ে empty push করে, তাহলে সব device এর ডেটা চলে যাবে।
- **Fix:** reset এ `ref.set(messData)` এবং `localStorage.setItem` দুটোই করতে হবে, আর confirm এ roomId লিখে confirm নিতে হবে।

### 2.2 [HIGH] Orphaned Rent Data
- `deleteMember(id)` L377-L388 — `fixedCosts.rent[memberId]` delete করে না। পরে নতুন সদস্য same ID না পেলেও orphan থেকে যায়, total calculation এ count হয় না কিন্তু memory leak।
- Fix: `delete messData.fixedCosts.rent[id]`

### 2.3 [HIGH] Dual Source of Truth for Fixed Bills
- `calculateMess()` L556-L561 সরাসরি DOM থেকে `document.getElementById('bill-electricity').value` পড়ে, আবার `messData.grandBills` ও আছে। User input টাইপ করল কিন্তু Save না চাপলে DOM vs messData mismatch। Share functions আবার DOM পড়ে, saveFixedCosts messData আপডেট করে। Inconsistent.
- Fix: Single source — সব সময় messData থেকে পড়া, input onChange এ messData update + debounced save।

### 2.4 [HIGH] Last Write Wins - No Conflict Resolution
- Firebase `ref.on("value")` পুরো object fetch করে, `ref.set()` পুরো object overwrite করে। দুজন একসাথে bazar যোগ করলে একজনেরটা হারাবে।
- Fix: Use `push()` for logs, `transaction()` বা `update()` for specific paths, not whole set।

### 2.5 [MEDIUM] addBazar duplicate allowed, addMeals overwrite
- Meal এ same date+member হলে overwrite (L389), Bazar এ always push (L445) — inconsistent UX। User ভুলে double click করলে duplicate bazar।
- Fix: Bazar এও duplicate check বা idempotent key, বা UI disable after click.

### 2.6 [MEDIUM] Validation Missing
- Member name: empty check আছে, কিন্তু duplicate name, max length (50?), HTML tag check নেই
- Meal count: `count <0` check, কিন্তু 0 allow, NaN, 1000+ allow। `step=0.5` UI তে, কিন্তু JS এ 0.33 allow।
- Bazar amount: `<=0` check, কিন্তু 999999999 allow, decimal handling inconsistent
- Rent: `parseFloat('abc')` => NaN, NaN propagation এ total NaN হয়ে যাবে।

### 2.7 [MEDIUM] Date Handling
- `new Date(String(dateValue)+"T00:00:00")` — Safari এ invalid হতে পারে, timezone shift হতে পারে। `valueAsDate` ব্যবহার ভালো, কিন্তু `formatBanglaDate` এ আবার string parsing।
- `meal-date` ও `bazar-date` শুধু onload এ set, রাত 12টার পর date update হয় না।

### 2.8 [LOW] lastMarketData volatile
- শুধু memory তে, reload এ হারায়, share button hidden হয়ে যায়। UX confusion।

---

## 3. Performance Audit

### 3.1 [HIGH] innerHTML += in Loops - Layout Thrashing
- `renderMembersList`, `updateDropdowns`, `renderFixedCostInputs`, `renderBazarGrid`, `renderMealsGrid` — সব জায়গায় loop এর ভিতর `innerHTML +=`। প্রতিবার browser পুরো DOM re-parse করে।
- 30 দিন x 10 সদস্য = 300 meal entries, bazar grid এ `filter` inside nested loop: O(D * M * L) ~ 30*10*300 = 90k iterations প্রতি calculate।
- Fix: একবারে string build করে একবার `innerHTML = html`, বা `DocumentFragment` ব্যবহার, বা logs কে `Map<date, Map<memberId, entries>>` index করে O(1) lookup।

### 3.2 [MEDIUM] Full Table Re-render on Every Change
- `calculateMess()` সব tab এর table re-render করে, এমনকি hidden tab ও। Meal add করলে bazar grid ও re-render — unnecessary।
- Fix: Tab-wise dirty flag, বা virtual DOM / framework, বা অন্তত `requestAnimationFrame` batch।

### 3.3 [MEDIUM] Firebase Full Download
- `ref.on("value")` প্রতিবার পুরো `messKhata` JSON download — 1 year data হলে 2-3MB হতে পারে। Mobile data expensive।
- Fix: `child_added` listener, pagination, বা date-based sharding: `messKhata/2026-09/bazarLog`

### 3.4 [MEDIUM] Tailwind Browser Runtime
- `@tailwindcss/browser@4` ~ 300KB gzipped, runtime CSS generation main thread block করে। Lighthouse performance -20।
- Fix: Build-time Tailwind।

### 3.5 [LOW] No Debounce
- Fixed cost inputs এ প্রতি keystroke এ calculation না হলেও Save না চাপলে stale data। আবার Firebase set প্রতি save এ full payload। Debounce 500ms দরকার।

---

## 4. Architecture & Maintainability

### 4.1 Single File Monolith (1103 lines)
- HTML, CSS, JS সব এক ফাইলে। Maintainability 3/10। কোনো module, bundler, linter নেই।
- Fix: 
```
/src
  /components - meals.js, bazar.js, fixed.js, summary.js
  /utils - date.js, bangla.js, escape.js
  /firebase - config.js, sync.js
  /styles - tailwind.css
```

### 4.2 Global Pollution
- `messData`, `lastMarketData`, `formatLongDate` সব window global। Conflict risk।
- Fix: IIFE বা ES Module, `const App = {}` namespace।

### 4.3 Inline Event Handlers
- `onclick="addMeals()"` — CSP bypass, testing কঠিন, XSS risk। 15+ জায়গায়।
- Fix: `addEventListener` in JS, `data-action` attribute।

### 4.4 DRY Violation
- Meal rate, split calculation 3 জায়গায় copy-paste: `calculateMess`, `shareMemberOnWhatsApp`, `shareAllInOneOnWhatsApp`। এক জায়গা change করলে অন্য জায়গা ভুল থাকবে।
- Fix: `getCalculatedSummary()` একটা pure function।

### 4.5 No Tests, No Types
- কোনো unit test, e2e test নেই। Meal calculation ভুল হলে টাকা-পয়সার হিসাব ভুল হবে — financial risk।
- Fix: Vitest + JS calculation functions pure করে test।

### 4.6 Monkey Patching saveToLocalStorage
- L1008-L1019 `originalSaveToLocalStorage` wrap — fragile, যদি script order change হয় ভাঙবে।
- Fix: Explicit `saveAll()` function যা local + firebase দুটোই করে।

---

## 5. UI/UX & Accessibility

- **Tab Switching:** Keyboard navigation নেই, ARIA `role="tablist"` নেই
- **Inputs:** Label `for` association নেই, screen reader পড়বে না
- **Color:** শুধু color দিয়ে status (পাবে/দেবে) — colorblind user বুঝবে না, icon + text দরকার (আছে কিন্তু contrast check দরকার)
- **Empty State:** "কোনো সদস্য নেই" আছে, কিন্তু onboarding flow নেই
- **Toast:** শুধু success, error toast নেই, Firebase error console এ only
- **Responsive:** Table overflow-x আছে, কিন্তু mobile এ 12 column table unreadable — card view দরকার
- **PWA:** Offline support নেই, mess এ net না থাকলে কাজ করবে না (localStorage আছে কিন্তু sync fail silent)
- **Print:** Report print CSS নেই

---

## 6. Firebase Realtime Sync Deep Dive

**Current Flow:**
1. `once("value")` -> cloud থাকলে local overwrite, না থাকলে local upload
2. `on("value")` -> যেকোনো change এ পুরো local overwrite
3. `saveToLocalStorage` override -> `ref.set(messData)`

**Problems:**
- Race condition: Page load এর সময় user যদি দ্রুত meal add করে, `firebaseReady` false থাকায় Firebase এ যাবে না, পরে `once` এর data দিয়ে overwrite হয়ে user এর নতুন entry হারাবে
- No offline queue: `.info/connected` দেখায় কিন্তু offline write queue নেই, user offline এ add করলে Firebase এ যাবে না, online হলে auto sync হবে না (কারণ save শুধু `saveToLocalStorage` call এ)
- No presence: কে online আছে জানা যায় না
- Single global node: সব মেসের ডেটা এক জায়গায় — privacy violation, GDPR risk

**Recommended Architecture:**
```js
// Multi-tenant
/messes/{messId}/members/{memberId}
/messes/{messId}/meals/{pushId}
/messes/{messId}/bazar/{pushId}
// Security rules per messId
// Use Firebase Auth UID in members
```

---

## 7. Prioritized Action Plan

### P0 - আজকেই ঠিক করতে হবে (Critical)
1. Firebase Rules `auth != null` + roomId isolation
2. `escapeHtml()` যোগ করে সব innerHTML sanitize
3. `resetApp()` এ `ref.set(empty)` যোগ, না হলে data loss
4. `deleteMember` এ rent delete

### P1 - এই সপ্তাহে (High)
5. Inline onclick সরিয়ে `addEventListener` + `data-*`
6. Calculation কে pure function `calculateSummary(messData)` এ refactor, DRY fix
7. `innerHTML +=` loop বাদ, single assignment
8. Input validation: max length, NaN guard, duplicate check
9. Tailwind browser বাদ দিয়ে build step
10. `try/catch` for localStorage parse

### P2 - এই মাসে (Medium)
11. Firebase `set` বাদ দিয়ে `push`/`update` + transaction
12. Indexed data structure for O(1) grid
13. Debounce + offline queue
14. Add Vitest tests for mealRate, balance
15. Add SRI + CSP
16. Split file into modules, add Vite

### P3 - Nice to have
17. PWA + Service Worker
18. Card view for mobile summary
19. Print CSS
20. ARIA, keyboard nav
21. Onboarding tutorial

---

## 8. Quick Fix Snippets

**Escape HTML:**
```js
const esc = s => String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
```

**Safe render example:**
```js
// আগে: container.innerHTML += `<span>${m.name}</span>`
// পরে:
const div = document.createElement('div');
div.textContent = m.name; // auto escape
container.appendChild(div);
```

**Fixed resetApp:**
```js
function resetApp(){
  if(!confirm('সব ডেটা মুছে যাবে!')) return;
  messData = {members:[], mealsLog:[], bazarLog:[], fixedCosts:{rent:{}}, grandBills:{...}};
  localStorage.setItem(LOCAL_KEY, JSON.stringify(messData));
  if(window.firebaseRef) window.firebaseRef.set(messData);
  ...
}
```

---

## 9. Compliance Checklist

- [ ] OWASP Top 10: A1 Injection (XSS) - FAIL
- [ ] OWASP A5 Broken Access Control (Firebase open) - FAIL
- [ ] Data Validation - FAIL
- [ ] Error Handling - PARTIAL
- [ ] Performance Budget (<100KB JS) - FAIL (Tailwind browser ~300KB)
- [ ] Accessibility WCAG 2.1 - FAIL
- [ ] PWA Installable - FAIL

---

## 10. Conclusion

App টা functional এবং Bengali UX ভালো, কিন্তু **security ও data integrity তে production-ready না**। Firebase open রাখা মানে যে কেউ পুরো মেসের আর্থিক ডেটা মুছে দিতে পারে। XSS থাকা মানে একজন malicious member অন্যদের browser hijack করতে পারে।

**Recommendation:** P0 fix গুলো না করে public deploy করবেন না। এরপর P1 refactor করে module structure এ যান।

---
*Generated by Arena Audit Agent - 2026-09-16*
