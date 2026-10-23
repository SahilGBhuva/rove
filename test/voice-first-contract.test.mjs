import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
test('home and planner expose voice destination entry without replacing typed search',()=>{
  assert.match(app,/aria-label="Speak a destination using the microphone"/);
  assert.match(app,/aria-label="Speak your destination"/);
  assert.match(app,/id="\$\{id\}" data-plan-field="\$\{which\}"/);
  assert.match(app,/e\.error === 'not-allowed'/);
});
test('navigation retains explicit boarding and exit confirmation',()=>{
  assert.match(app,/nav-board/);
  assert.match(app,/"I've exited"/);
  assert.match(app,/if \(current\?\.type === 'wait' && !state\.nav\.boarded\)/);
  assert.match(app,/if \(current\?\.type === 'ride' && !state\.nav\.boarded\)/);
  assert.match(app,/GPS proximity is advisory, never proof of exit/);
});
test('foreground-first speech and minimal controls',()=>{
  assert.match(app,/document\.hidden\) return/);
  assert.match(app,/Repeat instruction/);
  assert.match(app,/data-action="nav-help"/);
  assert.match(css,/\.rove-nav-primary/);
  assert.match(html,/styles\.css\?v=32/);
});

test('boarding advances once, and instructions identify stops without GPS safety claims',()=>{
  assert.match(app,/following\?\.type === 'ride' && following\.leg === nav\.steps\[nav\.i\]\.leg/);
  assert.match(app,/function currentNavInstruction/);
  assert.match(app,/GPS cannot verify the exit/);
  assert.match(app,/function focusNavAction/);
  assert.match(app,/tracking and speech may have paused in the background/);
});
