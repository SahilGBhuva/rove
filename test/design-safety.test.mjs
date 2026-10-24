// Design-safety contracts for the premium visual/motion redesign (workstream 8, QA).
// Fast, source-level checks that every design branch must keep passing. They are tolerant of
// new CSS and markup the design workstreams legitimately add, but strict on rider safety:
// reduced motion, no layout animation, Help never exposing Confirm, Confirm's accessible name,
// the decorative journey line staying hidden from screen readers, and big Confirm targets.
// Runtime checks (contrast, overlap, focus, frame times) live in docs/design/qa/design-qa.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import '../site/public/js/journey-guide.js';

const read = rel => readFileSync(new URL(`../site/${rel}`, import.meta.url), 'utf8');
const app = read('app.js');
const rgFiles = readdirSync(new URL('../site/css/', import.meta.url)).filter(f => /^rg-.*\.css$/.test(f)).sort();
const sheets = [...rgFiles.map(f => ({ name: `css/${f}`, rg: true, text: read(`css/${f}`) })), { name: 'styles.css', rg: false, text: read('styles.css') }];

/* ---------- Tiny CSS parser: enough for flat rules, @media, @supports and @keyframes. ---------- */
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
function blocks(css) {
  // Returns top-level items: { prelude, body } where body is the raw text inside the braces.
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    out.push({ prelude: css.slice(i, open).replace(/^[\s;]*/, '').trim(), body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}
/* Flatten into { selector, decls, media[], keyframes? } records. */
function rules(css, media = []) {
  const out = [];
  for (const b of blocks(css)) {
    if (/^@keyframes\s/i.test(b.prelude) || /^@-webkit-keyframes\s/i.test(b.prelude)) {
      out.push({ keyframes: b.prelude.split(/\s+/)[1], body: b.body, media });
    } else if (/^@(media|supports|layer|container)\b/i.test(b.prelude)) {
      out.push(...rules(b.body, [...media, b.prelude]));
    } else if (b.prelude.startsWith('@')) {
      continue;
    } else if (b.body.includes('{')) {
      // CSS nesting: treat nested rules as their own rules with a combined selector (approximate).
      out.push(...rules(b.body, media).map(r => (r.selector ? { ...r, selector: `${b.prelude} ${r.selector}` } : r)));
    } else {
      out.push({ selector: b.prelude, decls: decls(b.body), media });
    }
  }
  return out;
}
function decls(body) {
  const out = [];
  for (const part of body.split(';')) {
    const k = part.indexOf(':');
    if (k < 0) continue;
    out.push({ prop: part.slice(0, k).trim().toLowerCase(), value: part.slice(k + 1).trim() });
  }
  return out;
}
const isReduce = media => media.some(m => /prefers-reduced-motion\s*:\s*reduce/i.test(m));
const isNoPref = media => media.some(m => /prefers-reduced-motion\s*:\s*no-preference/i.test(m));
const selectorList = sel => sel.split(',').map(s => s.trim()).filter(Boolean);

const parsed = sheets.map(s => ({ ...s, rules: rules(stripComments(s.text)) }));
const allRules = parsed.flatMap(s => s.rules.map(r => ({ ...r, sheet: s.name, rg: s.rg })));
const reduceRules = allRules.filter(r => r.selector && isReduce(r.media));

/* Is there a universal reduced-motion kill switch (styles.css has one; nobody may edit it)? */
const globalKill = kind => reduceRules.some(r => selectorList(r.selector).includes('*') &&
  r.decls.some(d => d.prop === kind && /^none\s*!important$/i.test(d.value)));

const KILL = {
  animation: d => (d.prop === 'animation' && /^none\b/i.test(d.value)) || (d.prop === 'animation-name' && /^none\b/i.test(d.value)) ||
    (/^animation(-duration)?$/.test(d.prop) && /^0m?s\b/.test(d.value)),
  transition: d => (d.prop === 'transition' && /^none\b/i.test(d.value)) || (d.prop === 'transition-property' && /^none\b/i.test(d.value)) ||
    (/^transition(-duration)?$/.test(d.prop) && /^0m?s\b/.test(d.value))
};
/* A motion token (--m-*) is zeroed by rg-tokens.css under reduced motion, so motion timed by it is removed too. */
const tokensZeroed = reduceRules.filter(r => r.sheet === 'css/rg-tokens.css').flatMap(r => r.decls)
  .filter(d => /^--m-[\w-]+$/.test(d.prop) && /^0(m?s|px)?$/.test(d.value)).map(d => d.prop); // durations to 0ms, travel distances to 0px
const timedByZeroedToken = value => {
  const durations = value.match(/var\(\s*(--[\w-]+)/g)?.map(v => v.replace(/var\(\s*/, '')) || [];
  const literal = /(^|[\s,])\d*\.?\d+m?s\b/.test(value.replace(/var\([^)]*\)/g, ''));
  return durations.length > 0 && !literal && durations.every(t => tokensZeroed.includes(t));
};
/* An !important animation beats the universal `* { animation: none !important }` (a class selector is more
 * specific), so it needs its own !important reduced-motion override. */
function covered(rule, kind, value) {
  if (isNoPref(rule.media)) return 'only applies with no-preference';
  if (value && timedByZeroedToken(value)) return 'timed by a motion token zeroed under reduced motion';
  const important = value ? /!important/i.test(value) : rule.decls.some(d => d.prop.startsWith(kind) && /!important/i.test(d.value));
  const mine = selectorList(rule.selector);
  const local = reduceRules.some(r => r.decls.some(d => KILL[kind](d) && (!important || /!important/i.test(d.value))) &&
    selectorList(r.selector).some(s => mine.includes(s)));
  if (local) return 'reduced-motion override';
  if (!important && globalKill(kind)) return 'global reduced-motion kill switch in styles.css';
  return null;
}

const keyframesIn = s => new Set(s.rules.filter(r => r.keyframes).map(r => r.keyframes));
const rgKeyframes = new Set(parsed.filter(s => s.rg).flatMap(s => [...keyframesIn(s)]));
const allKeyframes = new Set(parsed.flatMap(s => [...keyframesIn(s)]));

test('styles.css keeps the universal reduced-motion kill switch (animation and transition)', () => {
  assert.ok(globalKill('animation'), '@media (prefers-reduced-motion: reduce) { * { animation: none !important } } must remain');
  assert.ok(globalKill('transition'), '@media (prefers-reduced-motion: reduce) { * { transition: none !important } } must remain');
});

test('rg-tokens.css zeroes every motion duration token under reduced motion', () => {
  const tokens = parsed.find(s => s.name === 'css/rg-tokens.css');
  assert.ok(tokens, 'rg-tokens.css exists');
  const defined = tokens.rules.filter(r => r.selector && !r.media.length).flatMap(r => r.decls).filter(d => /^--m-/.test(d.prop)).map(d => d.prop);
  assert.ok(defined.length >= 4, 'motion tokens defined');
  for (const t of defined) assert.ok(tokensZeroed.includes(t), `${t} is set to 0 (ms or px) under prefers-reduced-motion: reduce`);
});

test('every animation that uses a keyframe (rg-*.css and styles.css) is removed under reduced motion', () => {
  const problems = [];
  for (const r of allRules) {
    if (!r.selector || isReduce(r.media)) continue;
    for (const d of r.decls) {
      if (d.prop !== 'animation' && d.prop !== 'animation-name') continue;
      if (/^none\b/i.test(d.value)) continue;
      const names = [...allKeyframes].filter(k => new RegExp(`(^|[\\s,])${k.replace(/[-]/g, '\\-')}($|[\\s,])`).test(d.value));
      if (!names.length) continue;
      if (!covered(r, 'animation', d.prop === 'animation' ? d.value : null)) problems.push(`${r.sheet}: "${r.selector}" animates ${names.join(', ')}`);
    }
  }
  assert.deepEqual(problems, [], 'add a prefers-reduced-motion: reduce override for these');
});

test('every keyframe defined in rg-*.css is used only where reduced motion removes it', () => {
  // Also catches keyframes applied from styles.css or inline style= in app.js.
  const problems = [];
  for (const k of rgKeyframes) {
    const users = allRules.filter(r => r.selector && !isReduce(r.media) && r.decls.some(d => /^animation(-name)?$/.test(d.prop) && new RegExp(`(^|[\\s,])${k}($|[\\s,])`).test(d.value)));
    for (const r of users) if (!covered(r, 'animation')) problems.push(`${k} via "${r.selector}" (${r.sheet})`);
    if (new RegExp(`animation(-name)?\\s*:[^;"'\`]*\\b${k}\\b`).test(app) && !globalKill('animation')) problems.push(`${k} applied inline in app.js`);
  }
  assert.deepEqual(problems, []);
});

test('every transition in rg-*.css is removed under reduced motion', () => {
  const problems = [];
  for (const s of parsed.filter(x => x.rg)) for (const r of s.rules) {
    if (!r.selector || isReduce(r.media)) continue;
    for (const d of r.decls) {
      if (!/^transition(-duration)?$/.test(d.prop) || /^none\b/i.test(d.value)) continue;
      if (!covered({ ...r, sheet: s.name }, 'transition', d.value)) problems.push(`${s.name}: "${r.selector}" transition: ${d.value}`);
    }
  }
  assert.deepEqual(problems, []);
});

/* ---------- No layout animation in the design files ---------- */
const LAYOUT = /^(width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset(-[\w-]+)?|margin(-[\w-]+)?|padding(-[\w-]+)?|all)$/;
const transitionProps = d => {
  if (d.prop === 'transition-property') return d.value.split(',').map(x => x.trim().toLowerCase());
  if (d.prop === 'transition') return d.value.split(/,(?![^(]*\))/).map(x => x.trim().split(/\s+/)[0].toLowerCase()).filter(p => p && !/^\d|^var\(|^none$/.test(p));
  return [];
};

test('no rg-*.css file animates layout properties (width/height/top/left/margin/padding) in transitions', () => {
  const problems = [];
  for (const s of parsed.filter(x => x.rg)) for (const r of s.rules) {
    if (!r.selector) continue;
    for (const d of r.decls) for (const p of transitionProps(d)) if (LAYOUT.test(p)) problems.push(`${s.name}: "${r.selector}" transitions ${p}`);
  }
  assert.deepEqual(problems, [], 'animate transform/opacity instead (transition: all also counts, because it includes layout)');
});

test('no rg-*.css keyframes animate layout properties', () => {
  const problems = [];
  for (const s of parsed.filter(x => x.rg)) for (const r of s.rules) {
    if (!r.keyframes) continue;
    for (const step of blocks(r.body)) for (const d of decls(step.body)) {
      if (LAYOUT.test(d.prop) && d.prop !== 'all') problems.push(`${s.name}: @keyframes ${r.keyframes} animates ${d.prop}`);
    }
  }
  assert.deepEqual(problems, []);
});

/* ---------- Trip-screen safety in app.js ---------- */
const fn = name => { const start = app.indexOf(`function ${name}(`); assert.ok(start >= 0, `${name} exists`); const next = app.indexOf('\nfunction ', start + 10); return app.slice(start, next < 0 ? undefined : next); };
const actionCase = name => { const start = app.indexOf(`case '${name}':`); assert.ok(start >= 0, `case ${name}`); const end = app.indexOf('\n    case ', start + 10); return app.slice(start, end < 0 ? start + 3000 : end); };

test('Help overlay: while Help is open the dock offers Close help and no Confirm', () => {
  const view = fn('viewNavigate');
  // The Close help markup must be the "Help open" branch of a showHelp condition, and contain no Confirm.
  const m = view.match(/showHelp[^?;]*\?\s*(?:\/\/[^\n]*\n\s*)*(['"`])((?:(?!\1)[\s\S])*?Close help(?:(?!\1)[\s\S])*?)\1\s*:/);
  assert.ok(m, 'Close help is rendered only in the showHelp branch of viewNavigate');
  assert.match(m[2], /data-action="rg-help"/, 'Close help toggles help');
  assert.doesNotMatch(m[2], /rg-confirm/, 'no Confirm while Help is open');
  assert.match(m[2], /aria-expanded="true"/);
  // Close help appears nowhere else in viewNavigate (only while Help is open).
  assert.equal(view.split('Close help').length - 1, 1, 'Close help is rendered in exactly one place');
});

test('Confirm handler refuses to confirm while Help is open, and Help toggling moves focus sensibly', () => {
  assert.match(actionCase('rg-confirm'), /if \(nav\.showHelp && [^)]*\) break;/);
  const help = actionCase('rg-help');
  assert.match(help, /nav\.showHelp = !nav\.showHelp/);
  assert.match(help, /rgHelpHeading/);
  assert.match(help, /\.rg-confirm/);
});

test('Confirm keeps data-phase and an aria-label that contains its visible label', () => {
  const view = fn('viewNavigate');
  const tag = view.match(/<button\b[^>]*class="[^"]*\brg-confirm\b[^"]*"[^>]*>/);
  assert.ok(tag, 'Confirm button markup found');
  assert.match(tag[0], /data-phase="\$\{[^}]+\}"/, 'data-phase binds the phase index (stale-tap guard)');
  assert.match(tag[0], /data-action="rg-confirm"/);
  const label = tag[0].match(/aria-label="([^"]*)"/);
  if (label) assert.match(label[1], /confirmAria/, 'aria-label comes only from phase.confirmAria');

  const G = globalThis.RoveJourneyGuide;
  const t0 = Date.parse('2026-10-23T08:15:00-07:00'), MIN = 60000;
  const it = {
    id: 'qa', startTime: t0, endTime: t0 + 40 * MIN,
    legs: [
      { mode: 'WALK', from: { name: 'Start' }, to: { name: 'Powell St' }, startTime: t0, endTime: t0 + 5 * MIN, distanceMeters: 300, steps: [] },
      { mode: 'TRANSIT', transitMode: 'RAIL', agencyId: 'bart', routeName: 'Blue', headsign: 'Dublin', from: { name: 'Powell St', platform: '1' }, to: { name: '12th St Oakland' }, startTime: t0 + 7 * MIN, endTime: t0 + 20 * MIN, intermediateStops: [{}, {}], steps: [] },
      { mode: 'TRANSIT', transitMode: 'BUS', agencyId: 'act', routeName: '51A', headsign: 'Fruitvale', from: { name: '12th St Oakland' }, to: { name: 'Lake Merritt' }, startTime: t0 + 25 * MIN, endTime: t0 + 35 * MIN, steps: [] },
      { mode: 'WALK', from: { name: 'Lake Merritt' }, to: { name: 'Destination' }, startTime: t0 + 35 * MIN, endTime: t0 + 40 * MIN, distanceMeters: 200, steps: [] }
    ]
  };
  const guide = G.buildGuide(it, { destinationName: 'Destination' });
  assert.ok(guide.phases.some(p => p.confirmAria), 'some phases carry a fuller spoken label');
  for (const p of guide.phases) {
    assert.ok(p.confirmLabel, `${p.kind} has a visible label`);
    if (p.confirmAria) assert.ok(p.confirmAria.toLowerCase().includes(p.confirmLabel.toLowerCase()), `"${p.confirmAria}" contains "${p.confirmLabel}" (WCAG 2.5.3 label in name)`);
  }
});

test('the decorative journey line (.rg-jl) stays aria-hidden', () => {
  const line = fn('journeyLineHtml');
  const tags = [...line.matchAll(/<[a-z]+\b[^>]*class="rg-jl(?:\s[^"]*)?"[^>]*>/g)].map(m => m[0]);
  assert.ok(tags.length >= 1, 'journeyLineHtml renders a .rg-jl container');
  for (const t of tags) assert.match(t, /aria-hidden="true"/, `${t} must be aria-hidden`);
  assert.doesNotMatch(line, /\b(role|aria-label|tabindex)=/, 'no accessible role, name or focus stop inside the decorative line');
});

const toPx = v => { const m = String(v).match(/^(\d*\.?\d+)(px|rem|em)?\b/); if (!m) return null; return m[2] === 'rem' || m[2] === 'em' ? Number(m[1]) * 16 : Number(m[1]); };
// Pseudo-elements (e.g. the icon in .rg-confirm::before) are not the button's tap target.
const targetsConfirm = sel => !/::?(before|after|marker)\b/.test(sel) && /\.rg-confirm(?![\w-])/.test(sel.replace(/:not\([^)]*\)/g, ''));

test('Confirm keeps a minimum height of at least 64px everywhere it is sized', () => {
  const sizes = [];
  for (const r of allRules) {
    if (!r.selector || !selectorList(r.selector).some(targetsConfirm)) continue;
    for (const d of r.decls) if (/^(min-height|height|max-height|block-size|min-block-size)$/.test(d.prop)) sizes.push({ where: `${r.sheet}: "${r.selector}"`, prop: d.prop, value: d.value, px: toPx(d.value) });
  }
  const mins = sizes.filter(s => s.prop === 'min-height' || s.prop === 'min-block-size');
  assert.ok(mins.some(s => s.px >= 64), '.rg-confirm has a min-height of at least 64px');
  const small = sizes.filter(s => s.px != null && s.px < 64 && !/auto|none|fit|max|min-content/.test(s.value));
  assert.deepEqual(small.map(s => `${s.where} ${s.prop}: ${s.value}`), [], 'nothing shrinks Confirm below 64px');
});

test('Close help and the dock secondary buttons keep phone-sized targets (>= 48px)', () => {
  for (const cls of ['rg-close-help', 'rg-secondary']) {
    const mins = allRules.filter(r => r.selector && selectorList(r.selector).some(s => new RegExp(`\\.${cls}(?![\\w-])`).test(s)))
      .flatMap(r => r.decls.filter(d => d.prop === 'min-height').map(d => ({ where: `${r.sheet}: "${r.selector}"`, px: toPx(d.value) })));
    assert.ok(mins.some(m => m.px >= 48), `.${cls} has a min-height >= 48px`);
    assert.deepEqual(mins.filter(m => m.px != null && m.px < 48).map(m => m.where), [], `.${cls} never below 48px`);
  }
});
