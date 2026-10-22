// US-57: shared keyboard model of the roving-tabindex widgets (Tabs, SegmentedControl). Only the
// current item is in the Tab order; arrows move (wrapping) and Home / End jump to the ends.

/** Index the key moves to among `count` items, or null when the key isn't a navigation key. */
export function rovingIndex(key: string, current: number, count: number, { vertical = false } = {}): number | null {
  if (count === 0) return null;
  const from = current < 0 ? 0 : current;
  switch (key) {
    case "ArrowRight":
      return (from + 1) % count;
    case "ArrowLeft":
      return (from - 1 + count) % count;
    case "ArrowDown":
      return vertical ? (from + 1) % count : null;
    case "ArrowUp":
      return vertical ? (from - 1 + count) % count : null;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
