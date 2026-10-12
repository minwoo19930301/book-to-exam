export function gradeOnEnter(event, grade, { disabled = false } = {}) {
  const native = event.nativeEvent || event;
  if (event.key !== "Enter" || event.defaultPrevented || native.isComposing || event.isComposing || native.keyCode === 229 || event.keyCode === 229) return;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  // Keep buttons and links keyboard-operable when this handler is on a card.
  if (event.target?.closest?.("button, a, select, summary")) return;
  event.preventDefault();
  if (!event.repeat && !disabled) grade();
}
