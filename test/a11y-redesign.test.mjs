// Accessibility regression contracts for the v2 redesign (workstream E).
// Source-level and fast. Rove's core audience includes blind and low-vision riders, so these guard
// the things a visual redesign can silently break: the accessible mode staying on, the one-tap
// mode toggle, the sheet grabber, map control names, voice error semantics and typing fallback,
// the guided-trip safety rules, reduced motion in the new CSS files, colour contrast and targets.
//
// They are written to tolerate any legitimate implementation by the parallel workstreams. Checks
// that depend on a feature not merged yet (setMode / window.RoveMode, a grabber) skip with a reason
// on the base and start enforcing as soon as the feature lands.
// Runtime checks (overlap, clipping, keyboard reach, touch drag) live in docs/design/qa/design-qa.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

const path = rel => new URL(`../site/${rel}`, import.meta.url);
const read = rel => readFileSync(path(rel), 'utf8');
const app = read('app.js');
const html = read('index.html');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Body of a top-level `function name(` (or `async function`), up to the next top-level function. */
function fn(name) {
  const m = new RegExp(`\\n(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(app);
  if (!m) return null;
  const rest = app.slice(m.index + 1);
  const end = rest.slice(10).search(/\n(?:async\s+)?function\s+[\w$]+\s*\(/);
  return end < 0 ? rest : rest.slice(0, end + 10);
}
/* The balanced expression starting at `start` (handles strings, templates and comments). */
function balanced(src, start) {
  const open = src.slice(start).search(/[({[]/) + start;
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return src.slice(start, i + 1); }
  }
  return null;
}

/* ---------- Colour helpers (WCAG 2.x relative luminance) ---------- */
const hex = v => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16));
};
const lum = rgb => { const [r, g, b] = rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* ---------- 1. Accessible mode and the one-tap mode switch ---------- */

test('rove-accessible stays on the body: init adds it and nothing removes it', () => {
  const init = fn('init');
  assert.ok(init, 'init() exists');
  assert.match(init, /document\.body\.classList\.(add\(['"]rove-accessible['"]\)|toggle\(['"]rove-accessible['"],\s*true\))/, 'init() turns on the accessible layer');
  assert.doesNotMatch(app, /classList\.remove\([^)]*['"]rove-accessible['"]/, 'no code path removes rove-accessible');
  assert.doesNotMatch(app, /classList\.toggle\(['"]rove-accessible['"]\s*\)/, 'rove-accessible is never flipped off by a bare toggle');
  assert.doesNotMatch(app, /body\.className\s*=/, 'body.className is never overwritten (that would drop rove-accessible)');
});

test('mode switch (classic / audio-first) keeps rove-accessible and is a one-tap, named control', t => {
  const setMode = fn('setMode');
  if (!setMode && !/window\.RoveMode\s*=/.test(app)) { t.skip('setMode / window.RoveMode not merged yet (agent C)'); return; }
  const body = setMode || app;
  assert.doesNotMatch(body, /rove-accessible['"]\s*,\s*false|remove\([^)]*rove-accessible/, 'setMode never turns off rove-accessible');
  assert.match(body, /mode-(classic|audio)|dataset\.mode\s*=|setAttribute\(['"]data-mode/, 'setMode reflects the mode on the body (body.mode-* class or data-mode)');
  assert.match(app, /localStorage\.(setItem|getItem)\(\s*['"]rove-mode['"]/, "the chosen mode persists in localStorage 'rove-mode'");
  // The toggle: a native <button> (or radio) whose markup names the mode, reachable in one tap.
  const controls = [...(app + html).matchAll(/<(button|input)\b([^>]*(?:data-action=["'][^"']*mode[^"']*["']|data-mode=|data-set-mode|data-rove-mode)[^>]*)>([\s\S]{0,400}?)<\/button>|<input\b[^>]*type=["']radio["'][^>]*name=["'][^"']*mode[^"']*["'][^>]*>/gi)];
  assert.ok(controls.length >= 1, 'there is a mode toggle control (button or radio) in the markup');
  for (const c of controls) {
    if (c[1] !== 'button') continue;
    const attrs = c[2], inner = (c[3] || '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/\$\{[^}]*ICON[^}]*\}|\$\{rgIcon\([^)]*\)\}/g, '').replace(/<[^>]+>/g, '').trim();
    assert.ok(inner || /aria-label(ledby)?=/.test(attrs), `mode control has a name: ${attrs.trim().slice(0, 80)}`);
    assert.ok(/aria-pressed|aria-checked|aria-current|role=["'](radio|switch|menuitemradio)["']/.test(attrs) || /Switch to|mode/i.test(inner + attrs),
      'mode control exposes its state (aria-pressed/checked/current) or says what it switches to');
  }
});

/* ---------- 2. Bottom sheet grabber ---------- */

test('sheet grabber is a focusable, named control that works from the keyboard', t => {
  const m = /<([a-z]+)\b([^>]*(?:id=["']sheetGrabber["']|class=["'][^"']*\b(?:sheet-grabber|rg-grabber|grabber)\b[^"']*["'])[^>]*)>/i.exec(html + app);
  if (!m) { t.skip('no sheet grabber in the markup'); return; }
  const [, tag, attrs] = m;
  assert.ok(tag === 'button' || /role=["'](button|slider|separator|scrollbar)["']/.test(attrs), `grabber has an interactive role (got <${tag}${attrs.slice(0, 60)}>)`);
  assert.ok(tag === 'button' || /tabindex=["']0["']/.test(attrs), 'grabber is in the tab order');
  assert.match(attrs, /aria-label(ledby)?=["'][^"']{4,}/, 'grabber has an accessible name');
  const id = /id=["']([^"']+)["']/.exec(attrs)?.[1];
  const keyHandler = id && new RegExp(`(#|getElementById\\(['"])${id}['"\\)][^\\n]*keydown|${id}[\\s\\S]{0,200}addEventListener\\(['"]keydown`).test(app);
  const anyGrabKeys = /keydown[\s\S]{0,600}ArrowUp[\s\S]{0,300}ArrowDown/.test(app) || /ArrowUp[\s\S]{0,300}ArrowDown[\s\S]{0,300}(setDetent|detent)/.test(app);
  assert.ok(tag === 'button' || keyHandler || anyGrabKeys, 'grabber responds to ArrowUp / ArrowDown (or is a native button)');
  if (/role=["']slider["']/.test(attrs)) assert.match(app + attrs, /aria-valuetext|aria-valuenow/, 'a slider grabber reports its value');
});

/* ---------- 3. Map controls ---------- */

test('every map control and layer option has an accessible name; icons are hidden', () => {
  const start = html.indexOf('map-controls');
  assert.ok(start > 0, 'index.html still has a .map-controls block');
  const region = html.slice(html.lastIndexOf('<', start), html.indexOf('</main>') > start ? html.indexOf('</main>') : undefined);
  const buttons = [...region.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.ok(buttons.length >= 3, 'map controls are buttons');
  const unnamed = buttons.filter(([, attrs, inner]) => {
    if (/aria-label(ledby)?=["'][^"']+/.test(attrs) || /\btitle=["'][^"']+/.test(attrs)) return false;
    return !inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
  }).map(([, attrs]) => attrs.trim().slice(0, 60));
  assert.deepEqual(unnamed, [], 'map buttons without a name');
  const loudSvgs = [...region.matchAll(/<svg\b([^>]*)>/g)].filter(([, a]) => !/aria-hidden=["']true["']|role=["']img["'][^>]*aria-label/.test(a));
  assert.equal(loudSvgs.length, 0, 'decorative svgs in map controls are aria-hidden');
});

test('icon-only buttons rendered by app.js have an accessible name', () => {
  const offenders = [];
  for (const [, attrs, inner] of app.matchAll(/<button\b((?:[^>$]|\$\{[^}]*\})*)>([\s\S]{0,600}?)<\/button>/g)) {
    if (/aria-label(ledby)?=/.test(attrs) || /\btitle=/.test(attrs)) continue;
    const text = inner
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/\$\{\s*(rgIcon\([^)]*\)|[A-Z_]*ICON[A-Z_]*(\.[\w$]+|\[[^\]]*\]|\([^)]*\))?)\s*\}/g, '')
      .replace(/<[^>]+>/g, '').trim();
    if (!text) offenders.push(attrs.trim().slice(0, 80));
  }
  assert.deepEqual(offenders, [], 'add aria-label to these icon-only buttons');
});

/* ---------- 4. Voice errors ---------- */

const voiceStatus = fn('voiceStatusHtml') || '';

test('voice errors are announced (role=alert) and live states use role=status', () => {
  assert.ok(voiceStatus, 'voiceStatusHtml exists');
  const errorBranch = voiceStatus.slice(voiceStatus.indexOf("v.state === 'error'"));
  assert.ok(errorBranch.length > 20, 'voiceStatusHtml renders an error state');
  assert.match(errorBranch.slice(0, 2400), /role="alert"/, 'the error status is role=alert');
  for (const s of ['starting', 'listening', 'understanding']) {
    const at = voiceStatus.indexOf(`v.state === '${s}'`);
    assert.ok(at > 0, `voiceStatusHtml handles ${s}`);
    assert.match(voiceStatus.slice(at, voiceStatus.indexOf('\n', at)), /role="status"/, `${s} is role=status`);
  }
});

test('voice errors offer a typing fallback that reaches the destination field and never a download', () => {
  const errorBranch = voiceStatus.slice(voiceStatus.indexOf("v.state === 'error'"));
  const fallback = /href="#planTo"|for="planTo"|data-action="voice-type-instead"|data-action="voice-stop"[^>]*>[^<]*(Type|type)/.test(errorBranch);
  assert.ok(fallback, 'the error status offers "Type instead" that moves focus to #planTo');
  if (/data-action="voice-type-instead"/.test(errorBranch)) assert.match(app, /case 'voice-type-instead'[\s\S]{0,200}planTo/, 'voice-type-instead has a handler that focuses #planTo');
  assert.doesNotMatch(errorBranch, /data-action=["']voice-install|button\(\s*['"]voice-install|>[^<]*\bDownload\b|['"]Download\b/, 'riders are never offered a download');
  assert.match(errorBranch, /Try again/, 'retry is offered where it can help');
  // voiceFail still moves keyboard focus to the field for errors that need typing.
  assert.match(fn('voiceFail') || '', /#planTo/, 'voiceFail moves focus to the destination field');
});

test('voice error messages are accurate per cause (online vs offline, http, permission)', () => {
  const at = app.indexOf('const VOICE_ERRORS');
  assert.ok(at > 0, 'VOICE_ERRORS exists');
  const expr = balanced(app, app.indexOf('=', at) + 1);
  assert.ok(expr, 'VOICE_ERRORS is a single expression');
  const evalWith = ({ onLine = true, secure = true } = {}) => vm.runInNewContext(`(${expr})`, { navigator: { onLine }, window: { isSecureContext: secure }, Proxy });
  const online = evalWith();
  for (const code of ['not-allowed', 'audio-capture', 'no-speech', 'network', 'voice-service', 'unsupported', 'offline']) {
    assert.equal(typeof online[code], 'string', `VOICE_ERRORS['${code}'] is defined`);
    assert.ok(online[code].length <= 160, `VOICE_ERRORS['${code}'] stays short enough for an inline status`);
  }
  for (const code of ['network', 'voice-service', 'voice-busy', 'no-speech', 'not-allowed', 'audio-capture', 'unsupported']) {
    if (online[code]) assert.doesNotMatch(online[code], /offline|internet connection/i, `'${code}' while online never claims the rider is offline`);
  }
  assert.match(online.offline, /offline/i);
  assert.match(online['not-allowed'], /settings|allow/i, 'permission denied says how to turn the microphone back on');
  assert.match(online['audio-capture'], /microphone/i);
  assert.match(online['no-speech'], /hear/i);
  assert.match(online.unsupported, /browser/i);
  if ('voice-download' in online) assert.doesNotMatch(String(online['voice-download']), /download/i, "the 'voice-download' code never asks for a download");
  // Context-aware variants (only enforced if the implementation distinguishes them).
  const offline = evalWith({ onLine: false });
  if (offline.network !== online.network) assert.match(offline.network, /offline/i, 'network while truly offline says offline');
  const http = evalWith({ secure: false });
  if (http['not-allowed'] !== online['not-allowed']) assert.match(http['not-allowed'], /secure|https/i, 'insecure page explains https');
});

test('voice actions keep 48px targets and the error status does not overlay the form', () => {
  const css = stripComments(read('css/rg-voice.css'));
  const minHeights = [...css.matchAll(/\.rg-vx-button[^{]*\{[^}]*min-height:\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(minHeights.length >= 1 && minHeights.every(h => h >= 48), `voice buttons min-height >= 48px (got ${minHeights})`);
  for (const m of css.matchAll(/([^{}]*rg-voice-error[^{]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[2], /position:\s*(fixed|absolute)/, `voice error is inline, not an overlay (${m[1].trim()})`);
  }
});

test('the listening state is shown only from app state, never on its own', () => {
  // The status markup must come from state.plan.voice; nothing renders "Listening" unconditionally.
  assert.match(voiceStatus, /const v = state\.plan\.voice;\s*if \(!v\) return '';/);
  const listening = [...app.matchAll(/>Listening</g)].length + [...app.matchAll(/'Listening'/g)].length;
  assert.ok(listening >= 1);
  assert.doesNotMatch(app.replace(voiceStatus, ''), /data-vx="listening"/, 'listening markup only lives in voiceStatusHtml');
});

test('the speech bar only animates once audio really started and offers Stop / Dismiss', () => {
  const bar = fn('renderSpeechBar');
  assert.ok(bar, 'renderSpeechBar exists');
  assert.match(bar, /state === 'speaking'\s*\?[^:]*speech-bar-wave/, 'the moving bars render only in the speaking state');
  assert.match(bar, /data-speech-stop/);
  assert.match(bar, /data-speech-dismiss/);
  assert.match(bar, /announceAccess\(/, 'failures still reach screen readers');
});

/* ---------- 5. Guided trip safety ---------- */

test('Help / Confirm safety: Help hides Confirm, Confirm refuses while Help is open, focus moves to the heading', () => {
  const view = fn('viewNavigate') || '';
  assert.ok(view, 'viewNavigate exists');
  assert.match(view, /nav\.showHelp[\s\S]{0,200}\?\s*'<button[^']*rg-close-help[^']*data-action="rg-help"[^']*>Close help<\/button>'/, 'while Help is open the dock shows only Close help');
  assert.match(app, /case 'rg-confirm':[\s\S]{0,300}if \(nav\.showHelp && before\.kind !== 'arrive'\) break;/, 'confirm refuses while Help is open');
  assert.match(view, /id="rgHeading" tabindex="-1"/, 'the instruction heading can take focus');
  assert.match(fn('guideEnter') || '', /getElementById\('rgHeading'\)\?\.focus/, 'each step moves focus to #rgHeading');
  for (const name of ['onNavPosition', 'guideTick', 'updateGuideLive']) {
    const body = fn(name);
    if (body) assert.doesNotMatch(body, /type:\s*'CONFIRM'|nav\.i\+\+/, `${name} never confirms or advances a step (rider-confirmed only)`);
  }
  assert.match(view, /id="rgLive"/, 'the live tracking slot (#rgLive) is kept');
});

/* ---------- 6. Reduced motion in the new CSS files ---------- */

for (const file of ['css/rg-desktop.css', 'css/rg-map.css', 'css/rg-sheet.css', 'css/rg-live.css']) {
  test(`${file}: decorative motion is removed under prefers-reduced-motion`, t => {
    if (!existsSync(path(file))) { t.skip(`${file} not present`); return; }
    const css = stripComments(read(file));
    const hasReduce = /prefers-reduced-motion\s*:\s*reduce/.test(css);
    // Strip everything gated behind no-preference: that motion is already opt-in.
    let ungated = css;
    for (let at; (at = ungated.search(/@media[^{]*prefers-reduced-motion\s*:\s*no-preference[^{]*\{/)) >= 0;) {
      const block = balanced(ungated, at);
      ungated = ungated.slice(0, at) + ungated.slice(at + (block ? block.length : 1));
    }
    if (hasReduce) {
      // Whatever is inside a reduce block is the override itself.
      for (let at; (at = ungated.search(/@media[^{]*prefers-reduced-motion\s*:\s*reduce[^{]*\{/)) >= 0;) {
        const block = balanced(ungated, at);
        ungated = ungated.slice(0, at) + ungated.slice(at + (block ? block.length : 1));
      }
    }
    const withoutKeyframes = ungated.replace(/@(-webkit-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const animations = [...withoutKeyframes.matchAll(/(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^none\b/.test(v));
    const transitions = [...withoutKeyframes.matchAll(/(?:^|[;{\s])transition\s*:\s*([^;}]+)/g)].map(m => m[1].trim())
      .filter(v => !/^none\b/.test(v) && /\d+m?s\b/.test(v.replace(/var\([^)]*\)/g, '')));
    assert.ok(!animations.length || hasReduce, `${file} runs animations (${animations.slice(0, 3).join(' | ')}) without a prefers-reduced-motion: reduce override or no-preference gate`);
    assert.ok(!transitions.length || hasReduce, `${file} has transitions with literal durations (${transitions.slice(0, 3).join(' | ')}); use --m-* tokens or add a reduce override`);
    assert.doesNotMatch(withoutKeyframes, /scroll-behavior\s*:\s*smooth/, `${file}: smooth scrolling must be gated behind no-preference`);
    assert.doesNotMatch(withoutKeyframes, /animation[^;}]*\binfinite\b/, `${file}: looping animation must be gated behind no-preference`);
  });
}

/* ---------- 7. Colour contrast of the shared tokens (light and dark) ---------- */

test('shared colour tokens keep >= 4.5:1 text contrast in light and dark', () => {
  const order = [...html.matchAll(/href="((?:styles\.css|css\/rg-[\w-]+\.css))(?:\?[^"]*)?"/g)].map(m => m[1]).filter(f => existsSync(path(f)));
  const light = {}, dark = {};
  for (const file of order) {
    const css = stripComments(read(file));
    // :root rules outside media (light) and inside prefers-color-scheme: dark (dark).
    const darkBlocks = [];
    for (let i = 0, at; (at = css.slice(i).search(/@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/)) >= 0;) {
      const block = balanced(css, i + at);
      darkBlocks.push(block || '');
      i += at + (block ? block.length : 1);
    }
    let lightCss = css;
    for (const b of darkBlocks) lightCss = lightCss.replace(b, '');
    lightCss = lightCss.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const grab = (src, into) => { for (const r of src.matchAll(/:root\s*\{([^}]*)\}/g)) for (const d of r[1].matchAll(/(--rg-[\w-]+)\s*:\s*([^;]+)/g)) into[d[1]] = d[2].trim(); };
    grab(lightCss, light);
    for (const b of darkBlocks) grab(b, dark);
  }
  const darkTheme = { ...light, ...dark };
  const pairs = [['--rg-ink', '--rg-bg'], ['--rg-ink', '--rg-surface'], ['--rg-ink-2', '--rg-surface'], ['--rg-ink-2', '--rg-bg'],
    ['--rg-on-green', '--rg-green'], ['--rg-green', '--rg-surface'], ['--rg-warn', '--rg-warn-bg'], ['--rg-bad', '--rg-bad-bg'], ['--rg-bad', '--rg-surface']];
  const low = [];
  let checked = 0;
  for (const [name, theme] of [['light', light], ['dark', darkTheme]]) {
    for (const [fg, bg] of pairs) {
      const a = hex(theme[fg]), b = hex(theme[bg]);
      if (!a || !b) continue; // token not a plain hex (color-mix / var): covered by the runtime QA contrast pass
      checked++;
      const ratio = contrast(a, b);
      if (ratio < 4.5) low.push(`${name}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
    }
  }
  assert.ok(checked >= 10, `checked enough token pairs (${checked})`);
  assert.deepEqual(low, [], 'token pairs below 4.5:1');
});

/* ---------- 8. Zoom and focus basics that a redesign must not lose ---------- */

test('the page never disables zoom and keeps a visible focus style', () => {
  const viewport = /<meta[^>]*name=["']viewport["'][^>]*>/i.exec(html)?.[0] || '';
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i, 'pinch zoom stays available');
  const all = [read('styles.css'), ...['css/rg-tokens.css', 'css/rg-desktop.css', 'css/rg-sheet.css', 'css/rg-map.css'].filter(f => existsSync(path(f))).map(read)].map(stripComments).join('\n');
  assert.match(all, /:focus-visible/, 'a :focus-visible style exists');
  const killers = [...all.matchAll(/([^{}]*:focus(?!-within)(?:-visible)?[^{]*)\{([^}]*)\}/g)].filter(([, , body]) => /outline\s*:\s*(none|0)\b/.test(body) && !/box-shadow|border|background/.test(body));
  assert.deepEqual(killers.map(k => k[1].trim().slice(0, 80)), [], 'focus outlines are not removed without a replacement');
});
