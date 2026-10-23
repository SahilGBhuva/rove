import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
test('phone viewport supports safe areas without disabling zoom',()=>{
 assert.match(html,/viewport-fit=cover/);
 assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/100dvh/);
});
test('mobile journey is primary and map overlays are hidden',()=>{
 assert.match(css,/body \.map-area\{display:none!important\}/);
 assert.match(css,/\.map-controls, \.map-pick, \.layers-popover, \.map-mobile-brand \{ display: none !important; \}/);
 assert.ok(app.includes('if (window.innerWidth > 800) sections.push(`'));
 assert.ok(app.includes("if (window.innerWidth <= 800) {\n    announceAccess('Use the accessible search field"));
});
test('screen-reader heading focus does not draw giant blue rectangle',()=>{
 assert.match(css,/\[tabindex="-1"\]:focus\{outline:none;box-shadow:none\}/);
 assert.match(app,/target\.focus\(\{preventScroll:true\}\)/);
 assert.match(css,/\.rove-accessible button:focus-visible/);
});
test('one main landmark contains journey controls',()=>{
 assert.equal((html.match(/<main\b/g)||[]).length,1);
 assert.equal((html.match(/<aside\b/g)||[]).length,0);
 assert.match(html,/<main class="panel" id="panel" aria-label="Transit journey">/);
 assert.match(html,/id="searchInput"/);
 assert.match(css,/\.rove-accessible button,\.rove-accessible input\{min-height:48px\}/);
});
