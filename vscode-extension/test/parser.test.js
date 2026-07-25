'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeDotenv,
  applyMaskForPreview,
  buildMaskRanges,
  compileKeyPattern,
  finalCommentLabel,
  splitValueComment,
} = require('../src/parser');

function masked(input, config = {}) {
  const analysis = analyzeDotenv(input, config);
  const ranges = buildMaskRanges(input, analysis.secrets, config);
  return applyMaskForPreview(input, ranges);
}

test('explicit secret marker', () => {
  assert.equal(
    masked('PASSWORD=correct-horse-battery-staple # secret', { autoDetect: false }),
    'PASSWORD=cor...ple # secret',
  );
});

test('marker names are case insensitive', () => {
  assert.equal(
    masked('VALUE=abcdefghij # SHADOW', { autoDetect: false }),
    'VALUE=abc...hij # SHADOW',
  );
});

test('automatic token detection', () => {
  assert.equal(masked('GITHUB_TOKEN=ghp_1234567890abcdef'), 'GITHUB_TOKEN=ghp...def');
});

test('public marker overrides automatic detection', () => {
  assert.equal(masked('DEMO_PASSWORD=not-sensitive # public'), 'DEMO_PASSWORD=not-sensitive # public');
});

test('quoted values and comments are preserved', () => {
  assert.equal(
    masked('export API_KEY = "abcdefghij" # deployment key # secret'),
    'export API_KEY = "abc...hij" # deployment key # secret',
  );
});

test('hash inside quoted value is not treated as comment', () => {
  assert.equal(masked('PASSWORD="abc#123#xyz" # secret'), 'PASSWORD="abc...xyz" # secret');
});

test('short secrets are fully masked', () => {
  assert.equal(masked('PIN=1234 # secret', { autoDetect: false }), 'PIN=... # secret');
});

test('custom visible widths', () => {
  assert.equal(
    masked('TOKEN=abcdefghij # secret', { autoDetect: false, keepStart: 2, keepEnd: 2 }),
    'TOKEN=ab...ij # secret',
  );
});

test('database URL is detected', () => {
  assert.equal(
    masked('DATABASE_URL=postgres://user:password@host/db'),
    'DATABASE_URL=pos.../db',
  );
});

test('multiline secret creates ranges on each content line', () => {
  const input =
    'PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nvery-secret-key-material\n-----END PRIVATE KEY-----" # secret';
  const analysis = analyzeDotenv(input);
  const ranges = buildMaskRanges(input, analysis.secrets);

  assert.equal(analysis.secrets.length, 1);
  assert.equal(analysis.secrets[0].multiline, true);
  assert.equal(ranges.length, 3);
  assert.ok(ranges.every((range) => !input.slice(range.start, range.end).includes('\n')));
});

test('public marker preserves multiline value', () => {
  const input = 'PRIVATE_KEY="first line\nsecond line" # public';
  assert.equal(analyzeDotenv(input).secrets.length, 0);
});

test('unterminated multiline secret is protected through end of document', () => {
  const input = 'PRIVATE_KEY="first line\nsecond line';
  const analysis = analyzeDotenv(input);
  assert.equal(analysis.secrets.length, 1);
  assert.equal(analysis.secrets[0].unterminated, true);
  assert.equal(analysis.secrets[0].end, input.length);
});

test('automatic detection can be disabled', () => {
  assert.equal(analyzeDotenv('API_TOKEN=abcdefghij', { autoDetect: false }).secrets.length, 0);
});

test('invalid key regex falls back safely', () => {
  const compiled = compileKeyPattern('[');
  assert.equal(compiled.usedFallback, true);
  assert.equal(compiled.regex.test('PASSWORD'), true);
});

test('comment parser requires whitespace before hash outside quotes', () => {
  assert.deepEqual(splitValueComment('abc#123 # secret'), {
    value: 'abc#123 ',
    comment: '# secret',
    commentStart: 8,
  });
});

test('last comment token determines marker', () => {
  assert.equal(finalCommentLabel('# deployment key # blur'), 'blur');
});
