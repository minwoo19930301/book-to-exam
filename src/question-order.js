// Store IDs, not array indexes: new releases can add or remove questions while
// keeping the student's existing random order and current question intact.
export function shuffleQuestions(questions, random = Math.random) {
  const result = [...questions];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  // A requested reshuffle should visibly change even a two-question bank.
  if (result.length > 1 && result.every((question, index) => question.id === questions[index].id)) result.push(result.shift());
  return result;
}

export function restoreQuestionOrder(questions, savedOrder, random = Math.random) {
  const remaining = new Map(questions.map(question => [question.id, question]));
  const restored = [];
  for (const id of Array.isArray(savedOrder) ? savedOrder : []) {
    if (!remaining.has(id)) continue;
    restored.push(remaining.get(id));
    remaining.delete(id);
  }
  return [...restored, ...shuffleQuestions([...remaining.values()], random)];
}
