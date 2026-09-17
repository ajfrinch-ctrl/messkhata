# Fixed Cost Entry — Bazar-এর মতো নতুন এন্ট্রি UI

**Branch:** `arena/01a0af86-messkhata` (base: `feature/firebase-realtime`)
**পরিবর্তিত ফাইল:** `index.html`, `ui.js`, `sw.js` (+ এই ডকুমেন্ট)
**অপরিবর্তিত:** `ui.css`, `manifest.webmanifest`, `icons/`, Firebase config/path, localStorage key

---

## ১. কী বদলেছে

### ক) পুরনো Fixed Cost লেআউট সম্পূর্ণ বাদ

* Fixed স্ক্রিন থেকে সরানো হয়েছে: **বাসা ভাড়া (সদস্যভিত্তিক)**, **ইউটিলিটি বিল** (Electricity / Maid / WiFi / Others),
  **সদস্যভিত্তিক সমবণ্টন** সেকশন ও **বিস্তারিত টেবিল** (chair-wise rent/utility breakdown)।
* ফিক্সড শিট থেকে সরানো হয়েছে: প্রতিটি সদস্যের রেন্ট ইনপুট (`.rent-input[data-mem]`),
  চারটি বিল ইনপুট (`#bill-electricity`, `#bill-maid`, `#bill-wifi`, `#bill-others`),
  লাইভ টোটাল (`#sheet-rent-total`, `#sheet-bill-total`, `#sheet-fixed-total`)।
* পুরনো DOM id (`#fixed-rent-inputs`, `#bill-*`, `#sheet-fixed-total`, `#summary-foot-rent/maid/elec/wifi/oth` ইত্যাদি)
  আর কোথাও ব্যবহার হয় না।

### খ) নতুন Fixed Cost Entry UI — Bazar-এর হুবহু অনুরূপ

| বিষয় | Bazar (আগের) | Fixed Cost (নতুন) |
|---|---|---|
| Add বাটন | `+# Add Bazar` (`btn--bazar`) | `+# Add Fixed Cost` (`btn--fixed`) |
| শিট | `#sheet-bazar` — তারিখ → সদস্য চিপ → বিবরণ → টাকা | `#sheet-fixed` — তারিখ → সদস্য চিপ → খরচের নাম → টাকা |
| ফিল্ড id | `bazar-date`, `bazar-member-select` + `bazar-member-chips`, `bazar-desc`, `bazar-amount` | `fixed-date`, `fixed-member-select` + `fixed-member-chips`, `fixed-desc`, `fixed-amount` |
| মোট কার্ড | `#table-total-bazar` | `#foot-total-fixed-all` |
| তালিকা | `#bazar-list` (Recent Bazar, ⋮ → Edit / Share / Delete) | `#fixed-list` (Recent Fixed Cost, একই ⋮ অ্যাকশন শিট) |
| ছক | `#bazar-grid-container` (তারিখ × সদস্য) | `#fixed-grid-container` (তারিখ × সদস্য) |
| টেবিল ভিউ | `#bazar-log-table-body` | `#fixed-log-table-body` |
| WhatsApp | `#wa-share-btn`, `#bazar-share-list-btn` | `#fixed-wa-share-btn`, `#fixed-share-list-btn` |

* খরচের নাম **সম্পূর্ণ free text** — কোনো ক্যাটাগরি বা ড্রপডাউন নেই। `কলা`, `বাসা ভাড়া`, `ডিম` — যা লিখবেন তাই সংরক্ষিত হবে।
* **Required:** তারিখ, খরচের নাম, টাকার পরিমাণ, Paid By (সদস্য) — চারটিই বাধ্যতামূলক (বাজার এন্ট্রির মতোই ভ্যালিডেশন)।
* **একই তারিখে একাধিক এন্ট্রি** এবং **আলাদা আলাদা তারিখে এন্ট্রি** — দুটোই বাজারের মতোই কাজ করে।
* Edit ফ্লো: আগের এন্ট্রিটি সরিয়ে নতুন করে লেখা হয় → একই এন্ট্রি **দুইবার গোনা হয় না**।
* Delete ফ্লো: মোবাইল কনফার্ম ডায়ালগ → এন্ট্রি বাদ → সব হিসাব সাথে সাথে আপডেট।
* মোবাইল অভিজ্ঞতা হুবহু বাজারের মতো — একই bottom-sheet, চিপ-পিকার, action-sheet, টোস্ট।

