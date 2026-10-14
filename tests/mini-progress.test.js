import assert from "node:assert/strict";
import test from "node:test";
import { MINI_TTL, miniSessionKey, restoreMiniProgress, moveMiniProgress, reshuffleMiniProgress } from "../src/mini-progress.js";

const cards = ["short:a", "blank:a", "short:b", "blank:c"].map(key => ({ key }));
const now = 1_800_000_000_000;
test("mini progress uses a separate subject/type scope and restores only live unique card keys", () => {
  assert.notEqual(miniSessionKey("seoyangsa", "mixed"), miniSessionKey("seoyangsa", "short"));
  assert.notEqual(miniSessionKey("seoyangsa", "short"), miniSessionKey("hanguksa", "short"));
  const saved = { version: 1, order: ["blank:a", "blank:a", "deleted", "short:a"], currentKey: "blank:a", side: "answer", round: 3, updatedAt: now - 1000 };
  const result = restoreMiniProgress(cards, saved, now, () => 0);
  assert.deepEqual(result.order.slice(0, 2), ["blank:a", "short:a"]);
  assert.deepEqual([...result.order].sort(), cards.map(card => card.key).sort());
  assert.equal(result.currentKey, "blank:a");
  assert.equal(result.side, "answer");
  assert.equal(result.round, 3);
  assert.equal(saved.order.length, 4);
});

test("expired, future, malformed and deleted-card sessions cannot restore a stale answer face", () => {
  const saved = { version: 1, order: cards.map(card => card.key), currentKey: cards[0].key, side: "answer", round: 2, updatedAt: now };
  for (const value of [null, {}, { ...saved, updatedAt: now - MINI_TTL }, { ...saved, updatedAt: now + 1 }, { ...saved, currentKey: "missing" }, { ...saved, version: 2 }]) {
    const result = restoreMiniProgress(cards, value, now, () => 0);
    assert.equal(result.side, "question");
    assert.ok(result.order.includes(result.currentKey));
    assert.equal(result.order.length, cards.length);
  }
  assert.equal(restoreMiniProgress(cards, { ...saved, updatedAt: now - MINI_TTL + 1 }, now).side, "answer");
});

test("one round visits every mixed card exactly once, then reshuffles without an immediate repeat", () => {
  let session = restoreMiniProgress(cards, null, now, () => 0);
  const seen = [];
  for (let i = 0; i < cards.length; i++) {
    seen.push(session.currentKey);
    session = moveMiniProgress({ ...session, side: "answer" }, 1, now + i, () => 0);
    assert.equal(session.side, "question");
  }
  assert.equal(new Set(seen).size, cards.length);
  assert.deepEqual([...seen].sort(), cards.map(card => card.key).sort());
  assert.notEqual(session.currentKey, seen.at(-1));
  assert.equal(session.round, 2);
  const shuffled = reshuffleMiniProgress(session, now, () => 0);
  assert.notEqual(shuffled.currentKey, session.currentKey);
  assert.deepEqual([...shuffled.order].sort(), [...session.order].sort());
});

test("previous stops at the first card and navigation always closes the answer", () => {
  const session = restoreMiniProgress(cards, null, now, () => 0);
  assert.equal(moveMiniProgress(session, -1, now).currentKey, session.currentKey);
  const next = moveMiniProgress(session, 1, now);
  const previous = moveMiniProgress({ ...next, side: "answer" }, -1, now);
  assert.equal(previous.currentKey, session.currentKey);
  assert.equal(previous.side, "question");
});
