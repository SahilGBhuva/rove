import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('experimental schedule-only preview does not offer unsupported arrive-by planning', () => {
  assert.match(app, /previewOnly = status\?\.engine === 'EXPERIMENTAL_SCHEDULE_ONLY'/);
  assert.match(app, /!previewOnly \? `<option value="arrive"/);
  assert.match(app, /option\[value="arrive"\]/);
});

test('preview planner explains unsupported dates and walking uncertainty', () => {
  assert.match(app, /This preview supports trips within the next 14 days/);
  assert.match(app, /walking routes and crossings are not independently verified/);
  assert.match(app, /status === 422/);
});

test('future journeys show actual trip duration rather than days until arrival', () => {
  assert.match(app, /const futureTrip = departure\.getTime\(\) > now/);
  assert.match(app, /Trip \$\{durationLabel\(nav\.it\.durationSeconds/);
  assert.match(app, /Scheduled arrival time has passed/);
});

test('destination suggestions use a region of buttons, not an invalid ARIA listbox', () => {
  assert.match(app, /id="planSuggest" class="plan-suggest" role="region"/);
  assert.doesNotMatch(app, /id="planSuggest" class="plan-suggest" role="listbox"/);
});
