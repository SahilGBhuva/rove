#!/usr/bin/env node
/* Rove design QA: automated layout, accessibility, motion and performance checks across viewports.
 *
 * Usage:
 *   node scripts/preview-site.mjs 4348 &          # serve site/ + api/ locally
 *   node docs/design/qa/design-qa.mjs --base http://localhost:4348 \
 *        --puppeteer /path/to/dir/containing/node_modules \
 *        [--out docs/design/qa/report] [--chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] \
 *        [--only 390,390-dark] [--skip-perf]
 *   node docs/design/qa/design-qa.mjs --from-json docs/design/qa/baseline.json   # re-render the Markdown only
 *
 * puppeteer-core is NOT a project dependency. Point --puppeteer (or env PUPPETEER_DIR) at any directory whose
 * node_modules contains puppeteer-core; without it the script tries a plain `import('puppeteer-core')`.
 * Writes <out>.json and <out>.md. Exit code is always 0 unless the run itself fails: this is a report, not a gate.
 *
 * Layout/a11y audits run with prefers-reduced-motion: reduce so nothing is captured mid-animation. Motion and
 * performance measurements (CLS, long tasks, rAF frame times) run with normal motion. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/* ---------------- CLI ---------------- */
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
const flag = name => argv.includes(`--${name}`);
const BASE = (arg('base', argv[0] && !argv[0].startsWith('--') ? argv[0] : 'http://localhost:4348')).replace(/\/$/, '');
const OUT = arg('out', 'docs/design/qa/report');
const CHROME = arg('chrome', process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const PPDIR = arg('puppeteer', process.env.PUPPETEER_DIR || '');
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const SKIP_PERF = flag('skip-perf');
const FROM_JSON = arg('from-json', '');

async function loadPuppeteer() {
  if (PPDIR) {
    const req = createRequire(path.join(path.resolve(PPDIR), 'noop.js'));
    const entry = req.resolve('puppeteer-core');
    const mod = await import(pathToFileURL(entry).href);
    return mod.default || mod;
  }
  const mod = await import('puppeteer-core');
  return mod.default || mod;
}

/* ---------------- Configurations ---------------- */
const CONFIGS = [
  ...[320, 375, 390, 430, 768, 1024].map(w => ({ id: `${w}`, width: w, height: 844, scheme: 'light' })),
  { id: '390-dark', width: 390, height: 844, scheme: 'dark' },
  { id: 'landscape-844x390', width: 844, height: 390, scheme: 'light' },
  { id: 'short-390x500', width: 390, height: 500, scheme: 'light' },
  { id: '390-text200', width: 390, height: 844, scheme: 'light', textScale: 200 }
].filter(c => !ONLY || ONLY.includes(c.id));

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- In-page audit library (injected before any page script) ---------------- */
function installQA() {
  const qa = window.__designQA = {};
  // Layout shift and long task observers for the whole page life; reset() zeroes them.
  qa.cls = { total: 0, totalNoInput: 0, entries: [] };
  qa.longTasks = [];
  qa.reset = () => { qa.cls = { total: 0, totalNoInput: 0, entries: [] }; qa.longTasks = []; };
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        qa.cls.total += e.value;
        if (!e.hadRecentInput) qa.cls.totalNoInput += e.value;
        if (e.value > 0.001) qa.cls.entries.push({ value: +e.value.toFixed(4), hadRecentInput: e.hadRecentInput, sources: (e.sources || []).slice(0, 3).map(s => s.node && s.node.nodeType === 1 ? qa.sel(s.node) : String(s.node && s.node.nodeName)) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* unsupported */ }
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) qa.longTasks.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }

  qa.sel = el => {
    if (!el || el.nodeType !== 1) return String(el);
    const part = e => {
      let s = e.tagName.toLowerCase();
      if (e.id) return `${s}#${e.id}`;
      const cls = [...e.classList].filter(c => !/^(view-enter|is-)/.test(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      const da = e.getAttribute('data-action'); if (da) s += `[data-action="${da}"]`;
      return s;
    };
    const parts = []; let e = el;
    for (let i = 0; e && e.nodeType === 1 && i < 3; i++, e = e.parentElement) { parts.unshift(part(e)); if (e.id) break; }
    return parts.join(' > ');
  };
  const parseColor = c => {
    const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) {
      const cm = String(c).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      if (cm) return [cm[1] * 255, cm[2] * 255, cm[3] * 255, cm[4] == null ? 1 : +cm[4]];
      return null;
    }
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
  };
  const over = (top, bottom) => { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  qa.ratio = ratio;
  const hidden = el => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || +cs.opacity === 0 || e.hidden) return true;
      if (e.getAttribute('inert') != null) return true;
    }
    return false;
  };
  const visuallyHidden = el => { const r = el.getBoundingClientRect(); return r.width <= 2 || r.height <= 2; };
  qa.hidden = hidden;
  // Effective background: composite ancestor backgrounds from the element up to the root.
  const background = el => {
    const layers = []; let image = null;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !image) image = { sel: qa.sel(e), stops: (cs.backgroundImage.match(/rgba?\([^)]+\)|color\([^)]+\)/g) || []).map(parseColor).filter(Boolean), url: /url\(/.test(cs.backgroundImage) };
      const c = parseColor(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { color: base, image };
  };
  qa.contrast = () => {
    const out = []; const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    let checked = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName) || el.closest('svg, .maplibregl-canvas-container, canvas')) continue;
      if (hidden(el) || visuallyHidden(el)) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const rr = range.getBoundingClientRect(); if (rr.width < 1 || rr.height < 1) continue;
      checked++;
      const cs = getComputedStyle(el);
      let fg = parseColor(cs.color); if (!fg) continue;
      let op = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= +getComputedStyle(e).opacity;
      const bg = background(el);
      fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg.color);
      let r = ratio(fg, bg.color);
      let approx = false;
      if (bg.image && bg.image.stops.length) { approx = true; for (const s of bg.image.stops) r = Math.min(r, ratio(fg, over(s, bg.color))); }
      else if (bg.image && bg.image.url) approx = true;
      const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      if (r < 4.5) {
        const key = qa.sel(el) + '|' + cs.color;
        if (seen.has(key)) continue; seen.add(key);
        out.push({ selector: qa.sel(el), text: n.nodeValue.trim().slice(0, 40), ratio: +r.toFixed(2), fontSize: size, weight, large, wcagFail: r < (large ? 3 : 4.5), approx, fg: cs.color, bg: `rgb(${bg.color.slice(0, 3).map(Math.round).join(',')})` });
      }
    }
    return { checked, issues: out };
  };
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
  qa.interactive = () => [...document.querySelectorAll(INTERACTIVE)].filter(el => !hidden(el) && !el.closest('[inert]') && (() => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })() && !(el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) && !(el.closest('.visually-hidden, .sr-only')));
  qa.targets = () => {
    const small44 = [], small48 = []; let count = 0;
    for (const el of qa.interactive()) {
      const r = el.getBoundingClientRect(); count++;
      if (visuallyHidden(el)) continue;
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li, dd');
      const item = { selector: qa.sel(el), w: Math.round(r.width), h: Math.round(r.height), name: (el.getAttribute('aria-label') || el.textContent || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 40), inline: Boolean(inline) };
      if (r.width < 44 || r.height < 44) small44.push(item);
      if (r.width < 48 || r.height < 48) small48.push(item);
    }
    return { count, small44, small48 };
  };
  qa.overflow = () => {
    const vw = document.documentElement.clientWidth;
    const doc = { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, bodyScrollWidth: document.body.scrollWidth };
    const panel = document.getElementById('panelBody');
    const panelOverflow = panel ? panel.scrollWidth - panel.clientWidth : 0;
    const offenders = [];
    const clipped = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflowX !== 'visible' && e !== panel) { const r = e.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; } } return false; };
    const panelRect = panel?.getBoundingClientRect();
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('.maplibregl-map, #map, svg') || hidden(el)) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const pageOver = r.right > vw + 1 || r.left < -1;
      const panelOver = panel && panel.contains(el) && el !== panel && (r.right > panelRect.right + 1 || r.left < panelRect.left - 1);
      if ((pageOver || panelOver) && !clipped(el)) offenders.push({ el, selector: qa.sel(el), right: Math.round(r.right), left: Math.round(r.left), width: Math.round(r.width) });
    }
    // Report the innermost offenders (their children do not also overflow): those are usually the cause.
    const set = new Set(offenders.map(o => o.el));
    const leaves = offenders.filter(o => ![...o.el.querySelectorAll('*')].some(c => set.has(c))).slice(0, 12).map(({ el, ...rest }) => rest);
    return { horizontal: doc.scrollWidth > vw + 1 || panelOverflow > 1, doc, panelOverflow, offenders: leaves, offenderCount: offenders.length };
  };
  // Every interactive element outside the dock: scroll it into view (respects scroll-padding) and hit-test its centre.
  qa.dockOverlap = () => {
    const dock = document.querySelector('.rg-dock');
    const panel = document.getElementById('panelBody');
    const keep = panel ? panel.scrollTop : 0;
    const now = [], afterScroll = [];
    const hit = el => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { offscreen: true }; const h = document.elementFromPoint(x, y); return { h }; };
    if (dock && !hidden(dock)) {
      for (const el of qa.interactive()) {
        if (dock.contains(el) || visuallyHidden(el)) continue;
        const a = hit(el);
        if (!a.offscreen && a.h && dock.contains(a.h)) now.push({ selector: qa.sel(el) });
      }
      for (const el of qa.interactive()) {
        if (dock.contains(el) || visuallyHidden(el) || (panel && !panel.contains(el))) continue;
        el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        const a = hit(el);
        if (!a.offscreen && a.h && dock.contains(a.h)) afterScroll.push({ selector: qa.sel(el) });
      }
      if (panel) panel.scrollTop = keep;
    }
    return { hasDock: Boolean(dock && !hidden(dock)), overlapAtCurrentScroll: now, overlapAfterScrollIntoView: afterScroll };
  };
  qa.help = () => {
    const panel = document.getElementById('panelBody');
    if (panel) panel.scrollTop = panel.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
    const dock = document.querySelector('.rg-dock');
    const res = { helpOpen: Boolean(document.getElementById('rgHelp')), dockHasConfirm: Boolean(dock && dock.querySelector('.rg-confirm')), closeHelpInDock: Boolean(dock && dock.querySelector('.rg-close-help')), buttons: [] };
    for (const b of document.querySelectorAll('#rgHelp button, .rg-dock button')) {
      const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const off = y < 0 || y > innerHeight || x < 0 || x > innerWidth;
      const h = off ? null : document.elementFromPoint(x, y);
      res.buttons.push({ name: b.textContent.trim().slice(0, 40), inDock: Boolean(dock && dock.contains(b)), offscreen: off, hit: off ? null : Boolean(h && (h === b || b.contains(h))), hitInstead: off || (h && (h === b || b.contains(h))) ? null : qa.sel(h) });
    }
    return res;
  };
  qa.audit = () => ({ view: (typeof currentView === 'function' && currentView()?.name) || null, overflow: qa.overflow(), targets: qa.targets(), contrast: qa.contrast(), dock: qa.dockOverlap() });
  // Record requestAnimationFrame intervals for `ms`, optionally running scheduled actions meanwhile.
  qa.frames = (ms, actions = []) => new Promise(resolve => {
    const ts = []; const start = performance.now();
    for (const [at, code] of actions) setTimeout(() => { try { (0, eval)(code); } catch (e) { console.warn('qa action failed', e.message); } }, at);
    const tick = t => { ts.push(t); if (t - start < ms) requestAnimationFrame(tick); else resolve(ts.slice(1).map((v, i) => v - ts[i])); };
    requestAnimationFrame(tick);
  });
  qa.reducedMotionScan = () => {
    const out = [];
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running' && a.playState !== 'pending') continue;
      const t = a.effect && a.effect.target; const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      const cs = t && t.nodeType === 1 ? getComputedStyle(t) : null;
      out.push({ type: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '(script)', target: t ? qa.sel(t) : null, duration: timing.duration, iterations: timing.iterations, computedAnimationName: cs && cs.animationName, computedAnimationDuration: cs && cs.animationDuration, computedTransitionDuration: cs && cs.transitionDuration });
    }
    return out.filter(a => typeof a.duration !== 'number' || a.duration > 0.01 || a.iterations === Infinity);
  };
}

