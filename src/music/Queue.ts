/** Bounded FIFO queue. Pure data structure: no Discord or I/O, so it is trivial to test and extend (loop, shuffle...). */
export class Queue<T> {
  private items: T[] = [];

  constructor(private readonly maxSize: number) {}

  get size(): number {
    return this.items.length;
  }

  get remainingCapacity(): number {
    return this.maxSize - this.items.length;
  }

  /** Adds as many items as fit; returns how many were added. */
  enqueue(items: readonly T[]): number {
    const accepted = items.slice(0, this.remainingCapacity);
    this.items.push(...accepted);
    return accepted.length;
  }

  next(): T | undefined {
    return this.items.shift();
  }

  peek(count: number): T[] {
    return this.items.slice(0, count);
  }

  clear(): void {
    this.items = [];
  }

  /** Fisher–Yates shuffle. `random` is injectable for deterministic tests. */
  shuffle(random: () => number = Math.random): void {
    for (let i = this.items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [this.items[i], this.items[j]] = [this.items[j]!, this.items[i]!];
    }
  }
}
