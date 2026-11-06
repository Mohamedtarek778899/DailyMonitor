/* Daybook: screens and interaction. Data logic lives in logic.js. */
(function () {
  'use strict';
  const L = window.Logic;
  const KEY = 'daybook.v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = L.fmt;

  const ICON = {
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  };

  // ---------------------------------------------------------------- storage
  let state = load();
  const ui = { tab: 'today', month: L.ym(new Date()), q: '', fcat: '', ftype: 'all', edit: null, noteIdx: null, pending: null };
  let installEvt = null, toastTimer = 0, toastAct = null, saveWarned = false;

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    if (raw) {
      try {
        const r = L.validateImport(JSON.parse(raw));
        if (r.ok) return r.state;
      } catch (e) { /* fall through */ }
      try { localStorage.setItem(KEY + '.corrupt', raw); } catch (e) { /* ignore */ }
    }
    return L.defaultState();
  }
  function save() {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {
      if (!saveWarned) { saveWarned = true; toast('Could not save. Browser storage is full or blocked. Download a backup.'); }
    }
  }

  // ---------------------------------------------------------------- helpers
  const catOf = (id) => state.cats.find((c) => c.id === id) || state.cats.find((c) => c.fallback) || { id: '', name: 'Other', slot: 8 };
  const catColor = (c) => (c.slot < L.COLOR_SLOTS ? 'var(--s' + c.slot + ')' : 'var(--s-other)');
  const dayLabel = (s) => L.parseDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const todayStr = () => L.ymd(new Date());
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function applyTheme() {
    const t = state.settings.theme, root = document.documentElement;
    if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const m = $('meta[name=theme-color]');
    if (m) m.setAttribute('content', dark ? '#0B1519' : '#EEF2F3');
  }

  function toast(msg, action) {
    const el = $('#toast');
    toastAct = action || null;
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" data-act="toast-action">' + esc(action.label) + '</button>' : '');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 7000 : 3400);
  }

  // ---------------------------------------------------------------- charts
  function dayBars(month, pace, H) {
    const n = L.daysInMonth(month), series = L.dailySeries(state, month), todayS = todayStr();
    const W = 300, gap = 2, bw = (W - gap * (n - 1)) / n;
    const max = Math.max(pace * 1.25, ...series.map((s) => s.amt), 1);
    let bars = '', hits = '', mark = '';
    series.forEach((s, i) => {
      const x = i * (bw + gap), fut = s.date > todayS;
      const h = s.amt > 0 ? Math.max(3, (s.amt / max) * H) : 2, y = H - h, r = Math.min(2.5, bw / 2, h);
      const cls = 'b' + (fut ? ' fut' : '') + (pace > 0 && s.amt > pace ? ' over' : '');
      bars += '<path class="' + cls + '" d="M' + x.toFixed(2) + ',' + H + 'V' + (y + r).toFixed(2) + 'Q' + x.toFixed(2) + ',' + y.toFixed(2) + ' ' + (x + r).toFixed(2) + ',' + y.toFixed(2) +
        'H' + (x + bw - r).toFixed(2) + 'Q' + (x + bw).toFixed(2) + ',' + y.toFixed(2) + ' ' + (x + bw).toFixed(2) + ',' + (y + r).toFixed(2) + 'V' + H + 'Z"/>';
      const tipTxt = dayLabel(s.date) + ': ' + (s.amt ? fmt(s.amt) + ' EGP' : fut ? 'upcoming' : 'nothing spent');
      hits += '<rect class="hit" x="' + (x - gap / 2).toFixed(2) + '" y="0" width="' + (bw + gap).toFixed(2) + '" height="' + (H + 8) + '" data-tip="' + esc(tipTxt) + '"/>';
      if (s.date === todayS) { const cx = x + bw / 2; mark = '<path class="today-mark" d="M' + (cx - 3.5).toFixed(2) + ',' + (H + 8) + 'L' + cx.toFixed(2) + ',' + (H + 2.5) + 'L' + (cx + 3.5).toFixed(2) + ',' + (H + 8) + 'Z"/>'; }
    });
    const line = pace > 0 ? '<line class="pace" x1="0" x2="' + W + '" y1="' + (H - (pace / max) * H).toFixed(2) + '" y2="' + (H - (pace / max) * H).toFixed(2) + '"/>' : '';
    const total = L.sumAmt(L.expensesIn(state, month));
    return '<svg class="bars" viewBox="0 0 ' + W + ' ' + (H + 9) + '" role="img" aria-label="' + esc('Daily spending for ' + L.monthLabel(month) + ', ' + fmt(total) + ' EGP in total') + '">' + bars + line + mark + hits + '</svg>';
  }

  function paceLegend(pace) {
    if (!(pace > 0)) return '';
    return '<div class="legend-mini"><span><i style="background:var(--bar)"></i>Within daily pace</span><span><i style="background:var(--bar-over)"></i>Above daily pace</span><span><i class="dash"></i>Even pace, ' + fmt(pace, true) + ' EGP a day</span></div>';
  }

  function donut(slices, total) {
    const R = 62, C = 2 * Math.PI * R, sw = 24;
    let off = 0, out = '';
    slices.forEach((s) => {
      const len = (s.value / total) * C, gap = slices.length > 1 ? 2 : 0, dash = Math.max(len - gap, 0.5);
      const color = s.slot >= 0 ? 'var(--s' + s.slot + ')' : 'var(--s-other)';
      const tipTxt = s.label + ': ' + fmt(s.value) + ' EGP, ' + Math.round((s.value / total) * 100) + '%';
      out += '<circle class="slice" cx="88" cy="88" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-dasharray="' + dash.toFixed(2) + ' ' + (C - dash).toFixed(2) +
        '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 88 88)" data-tip="' + esc(tipTxt) + '"/>';
      off += len;
    });
    return '<svg class="donut" viewBox="0 0 176 176" role="img" aria-label="' + esc('Spending by category, ' + fmt(total) + ' EGP in total') + '">' + out +
      '<text class="d-lab" x="88" y="84">Spent</text><text class="d-fig" x="88" y="108">' + esc(fmt(total, true)) + '</text></svg>';
  }

  // ---------------------------------------------------------------- shared pieces
  function monthNav() {
    const maxM = L.addMonths(L.ym(new Date()), 12);
    return '<div class="mnav"><button class="icon-btn" data-act="mprev" aria-label="Previous month">' + ICON.prev + '</button><h2 aria-live="polite">' + esc(L.monthLabel(ui.month)) +
      '</h2><button class="icon-btn" data-act="mnext" aria-label="Next month"' + (ui.month >= maxM ? ' disabled' : '') + '>' + ICON.next + '</button></div>';
  }

  function txRow(t) {
    const income = t.type === 'income', c = income ? null : catOf(t.cat);
    const title = t.note ? esc(t.note) : income ? 'Income' : esc(c.name);
    const sub = t.note ? (income ? 'Income' : esc(c.name)) : '';
    return '<button class="row" data-act="edit-tx" data-id="' + esc(t.id) + '"><span class="dot" style="background:' + (income ? 'var(--ok)' : catColor(c)) + '"></span>' +
      '<span class="row-main"><span class="row-title">' + title + '</span><span class="row-sub">' + (sub ? '<span>' + sub + '</span>' : '') + (t.rid ? '<span class="pill">Monthly</span>' : '') + '</span></span>' +
      '<span class="row-amt ' + t.type + '">' + (income ? '+' : '') + fmt(t.amt) + '</span></button>';
  }

  function daysAgo(ts) {
    const n = Math.floor((Date.now() - ts) / 864e5);
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago';
  }

  // ---------------------------------------------------------------- Today
  function viewToday() {
    const now = new Date(), todayS = L.ymd(now), month = L.ym(now);
    const st = L.safeToSpend(state, now);
    const todays = state.tx.filter((t) => t.date === todayS).sort(L.sortTx);
    const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    let label, fig, sub, over = false, warnIcon = false, cta = '';
    if (st.budget <= 0) {
      label = 'Spent today'; fig = fmt(st.spentToday);
      sub = 'Set a limit for each category and Daybook will show how much you can spend each day.';
      cta = '<button class="btn" data-tab="budget">Set budgets</button>';
    } else if (st.remaining <= 0) {
      over = true; warnIcon = true;
      label = st.remaining === 0 ? 'Monthly budget used up' : 'Over the monthly budget by';
      fig = fmt(Math.abs(st.remaining));
      sub = 'You have spent ' + fmt(st.spentMonth) + ' of ' + fmt(st.budget) + ' EGP this month.';
    } else if (st.leftToday < 0) {
      over = true; warnIcon = true;
      label = 'Over today’s allowance by'; fig = fmt(-st.leftToday, true);
      sub = st.tomorrow === null ? 'This is the last day of the month.' : 'Tomorrow you can spend about ' + fmt(st.tomorrow, true) + ' EGP.';
    } else {
      label = 'Left to spend today'; fig = fmt(st.leftToday, true);
      sub = 'Of today’s ' + fmt(st.allowance, true) + ' EGP allowance, ' + fmt(st.spentToday) + ' spent.';
    }

    let monthLine = '';
    if (st.budget > 0) {
      const pct = Math.min(100, Math.round((st.spentMonth / st.budget) * 100));
      monthLine = '<hr><p class="hero-month"><b>' + (st.remaining > 0 ? fmt(st.remaining, true) + ' EGP left' : 'No budget left') + '</b> of ' + fmt(st.budget, true) + ' this month, ' +
        plural(st.daysLeft, 'day', 'days') + ' to go including today.</p><div class="pbar" role="progressbar" aria-label="Month budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i class="' + (st.remaining <= 0 ? 'over' : '') + '" style="width:' + pct + '%"></i></div>';
    }

    const hero = '<section class="panel hero' + (over ? ' over' : '') + '" aria-label="Today">' +
      '<p class="hero-label">' + (warnIcon ? ICON.warn : '') + esc(label) + '</p>' +
      '<p class="hero-fig"><span class="num">' + esc(fig) + '</span><span class="unit">EGP</span></p>' +
      '<p class="hero-sub">' + esc(sub) + '</p>' + cta +
      '<div class="ruler">' + dayBars(month, st.pace, 56) + '<div class="axis"><span>1 ' + esc(now.toLocaleDateString('en-GB', { month: 'short' })) + '</span><span>' + esc(String(st.dim)) + '</span></div>' + paceLegend(st.pace) + '</div>' +
      monthLine + '</section>';

    let banner = '';
    const lb = state.settings.lastBackup;
    if (state.tx.length >= 5 && Date.now() > state.settings.remindAfter && (!lb || Date.now() - lb > 14 * 864e5)) {
      banner = '<div class="banner"><b>' + (lb ? 'Last backup was ' + daysAgo(lb) + '.' : 'No backup yet.') + '</b> Your entries are saved only in this browser. A backup file protects them if the browser data is cleared.' +
        '<div class="row-actions"><button class="btn small" data-tab="more">Back up now</button><button class="btn small ghost" data-act="backup-later">Remind me in a week</button></div></div>';
    }

    const spentToday = L.sumAmt(todays.filter((t) => t.type === 'expense'));
    const list = todays.length
      ? '<div class="list">' + todays.map(txRow).join('') + '</div>'
      : '<p class="empty">Nothing logged today. Tap the + button to add what you spend or earn.</p>';

    return '<h1 class="page-title">' + esc(dateLabel) + '</h1>' + hero + banner +
      '<section class="section"><div class="section-head"><h2>Today’s entries</h2>' + (spentToday ? '<span class="sum">Spent ' + fmt(spentToday) + ' EGP</span>' : '') + '</div>' + list + '</section>';
  }

  // ---------------------------------------------------------------- History
  function histData() {
    const q = ui.q.trim().toLowerCase().replace(/,/g, '');
    let list = state.tx.filter((t) => t.date.startsWith(ui.month));
    if (ui.ftype !== 'all') list = list.filter((t) => t.type === ui.ftype);
    if (ui.fcat) list = list.filter((t) => t.type === 'expense' && t.cat === ui.fcat);
    if (q) list = list.filter((t) => (t.note || '').toLowerCase().includes(q) || (t.type === 'expense' && catOf(t.cat).name.toLowerCase().includes(q)) || String(t.amt / 100).includes(q));
    return list.sort(L.sortTx);
  }
  function histHTML() {
    const list = histData();
    const spent = L.sumAmt(list.filter((t) => t.type === 'expense')), inc = L.sumAmt(list.filter((t) => t.type === 'income'));
    const parts = [plural(list.length, 'entry', 'entries') + '.'];
    if (spent) parts.push('Spent ' + fmt(spent) + ' EGP.');
    if (inc) parts.push('Income ' + fmt(inc) + ' EGP.');
    let html = '', cur = '';
    if (!list.length) {
      const filtered = ui.q || ui.fcat || ui.ftype !== 'all';
      html = '<p class="empty">' + (filtered ? 'No entries match. Clear the search or filters to see everything in ' + esc(L.monthLabel(ui.month)) + '.' : 'No entries in ' + esc(L.monthLabel(ui.month)) + ' yet. Tap the + button to add one.') + '</p>';
    }
    list.forEach((t) => {
      if (t.date !== cur) {
        if (cur) html += '</div>';
        cur = t.date;
        const ds = L.sumAmt(list.filter((x) => x.date === cur && x.type === 'expense'));
        html += '<div class="day-head"><span>' + esc(dayLabel(cur)) + '</span><span>' + (ds ? 'Spent ' + fmt(ds) : '') + '</span></div><div class="list">';
      }
      html += txRow(t);
    });
    if (cur) html += '</div>';
    return { sum: esc(parts.join(' ')), list: html };
  }
  function viewHistory() {
    const h = histHTML();
    const catOpts = '<option value="">All categories</option>' + state.cats.map((c) => '<option value="' + esc(c.id) + '"' + (ui.fcat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    return '<h1 class="page-title">History</h1>' + monthNav() +
      '<div class="filters"><label class="search"><span class="sr">Search entries</span><input type="search" id="q" placeholder="Search notes, categories or amounts" value="' + esc(ui.q) + '" autocomplete="off"></label>' +
      '<label><span class="sr">Type</span><select id="ftype"><option value="all"' + (ui.ftype === 'all' ? ' selected' : '') + '>Expenses and income</option><option value="expense"' + (ui.ftype === 'expense' ? ' selected' : '') + '>Expenses only</option><option value="income"' + (ui.ftype === 'income' ? ' selected' : '') + '>Income only</option></select></label>' +
      '<label><span class="sr">Category</span><select id="fcat">' + catOpts + '</select></label></div>' +
      '<p class="sumline" id="hsum">' + h.sum + '</p><div id="hlist">' + h.list + '</div>';
  }
  function refreshHist() { const h = histHTML(); $('#hsum').innerHTML = h.sum; $('#hlist').innerHTML = h.list; }
  function bindHistory() {
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value; refreshHist(); });
    $('#ftype').addEventListener('change', (e) => { ui.ftype = e.target.value; refreshHist(); });
    $('#fcat').addEventListener('change', (e) => {
      ui.fcat = e.target.value;
      if (ui.fcat) { ui.ftype = 'expense'; $('#ftype').value = 'expense'; }
      refreshHist();
    });
  }

  // ---------------------------------------------------------------- Budget
  function viewBudget() {
    const m = ui.month, totals = L.categoryTotals(state, m), budget = L.totalBudget(state);
    const spentAll = L.sumAmt(L.expensesIn(state, m));
    const budgeted = state.cats.reduce((s, c) => s + (state.budgets[c.id] ? (totals[c.id] || 0) : 0), 0);
    const unbudgeted = spentAll - budgeted;
    let summary;
    if (budget > 0) {
      const left = budget - spentAll, pct = Math.min(100, Math.round((spentAll / budget) * 100)), lvl = L.budgetStatus(spentAll, budget).level;
      summary = '<p class="muted" style="margin-top:14px">' + (left >= 0 ? 'Left this month' : 'Over budget by') + '</p>' +
        '<p class="big-fig' + (left < 0 ? ' over' : '') + '">' + fmt(Math.abs(left), true) + ' <small>EGP</small></p>' +
        '<p class="sumline">Spent ' + fmt(spentAll, true) + ' of ' + fmt(budget, true) + ' EGP in total.</p>' +
        '<span class="meter" style="margin-top:10px" role="progressbar" aria-label="Month budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i class="' + (lvl === 'ok' ? '' : lvl) + '" style="width:' + pct + '%"></i></span>';
    } else {
      summary = '<p class="empty">Set a monthly limit for each category below. Together they make your total budget and your daily allowance.</p>';
    }

    const rows = state.cats.map((c) => {
      const spent = totals[c.id] || 0, limit = state.budgets[c.id] || 0, s = L.budgetStatus(spent, limit);
      let status;
      if (s.level === 'none') status = spent ? 'No limit set. Tap to add one.' : 'No limit set';
      else if (s.level === 'over') status = ICON.warn + 'Over by ' + fmt(spent - limit) + ' EGP';
      else if (s.level === 'near') status = ICON.warn + Math.round(s.pct * 100) + '% used, ' + fmt(limit - spent) + ' EGP left';
      else status = fmt(limit - spent) + ' EGP left';
      return '<button class="brow" data-act="edit-cat" data-id="' + esc(c.id) + '"><span class="brow-top"><span class="dot" style="background:' + catColor(c) + '"></span><span class="brow-name">' + esc(c.name) + '</span>' +
        '<span class="brow-nums">' + fmt(spent, true) + (limit ? ' <small>of ' + fmt(limit, true) + '</small>' : '') + '</span></span>' +
        (limit ? '<span class="meter" role="meter" aria-label="' + esc(c.name) + ' budget used" aria-valuemin="0" aria-valuemax="' + limit + '" aria-valuenow="' + spent + '"><i class="' + (s.level === 'ok' ? '' : s.level) + '" style="width:' + Math.min(100, Math.round(s.pct * 100)) + '%"></i></span>' : '') +
        '<span class="brow-status ' + (s.level === 'over' || s.level === 'near' ? s.level : '') + '">' + status + '</span></button>';
    }).join('');

    return '<h1 class="page-title">Budget</h1>' + monthNav() + summary +
      (unbudgeted > 0 && budget > 0 ? '<p class="hint">' + fmt(unbudgeted, true) + ' EGP went to categories without a limit. It still counts as spending.</p>' : '') +
      '<section class="section"><div class="section-head"><h2>Categories</h2></div><p class="hint" style="margin:0 0 6px">Limits repeat every month. Tap a category to change its name or limit.</p><div class="list">' + rows + '</div>' +
      '<div class="btn-row"><button class="btn ghost" data-act="add-cat">Add category</button></div></section>';
  }

  // ---------------------------------------------------------------- Insights
  function viewInsights() {
    const m = ui.month, now = new Date(), isCur = m === L.ym(now), dim = L.daysInMonth(m);
    const spent = L.sumAmt(L.expensesIn(state, m)), inc = L.sumAmt(L.incomeIn(state, m)), net = inc - spent;
    let html = '<h1 class="page-title">Insights</h1>' + monthNav();
    if (!spent && !inc) {
      return html + '<p class="empty">Nothing recorded in ' + esc(L.monthLabel(m)) + '. Add entries and charts will appear here.</p>';
    }
    html += '<div class="stats"><div><p class="k">Spent</p><p class="v">' + fmt(spent, true) + '</p></div><div><p class="k">Income</p><p class="v">' + fmt(inc, true) + '</p></div><div><p class="k">Income minus spent</p><p class="v">' + fmt(net, true) + '</p></div></div><p class="hint">All amounts in EGP.</p>';

    // where it went
    const { slices, total } = L.donutSlices(state, m);
    if (total) {
      html += '<section class="section"><div class="section-head"><h2>Where it went</h2></div><div class="donut-wrap">' + donut(slices, total) + '<div class="legend">' +
        slices.map((s) => {
          const color = s.slot >= 0 ? 'var(--s' + s.slot + ')' : 'var(--s-other)';
          const inner = '<span class="dot" style="background:' + color + '"></span><span class="name">' + esc(s.label) + '</span><span class="amt">' + fmt(s.value) + '</span><span class="pct">' + Math.round((s.value / total) * 100) + '%</span>';
          return s.slot >= 0 ? '<button class="lrow" data-act="filter-cat" data-id="' + esc(s.key) + '">' + inner + '</button>' : '<div class="lrow">' + inner + '</div>';
        }).join('') + '</div></div><p class="hint">Tap a category to see its entries.</p></section>';
    }

    // day by day
    if (spent) {
      const series = L.dailySeries(state, m), st = L.safeToSpend(state, now);
      const pace = L.totalBudget(state) > 0 ? L.totalBudget(state) / dim : 0;
      const peak = series.reduce((a, b) => (b.amt > a.amt ? b : a), series[0]);
      const counted = isCur ? now.getDate() : dim;
      let forecast = '';
      if (isCur && now.getDate() >= 5 && st.budget > 0) {
        const proj = L.forecast(state, now).projected, diff = Math.abs(st.budget - proj);
        forecast = '<hr><p class="hero-month">At this pace you will spend about <b>' + fmt(proj, true) + ' EGP</b> by the end of the month, ' + fmt(diff, true) + ' EGP ' + (proj <= st.budget ? 'under' : 'over') + ' your budget. Repeating entries count once.</p>';
      }
      html += '<section class="section"><div class="section-head"><h2>Day by day</h2></div><div class="panel chart"><div class="chart-note"><span>Busiest day: <b>' + esc(dayLabel(peak.date)) + '</b>, ' + fmt(peak.amt) + ' EGP</span><span>Average <b>' + fmt(spent / counted, true) + '</b> a day</span></div>' +
        dayBars(m, pace, 110) + '<div class="axis"><span>1</span><span>' + dim + '</span></div>' + paceLegend(pace) + forecast + '</div>' +
        '<details class="table-view"><summary>Show daily amounts as a table</summary><table><thead><tr><th>Day</th><th>Spent (EGP)</th></tr></thead><tbody>' +
        series.filter((s) => s.amt > 0).map((s) => '<tr><td>' + esc(dayLabel(s.date)) + '</td><td>' + fmt(s.amt) + '</td></tr>').join('') + '</tbody></table><p class="hint">Days with no spending are left out.</p></details></section>';
    }

    // biggest
    const top = L.topExpenses(state, m, 5);
    let out = html;
    if (top.length) out +='<section class="section"><div class="section-head"><h2>Biggest expenses</h2></div><div class="list">' + top.map(txRow).join('') + '</div></section>';

    // compare
    const cmp = L.compareMonths(state, m);
    if (cmp.prevTotal > 0 && cmp.curTotal > 0) {
      out += '<section class="section"><div class="section-head"><h2>Compared with ' + esc(L.monthLabel(L.addMonths(m, -1))) + '</h2></div>' +
        '<p class="sumline" style="margin-top:0">' + fmt(cmp.curTotal, true) + ' EGP now against ' + fmt(cmp.prevTotal, true) + ' EGP the month before' + (isCur ? ' (month not over yet).' : '.') + '</p><div class="list">' +
        cmp.rows.map((r) => {
          let chg;
          if (!r.prev) chg = '<span class="chg flat">New</span>';
          else if (r.delta > 0) chg = '<span class="chg up">' + ICON.up + '<span>' + fmt(r.delta, true) + ' more</span></span>';
          else if (r.delta < 0) chg = '<span class="chg down">' + ICON.down + '<span>' + fmt(-r.delta, true) + ' less</span></span>';
          else chg = '<span class="chg flat">Same</span>';
          return '<div class="cmp"><span class="dot" style="background:' + catColor(r.cat) + '"></span><span class="name">' + esc(r.cat.name) + '</span><span class="now">' + fmt(r.cur, true) + '</span>' + chg + '</div>';
        }).join('') + '</div></section>';
    }
    return out;
  }

  // ---------------------------------------------------------------- More
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'a.json', { type: 'application/json' })] })); } catch (e) { return false; }
  }
  function viewMore() {
    const recs = state.rec.slice().sort((a, b) => a.day - b.day);
    const lb = state.settings.lastBackup, theme = state.settings.theme;
    const recRows = recs.map((r) => {
      const c = r.type === 'expense' ? catOf(r.cat) : null;
      return '<button class="row" data-act="edit-rec" data-id="' + esc(r.id) + '"><span class="dot" style="background:' + (c ? catColor(c) : 'var(--ok)') + '"></span><span class="row-main"><span class="row-title">' + esc(r.note || (c ? c.name : 'Income')) +
        '</span><span class="row-sub">Day ' + r.day + ' of each month' + (c && r.note ? ', ' + esc(c.name) : '') + '</span></span><span class="row-amt ' + r.type + '">' + (r.type === 'income' ? '+' : '') + fmt(r.amt) + '</span></button>';
    }).join('');
    const radio = (v, t) => '<label><input type="radio" name="theme" value="' + v + '"' + (theme === v ? ' checked' : '') + '><span>' + t + '</span></label>';
    return '<h1 class="page-title">More</h1>' +
      '<section class="section"><div class="section-head"><h2>Repeating entries</h2></div><p class="hint" style="margin-top:0">Rent, subscriptions, salary. They are added on their day each month, and Daybook catches up if you open it later.</p>' +
      (recRows ? '<div class="list">' + recRows + '</div>' : '') + '<div class="btn-row"><button class="btn ghost" data-act="add-rec">Add repeating entry</button></div></section>' +
      '<section class="section"><div class="section-head"><h2>Backup and sync</h2></div>' +
      '<p class="hint" style="margin-top:0">Your entries are stored only in this browser on this device. To use Daybook on your phone and your computer, download a backup on one, then open it on the other with Import backup and choose Merge. Merge keeps the newest version of each entry, and deletions carry over. Budget limits come from the device that changed them last.</p>' +
      '<p class="hint">' + (lb ? 'Last backup: ' + daysAgo(lb) + '.' : 'You have not made a backup yet.') + '</p>' +
      '<div class="btn-row"><button class="btn" data-act="export">Download backup</button>' + (canShareFiles() ? '<button class="btn ghost" data-act="share">Share backup</button>' : '') +
      '<button class="btn ghost" data-act="import-pick">Import backup</button><button class="btn ghost" data-act="csv">Export as spreadsheet (CSV)</button></div>' +
      '<input type="file" id="file" accept="application/json,.json" hidden></section>' +
      '<section class="section"><div class="section-head"><h2>Appearance</h2></div><div class="seg" role="radiogroup" aria-label="Theme">' + radio('auto', 'Match device') + radio('light', 'Light') + radio('dark', 'Dark') + '</div></section>' +
      '<section class="section"><div class="section-head"><h2>About</h2></div><p class="hint" style="margin-top:0">Daybook keeps your daily spending in Egyptian pounds (EGP). It works offline and sends nothing anywhere.</p>' +
      '<p class="hint">To install it: on iPhone choose Share, then Add to Home Screen. On Android or desktop Chrome use the browser menu, then Install app.</p>' +
      '<div class="btn-row">' + (installEvt ? '<button class="btn" data-act="install">Install Daybook</button>' : '') + '<button class="btn danger" data-act="wipe">Delete all data</button></div></section>';
  }

  // ---------------------------------------------------------------- sheets
  function openSheet(html, focusSel) {
    const s = $('#sheet');
    s.innerHTML = html;
    if (!s.open) s.showModal();
    const el = focusSel && $(focusSel, s);
    if (el) el.focus();
  }
  function closeSheet() { const s = $('#sheet'); if (s.open) s.close(); }
  const head = (title) => '<header class="sheet-head"><h2 id="sheet-title">' + esc(title) + '</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">' + ICON.close + '</button></header>';

  function chipsHtml(selected) {
    return state.cats.map((c) => '<label class="chip"><input type="radio" name="cat" value="' + esc(c.id) + '"' + (c.id === selected ? ' checked' : '') + '><span><i class="dot" style="background:' + catColor(c) + '"></i>' + esc(c.name) + '</span></label>').join('');
  }
  const amountField = (val, focus) => '<label class="field"><span class="lbl">Amount</span><span class="amt-wrap"><input name="amt" id="amt" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(val) + '"' + (focus ? ' data-focus' : '') + ' aria-describedby="err"><span class="suffix">EGP</span></span></label><p class="err" id="err" role="alert"></p>';
  const typeSeg = (type) => '<div class="seg" role="radiogroup" aria-label="Type"><label><input type="radio" name="type" value="expense"' + (type === 'expense' ? ' checked' : '') + '><span>Expense</span></label><label><input type="radio" name="type" value="income"' + (type === 'income' ? ' checked' : '') + '><span>Income</span></label></div>';
  const centsToInput = (p) => String(p / 100);

  function sheetTx(id) {
    const t = id ? state.tx.find((x) => x.id === id) : null;
    if (id && !t) return;
    ui.edit = t ? t.id : null;
    ui.noteIdx = L.noteIndex(state);
    const type = t ? t.type : 'expense';
    const sel = t ? t.cat : (state.cats.some((c) => c.id === state.settings.lastCat) ? state.settings.lastCat : state.cats[0].id);
    openSheet('<form class="sheet-body" id="f-tx" novalidate data-touched="' + (t ? '1' : '') + '">' + head(t ? 'Edit entry' : 'Add entry') + typeSeg(type) + amountField(t ? centsToInput(t.amt) : '', true) +
      '<fieldset class="field" id="cat-field"' + (type === 'income' ? ' hidden' : '') + '><legend>Category</legend><div class="chips">' + chipsHtml(sel) + '</div></fieldset>' +
      '<label class="field"><span class="lbl">Note</span><input name="note" id="note" list="notes" maxlength="80" autocomplete="off" placeholder="Optional, like lunch or taxi" value="' + esc(t ? t.note : '') + '"></label>' +
      '<datalist id="notes">' + ui.noteIdx.list.map((n) => '<option value="' + esc(n) + '"></option>').join('') + '</datalist>' +
      '<div class="field"><label class="lbl" for="date">Date</label><div class="date-row"><input type="date" id="date" name="date" value="' + esc(t ? t.date : todayStr()) + '"><button type="button" class="btn ghost small" data-act="setdate" data-d="0">Today</button><button type="button" class="btn ghost small" data-act="setdate" data-d="-1">Yesterday</button></div></div>' +
      '<div class="actions">' + (t ? '<button type="button" class="btn danger" data-act="del-tx" data-id="' + esc(t.id) + '">Delete</button>' : '') + '<button type="submit" class="btn save">' + (t ? 'Save changes' : 'Add entry') + '</button></div></form>', '#amt');
  }

  function formFail(msg, sel) { const e = $('#err'); if (e) e.textContent = msg; const f = sel && $(sel); if (f) f.focus(); return false; }

  function submitTx(form) {
    const fd = new FormData(form);
    const type = fd.get('type') === 'income' ? 'income' : 'expense';
    const amt = L.parseAmount(fd.get('amt')), date = String(fd.get('date') || '');
    if (!(amt > 0)) return formFail('Enter an amount above 0, like 45 or 45.50.', '#amt');
    if (amt > L.MAX_AMT) return formFail('That amount is too large.', '#amt');
    if (!L.isDate(date)) return formFail('Pick a valid date.', '#date');
    let cat = '';
    if (type === 'expense') { cat = String(fd.get('cat') || ''); if (!state.cats.some((c) => c.id === cat)) return formFail('Pick a category.'); }
    const note = String(fd.get('note') || '').trim().slice(0, 80), now = Date.now(), editing = ui.edit;
    if (editing) {
      const t = state.tx.find((x) => x.id === editing);
      if (t) Object.assign(t, { type, amt, cat, note, date, updatedAt: now });
    } else {
      state.tx.push({ id: L.uid(), type, amt, cat, note, date, ts: now, updatedAt: now });
    }
    if (cat) state.settings.lastCat = cat;
    save(); closeSheet(); render();
    toast(editing ? 'Entry updated' : type === 'income' ? 'Added income of ' + fmt(amt) + ' EGP' : 'Added ' + fmt(amt) + ' EGP to ' + catOf(cat).name);
    return true;
  }

  function deleteTx(id) {
    const i = state.tx.findIndex((t) => t.id === id);
    if (i < 0) return;
    const t = state.tx.splice(i, 1)[0];
    state.tomb[id] = Date.now();
    save(); closeSheet(); render();
    toast('Entry deleted', { label: 'Undo', fn: () => { delete state.tomb[id]; t.updatedAt = Date.now(); state.tx.push(t); save(); render(); } });
  }

  function sheetCat(id) {
    const c = id ? state.cats.find((x) => x.id === id) : null;
    if (id && !c) return;
    ui.edit = c ? c.id : null;
    const limit = c && state.budgets[c.id] ? centsToInput(state.budgets[c.id]) : '';
    openSheet('<form class="sheet-body" id="f-cat" novalidate>' + head(c ? 'Edit category' : 'Add category') +
      '<label class="field"><span class="lbl">Name</span><input name="name" id="cname" maxlength="24" autocomplete="off" value="' + esc(c ? c.name : '') + '" data-focus aria-describedby="err"></label>' +
      '<label class="field"><span class="lbl">Monthly limit in EGP (leave empty for no limit)</span><input name="limit" id="climit" inputmode="decimal" autocomplete="off" placeholder="For example 3000" value="' + esc(limit) + '"></label><p class="err" id="err" role="alert"></p>' +
      '<div class="actions">' + (c && !c.fallback ? '<button type="button" class="btn danger" data-act="del-cat" data-id="' + esc(c.id) + '">Delete</button>' : '') + '<button type="submit" class="btn save">' + (c ? 'Save changes' : 'Add category') + '</button></div></form>', '#cname');
  }
  function submitCat(form) {
    const fd = new FormData(form), name = String(fd.get('name') || '').trim().slice(0, 24), raw = String(fd.get('limit') || '').trim();
    if (!name) return formFail('Give the category a name.', '#cname');
    if (state.cats.some((x) => x.id !== ui.edit && x.name.toLowerCase() === name.toLowerCase())) return formFail('You already have a category called ' + name + '.', '#cname');
    let limit = 0;
    if (raw) { limit = L.parseAmount(raw); if (!(limit > 0) || limit > L.MAX_AMT) return formFail('Enter a limit above 0, or leave it empty.', '#climit'); }
    const now = Date.now(), editing = ui.edit;
    let c = editing && state.cats.find((x) => x.id === editing);
    if (c) { c.name = name; c.updatedAt = now; }
    else { c = { id: 'cat-' + L.uid().slice(0, 8), name, slot: L.freeSlot(state.cats), fallback: false, updatedAt: now }; state.cats.push(c); }
    if ((state.budgets[c.id] || 0) !== limit) { if (limit) state.budgets[c.id] = limit; else delete state.budgets[c.id]; state.budgetsAt = now; }
    save(); closeSheet(); render(); toast(editing ? 'Category updated' : 'Category added');
    return true;
  }
  function confirmDelCat(id) {
    const c = state.cats.find((x) => x.id === id), fb = state.cats.find((x) => x.fallback);
    if (!c || c.fallback) return;
    const n = state.tx.filter((t) => t.cat === id).length;
    openSheet('<div class="sheet-body">' + head('Delete ' + c.name + '?') + '<p class="sheet-text">' + (n ? plural(n, 'entry', 'entries') + ' in this category will move to <b>' + esc(fb.name) + '</b>.' : 'No entries use this category.') + ' Its monthly limit will be removed.</p>' +
      '<div class="actions"><button type="button" class="btn ghost" data-act="close">Keep it</button><button type="button" class="btn solid-danger" data-act="del-cat-yes" data-id="' + esc(id) + '">Delete category</button></div></div>');
  }
  function deleteCat(id) {
    const c = state.cats.find((x) => x.id === id), fb = state.cats.find((x) => x.fallback);
    if (!c || !fb || c.fallback) return;
    const now = Date.now();
    state.tx.forEach((t) => { if (t.cat === id) { t.cat = fb.id; t.updatedAt = now; } });
    state.rec.forEach((r) => { if (r.cat === id) { r.cat = fb.id; r.updatedAt = now; } });
    delete state.budgets[id]; state.budgetsAt = now;
    state.cats = state.cats.filter((x) => x.id !== id); state.tomb[id] = now;
    if (ui.fcat === id) ui.fcat = '';
    save(); closeSheet(); render(); toast('Category deleted');
  }

  function sheetRec(id) {
    const r = id ? state.rec.find((x) => x.id === id) : null;
    if (id && !r) return;
    ui.edit = r ? r.id : null;
    const type = r ? r.type : 'expense', sel = r ? r.cat : state.cats[0].id;
    openSheet('<form class="sheet-body" id="f-rec" novalidate>' + head(r ? 'Edit repeating entry' : 'Add repeating entry') + typeSeg(type) + amountField(r ? centsToInput(r.amt) : '', true) +
      '<fieldset class="field" id="cat-field"' + (type === 'income' ? ' hidden' : '') + '><legend>Category</legend><div class="chips">' + chipsHtml(sel) + '</div></fieldset>' +
      '<label class="field"><span class="lbl">Name</span><input name="note" maxlength="80" autocomplete="off" placeholder="Like rent, internet or salary" value="' + esc(r ? r.note : '') + '"></label>' +
      '<label class="field"><span class="lbl">Day of the month (1 to 31)</span><input name="day" id="rday" type="number" inputmode="numeric" min="1" max="31" value="' + (r ? r.day : '') + '" placeholder="For example 1"></label>' +
      (r ? '' : '<label class="field"><span class="lbl">Starts</span><select name="start"><option value="this">This month</option><option value="next">Next month</option></select></label>') +
      '<p class="hint" style="margin:0">On months with fewer days, it is added on the last day.</p>' +
      '<div class="actions">' + (r ? '<button type="button" class="btn danger" data-act="del-rec" data-id="' + esc(r.id) + '">Delete</button>' : '') + '<button type="submit" class="btn save">' + (r ? 'Save changes' : 'Add repeating entry') + '</button></div></form>', '#amt');
  }
  function submitRec(form) {
    const fd = new FormData(form), type = fd.get('type') === 'income' ? 'income' : 'expense';
    const amt = L.parseAmount(fd.get('amt')), day = parseInt(fd.get('day'), 10);
    if (!(amt > 0)) return formFail('Enter an amount above 0.', '#amt');
    if (amt > L.MAX_AMT) return formFail('That amount is too large.', '#amt');
    if (!(day >= 1 && day <= 31)) return formFail('Pick a day between 1 and 31.', '#rday');
    let cat = '';
    if (type === 'expense') { cat = String(fd.get('cat') || ''); if (!state.cats.some((c) => c.id === cat)) return formFail('Pick a category.'); }
    const note = String(fd.get('note') || '').trim().slice(0, 80), now = Date.now(), editing = ui.edit;
    if (editing) {
      const r = state.rec.find((x) => x.id === editing);
      if (r) Object.assign(r, { type, amt, cat, note, day, updatedAt: now });
    } else {
      const base = L.ym(new Date());
      state.rec.push({ id: L.uid(), type, amt, cat, note, day, start: fd.get('start') === 'next' ? L.addMonths(base, 1) : base, last: '', paused: false, updatedAt: now });
    }
    L.applyRecurring(state, new Date());
    save(); closeSheet(); render(); toast(editing ? 'Repeating entry updated' : 'Repeats on day ' + day + ' of each month');
    return true;
  }
  function deleteRec(id) {
    const i = state.rec.findIndex((r) => r.id === id);
    if (i < 0) return;
    state.rec.splice(i, 1); state.tomb[id] = Date.now();
    save(); closeSheet(); render(); toast('Repeating entry deleted. Past entries were kept.');
  }

  // ---------------------------------------------------------------- backup / import
  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const backupJson = () => JSON.stringify(L.toExport(state), null, 1);
  const backupName = () => 'daybook-backup-' + todayStr() + '.json';
  function markBackup() { state.settings.lastBackup = Date.now(); save(); if (ui.tab === 'more' || ui.tab === 'today') render(); }

  function onFileChosen(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('That file is too large to be a Daybook backup.'); return; }
    file.text().then((txt) => {
      let obj;
      try { obj = JSON.parse(txt); } catch (e) { toast('That file could not be read. Choose a Daybook backup (.json).'); return; }
      const r = L.validateImport(obj);
      if (!r.ok) { toast(r.error); return; }
      ui.pending = r;
      const dates = r.state.tx.map((t) => t.date).sort();
      const range = dates.length ? ' from ' + dayLabel(dates[0]) + ' ' + dates[0].slice(0, 4) + ' to ' + dayLabel(dates[dates.length - 1]) + ' ' + dates[dates.length - 1].slice(0, 4) : '';
      openSheet('<div class="sheet-body">' + head('Import backup') + '<p class="sheet-text">This backup has <b>' + plural(r.state.tx.length, 'entry', 'entries') + '</b>' + esc(range) + '.' + (r.dropped ? ' ' + plural(r.dropped, 'damaged row was', 'damaged rows were') + ' skipped.' : '') + '</p>' +
        '<div class="stack"><button type="button" class="btn" data-act="import-merge">Merge with this device</button><p class="hint" style="margin:0">Recommended for syncing. Keeps what is here and adds what is new or newer in the backup.</p>' +
        '<button type="button" class="btn danger" data-act="import-replace">Replace everything on this device</button><p class="hint" style="margin:0">Removes the current entries and uses only the backup.</p></div></div>');
    }).catch(() => toast('That file could not be read.'));
  }
  function doImport(mode) {
    const r = ui.pending;
    if (!r) return;
    if (mode === 'merge') {
      const before = state.tx.length;
      state = L.mergeStates(state, r.state);
      L.applyRecurring(state, new Date());
      save(); closeSheet(); render();
      toast('Merged. ' + plural(state.tx.length, 'entry', 'entries') + ' on this device (' + (state.tx.length - before >= 0 ? '+' : '') + (state.tx.length - before) + ').');
    } else {
      const keep = state.settings;
      state = r.state; state.settings = keep;
      L.applyRecurring(state, new Date());
      save(); closeSheet(); render();
      toast('Replaced with the backup. ' + plural(state.tx.length, 'entry', 'entries') + '.');
    }
    ui.pending = null;
  }

  function wipeConfirm() {
    openSheet('<div class="sheet-body">' + head('Delete all data?') + '<p class="sheet-text">This removes every entry, budget, category and repeating entry from this device. It cannot be undone. Download a backup first if you might want them back.</p>' +
      '<div class="actions"><button type="button" class="btn ghost" data-act="close">Cancel</button><button type="button" class="btn solid-danger" data-act="wipe-yes">Delete everything</button></div></div>');
  }

  // ---------------------------------------------------------------- render + events
  function render(opts) {
    const views = { today: viewToday, history: viewHistory, budget: viewBudget, insights: viewInsights, more: viewMore };
    $('#view').innerHTML = views[ui.tab]();
    $$('#nav button').forEach((b) => { if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (ui.tab === 'history') bindHistory();
    if (opts && opts.top) window.scrollTo(0, 0);
  }
  function go(tab) { ui.tab = tab; render({ top: true }); }

  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { go(tabBtn.dataset.tab); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case 'add': sheetTx(); break;
      case 'edit-tx': sheetTx(id); break;
      case 'close': closeSheet(); break;
      case 'mprev': ui.month = L.addMonths(ui.month, -1); render({ top: true }); break;
      case 'mnext': ui.month = L.addMonths(ui.month, 1); render({ top: true }); break;
      case 'add-cat': sheetCat(); break;
      case 'edit-cat': sheetCat(id); break;
      case 'del-cat': confirmDelCat(id); break;
      case 'del-cat-yes': deleteCat(id); break;
      case 'add-rec': sheetRec(); break;
      case 'edit-rec': sheetRec(id); break;
      case 'del-tx': deleteTx(id); break;
      case 'del-rec': deleteRec(id); break;
      case 'setdate': { const d = new Date(); d.setDate(d.getDate() + Number(el.dataset.d)); const f = $('#date'); if (f) f.value = L.ymd(d); break; }
      case 'filter-cat': ui.fcat = id; ui.ftype = 'expense'; ui.q = ''; ui.tab = 'history'; render({ top: true }); break;
      case 'export': download(backupName(), backupJson(), 'application/json'); markBackup(); toast('Backup downloaded. Keep it somewhere safe.'); break;
      case 'share': {
        const file = new File([backupJson()], backupName(), { type: 'application/json' });
        navigator.share({ files: [file], title: 'Daybook backup' }).then(markBackup).catch((err) => { if (err && err.name !== 'AbortError') toast('Sharing did not work here. Use Download backup instead.'); });
        break;
      }
      case 'csv': download('daybook-entries-' + todayStr() + '.csv', L.toCSV(state), 'text/csv;charset=utf-8'); toast('Spreadsheet downloaded.'); break;
      case 'import-pick': { const f = $('#file'); if (f) f.click(); break; }
      case 'import-merge': doImport('merge'); break;
      case 'import-replace': doImport('replace'); break;
      case 'wipe': wipeConfirm(); break;
      case 'wipe-yes': { const keep = state.settings.theme; state = L.defaultState(); state.settings.theme = keep; save(); closeSheet(); render({ top: true }); toast('All data deleted.'); break; }
      case 'install': if (installEvt) { installEvt.prompt(); installEvt = null; render(); } break;
      case 'backup-later': state.settings.remindAfter = Date.now() + 7 * 864e5; save(); render(); break;
      case 'toast-action': { const a = toastAct; $('#toast').classList.remove('show'); if (a && a.fn) a.fn(); break; }
      default: break;
    }
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'f-tx') submitTx(f);
    else if (f.id === 'f-cat') submitCat(f);
    else if (f.id === 'f-rec') submitRec(f);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'type' && t.closest('form')) { const cf = $('#cat-field'); if (cf) cf.hidden = t.value === 'income'; }
    else if (t.name === 'cat' && t.closest('#f-tx')) { t.closest('form').dataset.touched = '1'; }
    else if (t.name === 'theme') { state.settings.theme = t.value; applyTheme(); save(); }
    else if (t.id === 'file') { onFileChosen(t.files && t.files[0]); t.value = ''; }
  });

  // Pick the category you used last time for the same note (until you choose one yourself).
  document.addEventListener('input', (e) => {
    if (e.target.id === 'note' && ui.noteIdx) {
      const form = e.target.closest('form');
      if (!form || form.dataset.touched) return;
      const c = ui.noteIdx.byKey[e.target.value.trim().toLowerCase()];
      const radio = c && $('input[name=cat][value="' + CSS.escape(c) + '"]', form);
      if (radio) radio.checked = true;
    }
  });

  const sheet = $('#sheet');
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('close', () => { ui.edit = null; sheet.innerHTML = ''; });

  // chart tooltips (hover on desktop, touch on phones)
  const tip = $('#tip');
  let tipTimer = 0;
  function showTip(text, x, y) {
    tip.textContent = text; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8) + 'px';
    tip.style.top = (y - r.height - 14 < 8 ? y + 20 : y - r.height - 14) + 'px';
  }
  function tipEvent(e) {
    const el = e.target.closest && e.target.closest('[data-tip]');
    clearTimeout(tipTimer);
    if (el) { showTip(el.dataset.tip, e.clientX, e.clientY); if (e.pointerType === 'touch') tipTimer = setTimeout(() => { tip.hidden = true; }, 2000); }
    else tip.hidden = true;
  }
  document.addEventListener('pointermove', tipEvent);
  document.addEventListener('pointerdown', tipEvent);
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);

  // keep things fresh: repeating entries, a new day, another tab, theme changes
  function refreshIfIdle() { if (!sheet.open) render(); }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (L.applyRecurring(state, new Date())) save();
    refreshIfIdle();
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); applyTheme(); refreshIfIdle(); } });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (ui.tab === 'more' && !sheet.open) render(); });
  window.addEventListener('appinstalled', () => { installEvt = null; });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  // start
  applyTheme();
  if (L.applyRecurring(state, new Date())) save();
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
