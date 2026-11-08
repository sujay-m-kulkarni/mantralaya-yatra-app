// Run with: node --test .github/scripts/
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bumpFromLabels, latestVersion, nextVersion } from './next-version.mjs';

test('a label picks the part that goes up', () => {
  assert.equal(nextVersion(['app-v1.4.2'], ['release: major'], 'app-v', '0.1.0'), '2.0.0');
  assert.equal(nextVersion(['app-v1.4.2'], ['release: minor'], 'app-v', '0.1.0'), '1.5.0');
  assert.equal(nextVersion(['app-v1.4.2'], [], 'app-v', '0.1.0'), '1.4.3');
  assert.equal(nextVersion(['app-v1.4.2'], ['bug', 'documentation'], 'app-v', '0.1.0'), '1.4.3');
});

test('major wins when both labels are on, whatever the case', () => {
  assert.equal(bumpFromLabels(['release: minor', 'release: major']), 'major');
  assert.equal(bumpFromLabels([' Release: Minor ']), 'minor');
});

test('the app and the API keep separate versions', () => {
  const tags = ['app-v1.4.2', 'api-v0.9.0', 'api-v0.10.1', 'app-v1.10.0'];
  assert.deepEqual(latestVersion(tags, 'app-v'), [1, 10, 0]);
  assert.deepEqual(latestVersion(tags, 'api-v'), [0, 10, 1]);
  assert.equal(nextVersion(tags, ['release: minor'], 'api-v', '0.1.0'), '0.11.0');
});

test('pre-release and unrelated tags are ignored', () => {
  assert.equal(latestVersion(['app-v0.1.0-build.41', 'v1.0.0', 'nightly'], 'app-v'), null);
});

test('the first release of a part is the version written in the code', () => {
  assert.equal(nextVersion([], [], 'api-v', '0.1.0'), '0.1.0');
  assert.equal(nextVersion(['app-v2.0.0'], ['release: major'], 'api-v', '0.1.0'), '0.1.0');
  assert.throws(() => nextVersion([], [], 'api-v', ''));
});
