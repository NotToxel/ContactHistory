export function contactRowWindow(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  sectionTop: number,
  rowHeight: number,
) {
  if (count <= 200) return { start: 0, end: count };
  const start = Math.min(
    count - 1,
    Math.max(0, Math.floor((scrollTop - sectionTop) / rowHeight) - 12),
  );
  const end = Math.min(
    count,
    Math.max(start + 1, Math.ceil((scrollTop + viewportHeight - sectionTop) / rowHeight) + 12),
  );
  return { start, end };
}
