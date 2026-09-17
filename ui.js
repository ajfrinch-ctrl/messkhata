/* ============================================================================
   Meal Khata — Mobile App Interaction Layer
   ----------------------------------------------------------------------------
   এই ফাইলটি শুধু UI / UX / navigation নিয়ন্ত্রণ করে।

   ⚠️ Business logic এখানে নতুন করে লেখা হয়নি —
   meal / bazar / fixed cost / member / report এর সব calculation, Firebase sync
   এবং WhatsApp share আগের ফাংশনগুলোকেই (saveMealsForDate, addBazar, saveFixedCosts,
   deleteBazar, deleteMember, resetApp, calculateMess, updateDropdowns,
   renderMealsGrid, renderBazarGrid, share*) কল করা হয়েছে।
   শুধু রেন্ডারিং ও navigation এর ধাপগুলো মোবাইল-বান্ধব করা হয়েছে।
   ========================================================================== */

(function () {
    'use strict';

    /* ------------------------------------------------------------ helpers -- */
    const $  = (id) => document.getElementById(id);
    const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
    const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

    const bn = (v) => (typeof window.convertToBanglaNumber === 'function'
        ? window.convertToBanglaNumber(v)
        : String(v));

    const bnDate = (d) => (typeof window.formatBanglaDate === 'function'
        ? window.formatBanglaDate(d)
        : String(d || ''));

    function esc(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function money(value, digits) {
        const n = Number(value) || 0;
        const d = digits === undefined ? (n % 1 === 0 ? 0 : 1) : digits;
        return '৳' + bn(n.toFixed(d));
    }

    /* ঋণাত্মক ব্যালেন্স: ৳-১২৩ নয়, বরং −৳১২৩ দেখানো হয় */
    function signedMoney(value) {
        const n = Number(value) || 0;
        return (n < 0 ? '−' : '') + money(Math.abs(n));
    }

    function todayISO() {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    function monthKey(dateStr) { return String(dateStr || '').slice(0, 7); }

    const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

    function monthLabel(key) {
        const parts = String(key || '').split('-');
        if (parts.length < 2) return String(key || '');
        const idx = Number(parts[1]) - 1;
        return (BN_MONTHS[idx] || parts[1]) + ' ' + bn(parts[0]);
    }

    /* ⚠️ legacy স্ক্রিপ্টে `let messData` দিয়ে ডিক্লেয়ার করা, তাই এটি window-এর
       প্রপার্টি নয় — global scope থেকে সরাসরি পড়তে হয়। */
    function data() {
        try {
            if (typeof messData === 'object' && messData) return messData;
        } catch (e) { /* not ready yet */ }
        return (typeof window.messData === 'object' && window.messData) ? window.messData : null;
    }

    /* সদস্যের তালিকা — অ্যাপের সব জায়গায় (মিল / বাজার / ফিক্সড / রিপোর্ট)
       এই একই ফাংশন থেকে আসে, তাই নতুন সদস্য যোগ বা মুছে দিলে তিনটি
       তালিকাই একসাথে আপডেট হয় এবং কোনো সদস্য বাদ যায় না বা দুইবারও
       আসে না। index.html-এর memberList() থাকলে সেটিই ব্যবহার হয়
       (id ছাড়া / ডুপ্লিকেট id বাদ দিয়ে, ক্রম messData.members অনুযায়ী)। */
    function members() {
        if (typeof window.memberList === 'function') {
            try { return window.memberList() || []; } catch (e) { /* ignore */ }
        }
        const d = data();
        const list = d ? (d.members || []) : [];
        const seen = {};
        return list.filter(function (m) {
            if (!m || !m.id || seen[m.id]) return false;
            seen[m.id] = 1;
            return true;
        });
    }

    function memberName(id) {
        const m = members().filter((x) => x.id === id)[0];
        return m ? m.name : 'সদস্য';
    }

    function firstMemberId() {
        return members().length ? members()[0].id : '';
    }

    function sortedBazarDesc() {
        const d = data(); if (!d) return [];
        return (d.bazarLog || []).slice().sort(function (a, b) {
            const diff = new Date(b.date) - new Date(a.date);
            return diff !== 0 ? diff : String(b.id).localeCompare(String(a.id));
        });
    }

    /* ------------------------------------------------------------- toast ---- */
    window.showToast = function (message) {
        const container = $('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = '<span aria-hidden="true">✅</span><span>' + esc(message) + '</span>';
        container.appendChild(toast);
        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(function () { toast.remove(); }, 300);
        }, 2600);
    };

    /* ------------------------------------------ alert / confirm → dialog --- */
    window.alert = function (message) {
        $('alert-title').textContent = 'জানানো হচ্ছে';
        $('alert-text').textContent = String(message === undefined ? '' : message);
        openSheet('alert-overlay', { silent: true });
    };

    on($('alert-ok-btn'), 'click', function () { closeTopSheet(); });

    function askConfirm(message, title) {
        return new Promise(function (resolve) {
            $('confirm-title').textContent = title || 'নিশ্চিত করুন';
            $('confirm-text').textContent = message;
            openSheet('confirm-overlay', { silent: true });

            function done(result) {
                $('confirm-yes').removeEventListener('click', yes);
                $('confirm-no').removeEventListener('click', no);
                closeSheet('confirm-overlay');
                resolve(result);
            }
            function yes() { done(true); }
            function no() { done(false); }

            $('confirm-yes').addEventListener('click', yes);
            $('confirm-no').addEventListener('click', no);
        });
    }

    /* বিদ্যমান legacy ফাংশনগুলো native confirm() ব্যবহার করে।
       লজিক অপরিবর্তিত রাখতে শুধু confirm কে সাময়িকভাবে "সবসময় হ্যাঁ" করা হয়,
       কারণ মোবাইল ডায়ালগে ইউজার ইতিমধ্যেই নিশ্চিত করেছেন। */
    function runConfirmed(fn) {
        const original = window.confirm;
        window.confirm = function () { return true; };
        try { fn(); } finally { window.confirm = original; }
    }

    /* ============================================================ SHEETS ==== */
    let sheetStack = [];
    let suppressPop = null;          /* { mode: 'ignore' | 'screen', until: ts } */

    function pushHistory(state) {
        try { history.pushState(state, ''); } catch (e) { /* ignore */ }
    }

    function selfPop(mode) {
        suppressPop = { mode: mode || 'ignore', until: Date.now() + 700 };
        try { history.back(); } catch (e) { /* ignore */ }
    }

    function openSheet(id, opts) {
        const el = $(id);
        if (!el) return;
        if (sheetStack.indexOf(id) === -1) sheetStack.push(id);
        el.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        pushHistory({ mk: 'sheet', id: id });

        if (!(opts && opts.silent)) {
            const focusable = el.querySelector('input:not([type="hidden"]):not(.visually-hidden-control), select:not(.visually-hidden-control)');
            if (focusable) {
                setTimeout(function () { try { focusable.focus(); } catch (e) { /* ignore */ } }, 280);
            }
        }
    }

    function closeSheet(id, opts) {
        const el = $(id);
        if (!el || !el.classList.contains('is-open')) return;
        el.classList.remove('is-open');
        sheetStack = sheetStack.filter(function (s) { return s !== id; });
        if (!sheetStack.length) document.body.style.overflow = '';
        if (!(opts && opts.silentHistory)) selfPop('ignore');
    }

    function closeTopSheet(opts) {
        if (!sheetStack.length) return false;
        closeSheet(sheetStack[sheetStack.length - 1], opts);
        return true;
    }

    function closeAllSheets() {
        const count = sheetStack.length;
        sheetStack.forEach(function (id) {
            const el = $(id);
            if (el) el.classList.remove('is-open');
        });
        sheetStack = [];
        document.body.style.overflow = '';
        if (count) selfPop('ignore');
    }

    /* ======================================================== SCREEN NAV ==== */
    const SCREEN_TITLES = {
        home:    ['Mess Khata', ''],
        meal:    ['Daily Meal', 'দৈনিক মিল ব্যবস্থাপনা'],
        bazar:   ['Bazar', 'দৈনিক বাজার খরচ'],
        fixed:   ['Fixed Cost', 'ফিক্সড খরচ ব্যবস্থাপনা'],
        report:  ['Accounts', 'হিসাব ও রিপোর্ট'],
        month:   ['Month Accounts', 'মাসের হিসাব'],
        members: ['Members', 'সদস্যদের তথ্য'],
        member:  ['Member Details', 'সদস্যের হিসাব'],
        more:    ['More', 'সেটিংস ও অন্যান্য']
    };

    const NAV_FOR_SCREEN = {
        home: 'home', meal: 'meal', bazar: 'bazar', report: 'report',
        fixed: 'more', members: 'more', member: 'more', more: 'more',
        month: 'report'
    };

    let navStack = ['home'];
    let pendingAction = null;
    let currentMemberId = null;

    function currentScreen() { return navStack[navStack.length - 1] || 'home'; }

    function activateScreen(name, direction) {
        const target = $('screen-' + name);
        if (!target) return;

        /* প্রতিটি স্ক্রিনে ঢোকার আগে নির্দিষ্ট রেন্ডার হুক */
        if (name === 'member') renderMemberDetail(currentMemberId);
        if (name === 'month') renderMonthScreen();

        $$('.screen').forEach(function (s) { s.classList.remove('is-active'); });
        target.classList.add('is-active');

        const meta = SCREEN_TITLES[name] || [name, ''];
        $('appbar-title').textContent = meta[0];
        $('appbar-sub').textContent = meta[1] || (monthLabel(todayISO().slice(0, 7)) + ' · মেস হিসাব');
        $('appbar-logo').classList.toggle('hidden', name !== 'home');
        $('nav-back').hidden = (name === 'home');

        const navKey = NAV_FOR_SCREEN[name] || 'home';
        $$('.navbar__item').forEach(function (item) {
            item.classList.toggle('is-active', item.getAttribute('data-goto') === navKey);
        });

        if (direction === 'back') {
            target.style.animation = 'none';
            void target.offsetWidth;
            target.style.animation = '';
        }

        window.scrollTo(0, 0);

        if (pendingAction) {
            const run = pendingAction;
            pendingAction = null;
            setTimeout(run, 70);
        }
    }

    function go(name, then) {
        if (sheetStack.length) closeAllSheetsSilently();
        if (then) pendingAction = then;

        if (name === 'home') {
            navStack = ['home'];
            try { history.replaceState({ mk: 'home' }, ''); } catch (e) { /* ignore */ }
        } else if (currentScreen() !== name) {
            navStack.push(name);
            pushHistory({ mk: 'screen', name: name });
        }
        activateScreen(name);
    }

    function closeAllSheetsSilently() {
        sheetStack.forEach(function (id) {
            const el = $(id);
            if (el) el.classList.remove('is-open');
        });
        sheetStack = [];
        document.body.style.overflow = '';
    }

    function goBack() {
        if (sheetStack.length) { closeTopSheet(); return; }
        if (navStack.length > 1) { selfPop('screen'); return; }
        activateScreen('home', 'back');
    }

    on($('nav-back'), 'click', goBack);

    window.addEventListener('popstate', function (event) {
        const pending = suppressPop;
        suppressPop = null;
        if (pending && Date.now() <= pending.until) {
            if (pending.mode === 'screen') {
                if (navStack.length > 1) navStack.pop();
                activateScreen(currentScreen(), 'back');
            }
            return;
        }

        /* ইউজারের নিজের back gesture / back button */
        if (sheetStack.length) { closeTopSheet({ silentHistory: true }); return; }
        if (navStack.length > 1) {
            navStack.pop();
            activateScreen(currentScreen(), 'back');
            return;
        }
        /* home screen — ব্রাউজারকে স্বাভাবিক ভাবে ছেড়ে দিই */
    });

    /* ================================================== WHATSAPP SHARE ====== */
    function shareUrlFor(text) {
        return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
    }

    function shareEntry(entry) {
        const info = {
            buyer: entry.memberId ? memberName(entry.memberId) : (entry.buyer || 'সদস্য'),
            date: entry.displayDate || bnDate(entry.date),
            desc: entry.desc || 'সাধারণ বাজার',
            amount: entry.amount
        };
        if (typeof window.shareSpecificOnWhatsApp === 'function') {
            runConfirmed(function () {
                window.shareSpecificOnWhatsApp(info.buyer, info.date, info.desc, info.amount);
            });
            return;
        }
        window.open(shareUrlFor('🛒 *বাজার খরচ আপডেট*\n\n👤 *বাজারকারী:* ' + info.buyer +
            '\n📅 *তারিখ:* ' + info.date + '\n📋 *বিবরণ:*\n' + info.desc +
            '\n\n💵 *টাকার পরিমাণ:* ' + bn(info.amount) + ' টাকা'), '_blank');
    }

    function shareMember(id) {
        if (typeof window.shareMemberOnWhatsApp === 'function') {
            runConfirmed(function () { window.shareMemberOnWhatsApp(id); });
        }
    }

    /* ==================================================== MEMBER PICKERS ==== */
    /* মিল শিটে এখন সদস্য-তালিকা (প্রতিজনের আলাদা মিল) ব্যবহার হয়,
       তাই এখানে শুধু বাজারের পিকারই দরকার। */
    const PICKERS = [
        { kind: 'bazar', select: 'bazar-member-select', chips: 'bazar-member-chips' },
        { kind: 'fixed', select: 'fixed-member-select', chips: 'fixed-member-chips' }
    ];

    function pickerById(kind) {
        return PICKERS.filter(function (p) { return p.kind === kind; })[0];
    }

    /* একটি পিকারের (বাজার বা ফিক্সড) সদস্য-তালিকা নতুন করে সাজানো হয়।
       দুটো শিটেই হুবহু একই মার্কআপ, একই স্টাইল ও একই সদস্য লিস্ট বসে —
       লিস্টটি members() (অর্থাৎ messData.members) থেকে সরাসরি আসে, তাই
       সদস্য যোগ/মুছে দিলে এখানে সাথে সাথেই দেখা যায়। */
    function renderPicker(p) {
        const select = $(p.select);
        const box = $(p.chips);
        if (!select || !box) return;

        const list = members();
        const current = select.value;

        box.innerHTML = list.map(function (m) {
            return '<button type="button" class="chip" data-picker="' + p.kind +
                '" data-mid="' + esc(m.id) + '">' + esc(m.name) + '</button>';
        }).join('');

        /* আগে যা বাছাই করা ছিল সেটি টিকে থাকে (সদস্যটি মুছে না গেলে),
           নাহলে প্রথম সদস্য — ফাঁকা তালিকা হলে শুধু empty-state দেখানো হয় */
        if (current && list.some(function (m) { return m.id === current; })) select.value = current;
        else if (list.length) select.value = list[0].id;
        else select.value = '';

        syncPickerSelection(p.kind);
    }

    function renderPickers() {
        PICKERS.forEach(function (p) { renderPicker(p); });
    }


    function syncPickerSelection(kind) {
        const p = pickerById(kind);
        if (!p) return;
        const select = $(p.select);
        const box = $(p.chips);
        if (!select || !box) return;
        $$('.chip', box).forEach(function (chip) {
            chip.classList.toggle('is-on', chip.getAttribute('data-mid') === select.value);
        });
    }

    const legacyUpdateDropdowns = window.updateDropdowns;
    window.updateDropdowns = function () {
        if (typeof legacyUpdateDropdowns === 'function') legacyUpdateDropdowns.apply(this, arguments);
        renderPickers();
    };

    /* ========================================================== ICONS ======= */
    function dotsIcon() {
        return '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5.4" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18.6" r="1.7"/></svg>';
    }
    function chevronRight() {
        return '<svg class="ico" viewBox="0 0 24 24"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
    }
    function chevronDown() {
        return '<svg class="ico" viewBox="0 0 24 24"><path d="M6 9.5 12 15.5 18 9.5"/></svg>';
    }
    function mealIcon() {
        return '<svg class="ico" viewBox="0 0 24 24"><path d="M4 11h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8Z"/><path d="M9 8V6.2"/><path d="M12 8V5.4"/><path d="M15 8V6.2"/></svg>';
    }
    function waIcon() {
        return '<svg class="ico" viewBox="0 0 24 24"><path d="M20 11.6a7.6 7.6 0 0 1-11.1 6.8L4.5 20l1.6-4.3A7.6 7.6 0 1 1 20 11.6Z"/></svg>';
    }
    function editIcon() {
        return '<svg class="ico" viewBox="0 0 24 24"><path d="M4.5 19.5h4l10-10a2.4 2.4 0 0 0-3.4-3.4l-10 10v3.4Z"/><path d="M14.4 7.1l2.9 2.9"/></svg>';
    }
    function trashIcon() {
        return '<svg class="ico" viewBox="0 0 24 24"><path d="M5 7h14"/><path d="M9.5 7V5.2h5V7"/><path d="M6.6 7l.9 12.2h9l.9-12.2"/><path d="M10.4 10.6v5.4"/><path d="M13.6 10.6v5.4"/></svg>';
    }
    function infoIcon() {
        return '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11.2v5.3"/><path d="M12 8h.01"/></svg>';
    }

    function emptyState(emoji, title, sub) {
        return '<div class="empty">' +
            '<div class="empty__mark" style="font-size:22px">' + emoji + '</div>' +
            '<p>' + esc(title) + '</p>' +
            (sub ? '<p style="font-size:12px;margin-top:4px">' + esc(sub) + '</p>' : '') +
        '</div>';
    }

    /* ====================================================== CALC HELPERS ==== */
    /* ফিক্সড খরচের হিসাব এক জায়গাতেই (index.html-এর computeFixedSummary) হয় —
       UI কেবল সেটাই পড়ে, তাই কোনো সংখ্যা দুইবার গোনা হয় না। */
    function fixedSummary() {
        if (typeof window.computeFixedSummary === 'function') {
            try { return window.computeFixedSummary(); } catch (e) { /* ignore */ }
        }
        const d = data();
        const perMember = {};
        members().forEach(function (m) { perMember[m.id] = { share: 0, paid: 0 }; });
        return { entries: (d && d.fixedCostLog) || [], perMember: perMember, total: 0, totalPaid: 0 };
    }

    function fixedEntries() {
        const list = fixedSummary().entries || [];
        return list.slice().sort(function (a, b) {
            const diff = new Date(b.date) - new Date(a.date);
            return diff !== 0 ? diff : String(b.id).localeCompare(String(a.id));
        });
    }

    function totals() {
        const d = data(); if (!d) return { meals: 0, bazar: 0, rate: 0, fixed: 0 };
        const meals = (d.mealsLog || []).reduce(function (s, l) { return s + (Number(l.count) || 0); }, 0);
        const bazar = (d.bazarLog || []).reduce(function (s, b) { return s + (Number(b.amount) || 0); }, 0);
        const fixed = Number(fixedSummary().total) || 0;
        return {
            meals: meals,
            bazar: bazar,
            rate: meals > 0 ? bazar / meals : 0,
            fixed: fixed
        };
    }

    function memberStats(memberId) {
        const d = data(); if (!d) return { meals: 0, spent: 0, rent: 0, share: 0, expense: 0, balance: 0 };
        const t = totals();
        const meals = (d.mealsLog || []).filter(function (l) { return l.memberId === memberId; })
            .reduce(function (s, l) { return s + (Number(l.count) || 0); }, 0);
        const bazarSpent = (d.bazarLog || []).filter(function (b) { return b.memberId === memberId; })
            .reduce(function (s, b) { return s + (Number(b.amount) || 0); }, 0);
        const f = fixedSummary().perMember[memberId] || { share: 0, paid: 0 };
        const expense = meals * t.rate + f.share;
        const spent = bazarSpent + f.paid;
        return {
            meals: meals,
            bazarSpent: bazarSpent,
            fixedPaid: f.paid,
            spent: spent,
            share: f.share,
            rent: f.share,
            expense: expense,
            balance: spent - expense
        };
    }

    /* ======================================================= HOME RENDER ==== */
    function renderHomeSummary() {
        const d = data(); if (!d) return;
        const today = todayISO();
        const t = totals();

        $('home-today-date').textContent = bnDate(today);

        const todayMeals = (d.mealsLog || []).filter(function (l) { return l.date === today; })
            .reduce(function (s, l) { return s + (Number(l.count) || 0); }, 0);
        const todayBazar = (d.bazarLog || []).filter(function (b) { return b.date === today; })
            .reduce(function (s, b) { return s + (Number(b.amount) || 0); }, 0);

        $('home-today-meals').textContent = bn(Number.isInteger(todayMeals) ? todayMeals : todayMeals.toFixed(1));
        $('home-today-bazar').textContent = money(todayBazar);
        /* সাধারণত ২ দশমিক; ১০০০+ হলে দশমিক বাদ দিলে ছোট স্ক্রিনেও এক লাইনে ধরে */
        $('home-meal-rate').textContent = '৳' + bn(t.rate.toFixed(t.rate >= 1000 ? 0 : 2));
        $('home-summary-note').textContent = 'মোট খরচ ' + money(t.bazar + t.fixed) +
            ' · ' + bn(members().length) + ' জন সদস্য';

        const startCard = $('home-start-card');
        if (startCard) startCard.classList.toggle('hidden', members().length > 0);
    }

    /* হোম থেকে Main Menu বাদ দেওয়া হয়েছে — শুধু “More” স্ক্রিনের মেটা থাকে */
    function renderMenuMeta() {
        const d = data(); if (!d) return;
        const t = totals();
        const set = function (id, text) { const el = $(id); if (el) el.textContent = text; };
        set('more-meta-meal', bn(Number.isInteger(t.meals) ? t.meals : t.meals.toFixed(1)) + ' মিল');
        set('more-meta-bazar', money(t.bazar));
        set('more-meta-fixed', money(t.fixed));
        set('more-meta-members', bn(members().length) + ' জন');
    }

    /* ======================================================= MEAL RENDER ==== */
    function renderMealScreen() {
        const d = data(); if (!d) return;
        const today = todayISO();
        const list = members();
        const todayBox = $('meal-today-list');
        const dayBox = $('meal-day-list');
        if (!todayBox || !dayBox) return;

        const todayEntries = (d.mealsLog || []).filter(function (l) { return l.date === today; });
        const todayTotal = todayEntries.reduce(function (s, l) { return s + (Number(l.count) || 0); }, 0);
        $('meal-today-total').textContent =
            'মোট ' + bn(Number.isInteger(todayTotal) ? todayTotal : todayTotal.toFixed(1)) + ' মিল';

        if (!list.length) {
            todayBox.innerHTML = emptyState('🥣', 'এখনো কোনো সদস্য নেই।', 'আগে সদস্য যোগ করুন, তারপর মিল লিখুন।');
            dayBox.innerHTML = '';
            return;
        }

        todayBox.innerHTML = list.map(function (m) {
            const entry = todayEntries.filter(function (l) { return l.memberId === m.id; })[0];
            const count = entry ? (Number(entry.count) || 0) : 0;
            const badge = count > 0
                ? '<span class="badge badge--meal">' + bn(count) + ' মিল</span>'
                : '<span class="badge">মিল নেই</span>';

            return '<div class="row">' +
                '<span class="avatar">' + esc(String(m.name || '?').trim().charAt(0) || '?') + '</span>' +
                '<div class="row__body">' +
                    '<div class="row__title">' + esc(m.name) + '</div>' +
                    '<div class="row__sub">' + badge + '</div>' +
                '</div>' +
                (entry
                    ? '<div class="row__actions">' +
                        '<button type="button" class="rowbtn" data-act="meal-actions" data-date="' + esc(today) +
                        '" data-mid="' + esc(m.id) + '" aria-label="আরও অপশন">' + dotsIcon() + '</button>' +
                      '</div>'
                    : '<button type="button" class="badge" data-act="meal-quick-open" data-mid="' + esc(m.id) +
                      '" data-date="' + esc(today) + '">+ যোগ</button>') +
            '</div>';
        }).join('');

        const grouped = {};
        (d.mealsLog || []).forEach(function (l) {
            if (!grouped[l.date]) grouped[l.date] = [];
            grouped[l.date].push(l);
        });
        const dates = Object.keys(grouped).sort(function (a, b) { return new Date(b) - new Date(a); });

        if (!dates.length) {
            dayBox.innerHTML = emptyState('🍽️', 'এখনো কোনো মিল এন্ট্রি নেই।',
                'উপরের “Add Meal” বাটনে চাপ দিয়ে আজকের মিল লিখুন।');
            return;
        }

        dayBox.innerHTML = dates.map(function (date) {
            const entries = grouped[date].slice().sort(function (a, b) {
                return (Number(b.count) || 0) - (Number(a.count) || 0);
            });
            const total = entries.reduce(function (s, l) { return s + (Number(l.count) || 0); }, 0);

            const rows = entries.map(function (l) {
                const count = Number(l.count) || 0;
                const name = memberName(l.memberId);
                return '<div class="row">' +
                    '<span class="avatar">' + esc(String(name).trim().charAt(0)) + '</span>' +
                    '<div class="row__body">' +
                        '<div class="row__title">' + esc(name) + '</div>' +
                        '<div class="row__sub">' + bn(count) + ' মিল</div>' +
                    '</div>' +
                    '<div class="row__actions">' +
                        '<button type="button" class="rowbtn" data-act="meal-actions" data-date="' + esc(date) +
                        '" data-mid="' + esc(l.memberId) + '" aria-label="আরও অপশন">' + dotsIcon() + '</button>' +
                    '</div>' +
                '</div>';
            }).join('');

            return '<details class="fold">' +
                '<summary>' +
                    '<span class="fold__ico fold__ico--meal">' + mealIcon() + '</span>' +
                    '<span class="fold__title">' + esc(bnDate(date)) + '</span>' +
                    '<span class="badge badge--meal">' + bn(Number.isInteger(total) ? total : total.toFixed(1)) + '</span>' +
                    '<span class="fold__chev">' + chevronDown() + '</span>' +
                '</summary>' +
                '<div class="fold__body">' + rows + '</div>' +
            '</details>';
        }).join('');
    }

    /* ====================================================== BAZAR RENDER ==== */
    function renderBazarScreen() {
        const d = data(); if (!d) return;
        const box = $('bazar-list');
        if (!box) return;

        const entries = sortedBazarDesc();
        const t = totals();
        const totalEl = $('table-total-bazar');
        if (totalEl) totalEl.textContent = bn(t.bazar.toFixed(1));
        $('bazar-count').textContent = bn(entries.length) + 'টি এন্ট্রি';

        if (!entries.length) {
            box.innerHTML = emptyState('🛒', 'কোনো বাজার খরচ নেই।', '“Add Bazar” চেপে প্রথম খরচ যোগ করুন।');
            return;
        }

        box.innerHTML = entries.map(function (b) {
            const amount = Number(b.amount) || 0;
            return '<div class="row">' +
                '<div class="row__body">' +
                    '<div class="row__title">' + esc(b.desc || 'সাধারণ বাজার') + '</div>' +
                    '<div class="row__sub">' + esc(b.displayDate || bnDate(b.date)) + ' · ' + esc(memberName(b.memberId)) + '</div>' +
                '</div>' +
                '<div class="row__right"><span class="row__amount">৳' + bn(amount) + '</span></div>' +
                '<div class="row__actions">' +
                    '<button type="button" class="rowbtn" data-act="bazar-actions" data-id="' + esc(b.id) +
                    '" aria-label="আরও অপশন">' + dotsIcon() + '</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    /* ================================================== FIXED COST RENDER == */
    /* Fixed Cost এখন Bazar-এর মতোই এন্ট্রি-ভিত্তিক — তালিকা, ছক ও অ্যাকশন
       সবই Bazar স্ক্রিনের হুবহু একই ধাঁচে তৈরি (ইনডিগো অ্যাকসেন্ট সহ)। */
    /* একটি ফিক্সড এন্ট্রি দেখানো হয় কোন সদস্যের নামে:
       • নতুন এন্ট্রি  → যিনি টাকা দিয়েছেন (memberId)
       • পুরনো রেকর্ড → যার নামে খরচটি (scope:'member' + chargeTo)
       এটি শুধু দেখানোর বিভাজন — হিসাবের নিয়ম (computeFixedSummary) অপরিবর্তিত। */
    function fixedOwnerOf(entry) {
        if (!entry) return '';
        if (typeof window.fixedOwnerOf === 'function') {
            try { return window.fixedOwnerOf(entry) || ''; } catch (e) { /* ignore */ }
        }
        const known = function (id) {
            return !!id && members().some(function (m) { return m.id === id; });
        };
        if (known(entry.memberId)) return entry.memberId;
        if (known(entry.chargeTo)) return entry.chargeTo;
        return entry.memberId || '';
    }

    function fixedEntriesOf(memberId) {
        return fixedEntries().filter(function (f) { return fixedOwnerOf(f) === memberId; });
    }

    function fixedEntryById(id) {
        return fixedEntries().filter(function (f) { return f.id === id; })[0] || null;
    }

    function renderFixedScreen() {
        const d = data(); if (!d) return;
        const box = $('fixed-list');
        if (!box) return;

        const list = fixedEntries();
        const summary = fixedSummary();
        const totalEl = $('foot-total-fixed-all');
        if (totalEl) totalEl.textContent = bn(Number(summary.total || 0).toFixed(1));
        const countEl = $('fixed-count');
        if (countEl) countEl.textContent = bn(list.length) + 'টি এন্ট্রি';

        if (!list.length) {
            box.innerHTML = emptyState('🏷️', 'কোনো ফিক্সড খরচ নেই।',
                '“Add Fixed Cost” চেপে প্রথম খরচ যোগ করুন — যেমন বাসা ভাড়া বা কলা।');
            return;
        }

        box.innerHTML = list.map(function (f) {
            const amount = Number(f.amount) || 0;
            const owner = fixedOwnerOf(f);
            const payer = owner ? memberName(owner) : '—';
            const legacyNote = f.legacy ? ' · পুরনো রেকর্ড' : '';
            return '<div class="row">' +
                '<div class="row__body">' +
                    '<div class="row__title">' + esc(f.desc || 'ফিক্সড খরচ') + '</div>' +
                    '<div class="row__sub">' + esc(f.displayDate || bnDate(f.date)) + ' · ' + esc(payer) + esc(legacyNote) + '</div>' +
                '</div>' +
                '<div class="row__right"><span class="row__amount row__amount--fixed">৳' + bn(amount) + '</span></div>' +
                '<div class="row__actions">' +
                    '<button type="button" class="rowbtn" data-act="fixed-actions" data-id="' + esc(f.id) +
                    '" aria-label="আরও অপশন">' + dotsIcon() + '</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    /* ===================================================== REPORT RENDER ==== */

    /* ===================================================== REPORT RENDER ==== */
    function memberCardHtml(memberId, opts) {
        const m = members().filter(function (x) { return x.id === memberId; })[0];
        if (!m) return '';
        const s = memberStats(memberId);
        const badge = s.balance >= 0
            ? '<span class="badge badge--ok">পাবে ' + money(Math.abs(s.balance)) + '</span>'
            : '<span class="badge badge--out">দেবে ' + money(Math.abs(s.balance)) + '</span>';

        return '<div class="membercard" data-act="member-detail" data-mid="' + esc(memberId) + '">' +
            '<div class="membercard__top">' +
                '<span class="avatar">' + esc(String(m.name || '?').trim().charAt(0)) + '</span>' +
                '<span class="membercard__name">' + esc(m.name) + '</span>' +
                badge +
                ((opts && opts.actions)
                    ? '<button type="button" class="rowbtn" data-act="member-actions" data-mid="' + esc(memberId) +
                      '" aria-label="আরও অপশন">' + dotsIcon() + '</button>'
                    : '') +
            '</div>' +
            '<div class="membercard__stats">' +
                '<div class="membercard__stat"><span>Meals</span><span>' + bn(s.meals) + '</span></div>' +
                '<div class="membercard__stat"><span>Expense</span><span>' + money(s.expense) + '</span></div>' +
                '<div class="membercard__stat"><span>Balance</span><span>' + signedMoney(s.balance) + '</span></div>' +
            '</div>' +
        '</div>';
    }

    function renderReportScreen() {
        const d = data(); if (!d) return;
        const memberBox = $('report-member-list');
        const monthBox = $('report-month-list');
        if (!memberBox || !monthBox) return;

        const list = members();
        if (!list.length) {
            memberBox.innerHTML = emptyState('📊', 'হিসাব দেখাতে সদস্য দরকার।', 'আগে সদস্য যোগ করুন।');
        } else {
            memberBox.innerHTML = list.map(function (m) {
                const s = memberStats(m.id);
                return '<div class="membercard" data-act="member-detail" data-mid="' + esc(m.id) + '">' +
                    '<div class="membercard__top">' +
                        '<span class="avatar">' + esc(String(m.name || '?').trim().charAt(0)) + '</span>' +
                        '<span class="membercard__name">' + esc(m.name) + '</span>' +
                        (s.balance >= 0
                            ? '<span class="badge badge--ok">পাবে ' + money(Math.abs(s.balance)) + '</span>'
                            : '<span class="badge badge--out">দেবে ' + money(Math.abs(s.balance)) + '</span>') +
                    '</div>' +
                    '<div class="membercard__stats">' +
                        '<div class="membercard__stat"><span>মিল</span><span>' + bn(s.meals) + '</span></div>' +
                        '<div class="membercard__stat"><span>মোট খরচ</span><span>' + money(s.expense) + '</span></div>' +
                        '<div class="membercard__stat"><span>মোট জমা</span><span>' + money(s.spent) + '</span></div>' +
                    '</div>' +
                    '<div class="btn-row">' +
                        '<button type="button" class="btn btn--soft-border btn--sm" data-act="share-member" data-mid="' +
                        esc(m.id) + '">' + waIcon() + ' শেয়ার</button>' +
                        '<button type="button" class="btn btn--soft-border btn--sm" data-act="member-actions" data-mid="' +
                        esc(m.id) + '">' + dotsIcon() + ' আরও</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        /* ফাইনাল সেটেলমেন্ট — মিল + বাজার + ফিক্সড খরচ মিলিয়ে কে পাবে, কে দেবে */
        const settleBox = $('report-settlement-list');
        if (settleBox) {
            if (!list.length) {
                settleBox.innerHTML = emptyState('⚖️', 'সেটেলমেন্টের জন্য সদস্য দরকার।', 'আগে সদস্য যোগ করুন।');
            } else {
                let receivable = 0;
                let payable = 0;
                const rows = list.map(function (m) {
                    const s = memberStats(m.id);
                    if (s.balance >= 0) receivable += s.balance;
                    else payable += Math.abs(s.balance);
                    return '<div class="row">' +
                        '<span class="avatar">' + esc(String(m.name || '?').trim().charAt(0)) + '</span>' +
                        '<div class="row__body">' +
                            '<div class="row__title">' + esc(m.name) + '</div>' +
                            '<div class="row__sub">মোট খরচ ' + money(s.expense) + ' · জমা ' + money(s.spent) + '</div>' +
                        '</div>' +
                        '<div class="row__right">' +
                            (s.balance >= 0
                                ? '<span class="badge badge--ok">পাবে ' + money(s.balance) + '</span>'
                                : '<span class="badge badge--out">দেবে ' + money(Math.abs(s.balance)) + '</span>') +
                        '</div>' +
                    '</div>';
                }).join('');
                settleBox.innerHTML = rows +
                    '<div class="row">' +
                        '<div class="row__body">' +
                            '<div class="row__title">সর্বমোট</div>' +
                            '<div class="row__sub">যারা পাবে ' + money(receivable) + ' · যারা দেবে ' + money(payable) + '</div>' +
                        '</div>' +
                    '</div>';
            }
        }

        const group = {};
        (d.bazarLog || []).forEach(function (b) {
            const k = monthKey(b.date);
            if (!group[k]) group[k] = { bazar: 0, meals: 0, fixed: 0 };
            group[k].bazar += Number(b.amount) || 0;
        });
        (d.mealsLog || []).forEach(function (l) {
            const k = monthKey(l.date);
            if (!group[k]) group[k] = { bazar: 0, meals: 0, fixed: 0 };
            group[k].meals += Number(l.count) || 0;
        });
        /* মাসিক মোটে ফিক্সড খরচও যোগ হয় (তারিখ অনুযায়ী) */
        (fixedSummary().entries || []).forEach(function (f) {
            const k = monthKey(f.date);
            if (!k) return;
            if (!group[k]) group[k] = { bazar: 0, meals: 0, fixed: 0 };
            group[k].fixed += Number(f.amount) || 0;
        });

        const keys = Object.keys(group).sort(function (a, b) { return b.localeCompare(a); });
        if (!keys.length) {
            monthBox.innerHTML = emptyState('🗓️', 'আগের মাসের কোনো তথ্য নেই।', 'ডেটা যোগ হলে এখানে মাসভিত্তিক হিসাব দেখা যাবে।');
        } else {
            const currentKey = todayISO().slice(0, 7);
            monthBox.innerHTML = keys.map(function (k) {
                const g = group[k];
                const rate = g.meals > 0 ? g.bazar / g.meals : 0;
                return '<button type="button" class="row row--tap" data-act="month-open" data-month="' + esc(k) + '">' +
                    '<div class="row__body">' +
                        '<div class="row__title">' + esc(monthLabel(k)) +
                            (k === currentKey ? ' <span class="badge badge--ok">চলতি</span>' : '') + '</div>' +
                        '<div class="row__sub">বাজার ' + money(g.bazar) + ' · ফিক্সড ' + money(g.fixed) +
                            ' · মোট খরচ ' + money(g.bazar + g.fixed) +
                            ' · মিল ' + bn(Number.isInteger(g.meals) ? g.meals : g.meals.toFixed(1)) + '</div>' +
                    '</div>' +
                    '<div class="row__right">' +
                        '<span class="row__amount row__amount--muted">৳' + bn(rate.toFixed(2)) + '</span>' +
                        '<div class="row__sub">মিল রেট</div>' +
                    '</div>' +
                    '<span class="menu__chev">' + chevronRight() + '</span>' +
                '</button>';
            }).join('');
        }
    }

    /* ===================================================== MONTH RENDER ===== */
    /* বিগত মাসের হিসাব — Report স্ক্রিনের মাসের তালিকা থেকে ট্যাপ করে খোলা হয়।
       সব সংখ্যা index.html-এর computeMonthSummary() থেকেই আসে (একই সূত্র)। */
    let monthViewKey = '';

    function monthSummaryFor(key) {
        if (typeof window.computeMonthSummary === 'function') {
            try { return window.computeMonthSummary(key); } catch (e) { /* ignore */ }
        }
        return { monthKey: key, rows: [], totalMeals: 0, totalBazar: 0, rate: 0, totalFixed: 0, totalFixedPaid: 0, totalExpense: 0 };
    }

    function monthLabelOf(key) {
        if (typeof window.formatBanglaMonthKey === 'function') return window.formatBanglaMonthKey(key);
        return monthLabel(key);
    }

    /* যে মাসগুলো দেখা যাবে — ডেটা আছে এমন মাস + ধরে রাখা পুরো সময় (চলতি মাস + বিগত ৩ মাস),
       নতুন থেকে পুরনো ক্রমে। ফলে ডেটা না থাকলেও পুরনো মাসে যাওয়া যায়। */
    function availableMonthKeys() {
        const d = data();
        const keys = {};
        if (d) {
            (d.mealsLog || []).forEach(function (l) { const k = monthKey(l.date); if (k) keys[k] = 1; });
            (d.bazarLog || []).forEach(function (b) { const k = monthKey(b.date); if (k) keys[k] = 1; });
            (fixedSummary().entries || []).forEach(function (f) { const k = monthKey(f.date); if (k) keys[k] = 1; });
        }
        if (typeof window.retainedMonthKeys === 'function') {
            window.retainedMonthKeys().forEach(function (k) { keys[k] = 1; });
        }
        keys[todayISO().slice(0, 7)] = 1;
        return Object.keys(keys).sort(function (a, b) { return b.localeCompare(a); });
    }

    function openMonth(key) {
        monthViewKey = key || todayISO().slice(0, 7);
        go('month');
    }

    function monthRowsHtml(rows) {
        return rows.map(function (r) {
            const badge = r.balance >= 0
                ? '<span class="badge badge--ok">পাবে ' + money(r.balance) + '</span>'
                : '<span class="badge badge--out">দেবে ' + money(Math.abs(r.balance)) + '</span>';
            return '<div class="row">' +
                '<span class="avatar">' + esc(String(r.name || '?').trim().charAt(0)) + '</span>' +
                '<div class="row__body">' +
                    '<div class="row__title">' + esc(r.name) + '</div>' +
                    '<div class="row__sub">মিল ' + bn(Number.isInteger(r.meals) ? r.meals : r.meals.toFixed(1)) +
                        ' · খরচ ' + money(r.expense) + ' · জমা ' + money(r.deposit) + '</div>' +
                '</div>' +
                '<div class="row__right">' + badge + '</div>' +
            '</div>';
        }).join('');
    }

    function renderMonthScreen() {
        const d = data(); if (!d) return;
        const listBox = $('month-member-list');
        if (!listBox) return;

        const keys = availableMonthKeys();
        if (!monthViewKey || keys.indexOf(monthViewKey) === -1) {
            monthViewKey = keys.length ? keys[0] : todayISO().slice(0, 7);
        }

        const idx = keys.indexOf(monthViewKey);
        const s = monthSummaryFor(monthViewKey);
        const isCurrent = monthViewKey === todayISO().slice(0, 7);

        $('month-nav-label').textContent = monthLabelOf(monthViewKey) + (isCurrent ? ' (চলতি)' : '');
        const sub = $('month-nav-sub');
        if (sub) {
            sub.textContent = keys.length > 1
                ? 'বিগত মাসের হিসাব · ' + bn(idx + 1) + '/' + bn(keys.length)
                : 'বিগত মাসের হিসাব';
        }
        const prev = $('month-prev'), next = $('month-next');
        if (prev) prev.disabled = (idx <= 0);
        if (next) next.disabled = (idx < 0 || idx >= keys.length - 1);
        const navMeta = $('appbar-sub');
        if (navMeta && currentScreen() === 'month') navMeta.textContent = monthLabelOf(monthViewKey) + ' · মাসের হিসাব';

        $('month-total-bazar').textContent = bn(s.totalBazar.toFixed(1));
        $('month-total-fixed').textContent = bn(s.totalFixed.toFixed(1));
        $('month-total-expense').textContent = bn(s.totalExpense.toFixed(1));
        $('month-total-meals').textContent = bn(Number.isInteger(s.totalMeals) ? s.totalMeals : s.totalMeals.toFixed(1));
        $('month-meal-rate').textContent = bn(s.rate.toFixed(2));
        const countEl = $('month-count');
        if (countEl) countEl.textContent = bn(s.rows.length) + ' জন সদস্য';

        if (!members().length) {
            listBox.innerHTML = emptyState('🗓️', 'হিসাব দেখাতে সদস্য দরকার।', 'আগে সদস্য যোগ করুন।');
        } else if (!s.rows.some(function (r) { return r.meals || r.bazarSpent || r.fixedShare || r.fixedPaid; })) {
            listBox.innerHTML = emptyState('🗓️', 'এই মাসের কোনো এন্ট্রি নেই।', 'অন্য মাস দেখতে উপরের ◀ ▶ বাটন ব্যবহার করুন।');
        } else {
            listBox.innerHTML = monthRowsHtml(s.rows);
        }

        const body = $('month-table-body');
        if (body) {
            body.innerHTML = s.rows.map(function (r) {
                const balanceText = r.balance >= 0
                    ? '<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-sm font-bold">পাবে: ৳' + bn(r.balance.toFixed(1)) + '</span>'
                    : '<span class="bg-rose-100 text-rose-800 px-2 py-1 rounded-sm font-bold">দেবে: ৳' + bn(Math.abs(r.balance).toFixed(1)) + '</span>';
                return '<tr class="border-b hover:bg-gray-50">' +
                    '<td class="p-2 border font-semibold">' + esc(r.name) + '</td>' +
                    '<td class="p-2 border text-center">' + bn(r.meals) + '</td>' +
                    '<td class="p-2 border text-gray-700">৳' + bn(r.mealCost.toFixed(1)) + '</td>' +
                    '<td class="p-2 border text-gray-600">৳' + bn(r.fixedShare.toFixed(1)) + '</td>' +
                    '<td class="p-2 border font-bold text-blue-700">৳' + bn(r.expense.toFixed(1)) + '</td>' +
                    '<td class="p-2 border text-emerald-600 font-semibold">৳' + bn(r.bazarSpent) + '</td>' +
                    '<td class="p-2 border text-indigo-600 font-semibold">৳' + bn(r.fixedPaid) + '</td>' +
                    '<td class="p-2 border">' + balanceText + '</td>' +
                '</tr>';
            }).join('');
        }

        const mealCostSum = s.rows.reduce(function (sum, r) { return sum + r.mealCost; }, 0);
        $('month-foot-meals').textContent = bn(Number.isInteger(s.totalMeals) ? s.totalMeals : s.totalMeals.toFixed(1));
        $('month-foot-meal-cost').textContent = '৳' + bn(mealCostSum.toFixed(1));
        $('month-foot-fixed').textContent = '৳' + bn(s.totalFixed.toFixed(1));
        $('month-foot-total-cost').textContent = '৳' + bn(s.totalExpense.toFixed(1));
        $('month-foot-bazar').textContent = '৳' + bn(s.totalBazar.toFixed(1));
        $('month-foot-fixed-paid').textContent = '৳' + bn(s.totalFixedPaid.toFixed(1));
    }

    function stepMonth(delta) {
        const keys = availableMonthKeys();
        const idx = keys.indexOf(monthViewKey);
        const nextIdx = idx + delta;
        if (nextIdx < 0 || nextIdx >= keys.length) return;
        monthViewKey = keys[nextIdx];
        renderMonthScreen();
        window.scrollTo(0, 0);
    }

    /* ডেটা ধরে রাখার নিয়ম — More স্ক্রিনের তথ্য কার্ডে দেখানো হয় */
    function renderRetentionInfo() {
        const el = $('retention-text');
        if (!el) return;
        const months = (typeof window.RETENTION_PREVIOUS_MONTHS === 'number') ? window.RETENTION_PREVIOUS_MONTHS : 3;
        const keys = (typeof window.retainedMonthKeys === 'function') ? window.retainedMonthKeys() : [];
        const labels = keys.map(monthLabelOf).join(', ');
        let text = 'চলতি মাস + বিগত ' + bn(months) + ' মাসের হিসাব রাখা হয়' +
            (labels ? ' (' + labels + ')' : '') +
            '। এর চেয়ে পুরনো মিল, বাজার ও ফিক্সড খরচ খাতা খোলার সময়ই স্থায়ীভাবে মুছে যায় — এই ডিভাইস ও Firebase দুই জায়গা থেকেই।';
        const last = (typeof window.lastPurgeInfo === 'function') ? window.lastPurgeInfo() : null;
        if (last && last.total) {
            text += ' সর্বশেষ পরিষ্কারে ' + bn(last.total) + 'টি পুরনো এন্ট্রি মুছে গেছে।';
        }
        el.textContent = text;
    }

    /* ==================================================== MEMBERS RENDER ==== */
    function renderMembersScreen() {
        const d = data(); if (!d) return;
        const box = $('members-list-container');
        const countEl = $('members-count');
        if (countEl) countEl.textContent = bn(members().length) + ' জন';
        if (!box) return;

        if (!members().length) {
            box.innerHTML = emptyState('👥', 'এখনো কোনো সদস্য নেই।', '“Add Member” চেপে মেসের সদস্য যোগ করুন।');
            return;
        }
        box.innerHTML = members().map(function (m) { return memberCardHtml(m.id, { actions: true }); }).join('');
    }

    function renderMemberDetail(memberId) {
        const head = $('member-detail-head');
        const body = $('member-detail-body');
        if (!head || !body) return;

        const m = members().filter(function (x) { return x.id === memberId; })[0];
        if (!m) {
            head.innerHTML = '';
            body.innerHTML = emptyState('👤', 'সদস্য পাওয়া যায়নি।', 'তালিকা থেকে আবার চেষ্টা করুন।');
            return;
        }

        const d = data();
        const s = memberStats(memberId);
        const myMeals = (d.mealsLog || []).filter(function (l) { return l.memberId === memberId; });
        const latest = myMeals.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); })[0];

        head.innerHTML =
            '<div class="memberhead__name">' + esc(m.name) + '</div>' +
            '<div class="memberhead__meta">' + bn(s.meals) + ' মিল · ' + bnDate(todayISO()) + ' পর্যন্ত</div>' +
            '<div class="memberhead__balance ' + (s.balance >= 0 ? 'is-in' : 'is-out') + '">' +
                '<span>' + (s.balance >= 0 ? 'পাবে' : 'দেবে') + '</span>' +
                '<span>' + money(Math.abs(s.balance)) + '</span>' +
            '</div>';

        function cell(label, value) {
            return '<div class="detailgrid__cell"><div class="detailgrid__label">' + esc(label) + '</div>' +
                '<div class="detailgrid__value">' + value + '</div></div>';
        }

        const recent = sortedBazarDesc().filter(function (b) { return b.memberId === memberId; }).slice(0, 5)
            .map(function (b) {
                return '<div class="row">' +
                    '<div class="row__body">' +
                        '<div class="row__title">' + esc(b.desc || 'সাধারণ বাজার') + '</div>' +
                        '<div class="row__sub">' + esc(b.displayDate || bnDate(b.date)) + '</div>' +
                    '</div>' +
                    '<div class="row__right"><span class="row__amount">৳' + bn(Number(b.amount) || 0) + '</span></div>' +
                '</div>';
            }).join('');

        const recentFixed = fixedEntriesOf(memberId).slice(0, 5)
            .map(function (f) {
                return '<div class="row">' +
                    '<div class="row__body">' +
                        '<div class="row__title">' + esc(f.desc || 'ফিক্সড খরচ') + '</div>' +
                        '<div class="row__sub">' + esc(f.displayDate || bnDate(f.date)) + '</div>' +
                    '</div>' +
                    '<div class="row__right"><span class="row__amount row__amount--fixed">৳' + bn(Number(f.amount) || 0) + '</span></div>' +
                '</div>';
            }).join('');

        body.innerHTML =
            '<div class="sec">' +
                '<div class="sec__head"><h2 class="sec__title">খরচের হিসাব</h2></div>' +
                '<div class="detailgrid">' +
                    cell('মিল', bn(s.meals) + ' টি') +
                    cell('মিলের খরচ', money(s.meals * totals().rate)) +
                    cell('ফিক্সড খরচের ভাগ', money(s.share)) +
                    cell('মোট খরচ', money(s.expense)) +
                    cell('বাজার জমা', money(s.bazarSpent)) +
                    cell('ফিক্সড খরচ জমা', money(s.fixedPaid)) +
                '</div>' +
            '</div>' +
            '<div class="sec">' +
                '<button type="button" class="btn btn--add btn--meal btn--flush" data-act="edit-meal-for" ' +
                    'data-mid="' + esc(memberId) + '" data-date="' + esc(latest ? latest.date : todayISO()) + '">' +
                    '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5.5v13"/><path d="M5.5 12h13"/></svg>' +
                    (latest ? ' সাম্প্রতিক মিল এডিট করুন' : ' এই সদস্যের মিল যোগ করুন') +
                '</button>' +
                '<button type="button" class="btn btn--wa btn--flush" data-act="share-member" data-mid="' + esc(memberId) + '">' +
                    waIcon() + ' হিসাব শেয়ার করুন</button>' +
            '</div>' +
            '<div class="sec">' +
                '<div class="sec__head"><h2 class="sec__title">সাম্প্রতিক বাজার</h2></div>' +
                '<div class="card">' + (recent || emptyState('🛒', 'এই সদস্যের কোনো বাজার নেই।', '')) + '</div>' +
            '</div>' +
            '<div class="sec">' +
                '<div class="sec__head"><h2 class="sec__title">সাম্প্রতিক ফিক্সড খরচ</h2></div>' +
                '<div class="card">' + (recentFixed || emptyState('🏷️', 'এই সদস্যের কোনো ফিক্সড খরচ নেই।', '')) + '</div>' +
            '</div>' +
            '<div class="sec">' +
                '<button type="button" class="btn btn--danger" data-act="member-delete" data-mid="' + esc(memberId) + '">' +
                    'সদস্য মুছে ফেলুন</button>' +
            '</div>';
    }

    /* legacy হিসাব একই থাকে — শুধু "২৭১১৫.০" ধরণের পূর্ণ সংখ্যায় অপ্রয়োজনীয়
       ".০" সরিয়ে দেওয়া হয় (presentation only, কোনো মান বদলায় না)। */
    function trimZeroDecimals(id) {
        const el = $(id);
        if (!el) return;
        const m = String(el.textContent).match(/^(.*?)([০-৯]+)\.০$/);
        if (m) el.textContent = m[1] + m[2];
    }

    function polishLegacyNumbers() {
        ['total-bazar', 'total-fixed', 'total-expense', 'table-total-bazar',
         'foot-total-fixed-all'].forEach(trimZeroDecimals);
    }

    /* ==================================================== MASTER RENDER ==== */
    /* সদস্যের তালিকা বদলালে (যোগ/মুছে ফেলা/সিঙ্ক) যেসব ভিউ পুরোপুরি
       সদস্য-নির্ভর, সেগুলোও নতুন করে সাজানো হয় — পিকার, ছক ও তালিকা।
       সদস্য-লিস্ট না বদলালে এই কাজটি হয় না, তাই প্রতিবার খরচ বাড়ে না। */
    let memberSignature = null;

    function membersSignature() {
        return members().map(function (m) { return m.id + '\u0001' + m.name; }).join('\u0002');
    }

    function refreshMemberViewsIfChanged() {
        const sig = membersSignature();
        if (sig === memberSignature) return false;
        memberSignature = sig;
        ['renderMealsGrid', 'renderBazarGrid', 'renderFixedGrid'].forEach(function (fn) {
            if (typeof window[fn] === 'function') {
                try { window[fn](); } catch (e) { /* ignore */ }
            }
        });
        return true;
    }

    function renderAll() {
        /* সদস্যের তালিকা (মিল / বাজার / ফিক্সড পিকার) সবসময় প্রথমেই সাজানো হয় —
           তাই সদস্য যোগ/মুছে দেওয়া, রিসেট বা ক্লাউড সিঙ্ক — যে পথেই হোক না কেন,
           Fixed Cost-এর সদস্য লিস্ট সাথে সাথেই আপডেট থাকে */
        renderPickers();
        refreshMemberViewsIfChanged();
        renderHomeSummary();
        renderMenuMeta();
        renderMealScreen();
        renderBazarScreen();
        renderFixedScreen();
        renderReportScreen();
        renderRetentionInfo();
        renderMonthScreen();
        renderMembersScreen();
        if (currentScreen() === 'member' && currentMemberId) renderMemberDetail(currentMemberId);
        polishLegacyNumbers();
    }

    const legacyCalculateMess = window.calculateMess;
    window.calculateMess = function () {
        if (typeof legacyCalculateMess === 'function') legacyCalculateMess.apply(this, arguments);
        renderAll();
    };

    const legacyRenderMealsGrid = window.renderMealsGrid;
    window.renderMealsGrid = function () {
        if (typeof legacyRenderMealsGrid === 'function') legacyRenderMealsGrid.apply(this, arguments);
        renderMealScreen();
    };

    const legacyRenderBazarGrid = window.renderBazarGrid;
    window.renderBazarGrid = function () {
        if (typeof legacyRenderBazarGrid === 'function') legacyRenderBazarGrid.apply(this, arguments);
        renderBazarScreen();
    };

    /* পুরনো ফিক্সড কস্ট ইনপুট ফর্ম আর নেই — legacy নামটি শুধু নিরাপদে এগিয়ে দিই */
    const legacyRenderFixedCostInputs = window.renderFixedCostInputs;
    window.renderFixedCostInputs = function () {
        if (typeof legacyRenderFixedCostInputs === 'function') legacyRenderFixedCostInputs.apply(this, arguments);
        renderFixedScreen();
    };

    /* ======================================================= ACTIONS UI ===== */
    function openActions(title, items) {
        $('sheet-actions-title').textContent = title;
        $('sheet-actions-list').innerHTML = items.map(function (item, index) {
            return '<button type="button" class="actionrow' + (item.tone ? ' actionrow--' + item.tone : '') +
                '" data-action-index="' + index + '">' +
                '<span class="actionrow__ico">' + item.icon + '</span>' +
                '<span class="actionrow__body">' + esc(item.label) +
                    (item.sub ? '<span class="actionrow__sub">' + esc(item.sub) + '</span>' : '') +
                '</span>' +
            '</button>';
        }).join('');

        const list = $('sheet-actions-list');
        const handler = function (event) {
            const btn = event.target.closest('[data-action-index]');
            if (!btn) return;
            const item = items[Number(btn.getAttribute('data-action-index'))];
            list.removeEventListener('click', handler);
            closeSheet('sheet-actions');
            setTimeout(function () { item.run(); }, 140);
        };
        list.addEventListener('click', handler);

        openSheet('sheet-actions');
    }

    /* ========================================================== MEAL ======= */
    /* একদিনের জন্য সব সদস্যের মিল একসাথে — প্রতিটি সদস্যের ঘর থেকে কত মিল,
       তা চিপে চাপ দিয়ে বেছে নেওয়া হয়। ড্রাফট এখানে রাখা হয়:
       mealDraft = { date: 'YYYY-MM-DD', counts: { memberId: number } }        */
    const MEAL_CHOICES = [0, 0.5, 1, 1.5, 2, 2.5, 3];
    let mealDraft = { date: '', counts: {} };
    let mealFocusMemberId = '';

    function findMeal(date, memberId) {
        const d = data(); if (!d) return null;
        return (d.mealsLog || []).filter(function (l) {
            return l.date === date && l.memberId === memberId;
        })[0] || null;
    }

    /* সংখ্যা → বাংলা লেবেল: 1 → ১, 1.5 → ১.৫ */
    function countLabel(value) {
        const n = Number(value) || 0;
        return bn(Number.isInteger(n) ? n : n.toFixed(1));
    }

    /* কোনো তারিখের বর্তমান মিল — { memberId: count } আকারে */
    function countsForDate(date) {
        const d = data();
        const counts = {};
        members().forEach(function (m) { counts[m.id] = 0; });
        if (d) {
            (d.mealsLog || []).forEach(function (l) {
                if (l.date === date && Object.prototype.hasOwnProperty.call(counts, l.memberId)) {
                    counts[l.memberId] = Number(l.count) || 0;
                }
            });
        }
        return counts;
    }

    function loadMealDraft(date, memberId) {
        mealDraft = { date: date, counts: countsForDate(date) };
        mealFocusMemberId = memberId || '';
    }

    function mealDraftTotal() {
        return Object.keys(mealDraft.counts).reduce(function (sum, id) {
            return sum + (Number(mealDraft.counts[id]) || 0);
        }, 0);
    }

    function updateMealTotal() {
        const total = countLabel(mealDraftTotal());
        const note = $('meal-day-total');
        if (note) note.textContent = 'মোট ' + total + ' মিল';
        const btn = $('meal-save-btn');
        if (btn) btn.textContent = 'মিল সংরক্ষণ · ' + total + ' মিল';
    }

    function renderMealRows() {
        const box = $('meal-member-rows');
        if (!box) return;

        box.innerHTML = members().map(function (m) {
            const value = Number(mealDraft.counts[m.id]) || 0;
            const chips = MEAL_CHOICES.map(function (c) {
                const on = value === c;
                return '<button type="button" class="chip chip--mini' + (on ? ' is-on' : '') + '"' +
                    ' data-mid="' + esc(m.id) + '" data-count="' + c + '"' +
                    ' aria-pressed="' + (on ? 'true' : 'false') + '">' + countLabel(c) + '</button>';
            }).join('');

            return '<div class="mealrow' + (m.id === mealFocusMemberId ? ' mealrow--focus' : '') + '"' +
                    ' data-mid="' + esc(m.id) + '">' +
                    '<div class="mealrow__head">' +
                        '<span class="avatar">' + esc(String(m.name || '?').trim().charAt(0) || '?') + '</span>' +
                        '<span class="mealrow__name">' + esc(m.name) + '</span>' +
                        '<span class="mealrow__val' + (value > 0 ? ' is-on' : '') + '">' +
                            (value > 0 ? countLabel(value) + ' মিল' : 'মিল নেই') + '</span>' +
                    '</div>' +
                    '<div class="chips chips--mini" role="group" aria-label="' + esc(m.name) + ' এর মিল">' +
                        chips +
                    '</div>' +
                '</div>';
        }).join('');

        updateMealTotal();
    }

    function openMealSheet(opts) {
        opts = opts || {};
        const date = opts.date || $('meal-date').value || todayISO();
        const memberId = opts.memberId || '';

        $('sheet-meal-title').textContent = 'দিনের মিল এন্ট্রি';
        $('meal-date').value = date;
        loadMealDraft(date, memberId);

        $('meal-sheet-hint').textContent = members().length
            ? 'প্রতিটি সদস্যের ঘর থেকে মিলের সংখ্যা বেছে নিন — ০ মানে ওই দিন মিল নেই। ' +
              'একবার সেভেই পুরো দিনের হিসাব সংরক্ষণ হবে।'
            : 'আগে সদস্য যোগ করুন — নিচের বাটনে চাপুন, তারপর মিল লিখতে পারবেন।';

        /* সদস্য না থাকলে সেভ করার কিছু নেই — আগে সদস্য যোগ করতে হবে */
        $('meal-save-btn').classList.toggle('hidden', !members().length);
        $('meal-add-member-btn').classList.toggle('hidden', members().length > 0);

        renderMealRows();
        openSheet('sheet-meal');

        /* কোনো নির্দিষ্ট সদস্য থেকে খোলা হলে সেই সারিটি চোখে পড়ার মতো রাখি */
        if (memberId) {
            const row = $$('#meal-member-rows .mealrow').filter(function (r) {
                return r.getAttribute('data-mid') === memberId;
            })[0];
            if (row && typeof row.scrollIntoView === 'function') {
                setTimeout(function () { row.scrollIntoView({ block: 'nearest' }); }, 240);
            }
        }
    }

    function saveMeal() {
        const date = $('meal-date').value;

        if (!members().length) {
            hideKeyboard();
            window.alert('আগে সদস্য যোগ করুন, তারপর মিল লিখুন।');
            return;
        }
        if (!date) {
            hideKeyboard();
            window.alert('দয়া করে তারিখ ঠিকভাবে দিন।');
            return;
        }

        const result = (typeof window.saveMealsForDate === 'function')
            ? window.saveMealsForDate(date, mealDraft.counts)
            : null;

        hideKeyboard();
        closeSheet('sheet-meal');
        renderAll();

        if (!result) {
            window.showToast('মিল সংরক্ষণ করা যায়নি।');
            return;
        }
        const changed = result.added + result.updated + result.removed;
        window.showToast(changed
            ? bnDate(date) + ' · মোট ' + countLabel(result.total) + ' মিল সংরক্ষণ হয়েছে।'
            : bnDate(date) + ' · কোনো পরিবর্তন হয়নি।');
    }

    function deleteMeal(date, memberId) {
        askConfirm('এই মিল এন্ট্রিটি মুছে ফেলতে চান?', 'মিল ডিলিট').then(function (ok) {
            if (!ok) return;
            const d = data(); if (!d) return;
            d.mealsLog = (d.mealsLog || []).filter(function (l) {
                return !(l.date === date && l.memberId === memberId);
            });
            if (typeof window.saveToLocalStorage === 'function') window.saveToLocalStorage();
            if (typeof window.calculateMess === 'function') window.calculateMess();
            window.showToast('মিল এন্ট্রি মুছে ফেলা হয়েছে।');
        });
    }

    function mealActions(date, memberId) {
        const entry = findMeal(date, memberId);

        openActions(memberName(memberId) + ' · ' + bnDate(date), [
            {
                label: entry ? 'Edit' : 'Add', sub: 'মিলের সংখ্যা ঠিক করুন', icon: editIcon(),
                run: function () { openMealSheet({ date: date, memberId: memberId }); }
            },
            {
                label: 'Delete', sub: 'এন্ট্রিটি মুছে ফেলুন', icon: trashIcon(), tone: 'danger',
                run: function () { deleteMeal(date, memberId); }
            }
        ]);
    }

    /* ========================================================= BAZAR ======= */
    let bazarEditing = null;

    function openBazarSheet(entry) {
        bazarEditing = entry ? entry.id : null;
        $('sheet-bazar-title').textContent = entry ? 'Edit Bazar' : 'Add Bazar';
        $('bazar-save-btn').textContent = entry ? 'আপডেট করুন' : 'খরচ যোগ করুন';

        $('bazar-date').value = entry ? entry.date : todayISO();
        $('bazar-desc').value = entry ? (entry.desc || '') : '';
        $('bazar-amount').value = entry ? entry.amount : '';

        /* শিট খোলার মুহূর্তেই সদস্যের তালিকা নতুন — পুরনো কোনো ক্যাশ করা লিস্ট দেখাবে না
           (দুই পিকারই একসাথে, যাতে বাজার ও ফিক্সডের তালিকা সবসময় হুবহু এক থাকে) */
        renderPickers();

        const select = $('bazar-member-select');
        if (select) {
            const wanted = (entry && entry.memberId) || select.value || firstMemberId();
            select.value = members().some(function (m) { return m.id === wanted; }) ? wanted : firstMemberId();
        }
        syncPickerSelection('bazar');

        const waBtn = $('wa-share-btn');
        if (waBtn) waBtn.classList.add('hidden');

        $('bazar-save-btn').classList.toggle('hidden', !members().length);
        $('bazar-add-member-btn').classList.toggle('hidden', members().length > 0);

        openSheet('sheet-bazar');
    }

    function saveBazar() {
        const date = $('bazar-date').value;
        const select = $('bazar-member-select');
        const memberId = select ? select.value : '';
        const desc = $('bazar-desc').value.trim();
        const amount = parseFloat($('bazar-amount').value);

        if (!members().length) {
            hideKeyboard();
            window.alert('আগে সদস্য যোগ করুন, তারপর বাজার খরচ যোগ করুন।');
            return;
        }
        if (!date || !memberId || isNaN(amount) || amount <= 0) {
            hideKeyboard();
            window.alert('দয়া করে তারিখ, সদস্য, বিবরণ ও টাকার পরিমাণ ঠিকভাবে দিন।');
            return;
        }

        /* edit মোডে আগের এন্ট্রিটি সরিয়ে বিদ্যমান addBazar() দিয়ে নতুন করে লেখা হয় */
        if (bazarEditing) {
            const d = data();
            if (d) {
                d.bazarLog = (d.bazarLog || []).filter(function (b) { return b.id !== bazarEditing; });
                if (typeof window.saveToLocalStorage === 'function') window.saveToLocalStorage();
            }
            bazarEditing = null;
        }

        if (typeof window.addBazar === 'function') window.addBazar();

        /* এইমাত্র যোগ হওয়া এন্ট্রিটি মনে রাখি — যাতে "শেষ এন্ট্রি শেয়ার" কাজ করে */
        const fresh = data();
        if (fresh) {
            const match = (fresh.bazarLog || []).filter(function (b) {
                return b.date === date && b.memberId === memberId &&
                    (Number(b.amount) || 0) === amount &&
                    (b.desc || '') === (desc || 'সাধারণ বাজার');
            }).pop();
            lastBazarEntryId = match ? match.id : null;
            const waBtn = $('wa-share-btn');
            if (waBtn) waBtn.classList.toggle('hidden', !lastBazarEntryId);
        }

        hideKeyboard();
        closeSheet('sheet-bazar');
        renderAll();
    }

    function deleteBazarEntry(id) {
        askConfirm('এই বাজার এন্ট্রিটি মুছে ফেলতে চান?', 'বাজার ডিলিট').then(function (ok) {
            if (!ok) return;
            runConfirmed(function () {
                if (typeof window.deleteBazar === 'function') window.deleteBazar(id);
            });
        });
    }

    function bazarActions(id) {
        const d = data();
        const entry = d ? (d.bazarLog || []).filter(function (b) { return b.id === id; })[0] : null;
        if (!entry) return;

        openActions(entry.desc || 'বাজার এন্ট্রি', [
            /* এন্ট্রির সারসংক্ষেপ শিরোনামে দেখানো হয়: বিবরণ · ৳পরিমাণ · তারিখ */
            {
                label: 'Edit', sub: 'বিবরণ বা টাকা পরিবর্তন করুন', icon: editIcon(),
                run: function () { openBazarSheet(entry); }
            },
            {
                label: 'Share', sub: 'হোয়াটসঅ্যাপে পাঠান', icon: waIcon(), tone: 'wa',
                run: function () { shareEntry(entry); }
            },
            {
                label: 'Delete', sub: 'এন্ট্রিটি মুছে ফেলুন', icon: trashIcon(), tone: 'danger',
                run: function () { deleteBazarEntry(id); }
            }
        ]);
    }

    /* ==================================================== FIXED COST ENTRY == */
    /* Bazar এন্ট্রির মতোই — একই ফিল্ড, একই সেভ/এডিট/ডিলিট/শেয়ার ওয়ার্কফ্লো */
    let fixedEditing = null;
    let lastFixedEntryId = null;

    function openFixedSheet(entry) {
        fixedEditing = entry ? entry.id : null;
        $('sheet-fixed-title').textContent = entry ? 'Edit Fixed Cost' : 'Add Fixed Cost';
        $('fixed-save-btn').textContent = entry ? 'আপডেট করুন' : 'খরচ যোগ করুন';

        $('fixed-date').value = entry ? entry.date : todayISO();
        $('fixed-desc').value = entry ? (entry.desc || '') : '';
        $('fixed-amount').value = entry ? entry.amount : '';

        /* বাজার শিটের হুবহু একই নিয়ম: খোলার মুহূর্তেই লাইভ সদস্য-তালিকা */
        renderPickers();

        const select = $('fixed-member-select');
        if (select) {
            /* বাজারের পিকারের হুবহু একই নিয়ম — এন্ট্রির নিজের সদস্য না থাকলে
               তালিকার প্রথম সদস্য বেছে নেওয়া হয় (তালিকা কখনো ফাঁকা রাখে না) */
            const wanted = (entry && entry.memberId) || select.value || firstMemberId();
            select.value = members().some(function (m) { return m.id === wanted; }) ? wanted : firstMemberId();
        }
        syncPickerSelection('fixed');

        const waBtn = $('fixed-wa-share-btn');
        if (waBtn) waBtn.classList.add('hidden');

        $('fixed-save-btn').classList.toggle('hidden', !members().length);
        $('fixed-add-member-btn').classList.toggle('hidden', members().length > 0);

        openSheet('sheet-fixed');
    }

    function saveFixed() {
        const date = $('fixed-date').value;
        const select = $('fixed-member-select');
        const memberId = select ? select.value : '';
        const desc = $('fixed-desc').value.trim();
        const amount = parseFloat($('fixed-amount').value);

        if (!members().length) {
            hideKeyboard();
            window.alert('আগে সদস্য যোগ করুন, তারপর ফিক্সড খরচ যোগ করুন।');
            return;
        }
        if (!date || !memberId || !desc || isNaN(amount) || amount <= 0) {
            hideKeyboard();
            window.alert('দয়া করে তারিখ, সদস্য, খরচের নাম ও টাকার পরিমাণ ঠিকভাবে দিন।');
            return;
        }

        /* edit মোডে আগের এন্ট্রিটি সরিয়ে বিদ্যমান addFixedCost() দিয়ে নতুন করে লেখা হয় —
           এতে পুরনো এন্ট্রির সংখ্যা একবারই গোনা হয় (ডাবল-কাউন্ট নেই) */
        if (fixedEditing) {
            const d = data();
            if (d) {
                d.fixedCostLog = (d.fixedCostLog || []).filter(function (f) { return f.id !== fixedEditing; });
                if (typeof window.saveToLocalStorage === 'function') window.saveToLocalStorage();
            }
            fixedEditing = null;
        }

        if (typeof window.addFixedCost === 'function') window.addFixedCost();

        const fresh = data();
        if (fresh) {
            const match = (fresh.fixedCostLog || []).filter(function (f) {
                return f.date === date && f.memberId === memberId &&
                    (Number(f.amount) || 0) === amount &&
                    (f.desc || '') === (desc || 'ফিক্সড খরচ');
            }).pop();
            lastFixedEntryId = match ? match.id : null;
            const waBtn = $('fixed-wa-share-btn');
            if (waBtn) waBtn.classList.toggle('hidden', !lastFixedEntryId);
        }

        hideKeyboard();
        closeSheet('sheet-fixed');
        renderAll();
    }

    function shareFixedEntry(entry) {
        const info = {
            payer: entry.memberId ? memberName(entry.memberId) : '—',
            date: entry.displayDate || bnDate(entry.date),
            desc: entry.desc || 'ফিক্সড খরচ',
            amount: entry.amount
        };
        if (typeof window.shareSpecificFixedOnWhatsApp === 'function') {
            runConfirmed(function () {
                window.shareSpecificFixedOnWhatsApp(info.payer, info.date, info.desc, info.amount);
            });
            return;
        }
        window.open(shareUrlFor('🏷️ *ফিক্সড খরচ আপডেট*\n\n👤 *টাকা দিয়েছেন:* ' + info.payer +
            '\n📅 *তারিখ:* ' + info.date + '\n📋 *খরচের নাম:*\n' + info.desc +
            '\n\n💵 *টাকার পরিমাণ:* ' + bn(info.amount) + ' টাকা'), '_blank');
    }

    function deleteFixedEntry(id) {
        askConfirm('এই ফিক্সড খরচ এন্ট্রিটি মুছে ফেলতে চান?', 'ফিক্সড খরচ ডিলিট').then(function (ok) {
            if (!ok) return;
            runConfirmed(function () {
                if (typeof window.deleteFixedCost === 'function') window.deleteFixedCost(id);
            });
        });
    }

    function fixedActions(id) {
        const entry = fixedEntryById(id);
        if (!entry) return;

        openActions(entry.desc || 'ফিক্সড খরচ এন্ট্রি', [
            {
                label: 'Edit', sub: 'নাম, তারিখ বা টাকা পরিবর্তন করুন', icon: editIcon(),
                run: function () { openFixedSheet(entry); }
            },
            {
                label: 'Share', sub: 'হোয়াটসঅ্যাপে পাঠান', icon: waIcon(), tone: 'wa',
                run: function () { shareFixedEntry(entry); }
            },
            {
                label: 'Delete', sub: 'এন্ট্রিটি মুছে ফেলুন', icon: trashIcon(), tone: 'danger',
                run: function () { deleteFixedEntry(id); }
            }
        ]);
    }

    /* ======================================================== MEMBER ======= */
    function memberActions(memberId) {
        const m = members().filter(function (x) { return x.id === memberId; })[0];
        if (!m) return;

        openActions(m.name, [
            {
                label: 'বিস্তারিত দেখুন', sub: 'মিল, খরচ ও ব্যালেন্স', icon: infoIcon(),
                run: function () { currentMemberId = memberId; go('member'); }
            },
            {
                label: 'WhatsApp-এ শেয়ার', sub: 'মাসিক হিসাব পাঠান', icon: waIcon(), tone: 'wa',
                run: function () { shareMember(memberId); }
            },
            {
                label: 'Delete', sub: 'সদস্য ও তার সব এন্ট্রি মুছে যাবে', icon: trashIcon(), tone: 'danger',
                run: function () { confirmDeleteMember(memberId); }
            }
        ]);
    }

    function confirmDeleteMember(memberId) {
        askConfirm('এই সদস্যকে মুছে ফেলতে চান? তার সব মিল ও বাজার এন্ট্রিও মুছে যাবে।', 'সদস্য ডিলিট')
            .then(function (ok) {
                if (!ok) return;
                runConfirmed(function () {
                    if (typeof window.deleteMember === 'function') window.deleteMember(memberId);
                });
                if (currentScreen() === 'member' && currentMemberId === memberId) go('members');
            });
    }

    function hideKeyboard() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    /* ==================================================== CLICK ROUTER ===== */
    document.addEventListener('click', function (event) {
        const gotoEl = event.target.closest('[data-goto]');
        if (gotoEl) {
            event.preventDefault();
            hideKeyboard();
            go(gotoEl.getAttribute('data-goto'));
            return;
        }

        const chip = event.target.closest('.chip[data-picker]');
        if (chip) {
            const kind = chip.getAttribute('data-picker');
            const p = pickerById(kind);
            if (p && $(p.select)) $(p.select).value = chip.getAttribute('data-mid') || '';
            syncPickerSelection(kind);
            return;
        }

        /* মিল শিট — “সবাই X”: এক চাপে সবার মিল একই সংখ্যায় */
        const applyChip = event.target.closest('.chip[data-apply]');
        if (applyChip) {
            const value = Number(applyChip.getAttribute('data-apply')) || 0;
            members().forEach(function (m) { mealDraft.counts[m.id] = value; });
            renderMealRows();
            return;
        }

        /* মিল শিট — একজন সদস্যের জন্য কত মিল */
        const countChip = event.target.closest('.chip[data-count][data-mid]');
        if (countChip) {
            const memberId = countChip.getAttribute('data-mid');
            mealDraft.counts[memberId] = Number(countChip.getAttribute('data-count')) || 0;
            renderMealRows();
            return;
        }

        const memberCard = event.target.closest('[data-act="member-detail"]');
        if (memberCard && !event.target.closest('[data-act="member-actions"], [data-act="share-member"]')) {
            currentMemberId = memberCard.getAttribute('data-mid');
            go('member');
            return;
        }

        const actEl = event.target.closest('[data-act]');
        if (!actEl) return;

        switch (actEl.getAttribute('data-act')) {
            case 'open-meal':   go('meal', function () { openMealSheet({}); }); break;
            case 'open-bazar':  go('bazar', function () { openBazarSheet(null); }); break;
            case 'open-fixed':  go('fixed', function () { openFixedSheet(null); }); break;
            case 'open-member': go('members', function () { openSheet('sheet-member', { silent: true }); }); break;
            case 'member-first-meal':
                pendingSheetAfterMember = function () { openMealSheet({}); };
                go('members', function () { openSheet('sheet-member', { silent: true }); });
                break;
            case 'member-first-bazar':
                pendingSheetAfterMember = function () { openBazarSheet(null); };
                go('members', function () { openSheet('sheet-member', { silent: true }); });
                break;
            case 'member-first-fixed':
                pendingSheetAfterMember = function () { openFixedSheet(null); };
                go('members', function () { openSheet('sheet-member', { silent: true }); });
                break;

            case 'meal-quick-open':
                openMealSheet({ date: actEl.getAttribute('data-date'), memberId: actEl.getAttribute('data-mid') });
                break;
            case 'edit-meal-for':
                openMealSheet({
                    date: actEl.getAttribute('data-date'),
                    memberId: actEl.getAttribute('data-mid')
                });
                break;
            case 'meal-actions':
                mealActions(actEl.getAttribute('data-date'), actEl.getAttribute('data-mid'));
                break;
            case 'bazar-actions':
                bazarActions(actEl.getAttribute('data-id'));
                break;
            case 'fixed-actions':
                fixedActions(actEl.getAttribute('data-id'));
                break;
            case 'month-open':
                openMonth(actEl.getAttribute('data-month'));
                break;
            case 'fixed-share':
                shareFixedEntry(fixedEntryById(actEl.getAttribute('data-id')) || {});
                break;
            case 'fixed-delete':
                deleteFixedEntry(actEl.getAttribute('data-id'));
                break;
            case 'member-actions':
            case 'member-delete':
                event.stopPropagation();
                memberActions(actEl.getAttribute('data-mid'));
                break;
            case 'share-member':
                event.stopPropagation();
                shareMember(actEl.getAttribute('data-mid'));
                break;
            case 'share-last-bazar': {
                const d = data();
                const entry = (d && lastBazarEntryId)
                    ? (d.bazarLog || []).filter(function (b) { return b.id === lastBazarEntryId; })[0]
                    : (d ? (d.bazarLog || []).slice(-1)[0] : null);
                if (!entry) { window.showToast('শেয়ার করার মতো বাজার এন্ট্রি নেই।'); break; }
                shareEntry(entry);
                break;
            }
            case 'share-last-fixed': {
                const entry = lastFixedEntryId
                    ? fixedEntryById(lastFixedEntryId)
                    : fixedEntries()[0];
                if (!entry) { window.showToast('শেয়ার করার মতো ফিক্সড খরচ এন্ট্রি নেই।'); break; }
                shareFixedEntry(entry);
                break;
            }

            case 'install':            if (window.promptInstallApp) window.promptInstallApp(); break;
            case 'install-help':       if (window.showInstallHelp) window.showInstallHelp(); break;
            case 'close-install-help': if (window.closeInstallHelp) window.closeInstallHelp(); break;
            case 'dismiss-banner':     if (window.dismissInstallBanner) window.dismissInstallBanner(); break;
            case 'reset':
                runConfirmed(function () {
                    if (typeof window.resetApp === 'function') window.resetApp();
                });
                break;
            default: break;
        }
    });

    /* overlay-এর বাইরে চাপ দিলে বন্ধ */
    document.addEventListener('click', function (event) {
        if (!event.target.closest('[data-close]')) return;
        if (event.target.closest('#alert-overlay')) { closeSheet('alert-overlay'); return; }
        if (event.target.closest('#confirm-overlay')) return; /* confirm নিজে হ্যান্ডেল করে */
        if (event.target.closest('#alert-ok-btn')) return;
        closeTopSheet();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            if (sheetStack.length) closeTopSheet();
            else if (navStack.length > 1) goBack();
        }
        if (event.key === 'Enter' && event.target && event.target.id === 'member-name') {
            const btn = $('member-save-btn');
            if (btn) btn.click();
        }
    });

    let pendingSheetAfterMember = null;

    /* ------------------------------------------------------- sheet saves -- */
    on($('meal-save-btn'), 'click', saveMeal);
    on($('bazar-save-btn'), 'click', saveBazar);

    /* তারিখ বদলালে ওই দিনের সংরক্ষিত মিল দিয়ে তালিকা নতুন করে সাজানো হয় */
    on($('meal-date'), 'change', function () {
        const date = $('meal-date').value || todayISO();
        loadMealDraft(date, '');
        renderMealRows();
    });

    on($('fixed-save-btn'), 'click', saveFixed);

    on($('member-save-btn'), 'click', function () {
        const input = $('member-name');
        if (!input || !input.value.trim()) {
            window.alert('দয়া করে সদস্যের নাম লিখুন।');
            return;
        }
        if (typeof window.addMember === 'function') window.addMember();
        input.value = '';
        hideKeyboard();
        closeSheet('sheet-member');
        renderAll();
        /* অন্য স্ক্রিন থেকে ডাকা হলে (সদস্য না থাকায়) মিল/বাজার শিট আবার খুলে দিই */
        const pending = pendingSheetAfterMember;
        pendingSheetAfterMember = null;
        if (pending) setTimeout(pending, 220);
    });

    /* ------------------------------------------------------- sync status -- */
    function syncChip(shortText, ok) {
        const label = $('sync-label');
        const chip = $('sync-chip');
        const detail = $('sync-detail-text');
        if (label) label.textContent = shortText;
        if (chip) chip.setAttribute('aria-label', 'সিঙ্ক স্ট্যাটাস: ' + shortText);
        if (chip) {
            chip.classList.toggle('is-on', ok === true);
            chip.classList.toggle('is-off', ok === false);
        }
        if (detail) detail.textContent = shortText;
    }

    (function watchSync() {
        const el = $('firebase-sync-status');
        if (!el) return;
        const read = function () {
            const text = (el.textContent || '').trim();
            if (!text) return;

            let short = 'সিঙ্ক…';
            if (text.indexOf('🟢') !== -1) short = 'চালু';
            else if (text.indexOf('🟠') !== -1) short = 'অফলাইন';
            else if (text.indexOf('🔴') !== -1) short = 'সমস্যা';

            const ok = text.indexOf('🟢') !== -1 ? true
                : ((text.indexOf('🔴') !== -1 || text.indexOf('🟠') !== -1) ? false : null);
            syncChip(short, ok);
        };
        try {
            new MutationObserver(read).observe(el, { childList: true, characterData: true, subtree: true });
        } catch (e) { /* ignore */ }
        read();
    })();

    /* ------------------------------------------- WhatsApp share buttons --- */
    let lastBazarEntryId = null;

    on($('meal-share-btn'), 'click', function () {
        if (!members().length) { window.alert('কোনো সদস্য পাওয়া যায়নি।'); return; }
        runConfirmed(function () {
            if (typeof window.shareMealsOnWhatsApp === 'function') window.shareMealsOnWhatsApp();
        });
    });

    on($('bazar-share-list-btn'), 'click', function () {
        const d = data();
        if (!d || !(d.bazarLog || []).length) { window.alert('কোনো বাজার খরচ পাওয়া যায়নি।'); return; }
        runConfirmed(function () {
            if (typeof window.shareBazarListOnWhatsApp === 'function') window.shareBazarListOnWhatsApp();
        });
    });

    on($('month-prev'), 'click', function () { stepMonth(+1); });   /* তালিকা নতুন→পুরনো, তাই +1 = আগের মাস */
    on($('month-next'), 'click', function () { stepMonth(-1); });

    on($('month-share-btn'), 'click', function () {
        if (!monthViewKey) return;
        runConfirmed(function () {
            if (typeof window.shareMonthOnWhatsApp === 'function') window.shareMonthOnWhatsApp(monthViewKey);
        });
    });

    on($('fixed-share-list-btn'), 'click', function () {
        if (!fixedEntries().length) { window.alert('কোনো ফিক্সড খরচ পাওয়া যায়নি।'); return; }
        runConfirmed(function () {
            if (typeof window.shareFixedListOnWhatsApp === 'function') window.shareFixedListOnWhatsApp();
        });
    });

    on($('report-share-btn'), 'click', function () {
        runConfirmed(function () {
            if (typeof window.shareAllInOneOnWhatsApp === 'function') window.shareAllInOneOnWhatsApp();
        });
    });

    on($('sync-now-btn'), 'click', function () {
        if (typeof window.syncMessDataNow === 'function') window.syncMessDataNow();
        else window.showToast('Firebase সংযোগ পাওয়া যায়নি।');
    });

    /* --------------------------------------------------------- url tabs -- */
    function openTabFromUrl() {
        const tabs = {
            'tab-meals': 'meal', 'tab-bazar': 'bazar', 'tab-fixed': 'fixed',
            'tab-summary': 'report', 'tab-members': 'members'
        };
        try {
            const tab = new URLSearchParams(location.search).get('tab');
            if (tab && tabs[tab]) go(tabs[tab]);
        } catch (e) { /* ignore */ }
    }

    const legacySwitchTab = window.switchTab;
    window.switchTab = function (tabId) {
        const map = {
            'tab-meals': 'meal', 'tab-bazar': 'bazar', 'tab-fixed': 'fixed',
            'tab-summary': 'report', 'tab-members': 'members'
        };
        if (map[tabId]) { go(map[tabId]); return; }
        if (typeof legacySwitchTab === 'function') legacySwitchTab.apply(this, arguments);
    };

    /* ============================================================= BOOT ==== */
    function boot() {
        try { history.replaceState({ mk: 'home' }, ''); } catch (e) { /* ignore */ }

        const dateInput = $('meal-date');
        if (dateInput && !dateInput.value) dateInput.value = todayISO();
        const bazarDate = $('bazar-date');
        if (bazarDate && !bazarDate.value) bazarDate.value = todayISO();

        document.body.style.overflow = '';
        activateScreen('home');

        setTimeout(function () {
            if (typeof window.updateDropdowns === 'function') window.updateDropdowns();
            if (typeof window.renderFixedCostInputs === 'function') window.renderFixedCostInputs();
            if (typeof window.calculateMess === 'function') window.calculateMess();
            renderAll();
            openTabFromUrl();
        }, 0);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* Firebase ডেটা এসে পৌঁছালে আরেকবার রিফ্রেশ */
    window.addEventListener('load', function () { setTimeout(renderAll, 80); });

    /* অ্যাপ ফিরে এলে (bfcache / ট্যাব বদল / ফোন লক-আনলক) সদস্যের তালিকা
       আবার তাজা করা হয় — অন্য ফোনে যোগ করা সদস্যের নামও সাথে সাথে দেখায় */
    window.addEventListener('pageshow', function () {
        renderPickers();
        refreshMemberViewsIfChanged();
    });
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) renderPickers();
    });
})();
