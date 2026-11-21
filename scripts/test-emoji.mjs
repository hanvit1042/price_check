import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiFor, catLabel, HIDDEN } from '../docs/emoji.js';
test('이모지 매칭', () => {
  assert.equal(emojiFor('양파', '채소류'), '🧅');
  assert.equal(emojiFor('양배추', '채소류'), '🥬');
  assert.equal(emojiFor('방울토마토', '채소류'), '🍅');
  assert.equal(emojiFor('깐마늘(국산)', '채소류'), '🧄');
  assert.equal(emojiFor('배', '과일류'), '🍐');
  assert.equal(emojiFor('쇠고기', '축산물'), '🥩');
  assert.equal(emojiFor('알수없음', '수산물'), '🐟');
  assert.equal(catLabel('수산물'), '수산물');
  assert.ok(HIDDEN.has('장미'));
});
