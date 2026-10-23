import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
test('phone viewport supports safe areas, without disabling zoom',()=>{
 assert.match(html,/viewport-fit=cover/);
 assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/max-width: 767px/);
});
test('unified phone layout fills the dynamic viewport and handles keyboard resizing',()=>{
 assert.match(css,/height:100dvh/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/safe-area-inset-top/);
 assert.match(app,/window\.addEventListener\('resize'/);
});
test('map controls and search have accessible phone targets',()=>{
 assert.match(css,/\.rove-accessible button,\.rove-accessible input\{min-height:48px\}/);
 assert.match(css,/\.search-field input, \.plan-field input \{ font-size: 16px/);
 assert.match(html,/id="searchInput"/);
});
