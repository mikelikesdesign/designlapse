import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitSteps, renderStep, stepValues, stripSteps, add, iterate, build, list } from '../src/index.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'designlapse.js');
const DOC = `<!doctype html><html><head><style>.a > .b{color:red}</style></head><body>
<div class="status">9:41</div>
<div class="cover" data-step="1"><button data-step="2">back</button><img src="x.png" data-step="2"></div>
<div class="avatar" data-step='3'>AM</div>
<p data-step=4>Bio with <b>bold</b> text</p>
<ul data-step="5"><li>one</li><li>two</li></ul>
</body></html>`;

test('finds the step numbers in order', () => {
  assert.deepEqual(stepValues(DOC), [1, 2, 3, 4, 5]);
});

test('each step keeps earlier pieces, drops later ones, and marks the new piece', () => {
  const s1 = renderStep(DOC, 1);
  assert.match(s1, /<div data-lapse="new" class="cover">/);
  assert.doesNotMatch(s1, /back|x\.png|AM|Bio|<ul/);
  assert.match(s1, /9:41/);
  const s2 = renderStep(DOC, 2);
  assert.match(s2, /<button data-lapse="new">back<\/button>/);
  assert.match(s2, /<img data-lapse="new" src="x.png">/);
  assert.match(s2, /<div class="cover"><button/);
  const s4 = renderStep(DOC, 4);
  assert.match(s4, /<p data-lapse="new">Bio with <b>bold<\/b> text<\/p>/);
  assert.doesNotMatch(s4, /<ul/);
});

test('the last step is the final design without data-step attributes', () => {
  const steps = splitSteps(DOC);
  assert.equal(steps.length, 5);
  assert.equal(steps[4].replace(/ data-lapse="new"/g, ''), stripSteps(DOC));
  assert.doesNotMatch(steps[4], /data-step/);
  assert.match(steps[4], /\.a > \.b\{color:red\}/, 'CSS is left alone');
});

test('an untagged design is one step', () => {
  assert.equal(splitSteps('<html><body><h1>Hi</h1></body></html>').length, 1);
});

test('add, iterate (branch) and build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'designlapse-'));
  const final = path.join(dir, 'final.html');
  fs.writeFileSync(final, DOC);
  const designs = path.join(dir, 'designs');
  const r = add(final, { dir: designs, title: 'User profile', prompt: 'Design a profile' });
  assert.equal(r.name, 'user-profile');
  assert.equal(r.steps, 5);
  assert.throws(() => add(final, { dir: designs, title: 'User profile' }), /already exists/);

  const changed = path.join(dir, 'changed.html');
  fs.writeFileSync(changed, '<html><body>changed</body></html>');
  const it = iterate('user-profile', changed, { dir: designs, from: '3' });
  assert.deepEqual([it.id, it.parent, it.branch], ['6', '3', true]);
  const next = iterate('user-profile', changed, { dir: designs });
  assert.deepEqual([next.id, next.parent, next.branch], ['7', '6', false]);
  assert.throws(() => iterate('user-profile', changed, { dir: designs, from: '99' }), /no step 99/);

  add(final, { dir: designs, title: 'Settings', frame: 'browser' });
  assert.deepEqual(list({ dir: designs }).map(d => d.name), ['user-profile', 'settings']);

  const b = build({ dir: designs, current: 'user-profile' });
  assert.deepEqual(b.warnings, []);
  const page = fs.readFileSync(b.file, 'utf8');
  const data = JSON.parse(page.match(/<script id="flow-data" type="application\/json">([\s\S]*?)<\/script>/)[1].replace(/<\\\//g, '</'));
  assert.equal(data.current, 'user-profile');
  assert.deepEqual(data.designs.map(d => [d.slug, d.steps.length]), [['user-profile', 7], ['settings', 5]]);
  assert.equal(data.designs[0].steps[5].parent, '3');
  assert.doesNotMatch(page, /__FLOW_DATA__/);
});

test('CLI: add, iterate, list, errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'designlapse-cli-'));
  fs.writeFileSync(path.join(dir, 'final.html'), DOC);
  const run = (...a) => execFileSync(process.execPath, [BIN, ...a], { cwd: dir, encoding: 'utf8' });
  assert.match(run('add', 'final.html', '--title', 'Profile'), /Added "profile" with 5 steps/);
  assert.match(run('iterate', 'profile', 'final.html', '--from', '2'), /Added step 6 to "profile", branching from step 2/);
  assert.match(run('list'), /step 6 \(from 2\)/);
  assert.ok(fs.existsSync(path.join(dir, 'designs', 'designlapse.html')));
  assert.throws(() => run('iterate', 'nope', 'final.html'), /No design named "nope"/);
  assert.match(run('instructions'), /# Designlapse — instructions for AI agents/);
});

test('dev server serves the page with live reload and rebuilds on change', async () => {
  const { dev } = await import('../src/index.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'designlapse-dev-'));
  const final = path.join(dir, 'final.html');
  fs.writeFileSync(final, DOC);
  const designs = path.join(dir, 'designs');
  add(final, { dir: designs, title: 'Profile' });
  const logs = [];
  const d = dev({ dir: designs, port: 0, log: m => logs.push(m) });
  await new Promise(r => d.server.once('listening', r));
  const base = `http://127.0.0.1:${d.server.address().port}`;
  try {
    const page = await (await fetch(base + '/')).text();
    assert.match(page, /new EventSource\('\/__designlapse\/events'\)/);
    assert.ok(page.lastIndexOf('EventSource') > page.indexOf('id="flow-data"'), 'reload script goes at the end');
    assert.equal((await fetch(base + '/profile/01.html')).status, 200);
    assert.equal((await fetch(base + '/../../etc/passwd')).status, 404);
    fs.appendFileSync(path.join(designs, 'profile', '02.html'), '\n');
    await new Promise(r => setTimeout(r, 600));
    assert.ok(logs.some(l => l.startsWith('rebuilt')), 'rebuilds after a change');
  } finally {
    d.close();
  }
});
