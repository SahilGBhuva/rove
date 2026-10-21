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
test('phone sheet uses visual viewport and handles keyboard resize',()=>{
 assert.match(app,/window\.visualViewport\?\.height/);
 assert.match(app,/window\.visualViewport\?\.addEventListener\('resize'/);
 assert.match(app,/setDetent\(state\.detent\)/);
});
test('map controls and search have accessible phone targets',()=>{
 assert.match(css,/min-width: 44px; min-height: 44px/);
 assert.match(css,/\.search-field input, \.plan-field input \{ font-size: 16px/);
 assert.match(html,/id="searchInput"/);
});
