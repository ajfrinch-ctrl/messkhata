/* ============================================================================
   Meal Khata — Mobile App Interaction Layer
   ----------------------------------------------------------------------------
   এই ফাইলটি শুধু UI / UX / navigation নিয়ন্ত্রণ করে।

   ⚠️ Business logic এখানে নতুন করে লেখা হয়নি —
   meal / bazar / fixed cost / member / report এর সব calculation, Firebase sync
   এবং WhatsApp share আগের ফাংশনগুলোকেই (addMeals, addBazar, saveFixedCosts,
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

    function members() {
        const d = data();
        return d ? (d.members || []) : [];
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
        members: ['Members', 'সদস্যদের তথ্য'],
        member:  ['Member Details', 'সদস্যের হিসাব'],
        more:    ['More', 'সেটিংস ও অন্যান্য']
    };

    const NAV_FOR_SCREEN = {
        home: 'home', meal: 'meal', bazar: 'bazar', report: 'report',
        fixed: 'more', members: 'more', member: 'more', more: 'more'
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
    const PICKERS = [
        { kind: 'meal', select: 'meal-member-select', chips: 'meal-member-chips' },
        { kind: 'bazar', select: 'bazar-member-select', chips: 'bazar-member-chips' }
    ];

    function pickerById(kind) {
        return PICKERS.filter(function (p) { return p.kind === kind; })[0];
    }

    function renderPickers() {
        PICKERS.forEach(function (p) {
            const select = $(p.select);
            const box = $(p.chips);
            if (!select || !box) return;

            const list = members();
            const current = select.value;

            box.innerHTML = list.map(function (m) {
                return '<button type="button" class="chip" data-picker="' + p.kind +
                    '" data-mid="' + esc(m.id) + '">' + esc(m.name) + '</button>';
            }).join('');

            if (current && list.some(function (m) { return m.id === current; })) select.value = current;
            else if (!current && list.length) select.value = list[0].id;
            else select.value = '';

            syncPickerSelection(p.kind);
        });
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
    function totals() {
        const d = data(); if (!d) return { meals: 0, bazar: 0, rate: 0, fixed: 0, utility: 0, rent: 0 };
        const meals = (d.mealsLog || []).reduce(function (s, l) { return s + (Number(l.count) || 0); }, 0);
        const bazar = (d.bazarLog || []).reduce(function (s, b) { return s + (Number(b.amount) || 0); }, 0);
        const rent = Object.keys((d.fixedCosts && d.fixedCosts.rent) || {})
            .reduce(function (s, k) { return s + (Number(d.fixedCosts.rent[k]) || 0); }, 0);
        const bills = d.grandBills || {};
        const utility = ['electricity', 'maid', 'wifi', 'others']
            .reduce(function (s, k) { return s + (Number(bills[k]) || 0); }, 0);
        return {
            meals: meals,
            bazar: bazar,
            rate: meals > 0 ? bazar / meals : 0,
            rent: rent,
            utility: utility,
            fixed: rent + utility
        };
    }

    function memberStats(memberId) {
        const d = data(); if (!d) return { meals: 0, spent: 0, rent: 0, expense: 0, balance: 0 };
        const t = totals();
        const meals = (d.mealsLog || []).filter(function (l) { return l.memberId === memberId; })
            .reduce(function (s, l) { return s + (Number(l.count) || 0); }, 0);
        const spent = (d.bazarLog || []).filter(function (b) { return b.memberId === memberId; })
            .reduce(function (s, b) { return s + (Number(b.amount) || 0); }, 0);
        const rent = Number((d.fixedCosts && d.fixedCosts.rent ? d.fixedCosts.rent[memberId] : 0)) || 0;
        const count = members().length;
        const share = count ? t.utility / count : 0;
        const expense = meals * t.rate + rent + share;
        return { meals: meals, spent: spent, rent: rent, share: share, expense: expense, balance: spent - expense };
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

    function renderMenuMeta() {
        const d = data(); if (!d) return;
        const t = totals();
        const set = function (id, text) { const el = $(id); if (el) el.textContent = text; };
        set('menu-meta-meal', bn(Number.isInteger(t.meals) ? t.meals : t.meals.toFixed(1)) + ' মিল');
        set('menu-meta-bazar', money(t.bazar));
        set('menu-meta-fixed', money(t.fixed));
        set('menu-meta-report', '৳' + bn(t.rate.toFixed(2)));
        set('menu-meta-members', bn(members().length) + ' জন');
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
    /* Fixed Cost ক্যাটাগরি — একই রকম SVG আইকন (ইমোজির বদলে, সব ডিভাইসে একই দেখাবে) */
    const ICONS = {
        rent: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 10.6 12 4l8 6.6V20H4v-9.4Z"/><path d="M9.6 20v-5.2h4.8V20"/></svg>',
        elec: '<svg class="ico" viewBox="0 0 24 24"><path d="M13 3.5 6.5 13.5h4.2L11 20.5l6.5-10h-4.2z"/></svg>',
        maid: '<svg class="ico" viewBox="0 0 24 24"><path d="M16 4.5 11 12.5"/><path d="M5.5 20.5l3-5.5 4.2 2.3-2.6 3.2z"/><path d="M12.6 15.2l.9-1.6"/></svg>',
        wifi: '<svg class="ico" viewBox="0 0 24 24"><path d="M4.5 9.5a11 11 0 0 1 15 0"/><path d="M7.6 13a7 7 0 0 1 8.8 0"/><path d="M10.6 16.4a3 3 0 0 1 2.8 0"/><circle cx="12" cy="19.4" r=".9"/></svg>',
        water:'<svg class="ico" viewBox="0 0 24 24"><path d="M12 3.5c3 3.7 5.5 6.6 5.5 9.4a5.5 5.5 0 0 1-11 0C6.5 10.1 9 7.2 12 3.5Z"/></svg>',
        other:'<svg class="ico" viewBox="0 0 24 24"><path d="M4.5 8.4 12 4.5l7.5 3.9v7.2L12 19.5l-7.5-3.9z"/><path d="M4.5 8.4 12 12.3l7.5-3.9"/><path d="M12 12.3v7.2"/></svg>'
    };

    const BILL_ROWS = [
        { key: 'electricity', label: 'Electricity', sub: 'বিদ্যুৎ বিল',   ico: ICONS.elec,  cls: 'elec' },
        { key: 'maid',        label: 'Maid',        sub: 'বুয়া বিল',     ico: ICONS.maid,  cls: 'maid' },
        { key: 'wifi',        label: 'WiFi',        sub: 'ওয়াইফাই বিল',  ico: ICONS.wifi,  cls: 'wifi' },
        { key: 'others',      label: 'Others',      sub: 'অন্যান্য বিল',  ico: ICONS.other, cls: 'other' }
    ];

    function fixedRow(ico, cls, title, sub, amount) {
        return '<button type="button" class="row row--tap" data-act="fixed-edit">' +
            '<span class="billrow__ico ' + (cls ? 'billrow__ico--' + cls : '') + '">' + ico + '</span>' +
            '<span class="row__body">' +
                '<span class="row__title">' + esc(title) + '</span>' +
                '<span class="row__sub">' + esc(sub) + '</span>' +
            '</span>' +
            '<span class="row__right"><span class="row__amount row__amount--muted">' + amount + '</span></span>' +
            '<span class="menu__chev">' + chevronRight() + '</span>' +
        '</button>';
    }

    function renderFixedScreen() {
        const d = data(); if (!d) return;
        const box = $('fixed-list');
        const memberBox = $('fixed-member-list');
        if (!box || !memberBox) return;

        const t = totals();
        const bills = d.grandBills || {};

        let html = fixedRow(ICONS.rent, 'rent', 'House Rent', 'বাসা ভাড়া (ব্যক্তিগত)', money(t.rent));
        BILL_ROWS.forEach(function (b) {
            html += fixedRow(b.ico, b.cls, b.label, b.sub, money(Number(bills[b.key]) || 0));
        });
        box.innerHTML = html;

        const list = members();
        if (!list.length) {
            memberBox.innerHTML = emptyState('👥', 'কোনো সদস্য নেই।', 'সদস্য যোগ করলে ফিক্সড খরচ ভাগ হবে।');
            return;
        }

        const share = t.utility / list.length;
        memberBox.innerHTML = list.map(function (m) {
            const s = memberStats(m.id);
            return '<div class="row">' +
                '<span class="avatar">' + esc(String(m.name || '?').trim().charAt(0)) + '</span>' +
                '<div class="row__body">' +
                    '<div class="row__title">' + esc(m.name) + '</div>' +
                    '<div class="row__sub">ভাড়া ' + money(s.rent) + ' · ইউটিলিটি ' + money(share) + '</div>' +
                '</div>' +
                '<div class="row__right"><span class="row__amount row__amount--muted">' + money(s.rent + share) + '</span></div>' +
            '</div>';
        }).join('');
    }

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
                        '<div class="membercard__stat"><span>বাজার জমা</span><span>' + money(s.spent) + '</span></div>' +
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

        const group = {};
        (d.bazarLog || []).forEach(function (b) {
            const k = monthKey(b.date);
            if (!group[k]) group[k] = { bazar: 0, meals: 0 };
            group[k].bazar += Number(b.amount) || 0;
        });
        (d.mealsLog || []).forEach(function (l) {
            const k = monthKey(l.date);
            if (!group[k]) group[k] = { bazar: 0, meals: 0 };
            group[k].meals += Number(l.count) || 0;
        });

        const keys = Object.keys(group).sort(function (a, b) { return b.localeCompare(a); });
        if (!keys.length) {
            monthBox.innerHTML = emptyState('🗓️', 'আগের মাসের কোনো তথ্য নেই।', 'ডেটা যোগ হলে এখানে মাসভিত্তিক হিসাব দেখা যাবে।');
        } else {
            const currentKey = todayISO().slice(0, 7);
            monthBox.innerHTML = keys.map(function (k) {
                const g = group[k];
                const rate = g.meals > 0 ? g.bazar / g.meals : 0;
                return '<div class="row">' +
                    '<div class="row__body">' +
                        '<div class="row__title">' + esc(monthLabel(k)) +
                            (k === currentKey ? ' <span class="badge badge--ok">চলতি</span>' : '') + '</div>' +
                        '<div class="row__sub">বাজার ' + money(g.bazar) + ' · মিল ' +
                            bn(Number.isInteger(g.meals) ? g.meals : g.meals.toFixed(1)) + '</div>' +
                    '</div>' +
                    '<div class="row__right">' +
                        '<span class="row__amount row__amount--muted">৳' + bn(rate.toFixed(2)) + '</span>' +
                        '<div class="row__sub">মিল রেট</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
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

        body.innerHTML =
            '<div class="sec">' +
                '<div class="sec__head"><h2 class="sec__title">খরচের হিসাব</h2></div>' +
                '<div class="detailgrid">' +
                    cell('মিল', bn(s.meals) + ' টি') +
                    cell('মিলের খরচ', money(s.meals * totals().rate)) +
                    cell('বাসা ভাড়া', money(s.rent)) +
                    cell('ইউটিলিটি শেয়ার', money(s.share)) +
                    cell('মোট খরচ', money(s.expense)) +
                    cell('বাজার জমা', money(s.spent)) +
                '</div>' +
            '</div>' +
            '<div class="sec">' +
                '<button type="button" class="btn btn--add btn--meal btn--flush" data-act="edit-meal-for" ' +
                    'data-mid="' + esc(memberId) + '" data-date="' + esc(latest ? latest.date : todayISO()) + '" ' +
                    'data-count="' + esc(latest ? latest.count : 1) + '">' +
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
         'foot-total-rent', 'foot-total-utility', 'foot-total-fixed-all'].forEach(trimZeroDecimals);
    }

    /* ==================================================== MASTER RENDER ==== */
    function renderAll() {
        renderHomeSummary();
        renderMenuMeta();
        renderMealScreen();
        renderBazarScreen();
        renderFixedScreen();
        renderReportScreen();
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

    const legacyRenderFixedCostInputs = window.renderFixedCostInputs;
    window.renderFixedCostInputs = function () {
        if (typeof legacyRenderFixedCostInputs === 'function') legacyRenderFixedCostInputs.apply(this, arguments);
        styleFixedRentInputs();
        renderFixedScreen();
    };

    /* legacy ভাড়ার ইনপুটগুলো মোবাইল-বান্ধব রো-তে সাজাই (id/data-mem অপরিবর্তিত) */
    function styleFixedRentInputs() {
        $$('#fixed-rent-inputs > div').forEach(function (wrap) {
            const label = wrap.querySelector('label');
            const input = wrap.querySelector('input.rent-input');
            wrap.className = 'rentrow';
            if (label) label.className = 'rentrow__name';
            if (input) {
                input.className = 'input rent-input';
                input.setAttribute('inputmode', 'decimal');
                if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', '০');
                const name = label ? label.textContent.trim() : '';
                if (name) input.setAttribute('aria-label', name + ' এর বাসা ভাড়া');
            }
        });
    }

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
    let mealEditing = null;

    function findMeal(date, memberId) {
        const d = data(); if (!d) return null;
        return (d.mealsLog || []).filter(function (l) {
            return l.date === date && l.memberId === memberId;
        })[0] || null;
    }

    function markCountChip(count) {
        const box = $('meal-count-chips');
        if (!box) return;
        $$('.chip', box).forEach(function (chip) {
            chip.classList.toggle('is-on', String(chip.getAttribute('data-count')) === String(count));
        });
    }

    function openMealSheet(opts) {
        opts = opts || {};
        const date = opts.date || todayISO();
        const memberId = opts.memberId || firstMemberId();
        const entry = opts.entry || findMeal(date, memberId);
        const count = (opts.count !== undefined && opts.count !== null && opts.count !== '')
            ? opts.count
            : (entry ? entry.count : '');

        mealEditing = entry ? { date: entry.date, memberId: entry.memberId } : null;

        $('sheet-meal-title').textContent = entry ? 'Edit Meal' : 'Add Meal';
        $('meal-save-btn').textContent = entry ? 'মিল আপডেট করুন' : 'মিল সংরক্ষণ করুন';
        $('meal-date').value = date;
        $('meal-count').value = count;
        $('meal-sheet-hint').textContent = members().length
            ? (entry
                ? 'সংখ্যা বদলে আপডেট করুন — একই তারিখ ও সদস্যের আগের এন্ট্রি আপডেট হবে।'
                : 'একাধিক মিল একসাথে লিখতে পারবেন — সেভ করলেই এন্ট্রি যোগ হবে।')
            : 'আগে সদস্য যোগ করুন — নিচের বাটনে চাপুন, তারপর মিল লিখতে পারবেন।';

        /* সদস্য না থাকলে সেভ করার কিছু নেই — আগে সদস্য যোগ করতে হবে */
        $('meal-save-btn').classList.toggle('hidden', !members().length);
        $('meal-add-member-btn').classList.toggle('hidden', members().length > 0);

        const select = $('meal-member-select');
        if (select) select.value = memberId || '';
        syncPickerSelection('meal');
        markCountChip(count);

        openSheet('sheet-meal');
    }

    function saveMeal() {
        const date = $('meal-date').value;
        const select = $('meal-member-select');
        const memberId = select ? select.value : '';
        const count = parseFloat($('meal-count').value);

        if (!members().length) {
            hideKeyboard();
            window.alert('আগে সদস্য যোগ করুন, তারপর মিল লিখুন।');
            return;
        }
        if (!date || !memberId || isNaN(count) || count < 0) {
            hideKeyboard();
            window.alert('দয়া করে তারিখ, সদস্য ও মিলের সংখ্যা ঠিকভাবে দিন।');
            return;
        }

        /* Edit করার সময় তারিখ/সদস্য বদলালে পুরনো এন্ট্রি সরানো হয়,
           তারপর বিদ্যমান addMeals() একই নিয়মে নতুন/পুরনো এন্ট্রি হ্যান্ডেল করে। */
        if (mealEditing && !(mealEditing.date === date && mealEditing.memberId === memberId)) {
            const d = data();
            if (d) {
                d.mealsLog = (d.mealsLog || []).filter(function (l) {
                    return !(l.date === mealEditing.date && l.memberId === mealEditing.memberId);
                });
                if (typeof window.saveToLocalStorage === 'function') window.saveToLocalStorage();
            }
        }

        if (typeof window.addMeals === 'function') window.addMeals();

        mealEditing = null;
        hideKeyboard();
        closeSheet('sheet-meal');
        renderAll();
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
        if (!entry) { openMealSheet({ date: date, memberId: memberId }); return; }

        openActions(memberName(memberId) + ' · ' + bnDate(date), [
            {
                label: 'Edit', sub: 'মিলের সংখ্যা পরিবর্তন করুন', icon: editIcon(),
                run: function () { openMealSheet({ entry: entry }); }
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

        const select = $('bazar-member-select');
        if (select) {
            const fallback = firstMemberId();
            select.value = entry ? entry.memberId : (select.value || fallback);
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
            const memberId = chip.getAttribute('data-mid');
            if (p && $(p.select)) $(p.select).value = memberId || '';
            if (kind === 'meal') {
                const date = $('meal-date').value;
                const entry = findMeal(date, memberId);
                if (entry) {
                    $('meal-count').value = entry.count;
                    mealEditing = { date: entry.date, memberId: entry.memberId };
                } else {
                    mealEditing = null;
                }
                markCountChip(entry ? entry.count : '');
            }
            syncPickerSelection(kind);
            return;
        }

        const countChip = event.target.closest('.chip[data-count]');
        if (countChip) {
            $('meal-count').value = countChip.getAttribute('data-count');
            markCountChip(countChip.getAttribute('data-count'));
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
            case 'open-fixed':  go('fixed', function () { openSheet('sheet-fixed'); }); break;
            case 'open-member': go('members', function () { openSheet('sheet-member', { silent: true }); }); break;
            case 'member-first-meal':
                pendingSheetAfterMember = function () { openMealSheet({}); };
                go('members', function () { openSheet('sheet-member', { silent: true }); });
                break;
            case 'member-first-bazar':
                pendingSheetAfterMember = function () { openBazarSheet(null); };
                go('members', function () { openSheet('sheet-member', { silent: true }); });
                break;
            case 'fixed-edit':  openSheet('sheet-fixed'); break;

            case 'meal-quick-open':
                openMealSheet({ date: actEl.getAttribute('data-date'), memberId: actEl.getAttribute('data-mid') });
                break;
            case 'edit-meal-for':
                openMealSheet({
                    date: actEl.getAttribute('data-date'),
                    memberId: actEl.getAttribute('data-mid'),
                    count: actEl.getAttribute('data-count')
                });
                break;
            case 'meal-actions':
                mealActions(actEl.getAttribute('data-date'), actEl.getAttribute('data-mid'));
                break;
            case 'bazar-actions':
                bazarActions(actEl.getAttribute('data-id'));
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

    on($('meal-date'), 'change', function () {
        const date = $('meal-date').value;
        const select = $('meal-member-select');
        const memberId = select ? select.value : '';
        const entry = findMeal(date, memberId);
        mealEditing = entry ? { date: entry.date, memberId: entry.memberId } : null;
        if (entry) {
            $('meal-count').value = entry.count;
            markCountChip(entry.count);
        }
    });

    on($('fixed-save-btn'), 'click', function () {
        /* বিদ্যমান saveFixedCosts() — input id/data-mem অপরিবর্তিত */
        if (typeof window.saveFixedCosts === 'function') window.saveFixedCosts();
        hideKeyboard();
        closeSheet('sheet-fixed');
    });

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
})();
