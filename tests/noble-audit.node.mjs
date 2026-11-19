/* What "audited" covers for the @noble/ciphers this lab ships.
 *
 * The README introduced the PRG as "real AES-128-CTR from the audited
 * `@noble/ciphers` library", with no version. The library records its latest
 * independent audit as "at version 1.0.0, in Sep 2024, independently, by
 * [cure53]", scope "everything"; this lab pins ^2.0.1 -- a major version past
 * it -- and the lockfile resolves a 2.x release.
 *
 * The same check as crypto-lab-musig-gate's src/musig/noble-audit.test.ts. It
 * is a node:test file rather than a vitest one because this lab's tsconfig
 * type-checks everything under src/ without Node types, and the check needs
 * the filesystem.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const flat = (text) => text.replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ');

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const nobleReadme = read('node_modules/@noble/ciphers/README.md');

test('the lab pins a major version later than the latest audit @noble/ciphers records', () => {
  assert.equal(pkg.dependencies['@noble/ciphers'], '^2.0.1');
  assert.match(lock.packages['node_modules/@noble/ciphers'].version, /^2\./);
  assert.ok(nobleReadme.includes('The library has been audited'));
  assert.match(nobleReadme, /at version 1\.0\.0, in Sep 2024, independently, by \[cure53\]/);
  // If the library records an audit of a 2.x release, the README sentence
  // checked below is out of date, and this fails rather than passing quietly.
  assert.doesNotMatch(nobleReadme, /at version 2\.\d+\.\d+, in [A-Z]/);
});

test('the README names the audited version and never says just "audited"', () => {
  const readme = flat(read('README.md'));
  assert.ok(!readme.includes('from the audited `@noble/ciphers`'));
  assert.doesNotMatch(readme, /\baudited\s+`?@noble\/ciphers/);
  assert.ok(readme.includes('at version 1.0.0, in Sep 2024, independently, by [cure53]'));
  assert.match(readme, /\^2\.0\.1/);
  assert.ok(readme.includes('not the audited one'));
});

test('the one source file that imports the library makes no audit claim of its own', () => {
  const prg = read('src/dpf/prg.ts');
  assert.match(prg, /from '@noble\/ciphers\/aes\.js'/);
  assert.doesNotMatch(flat(prg), /\baudited\b/);
});
