type Point = { x: number; y: number };
type Group<T> = { id: number; items: T[]; center: Point; width: number };
type Pair = { a: number; b: number; distance: number };

/** Merge colliding price-pin rectangles without moving pins away from their real centroid. */
export function mergeOverlappingGroups<T extends { id: string }>(
  input: readonly (readonly T[])[],
  centerFor: (items: T[]) => Point,
  size: { width: number | ((items: T[]) => number); height: number } = {
    width: 100,
    height: 46,
  },
): T[][] {
  const sorted = input
    .filter((items) => items.length)
    .map((items) => [...items].sort((a, b) => a.id.localeCompare(b.id)))
    .sort((a, b) => a[0].id.localeCompare(b[0].id));
  const widthFor = (items: T[]) =>
    typeof size.width === "number" ? size.width : size.width(items);
  const groups = new Map<number, Group<T>>(
    sorted.map((items, id) => [
      id,
      { id, items, center: centerFor(items), width: widthFor(items) },
    ]),
  );
  const heap: Pair[] = [];
  let nextId = groups.size;
  const before = (a: Pair, b: Pair) =>
    a.distance < b.distance ||
    (a.distance === b.distance && (a.a < b.a || (a.a === b.a && a.b < b.b)));
  const enqueue = (a: Group<T>, b: Group<T>) => {
    const dx = a.center.x - b.center.x,
      dy = a.center.y - b.center.y;
    if (Math.abs(dx) >= (a.width + b.width) / 2 || Math.abs(dy) >= size.height)
      return;
    const pair = {
      a: Math.min(a.id, b.id),
      b: Math.max(a.id, b.id),
      distance: dx * dx + dy * dy,
    };
    heap.push(pair);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!before(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  };
  const dequeue = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1,
          right = left + 1;
        if (left >= heap.length) break;
        const child =
          right < heap.length && before(heap[right], heap[left]) ? right : left;
        if (!before(heap[child], heap[index])) break;
        [heap[index], heap[child]] = [heap[child], heap[index]];
        index = child;
      }
    }
    return first;
  };
  const original = [...groups.values()];
  original.forEach((a, index) => {
    for (let next = index + 1; next < original.length; next++)
      enqueue(a, original[next]);
  });
  while (heap.length) {
    const pair = dequeue(),
      a = groups.get(pair.a),
      b = groups.get(pair.b);
    // Old heap entries are invalidated when either of their groups is merged.
    if (!a || !b) continue;
    const items = [...a.items, ...b.items].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const combined = {
      id: nextId++,
      items,
      center: centerFor(items),
      width: widthFor(items),
    };
    groups.delete(a.id);
    groups.delete(b.id);
    for (const other of groups.values()) enqueue(combined, other);
    groups.set(combined.id, combined);
  }
  return [...groups.values()]
    .map((group) => group.items)
    .sort((a, b) => a[0].id.localeCompare(b[0].id));
}