### গ) হিসাব (Accounting)

* **যে সদস্য টাকা দিয়েছেন, তাঁর অ্যাকাউন্টে পুরো টাকা জমা (credit)** হয় — বাজারে যিনি দেন তাঁর মতোই।
* **খরচটি সব সদস্যের মধ্যে সমান ভাগে বণ্টিত হয়** (অ্যাপে ফিক্সড খরচের জন্য এটাই আগের নিয়ম ছিল — ইউটিলিটি বিল সবার মধ্যে সমান ভাগ হতো)।
* মোট খরচ = মিলের খরচ + ফিক্সড খরচের ভাগ; ব্যালেন্স = **জমা (বাজার + ফিক্সড) − মোট খরচ** → পাবে / দেবে।
* **মিল রেট অপরিবর্তিত** = মোট বাজার ÷ মোট মিল; ফিক্সড খরচ মিল রেটে ঢোকানো হয়নি।
* মাসিক মোট ও Previous Months তালিকায় ফিক্সড খরচ যোগ হয়েছে (তারিখ অনুযায়ী)।
* Report স্ক্রিনে নতুন **Final Settlement** সেকশন — মিল + বাজার + ফিক্সড সব মিলিয়ে কে পাবে, কে দেবে।

---

## ২. পুরনো ডেটা (compatibility)

পুরনো ডেটা মুছে ফেলা হয়নি; localStorage key ও Firebase path (``messKhata``) অপরিবর্তিত।

`messData.fixedCosts.rent` ও `messData.grandBills` আগের মতোই সংরক্ষিত থাকে (রিসেট/সিঙ্কেও যায়),
কিন্তু হিসাবের জন্য **একবারই** `fixedCostLog`-এ মাইগ্রেট হয় (`migrateFixedCostData()`, বুট ও ক্লাউড লোডে চলে; `fixedCostLog` থাকলে আর চলে না):

| পুরনো রেকর্ড | মাইগ্রেট হয়ে হয় | হিসাব |
|---|---|---|
| সদস্যের ব্যক্তিগত বাসা ভাড়া (`fixedCosts.rent`) | `scope:'member'` এন্ট্রি (`desc: 'বাসা ভাড়া'`) | আগের মতোই ওই সদস্যের খরচ, কোনো জমা নেই → **সংখ্যা অপরিবর্তিত** |
| চারটি ইউটিলিটি বিল (`grandBills`) | `scope:'all'` এন্ট্রি (`বিদ্যুৎ বিল`, `বুয়া বিল`, `ওয়াইফাই বিল`, `অন্যান্য বিল`) | আগের মতোই সবার সমান ভাগ, কোনো জমা নেই → **সংখ্যা অপরিবর্তিত** |

* তারিখ না থাকায় পুরনো রেকর্ডগুলোর তারিখ হিসেবে ডেটার **সবচেয়ে পুরনো তারিখ** (না থাকলে আজ) বসানো হয়; তালিকায় `পুরনো রেকর্ড` লেবেল দেখানো হয়।
* পুরনো রেকর্ডও এখন তালিকা/টেবিলে দেখা যায়, Edit ও Delete করা যায় — কিন্তু এডিট করলে সেটি নতুন নিয়মের এন্ট্রি হয়ে যায় (Paid By সহ)।
* সদস্য ডিলিট করলে মিল/বাজারের মতোই তাঁর ফিক্সড এন্ট্রিগুলোও বাদ যায়।

