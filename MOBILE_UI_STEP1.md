# Mobile UI Redesign — Step 1 (Interface / UX only)

**তারিখ:** ২০২৬-০৯-১৬
**Branch:** `arena/01a0ab0a-messkhata` (base: `feature/firebase-realtime`)
**লক্ষ্য:** শুধুমাত্র Mobile Interface / UI / UX redesign — কোনো business logic, Firebase বা database পরিবর্তন নয়।

---

## ১. ফাইল স্ট্রাকচার

| ফাইল | অবস্থা | কী আছে |
|---|---|---|
| `index.html` | রিরাইট (markup) | App shell, ৮টি mobile screen, ৫টি bottom-sheet, ২টি dialog। সব `<script>` (date helper, calculation, Firebase, PWA) **আগের মতোই অপরিবর্তিত** |
| `ui.css` | নতুন | Design tokens, cards, buttons, sheets, bottom navigation, responsive নিয়ম |
| `ui.js` | নতুন | Navigation, rendering, sheets/dialogs, action sheet (Edit/Delete/Share), empty-state onboarding |
| `sw.js` | হালকা পরিবর্তন | Cache version `v2`, `ui.css` ও `ui.js` app-shell cache-এ যোগ |
| `manifest.webmanifest` | অপরিবর্তিত | — |

CSS/JS আলাদা ফাইলে রাখা হয়েছে যাতে পরবর্তী ধাপে (Fixed Cost data entry) শুধু ওই ফাইলগুলোতেই কাজ করা যায়।

---

## ২. Design System

* **রঙ:** Primary সবুজ `#059669` (bKash-অনুপ্রাণিত, কিন্তু সম্পূর্ণ নিজস্ব), সেকশন-ভিত্তিক tint — Meal (amber), Bazar (emerald), Fixed (indigo), Report (blue), Members (violet)।
* **Typography:** বাংলার জন্য `Noto Sans Bengali`, সংখ্যা/শিরোনামে `Poppins`। `font-variant-numeric: tabular-nums` — সংখ্যা সাজানো থাকে।
* **Radius:** card 16px, sheet 20px, icon bubble 12–15px। শ্যাডো খুব হালকা (subtle), কোনো gradient animation নেই।
* **Touch target:** সব বাটন ≥ ৪৮px; ছোট icon-buttons ≥ ৩৬px (audit-verified)।
* **Icon:** সম্পূর্ণ consistent SVG line-icon সেট (stroke 1.9)। ইমোজির উপর নির্ভরতা কমানো হয়েছে — কারণ কিছু Android ডিভাইসে ইমোজি বক্স (□) হিসেবে দেখায়। আইকন-বাবলে ইমোজি থাকলেও প্রতিটি সেকশনে গ্লিফ একই।

---

## ৩. Screen Map

```
Home ──► Daily Meal ──► (Add/Edit Meal sheet)
     ├─► Bazar ─────────► (Add/Edit Bazar sheet) + ⋮ → Edit | Share | Delete
     ├─► Fixed Cost ────► (Fixed Cost sheet)
     ├─► Accounts ──────► Total Bazar, Total Fixed, Total Expense, Total Meals, Meal Rate,
     │                     Member Accounts, Previous Months
     ├─► Members ───────► Member Details (Meals, Expense, Balance + সাম্প্রতিক বাজার)
     └─► More ──────────► Sync, Install, About, Reset
```

* **Bottom Navigation (fixed):** Home | Meal | Bazar | Report | More — প্রতিটিতে icon + label + active indicator, `env(safe-area-inset-bottom)` সাপোর্ট।
* **Header:** Compact app bar — Home-এ logo + "Mess Khata" + মাস; ভেতরের স্ক্রিনে `← Back` + শিরোনাম; ডানে সিঙ্ক status chip ও menu।
* **Transitions:** স্ক্রিন বদলে হালকা slide-in; back গেলে animation ছাড়া; bottom-sheet নিচ থেকে উঠে আসে (Glide-style)। `prefers-reduced-motion` respect করা হয়।