/* ---------------- Page helpers ---------------- */
async function newPage(browser, log) {
  const page = await browser.newPage();
  await page.bringToFront();
  page.on('pageerror', e => log.push({ type: 'pageerror', text: String(e.message || e).slice(0, 300) }));
  page.on('console', m => { if (m.type() === 'error') log.push({ type: 'console', text: m.text().slice(0, 300), url: m.location()?.url || '' }); });
  await page.evaluateOnNewDocument(installQA);
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rove-access-speak', 'no'); localStorage.removeItem('rove-active-trip-v1'); } catch { /* storage blocked */ } });
  return page;
}
async function fresh(page, cfg, { motion = 'reduce' } = {}) {
  await page.setViewport({ width: cfg.width, height: cfg.height, deviceScaleFactor: 1, isMobile: cfg.width < 800, hasTouch: cfg.width < 800 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: cfg.scheme }, { name: 'prefers-reduced-motion', value: motion }]);
  await page.goto(`${BASE}/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined' && state.network && window.__designQA, { timeout: 30000 });
  if (cfg.textScale) await page.evaluate(s => { document.documentElement.style.fontSize = `${s}%`; }, cfg.textScale);
  await sleep(500);
}
const clickSel = async (page, sel) => {
  // Real pointer click at the element centre when hittable (exercises the dock/hit path); DOM click otherwise.
  const ok = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h && (h === el || el.contains(h)) ? 'hit' : 'dom'; }, sel);
  if (!ok) throw new Error(`missing ${sel}`);
  if (ok === 'hit') await page.click(sel); else await page.$eval(sel, el => el.click());
  return ok;
};
const audit = page => page.evaluate(() => window.__designQA.audit());

/* Scenes for one configuration. Returns { scenes: {name: audit}, focus: [...], help: {...} } */
async function runConfig(browser, cfg) {
  const log = []; const page = await newPage(browser, log);
  const scenes = {}; const focus = []; let help = null; const errorsByScene = {};
  const mark = name => { errorsByScene[name] = log.splice(0); };
  const scene = async (name, fn) => {
    try { await fn(); scenes[name] = await audit(page); } catch (e) { scenes[name] = { error: e.message }; }
    mark(name);
  };
  await scene('home', async () => { await fresh(page, cfg); });
  await scene('plan-search', async () => {
    await page.evaluate(() => openPlan({})); await sleep(250);
    if (await page.$('#planTo')) { await page.click('#planTo'); await page.type('#planTo', 'Lake Mer'); }
    await sleep(900);
  });
  await scene('results-demo', async () => { await fresh(page, cfg); await page.evaluate(() => startDemo()); await sleep(500); });
  // Demo journey: every step, checking focus lands on the new instruction after each Confirm.
  try {
    await page.evaluate(() => document.querySelector('[data-action="nav-start"]').click()); await sleep(500);
    let step = 0;
    scenes['trip-1'] = await audit(page); mark('trip-1');
    const total = await page.evaluate(() => state.nav.guide.phases.length);
    while (step < total - 1) {
      const how = await clickSel(page, '.rg-dock .rg-confirm');
      await sleep(450);
      step++;
      const f = await page.evaluate(() => ({ active: document.activeElement?.id || document.activeElement?.tagName, kind: guidePhase(state.nav)?.kind, index: state.nav?.gs?.index }));
      focus.push({ afterConfirm: step, click: how, phase: f.kind, activeElement: f.active, ok: f.active === 'rgHeading' });
      const name = f.kind === 'arrive' ? 'arrival' : `trip-${step + 1}`;
      scenes[name] = await audit(page); mark(name);
    }
  } catch (e) { scenes['trip-error'] = { error: e.message }; mark('trip-error'); }
  await scene('help-open', async () => {
    await fresh(page, cfg);
    await page.evaluate(() => { startDemo(); document.querySelector('[data-action="nav-start"]').click(); }); await sleep(300);
    await clickSel(page, '.rg-dock .rg-confirm'); await sleep(300);
    await clickSel(page, '.rg-dock [data-action="rg-help"]'); await sleep(500);
    help = await page.evaluate(() => window.__designQA.help());
    help.focusAfterOpen = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  });
  await scene('results-real', async () => {
    await fresh(page, cfg);
    await page.evaluate(async () => { openPlan({ from: placeFromStop('bart', 'POWL'), to: placeFromStop('bart', 'LAKE') }); state.plan.timeMode = 'depart'; state.plan.dateTime = '2026-10-23T08:15'; await submitPlan(); });
    await sleep(900);
  });
  await page.close();
  return { scenes, focus, help, errorsByScene };
}

/* Reduced motion: after every action, no running animation or transition may have a non-zero duration. */
async function reducedMotion(browser) {
  const log = []; const page = await newPage(browser, log);
  const cfg = { width: 390, height: 844, scheme: 'light' };
  await fresh(page, cfg, { motion: 'reduce' });
  const steps = [
    ['home', '0'],
    ['plan', 'openPlan({})'],
    ['results-demo', 'startDemo()'],
    ['trip start', 'document.querySelector(\'[data-action="nav-start"]\').click()'],
    ['confirm 1', 'document.querySelector(".rg-dock .rg-confirm").click()'],
    ['help open', 'document.querySelector(\'.rg-dock [data-action="rg-help"]\').click()'],
    ['help close', 'document.querySelector(".rg-dock .rg-close-help").click()'],
    ['confirm 2', 'document.querySelector(".rg-dock .rg-confirm").click()'],
    ['confirm 3', 'document.querySelector(".rg-dock .rg-confirm").click()'],
    ['home again', 'goHome()']
  ];
  const results = [];
  for (const [name, code] of steps) {
    const now = await page.evaluate(c => { try { (0, eval)(c); } catch (e) { return { error: e.message }; } return { running: window.__designQA.reducedMotionScan() }; }, code);
    await sleep(120);
    const later = await page.evaluate(() => window.__designQA.reducedMotionScan());
    results.push({ step: name, error: now.error || null, runningImmediately: now.running || [], runningAfter120ms: later });
  }
  await page.close();
  return { results, violations: results.reduce((n, r) => n + r.runningImmediately.length + r.runningAfter120ms.length, 0), errors: log };
}

/* Frame stats against `budget` = the measured vsync interval (dropped = missed vsyncs). */
const stats = (intervals, budget) => {
  const s = [...intervals].sort((a, b) => a - b); const q = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null;
  const dropped = intervals.reduce((n, dt) => n + Math.max(0, Math.round(dt / budget) - 1), 0);
  return { frames: intervals.length, p50: +(q(0.5) ?? 0).toFixed(1), p95: +(q(0.95) ?? 0).toFixed(1), max: +(s[s.length - 1] ?? 0).toFixed(1), dropped, over50ms: intervals.filter(d => d > 50).length };
};
const CFG_PERF = { width: 390, height: 844, scheme: 'light' };

async function vsyncInterval(browser) {
  const page = await browser.newPage(); await page.bringToFront();
  await page.goto('data:text/html,<div id=x style="width:40px;height:40px;background:red"></div>');
  const med = await page.evaluate(() => new Promise(res => { const ts = []; const f = t => { ts.push(t); document.getElementById('x').style.transform = `translateX(${ts.length % 50}px)`; if (ts.length < 90) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res(d[d.length >> 1]); } }; requestAnimationFrame(f); }));
  await page.close();
  return med;
}

/* rAF intervals for 3 s on the idle home screen (motif) and across screen transitions, at a CPU throttle rate. */
async function measureFrames(browser, rate, { budget = 1000 / 60 } = {}) {
  const log = []; const page = await newPage(browser, log);
  const cdp = await page.createCDPSession();
  await fresh(page, CFG_PERF, { motion: 'no-preference' }); await sleep(800);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const motifAnimated = await page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.rg-motif, .rg-motif-wrap')).length);
  const home = await page.evaluate(() => window.__designQA.frames(3000));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await fresh(page, CFG_PERF, { motion: 'no-preference' }); await sleep(800);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  // home -> results -> trip -> next step, all inside one 3 s recording.
  const trans = await page.evaluate(() => window.__designQA.frames(3000, [[150, 'startDemo()'], [1100, 'document.querySelector(\'[data-action="nav-start"]\').click()'], [2050, 'document.querySelector(".rg-dock .rg-confirm").click()']]));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  return { homeMotif: { ...stats(home, budget), motifAnimationsRunning: motifAnimated }, screenTransition: stats(trans, budget), errors: log.slice(0, 5) };
}

/* Performance with normal motion: CLS + long tasks across the demo journey, rAF frame times at 1x and 4x CPU
 * (Emulation.setCPUThrottlingRate 4 approximates a mid-range phone). Dropped frames are counted against the
 * measured vsync interval of this machine (60 Hz expected; the background-throttling launch flags matter).
 * (An uncapped --disable-frame-rate-limit variant was tried and rejected: idle pages stop producing frames,
 * so its intervals do not measure frame cost.) */
async function performanceRun(browser) {
  const vsync = await vsyncInterval(browser);
  const out = { vsyncIntervalMs: +vsync.toFixed(1), journey: {}, frames: {} };
  for (const rate of [1, 4]) {
    const log = []; const page = await newPage(browser, log);
    const cdp = await page.createCDPSession();
    await fresh(page, CFG_PERF, { motion: 'no-preference' });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.evaluate(() => window.__designQA.reset());
    const t0 = Date.now();
    await page.evaluate(() => startDemo()); await sleep(700);
    await clickSel(page, '[data-action="nav-start"]'); await sleep(700);
    const total = await page.evaluate(() => state.nav.guide.phases.length);
    for (let i = 0; i < total - 1; i++) { await clickSel(page, '.rg-dock .rg-confirm'); await sleep(700); }
    const r = await page.evaluate(() => ({ cls: window.__designQA.cls, longTasks: window.__designQA.longTasks }));
    out.journey[`${rate}x`] = { durationMs: Date.now() - t0, clsTotal: +r.cls.total.toFixed(4), clsExcludingRecentInput: +r.cls.totalNoInput.toFixed(4), shifts: r.cls.entries.slice(0, 10), longTaskCount: r.longTasks.length, longTaskTotalMs: r.longTasks.reduce((a, b) => a + b, 0), longTaskMaxMs: Math.max(0, ...r.longTasks), errors: log.slice(0, 10) };
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.close();
    out.frames[`${rate}x`] = await measureFrames(browser, rate, { budget: vsync });
  }
  return out;
}

/* Keyboard-only pass: Tab order by accessible name on home, results and the trip screen. */
async function keyboardPass(browser) {
  const log = []; const page = await newPage(browser, log);
  const cfg = { width: 390, height: 844, scheme: 'light' };
  const out = {};
  const walk = async () => {
    // Move the sequential-focus starting point to the very top of the document, then Tab forward.
    await page.evaluate(() => { window.scrollTo(0, 0); const p = document.getElementById('panelBody'); if (p) p.scrollTop = 0; const a = document.createElement('span'); a.id = '__qaStart'; a.tabIndex = -1; document.body.prepend(a); a.focus({ preventScroll: true }); });
    const order = []; let first = null;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const handle = await page.evaluateHandle(() => document.activeElement);
      const info = await page.evaluate(el => {
        if (!el || el === document.body) return null;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
        return { key: window.__designQA.sel(el) + '@' + Math.round(r.top) + ',' + Math.round(r.left), selector: window.__designQA.sel(el), inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, focusIndicator: Boolean(ring), underDock: (() => { const d = document.querySelector('.rg-dock'); if (!d || d.contains(el)) return false; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(h && d.contains(h)); })() };
      }, handle);
      if (!info) { if (order.length) break; continue; }
      if (first && info.key === first) break;
      if (!first) first = info.key;
      let name = '', role = '';
      try { const ax = await page.accessibility.snapshot({ root: handle, interestingOnly: false }); name = ax?.name || ''; role = ax?.role || ''; } catch { /* no AX node */ }
      order.push({ i: order.length + 1, role, name: name.slice(0, 60), selector: info.selector, inViewport: info.inViewport, focusIndicator: info.focusIndicator, underDock: info.underDock });
      await handle.dispose();
    }
    await page.evaluate(() => document.getElementById('__qaStart')?.remove());
    return order;
  };
  await fresh(page, cfg); out.home = await walk();
  await page.evaluate(() => startDemo()); await sleep(400); out.results = await walk();
  await page.evaluate(() => document.querySelector('[data-action="nav-start"]').click()); await sleep(400); out.trip = await walk();
  await page.close();
  return { orders: out, errors: log };
}

/* ---------------- Markdown ---------------- */
function markdown(r) {
  const L = [];
  const n = x => (x == null ? '—' : x);
  L.push(`# Rove design QA report`, '', `Base URL: ${r.base}  `, `Run: ${r.startedAt} (${Math.round(r.durationMs / 1000)} s)  `, `Chrome: ${r.chrome}`, '', 'Rerun: `node scripts/preview-site.mjs 4348` then `node docs/design/qa/design-qa.mjs --base http://localhost:4348 --puppeteer <dir with node_modules/puppeteer-core> --out docs/design/qa/<name>`. Configs: widths 320/375/390/430/768/1024 at 844 high, 390 dark, landscape 844x390, short 390x500, 390 with 200% root font size.', '');
  L.push('Audits run with `prefers-reduced-motion: reduce`; motion/performance sections use normal motion. Contrast counts are unique element+colour pairs with ratio < 4.5:1 (WCAG fail column applies the 3:1 large-text threshold). Dock overlap counts interactive elements whose centre hits `.rg-dock` after `scrollIntoView({block:"nearest"})`.', '');
  L.push('## Summary by viewport and scene', '');
  L.push('| Config | Scene | View | H-overflow | Targets | <44px | <48px | Contrast <4.5 | WCAG fail | Dock overlap (now / after scroll) | Console errors |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [cid, c] of Object.entries(r.configs)) {
    for (const [sname, s] of Object.entries(c.scenes)) {
      const errs = (c.errorsByScene[sname] || []).length;
      if (s.error) { L.push(`| ${cid} | ${sname} | — | ERROR: ${s.error.replace(/\|/g, '/')} | | | | | | | ${errs} |`); continue; }
      L.push(`| ${cid} | ${sname} | ${n(s.view)} | ${s.overflow.horizontal ? `**yes** (${s.overflow.doc.scrollWidth}/${s.overflow.doc.clientWidth}, panel +${s.overflow.panelOverflow})` : 'no'} | ${s.targets.count} | ${s.targets.small44.length} | ${s.targets.small48.length} | ${s.contrast.issues.length} | ${s.contrast.issues.filter(i => i.wcagFail).length} | ${s.dock.hasDock ? `${s.dock.overlapAtCurrentScroll.length} / ${s.dock.overlapAfterScrollIntoView.length}` : '—'} | ${errs} |`);
    }
  }
  L.push('', '## Focus after Confirm (must be #rgHeading)', '', '| Config | Results |', '|---|---|');
  for (const [cid, c] of Object.entries(r.configs)) L.push(`| ${cid} | ${c.focus.length ? c.focus.map(f => `${f.afterConfirm}:${f.phase}=${f.ok ? 'ok' : `**${f.activeElement}**`}${f.click === 'dom' ? '(dom-click)' : ''}`).join(', ') : '—'} |`);
  L.push('', '(dom-click) means the Confirm centre was not hittable by a real pointer at that moment, so the script fell back to element.click().', '');
  L.push('## Help open, scrolled to bottom', '', '| Config | Dock has Confirm | Close help in dock | Buttons hit | Obscured | Offscreen | Focus after open |', '|---|---|---|---|---|---|---|');
  for (const [cid, c] of Object.entries(r.configs)) {
    const h = c.help; if (!h) { L.push(`| ${cid} | ERROR | | | | | |`); continue; }
    const ob = h.buttons.filter(b => b.hit === false);
    L.push(`| ${cid} | ${h.dockHasConfirm ? '**YES**' : 'no'} | ${h.closeHelpInDock ? 'yes' : '**no**'} | ${h.buttons.filter(b => b.hit).length}/${h.buttons.length} | ${ob.length ? ob.map(b => `"${b.name}" by ${b.hitInstead}`).join('; ') : 0} | ${h.buttons.filter(b => b.offscreen).map(b => `"${b.name}"`).join(', ') || 0} | ${h.focusAfterOpen} |`);
  }
  if (r.reducedMotion) {
    L.push('', '## Reduced motion', '', `Running animations/transitions with non-zero duration under \`prefers-reduced-motion: reduce\`: **${r.reducedMotion.violations}**`, '');
    for (const s of r.reducedMotion.results) {
      const all = [...s.runningImmediately, ...s.runningAfter120ms];
      if (all.length || s.error) L.push(`- ${s.step}: ${s.error ? `error ${s.error}; ` : ''}${all.map(a => `${a.type} ${a.name} on ${a.target} (${a.duration}ms, computed animation-name ${a.computedAnimationName}, duration ${a.computedAnimationDuration}, transition ${a.computedTransitionDuration})`).join('; ')}`);
    }
  }
  if (r.performance) {
    const P = r.performance;
    L.push('', '## Performance (390x844, normal motion)', '', '### Demo journey: layout shift and long tasks', '', '| CPU | CLS (all / excl. recent input) | Long tasks (count / total / max ms) |', '|---|---|---|');
    for (const [rate, j] of Object.entries(P.journey)) L.push(`| ${rate} | ${j.clsTotal} / ${j.clsExcludingRecentInput} | ${j.longTaskCount} / ${j.longTaskTotalMs} / ${j.longTaskMaxMs} |`);
    const fr = (title, set, note) => {
      L.push('', `### ${title}`, '', note, '', '| CPU | Home motif p50 / p95 / max ms | dropped / frames | Transition p50 / p95 / max ms | dropped / frames |', '|---|---|---|---|---|');
      for (const [rate, f] of Object.entries(set)) L.push(`| ${rate} | ${f.homeMotif.p50} / ${f.homeMotif.p95} / ${f.homeMotif.max} | ${f.homeMotif.dropped} / ${f.homeMotif.frames} | ${f.screenTransition.p50} / ${f.screenTransition.p95} / ${f.screenTransition.max} | ${f.screenTransition.dropped} / ${f.screenTransition.frames} |`);
    };
    fr(`requestAnimationFrame intervals over 3 s (vsync measured at ${P.vsyncIntervalMs} ms)`, P.frames, '"dropped" = missed vsyncs relative to the measured refresh interval. Transition = home → results (startDemo) → trip (Start) → next step (Confirm) inside one 3 s recording. 4x = CDP CPU throttling to approximate a phone.');
    const motif = Object.values(P.frames)[0]?.homeMotif.motifAnimationsRunning;
    L.push('', `Home motif animations running during measurement: ${motif ?? '—'}${motif === 0 ? ' (the motif is static on this build, so the home figure is an idle baseline)' : ''}.`);
    const shifts = Object.entries(P.journey).flatMap(([k, j]) => j.shifts.map(s => `${k}: ${s.value}${s.hadRecentInput ? ' (after input)' : ''} ${s.sources.join(', ')}`));
    if (shifts.length) L.push('', 'Largest layout shifts:', '', ...shifts.slice(0, 10).map(s => `- ${s}`));
  }
  if (r.keyboard) {
    L.push('', '## Keyboard-only Tab order (390x844)', '');
    for (const [screen, order] of Object.entries(r.keyboard.orders)) {
      L.push(`### ${screen}`, '', '| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |', '|---|---|---|---|---|---|---|');
      for (const o of order) L.push(`| ${o.i} | ${o.role} | ${o.name.replace(/\|/g, '/')} | \`${o.selector}\` | ${o.inViewport ? 'yes' : 'no'} | ${o.focusIndicator ? 'yes' : '**no**'} | ${o.underDock ? '**yes**' : 'no'} |`);
      L.push('');
    }
  }
  // Detail: worst offenders aggregated across configs.
  const agg = (pick) => { const m = new Map(); for (const [cid, c] of Object.entries(r.configs)) for (const [sname, s] of Object.entries(c.scenes)) if (!s.error) for (const it of pick(s)) { const k = it.key; const v = m.get(k) || { ...it, where: new Set() }; v.where.add(`${cid}/${sname}`); m.set(k, v); } return [...m.values()].sort((a, b) => b.where.size - a.where.size); };
  const contrast = agg(s => s.contrast.issues.map(i => ({ key: `${i.selector}|${i.fg}|${i.bg}`, ...i })));
  L.push('## Contrast issues (unique, most widespread first)', '', '| Selector | Text | Ratio | Size/weight | WCAG fail | fg / bg | Seen in |', '|---|---|---|---|---|---|---|');
  for (const c of contrast.slice(0, 40)) L.push(`| \`${c.selector}\` | ${c.text.replace(/\|/g, '/')} | ${c.ratio}${c.approx ? '~' : ''} | ${c.fontSize}px/${c.weight} | ${c.wcagFail ? '**yes**' : 'no (large)'} | ${c.fg} / ${c.bg} | ${c.where.size}: ${[...c.where].slice(0, 4).join(', ')}${c.where.size > 4 ? '…' : ''} |`);
  const small = agg(s => s.targets.small44.map(t => ({ key: t.selector, ...t })));
  L.push('', '## Targets smaller than 44x44 (unique)', '', '| Selector | Name | Size | Inline link | Seen in |', '|---|---|---|---|---|');
  for (const t of small.slice(0, 40)) L.push(`| \`${t.selector}\` | ${t.name.replace(/\|/g, '/')} | ${t.w}x${t.h} | ${t.inline ? 'yes' : 'no'} | ${t.where.size}: ${[...t.where].slice(0, 4).join(', ')}${t.where.size > 4 ? '…' : ''} |`);
  const small48 = agg(s => s.targets.small48.filter(t => !(t.w < 44 || t.h < 44)).map(t => ({ key: t.selector, ...t })));
  L.push('', '## Targets 44–47px (meet 44, miss 48)', '', '| Selector | Name | Size | Seen in |', '|---|---|---|---|');
  for (const t of small48.slice(0, 30)) L.push(`| \`${t.selector}\` | ${t.name.replace(/\|/g, '/')} | ${t.w}x${t.h} | ${t.where.size}: ${[...t.where].slice(0, 4).join(', ')}${t.where.size > 4 ? '…' : ''} |`);
  const over = agg(s => s.overflow.offenders.map(o => ({ key: o.selector, ...o })));
  L.push('', '## Horizontal overflow offenders', '');
  if (!over.length) L.push('None.');
  else { L.push('| Selector | left/right/width | Seen in |', '|---|---|---|'); for (const o of over.slice(0, 30)) L.push(`| \`${o.selector}\` | ${o.left}/${o.right}/${o.width} | ${[...o.where].join(', ')} |`); }
  const dockAgg = agg(s => s.dock.overlapAfterScrollIntoView.map(o => ({ key: o.selector, ...o })));
  L.push('', '## Elements hidden under the dock after scrollIntoView', '');
  if (!dockAgg.length) L.push('None.'); else for (const d of dockAgg) L.push(`- \`${d.selector}\` in ${[...d.where].join(', ')}`);
  const errs = new Map();
  for (const [cid, c] of Object.entries(r.configs)) for (const [sname, list] of Object.entries(c.errorsByScene)) for (const e of list) { const k = e.text.slice(0, 160); const v = errs.get(k) || { ...e, where: new Set() }; v.where.add(`${cid}/${sname}`); errs.set(k, v); }
  L.push('', '## Console errors (unique)', '');
  if (!errs.size) L.push('None.'); else for (const e of errs.values()) L.push(`- [${e.type}] ${e.text.replace(/\n/g, ' ')} — ${e.where.size} scene(s)`);
  L.push('');
  return L.join('\n');
}

/* ---------------- Main ---------------- */
const LAUNCH_ARGS = ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'];
if (FROM_JSON) {
  const r = JSON.parse(fs.readFileSync(FROM_JSON, 'utf8'));
  const md = FROM_JSON.replace(/\.json$/, '') + '.md';
  fs.writeFileSync(md, markdown(r)); console.log(`wrote ${md}`); process.exit(0);
}
const puppeteer = await loadPuppeteer();
const startedAt = new Date().toISOString(); const t0 = Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: LAUNCH_ARGS });
const report = { base: BASE, startedAt, chrome: await browser.version(), configs: {} };
try {
  for (const cfg of CONFIGS) { process.stderr.write(`config ${cfg.id}\n`); report.configs[cfg.id] = await runConfig(browser, cfg); }
  process.stderr.write('reduced motion\n'); report.reducedMotion = await reducedMotion(browser);
  process.stderr.write('keyboard\n'); report.keyboard = await keyboardPass(browser);
  if (!SKIP_PERF) { process.stderr.write('performance\n'); report.performance = await performanceRun(browser); }
} finally { await browser.close(); }
report.durationMs = Date.now() - t0;
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${OUT}.md`, markdown(report));
console.log(`wrote ${OUT}.json and ${OUT}.md`);