---

## ৩. যা পরিবর্তন করা হয়নি (যাচাইকৃত)

* Meal entry, মিলের ছক, meal rate = বাজার ÷ মিল — অপরিবর্তিত
* Bazar entry/edit/delete/share, বাজারের ছক ও তালিকা — অপরিবর্তিত
* Member add/delete, Member Details, Reports (টাইল, member accounts, balance sheet টেবিল — শুধু কলাম ফিক্সড অনুযায়ী)
* Deposit/সেটেলমেন্টে বাজারের জমার সূত্র — অপরিবর্তিত, সাথে ফিক্সড জমা যোগ
* Firebase config, `ref.set(messData)` সিঙ্ক, `.info/connected` — অপরিবর্তিত (শুধু `fixedCostLog` ফিল্ডটি সংরক্ষণ করে)
* localStorage key, PWA install flow, WhatsApp share (মেসেজে ফিক্সড অংশ নতুন নিয়ম অনুযায়ী)

---

## ৪. যাচাই (Verification)

স্যান্ডবক্সে ব্রাউজার না থাকায় jsdom দিয়ে headless-টেস্ট চালানো হয়েছে — **৮০টি চেক, সব পাস**:

* পুরনো ডেটা মাইগ্রেশনের পর মিল রেট, ফিক্সড ভাগ ও প্রতি সদস্যের ব্যালেন্স **পুরনো অ্যাপের সূত্রের সাথে হুবহু** মিলে যায়
* নতুন এন্ট্রি (একই তারিখে ২টি + ভিন্ন তারিখে ২টি), free-text নাম (`কলা`), Paid By ভ্যালিডেশন
* Paid By-এর পুরো টাকা জমা, সবার সমান ভাগ, **ডাবল-কাউন্ট নেই** (মোট = এন্ট্রিগুলোর যোগফল)
* Edit/Delete, সদস্য ডিলিট, রিসেট, empty-state, একক সদস্যের কেস
* চূড়ান্ত সেটেলমেন্টে পাবে/দেবে-র যোগফল = ০
* Firebase ক্লাউড ডেটা (পুরনো স্কিমা) → মাইগ্রেশন → আবার সিঙ্ক

`sw.js`-এর cache version `meal-khata-v4` → **`meal-khata-v5`** (পরের ধাপে **v6**) — পুরনো cache বাদ যাবে, নতুন UI সবাই পাবেন।

> পরবর্তী পরিবর্তন (বিগত মাসের হিসাব + পুরনো ডেটা স্থায়ীভাবে ডিলিট): দেখুন [`MONTH_HISTORY_AND_RETENTION.md`](./MONTH_HISTORY_AND_RETENTION.md)।
>
> **Fixed Cost-এর সদস্য-তালিকার বাগ ফিক্স** (নতুন সদস্য যোগ করলেই তাঁর নাম Fixed Cost-এ দেখায়,
> বাজারের হুবহু একই UI/সদস্য লিস্ট): দেখুন [`FIXED_COST_MEMBER_SYNC.md`](./FIXED_COST_MEMBER_SYNC.md)।

> নোট: কোনো ডিভাইসে যদি পুরনো ক্যাশে করা অ্যাপ চালু থাকে, সে লেখার সময় `fixedCostLog` ফিল্ডটি বাদ দিতে পারে
> (কারণ পুরনো কোড ওই ফিল্ড চেনে না)। তখন নতুন অ্যাপ খোলার সময় পুরনো `fixedCosts.rent`/`grandBills` থেকে
> আবার মাইগ্রেট হবে — পুরনো হিসাব হারাবে না, শুধু মাঝের নতুন এন্ট্রিগুলো নতুন করে যোগ করতে হবে।
> সব ডিভাইস একবার রিফ্রেশ করলেই সমস্যা শেষ।
