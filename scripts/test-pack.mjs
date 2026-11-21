import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePack } from '../docs/pack.js';
test('포장 단위 품종', () => {
  assert.deepEqual(parsePack('20kg'), { qty: 20, label: '20kg' });
  assert.deepEqual(parsePack('10kg(햅쌀)'), { qty: 10, label: '10kg' });
  assert.deepEqual(parsePack('500g'), { qty: 0.5, label: '500g' });
  assert.equal(parsePack('백미'), null);
  assert.equal(parsePack('햇양파'), null);
  assert.equal(parsePack(''), null);
});
