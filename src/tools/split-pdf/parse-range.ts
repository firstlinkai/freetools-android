/**
 * Parses a page-range expression like "1-3, 5, 8-10" into a sorted list of
 * unique zero-based page indices, validated against the document page count.
 */
export function parsePageRanges(
  input: string,
  pageCount: number,
): { pages: number[] } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Enter at least one page or range." };

  const result = new Set<number>();
  const parts = trimmed.split(",");

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) {
      return { error: `"${part}" is not a valid page or range.` };
    }

    const from = parseInt(match[1], 10);
    const to = match[2] !== undefined ? parseInt(match[2], 10) : from;

    if (from < 1 || to < 1) {
      return { error: "Page numbers start at 1." };
    }
    if (from > to) {
      return { error: `Range "${part}" is reversed. Use low-high order.` };
    }
    if (to > pageCount) {
      return {
        error: `Page ${to} is out of range. This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"}.`,
      };
    }

    for (let p = from; p <= to; p++) result.add(p - 1);
  }

  if (result.size === 0) return { error: "Enter at least one page or range." };
  return { pages: Array.from(result).sort((a, b) => a - b) };
}
