/* Daybook: pure logic (no DOM). Works in the browser (window.Logic) and in Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Money is stored as integer piastres (1 EGP = 100) so totals never drift.
  const MAX_AMT = 1e9 * 100;
  const COLOR_SLOTS = 8; // slots 0-7 use the validated palette; 8+ fold into "Other categories"

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const ym = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const daysInMonth = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const addMonths = (month, n) => { const [y, m] = month.split('-').map(Number); return ym(new Date(y, m - 1 + n, 1)); };
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const monthLabel = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parseDate(s)) === s;
  const isMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

  // ---------- amounts ----------
  function parseAmount(input) {
    if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : NaN;
    let s = String(input == null ? '' : input).trim();
    s = s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
         .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
         .replace(/٫/g, '.')
         .replace(/[٬,\s]/g, '');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }

  function fmt(p, whole) {
    p = Math.round(p);
    const neg = p < 0, a = Math.abs(p);
    if (whole) {
      const w = Math.round(a / 100);
      return (neg && w > 0 ? '−' : '') + w.toLocaleString('en-US');
    }
    const w = Math.floor(a / 100), f = a % 100;
    return (neg ? '−' : '') + w.toLocaleString('en-US') + (f ? '.' + pad(f) : '');
  }

  // ---------- state ----------
  function defaultCats() {
    return ['Food', 'Transport', 'Bills', 'Home', 'Shopping', 'Health', 'Fun', 'Other'].map((name, i) => ({
      id: 'cat-' + name.toLowerCase(), name, slot: i, fallback: name === 'Other', updatedAt: 0,
    }));
  }
  function defaultSettings() { return { theme: 'auto', lastBackup: 0, lastCat: '', remindAfter: 0 }; }
  function defaultState() {
    return { v: 1, updatedAt: Date.now(), budgetsAt: 0, cats: defaultCats(), tx: [], budgets: {}, rec: [], tomb: {}, settings: defaultSettings() };
  }
  function freeSlot(cats) {
    const used = new Set(cats.map((c) => c.slot));
    for (let i = 0; i < COLOR_SLOTS; i++) if (!used.has(i)) return i;
    return COLOR_SLOTS;
  }

  // Keep the data internally consistent (called after load / import / merge).
  function repair(s) {
    if (!s.cats.some((c) => c.fallback)) {
      const other = s.cats.find((c) => c.name.toLowerCase() === 'other');
      if (other) other.fallback = true;
      else s.cats.push({ id: 'cat-other', name: 'Other', slot: freeSlot(s.cats), fallback: true, updatedAt: 0 });
    }
    const fb = s.cats.find((c) => c.fallback).id;
    const ids = new Set(s.cats.map((c) => c.id));
    for (const t of s.tx) t.cat = t.type === 'expense' ? (ids.has(t.cat) ? t.cat : fb) : '';
    for (const r of s.rec) r.cat = r.type === 'expense' ? (ids.has(r.cat) ? r.cat : fb) : '';
    for (const k of Object.keys(s.budgets)) if (!ids.has(k) || !(s.budgets[k] > 0)) delete s.budgets[k];
    return s;
  }

  // Check + clean anything that comes from storage or a backup file.
  function validateImport(o) {
    if (!o || typeof o !== 'object') return { ok: false, error: 'This file is not a Daybook backup.' };
    const src = (o.app === 'daybook' && o.data && typeof o.data === 'object') ? o.data : o;
    if (!Array.isArray(src.tx)) return { ok: false, error: 'This file is not a Daybook backup.' };
    const num = (x, d) => (Number.isFinite(x) ? x : d);
    const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
    let dropped = 0;
    const s = { v: 1, updatedAt: num(src.updatedAt, Date.now()), budgetsAt: num(src.budgetsAt, 0), cats: [], tx: [], budgets: {}, rec: [], tomb: {}, settings: defaultSettings() };

    const rawCats = Array.isArray(src.cats) && src.cats.length ? src.cats : defaultCats();
    const seen = new Set();
    for (const c of rawCats) {
      const id = c && str(c.id, 40), name = c && str(c.name, 24).trim();
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      s.cats.push({ id, name, slot: Number.isInteger(c.slot) && c.slot >= 0 && c.slot < 100 ? c.slot : freeSlot(s.cats), fallback: c.fallback === true, updatedAt: num(c.updatedAt, 0) });
    }
    if (!s.cats.length) s.cats = defaultCats();

    const txMap = new Map();
    for (const t of src.tx) {
      const ok = t && typeof t === 'object' && (t.type === 'expense' || t.type === 'income') &&
        Number.isInteger(t.amt) && t.amt > 0 && t.amt <= MAX_AMT && isDate(t.date);
      if (!ok) { dropped++; continue; }
      const id = str(t.id, 60) || uid();
      const rec = { id, type: t.type, amt: t.amt, cat: str(t.cat, 40), note: str(t.note, 120), date: t.date, ts: num(t.ts, 0), updatedAt: num(t.updatedAt, 0) };
      if (typeof t.rid === 'string' && t.rid) rec.rid = t.rid.slice(0, 60);
      const prev = txMap.get(id);
      if (!prev || rec.updatedAt > prev.updatedAt) txMap.set(id, rec);
    }
    s.tx = [...txMap.values()];

    if (src.budgets && typeof src.budgets === 'object') {
      for (const k of Object.keys(src.budgets)) {
        const v = src.budgets[k];
        if (Number.isInteger(v) && v > 0 && v <= MAX_AMT) s.budgets[k] = v;
      }
    }
    if (Array.isArray(src.rec)) {
      for (const r of src.rec) {
        const ok = r && typeof r === 'object' && (r.type === 'expense' || r.type === 'income') && Number.isInteger(r.amt) && r.amt > 0 &&
          r.amt <= MAX_AMT && Number.isInteger(r.day) && r.day >= 1 && r.day <= 31 && isMonth(r.start) && str(r.id, 60);
        if (!ok) { dropped++; continue; }
        s.rec.push({ id: r.id.slice(0, 60), type: r.type, amt: r.amt, cat: str(r.cat, 40), note: str(r.note, 120), day: r.day, start: r.start, last: isMonth(r.last) ? r.last : '', paused: r.paused === true, updatedAt: num(r.updatedAt, 0) });
      }
    }
    if (src.tomb && typeof src.tomb === 'object') {
      for (const k of Object.keys(src.tomb)) if (Number.isFinite(src.tomb[k])) s.tomb[k.slice(0, 80)] = src.tomb[k];
    }
    if (src.settings && typeof src.settings === 'object') {
      const t = src.settings;
      s.settings = { theme: ['auto', 'light', 'dark'].includes(t.theme) ? t.theme : 'auto', lastBackup: num(t.lastBackup, 0), lastCat: str(t.lastCat, 40), remindAfter: num(t.remindAfter, 0) };
    }
    return { ok: true, state: repair(s), dropped };
  }

  function toExport(state) {
    const { v, updatedAt, budgetsAt, cats, tx, budgets, rec, tomb } = state;
    return { app: 'daybook', version: 1, exportedAt: new Date().toISOString(), data: clone({ v, updatedAt, budgetsAt, cats, tx, budgets, rec, tomb }) };
  }

  // Merge a backup into the local data. Newest edit wins; deletions are remembered (tombstones).
  function mergeStates(a, b) {
    const out = clone(a);
    const tomb = Object.assign({}, a.tomb);
    for (const k in b.tomb) tomb[k] = Math.max(tomb[k] || 0, b.tomb[k]);
    const mergeList = (la, lb) => {
      const m = new Map();
      for (const x of la) m.set(x.id, x);
      for (const x of lb) { const y = m.get(x.id); if (!y || (x.updatedAt || 0) > (y.updatedAt || 0)) m.set(x.id, clone(x)); }
      return [...m.values()].filter((x) => !(tomb[x.id] && tomb[x.id] >= (x.updatedAt || 0)));
    };
    out.tx = mergeList(a.tx, b.tx);
    out.cats = mergeList(a.cats, b.cats);
    out.rec = mergeList(a.rec, b.rec);
    out.tomb = tomb;
    if ((b.budgetsAt || 0) > (a.budgetsAt || 0)) { out.budgets = clone(b.budgets); out.budgetsAt = b.budgetsAt; }
    out.updatedAt = Date.now();
    return repair(out);
  }

  // ---------- recurring ----------
  // Adds the entries that are due. Ids are deterministic, so two devices never create duplicates.
  function applyRecurring(state, today) {
    const cur = ym(today), td = today.getDate();
    let added = 0;
    for (const r of state.rec) {
      if (r.paused) continue;
      let m = r.last ? addMonths(r.last, 1) : r.start;
      if (m < r.start) m = r.start;
      for (let g = 0; m <= cur && g < 240; g++, m = addMonths(m, 1)) {
        const day = Math.min(r.day, daysInMonth(m));
        if (m === cur && day > td) break;
        const id = 'r-' + r.id + '-' + m;
        if (!state.tomb[id] && !state.tx.some((t) => t.id === id)) {
          state.tx.push({ id, type: r.type, amt: r.amt, cat: r.type === 'expense' ? r.cat : '', note: r.note || '', date: m + '-' + pad(day), rid: r.id, ts: Date.now(), updatedAt: Date.now() });
          added++;
        }
        r.last = m;
      }
    }
    return added;
  }

  // ---------- numbers for the screens ----------
  const sumAmt = (list) => list.reduce((s, t) => s + t.amt, 0);
  const expensesIn = (state, month) => state.tx.filter((t) => t.type === 'expense' && t.date.startsWith(month));
  const incomeIn = (state, month) => state.tx.filter((t) => t.type === 'income' && t.date.startsWith(month));
  const totalBudget = (state) => state.cats.reduce((s, c) => s + (state.budgets[c.id] || 0), 0);

  function categoryTotals(state, month) {
    const out = {};
    for (const t of expensesIn(state, month)) out[t.cat] = (out[t.cat] || 0) + t.amt;
    return out;
  }

  function dailySeries(state, month) {
    const n = daysInMonth(month), arr = [];
    for (let d = 1; d <= n; d++) arr.push({ day: d, date: month + '-' + pad(d), amt: 0 });
    for (const t of expensesIn(state, month)) arr[Number(t.date.slice(8)) - 1].amt += t.amt;
    return arr;
  }

  function safeToSpend(state, today) {
    const month = ym(today), dim = daysInMonth(month), day = today.getDate(), todayS = ymd(today);
    const budget = totalBudget(state);
    const list = expensesIn(state, month);
    const spentMonth = sumAmt(list);
    const spentToday = sumAmt(list.filter((t) => t.date === todayS));
    const before = spentMonth - spentToday;
    const daysLeft = dim - day + 1;
    const remaining = budget - spentMonth;
    const allowance = budget > 0 ? (budget - before) / daysLeft : null;
    return {
      budget, spentMonth, spentToday, remaining, daysLeft, dim, day, allowance,
      leftToday: allowance === null ? null : allowance - spentToday,
      tomorrow: daysLeft > 1 ? remaining / (daysLeft - 1) : null,
      pace: budget > 0 ? budget / dim : 0,
    };
  }

  // Month-end estimate. Repeating entries (rent, subscriptions) and dated-ahead entries count once;
  // only everyday spending is extrapolated, so one big bill on day 1 does not inflate the forecast.
  function forecast(state, today) {
    const month = ym(today), dim = daysInMonth(month), day = today.getDate(), todayS = ymd(today);
    const list = expensesIn(state, month);
    const fixed = sumAmt(list.filter((t) => t.rid));
    const ahead = sumAmt(list.filter((t) => !t.rid && t.date > todayS));
    const everyday = sumAmt(list.filter((t) => !t.rid && t.date <= todayS));
    const notYetAdded = state.rec
      .filter((r) => r.type === 'expense' && !r.paused && r.start <= month && !state.tx.some((t) => t.id === 'r-' + r.id + '-' + month) && !state.tomb['r-' + r.id + '-' + month])
      .reduce((s, r) => s + r.amt, 0);
    return { projected: fixed + ahead + notYetAdded + (everyday / day) * dim, everyday, fixed };
  }

  function budgetStatus(spent, limit) {
    if (!(limit > 0)) return { level: 'none', pct: 0 };
    const pct = spent / limit;
    return { level: pct >= 1 ? 'over' : pct >= 0.8 ? 'near' : 'ok', pct };
  }

  function donutSlices(state, month) {
    const totals = categoryTotals(state, month);
    const slices = [];
    let folded = 0, foldedCount = 0, total = 0;
    for (const c of state.cats) {
      const v = totals[c.id] || 0;
      if (!v) continue;
      total += v;
      if (c.slot < COLOR_SLOTS) slices.push({ key: c.id, label: c.name, value: v, slot: c.slot });
      else { folded += v; foldedCount++; }
    }
    slices.sort((a, b) => b.value - a.value);
    if (folded) slices.push({ key: 'folded', label: 'Other categories', value: folded, slot: -1, count: foldedCount });
    return { slices, total };
  }

  function compareMonths(state, month) {
    const cur = categoryTotals(state, month), prev = categoryTotals(state, addMonths(month, -1));
    const rows = [];
    for (const c of state.cats) {
      const a = cur[c.id] || 0, b = prev[c.id] || 0;
      if (a || b) rows.push({ cat: c, cur: a, prev: b, delta: a - b });
    }
    rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    return { rows, curTotal: sumAmt(expensesIn(state, month)), prevTotal: sumAmt(expensesIn(state, addMonths(month, -1))) };
  }

  const sortTx = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));
  const topExpenses = (state, month, n) => expensesIn(state, month).slice().sort((a, b) => b.amt - a.amt || sortTx(a, b)).slice(0, n);

  // Recent notes (for suggestions) and the category last used with each note.
  function noteIndex(state) {
    const list = [], byKey = {};
    const sorted = state.tx.filter((t) => t.type === 'expense' && t.note).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    for (const t of sorted) {
      const k = t.note.toLowerCase();
      if (byKey[k]) continue;
      byKey[k] = t.cat;
      if (list.length < 40) list.push(t.note);
    }
    return { list, byKey };
  }

  // ---------- CSV ----------
  function csvCell(v, guard) {
    let s = String(v == null ? '' : v);
    if (guard && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(state) {
    const names = {};
    for (const c of state.cats) names[c.id] = c.name;
    const rows = [['Date', 'Type', 'Category', 'Amount (EGP)', 'Note']];
    state.tx.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0))).forEach((t) => {
      rows.push([t.date, t.type === 'income' ? 'Income' : 'Expense', t.type === 'income' ? '' : (names[t.cat] || ''), (t.amt / 100).toFixed(2), t.note || '']);
    });
    return '﻿' + rows.map((r) => r.map((c, i) => csvCell(c, i === 2 || i === 4)).join(',')).join('\r\n');
  }

  return {
    COLOR_SLOTS, MAX_AMT, pad, ymd, ym, daysInMonth, addMonths, parseDate, monthLabel, clone, uid, isDate, isMonth,
    parseAmount, fmt, defaultState, defaultCats, defaultSettings, freeSlot, repair, validateImport, toExport, mergeStates,
    applyRecurring, sumAmt, expensesIn, incomeIn, totalBudget, categoryTotals, dailySeries, safeToSpend, forecast, budgetStatus,
    donutSlices, compareMonths, sortTx, topExpenses, noteIndex, toCSV,
  };
});
