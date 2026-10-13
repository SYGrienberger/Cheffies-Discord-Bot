/** In-memory per-key cooldowns (key = "<command>:<userId>"). */
export class Cooldowns {
  private readonly until = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns 0 and starts the cooldown if allowed, otherwise the seconds left. */
  hit(key: string, seconds: number): number {
    const now = this.now();
    const until = this.until.get(key);
    if (until !== undefined && until > now) return Math.ceil((until - now) / 1000);
    this.until.set(key, now + seconds * 1000);
    if (this.until.size > 10_000) this.sweep(now);
    return 0;
  }

  private sweep(now: number): void {
    for (const [key, until] of this.until) if (until <= now) this.until.delete(key);
  }
}