---

## ৪. Mobile-first নিয়ম যা মানা হয়েছে

1. **No horizontal page scroll** — ৩২০ / ৩৬০ / ৩৭৫ / ৩৯০ / ৪১২ / ৪৩০px — ছয়টিতেই যাচাই করা (`scrollWidth === clientWidth`)।
2. Tables (দৈনিক মিলের ছক, বাজারের ছক, ব্যালেন্স শীট) collapsed `<details>`-এর ভিতরে, ভিতরে `overflow-x: auto` — পুরনো রিপোর্টিং ভিউ অপরিবর্তিত।
3. সব form **single column**, input height ≥ ৫২px, `inputmode="decimal"`, `font-size: 16px` (Android zoom এড়াতে)।
4. Modal/sheet: প্রায় full-width, comfortable margin, ভিতরে vertical scroll, নিচে sticky action button, বড় close button।
5. Edit / Delete / Share / More → **bottom sheet**।
6. `alert()` / `confirm()` → মোবাইল-বান্ধব dialog (একই বার্তা, শুধু উপস্থাপন আলাদা)।
7. Primary buttons: full-width, rounded, ≥ ৪৮px — `+ Add Meal`, `+ Add Bazar`, `+ Add Fixed Cost`, `+ Add Member`।

---

## ৫. যা **পরিবর্তন করা হয়নি** (যাচাই করা হয়েছে)

* Firebase config, `messKhata` path, `ref.set(messData)` sync, `.info/connected` listener
* Meal / Bazar / Fixed cost / Member calculation — `calculateMess()` অপরিবর্তিত
* `addMeals()`, `addBazar()`, `saveFixedCosts()`, `addMember()`, `deleteMember()`, `deleteBazar()`, `resetApp()`
* localStorage key `messAppDataMealKhata` ও ডেটা স্কিমা (migration নেই, ডেটা মুছে ফেলা হয়নি)
* `renderMealsGrid()`, `renderBazarGrid()`, `renderFixedCostInputs()`, `updateDropdowns()` — ছক/ইনপুট id + `data-mem` সব আগের মতো
* WhatsApp share — পাঁচটি ফাংশনের মেসেজ byte-identical
* `manifest.webmanifest`, icons, PWA install flow

---

## ৬. যাচাই (Testing)

Headless Chromium দিয়ে চালানো হয়েছে:

* **42টি data check** — UI-তে দেখানো প্রতিটি সংখ্যা independently recompute করে মেলানো (Home summary, Report tiles, member accounts, legacy tables) → সব ✅
* **53টি interaction/parity test** — meal add/edit/delete, bazar add/edit/delete, fixed cost save, member add/delete, member detail, back navigation, empty-state onboarding → সব ✅
* **WhatsApp parity** — ৫টি share message মূল অ্যাপের সাথে character-by-character অভিন্ন → ✅
* **Responsive/tap audit** — ৬টি width × ১১টি state; কোনো overflow বা undersized tap target নেই → ✅
* **Stress test** — অতি লম্বা বাংলা/English নাম ও বিবরণ, ৫-অঙ্কের টাকার পরিমাণ ৩২০px-এ → কোনো overflow নেই ✅

---

## ৭. পরবর্তী ধাপের জন্য প্রস্তুতি

* Fixed Cost screen ও sheet এখন Bazar-এর সাথে visually consistent — Step 2-এ এখানেই category-wise data entry যোগ করা সহজ।
* `ui.css`-এ `.group`, `.billrow`, `.rentrow` ক্লাসগুলো শুধু list-row হিসেবে কাজ করে; নতুন entry form যোগ করলে UI ভাঙবে না।
* `saveFixedCosts()` আগের input id (`bill-electricity`, `bill-maid`, `bill-wifi`, `bill-others`, `.rent-input[data-mem]`) পড়ে — নতুন structure যোগ করতে চাইলে এই id গুলো রেখে দিলেই পুরনো calculation অটুট থাকবে।
