import { shuffleQuestions } from "./question-order.js";

export const MINI_TTL = 30 * 24 * 60 * 60 * 1000;
export const miniSessionKey = (subject, type) => `bte-mini:v1:${subject}:${type}`;
const shuffled = (keys, random) => shuffleQuestions(keys.map(id => ({ id })), random).map(item => item.id);

export function restoreMiniProgress(cards, saved, now = Date.now(), random = Math.random) {
  const keys = [...new Set(cards.map(card => card.key))];
  const valid = saved?.version === 1 && Number.isFinite(saved.updatedAt) && saved.updatedAt <= now && now - saved.updatedAt < MINI_TTL;
  const available = new Set(keys), order = [];
  for (const key of valid && Array.isArray(saved.order) ? saved.order : []) {
    if (available.delete(key)) order.push(key);
  }
  order.push(...shuffled([...available], random));
  const currentKey = valid && order.includes(saved.currentKey) ? saved.currentKey : order[0];
  return { version: 1, order, currentKey,
    side: valid && currentKey === saved.currentKey && saved.side === "answer" ? "answer" : "question",
    round: valid && Number.isSafeInteger(saved.round) && saved.round > 0 ? saved.round : 1, updatedAt: now };
}

export function moveMiniProgress(session, direction, now = Date.now(), random = Math.random) {
  const index = session.order.indexOf(session.currentKey);
  if (direction < 0) return { ...session, currentKey: session.order[Math.max(0, index - 1)], side: "question", updatedAt: now };
  if (index < session.order.length - 1) return { ...session, currentKey: session.order[index + 1], side: "question", updatedAt: now };
  return reshuffleMiniProgress(session, now, random);
}

export function reshuffleMiniProgress(session, now = Date.now(), random = Math.random) {
  const order = shuffled(session.order, random);
  if (order.length > 1 && order[0] === session.currentKey) order.push(order.shift());
  return { ...session, order, currentKey: order[0], side: "question", round: session.round + 1, updatedAt: now };
}
