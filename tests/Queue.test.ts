import { describe, expect, it } from 'vitest';
import { Queue } from '../src/music/Queue.js';

describe('Queue', () => {
  it('is FIFO', () => {
    const q = new Queue<number>(10);
    q.enqueue([1, 2, 3]);
    expect(q.next()).toBe(1);
    expect(q.peek(5)).toEqual([2, 3]);
    expect(q.size).toBe(2);
  });

  it('only accepts what fits', () => {
    const q = new Queue<number>(3);
    expect(q.enqueue([1, 2])).toBe(2);
    expect(q.enqueue([3, 4, 5])).toBe(1);
    expect(q.enqueue([6])).toBe(0);
    expect(q.peek(10)).toEqual([1, 2, 3]);
  });

  it('clears', () => {
    const q = new Queue<number>(3);
    q.enqueue([1, 2]);
    q.clear();
    expect(q.next()).toBeUndefined();
  });

  it('shuffles deterministically with an injected RNG and keeps every item', () => {
    const q = new Queue<number>(10);
    q.enqueue([1, 2, 3, 4]);
    q.shuffle(() => 0);
    expect(q.peek(10)).toEqual([2, 3, 4, 1]);
  });
});
