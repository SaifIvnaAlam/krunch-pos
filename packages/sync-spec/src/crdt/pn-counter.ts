export class PNCounter {
  private increments: Map<string, number>;
  private decrements: Map<string, number>;

  constructor(
    increments?: Map<string, number>,
    decrements?: Map<string, number>,
  ) {
    this.increments = increments ?? new Map();
    this.decrements = decrements ?? new Map();
  }

  value(): number {
    let total = 0;
    for (const v of this.increments.values()) total += v;
    for (const v of this.decrements.values()) total -= v;
    return total;
  }

  increment(nodeId: string, amount: number = 1): void {
    const current = this.increments.get(nodeId) ?? 0;
    this.increments.set(nodeId, current + amount);
  }

  decrement(nodeId: string, amount: number = 1): void {
    const current = this.decrements.get(nodeId) ?? 0;
    this.decrements.set(nodeId, current + amount);
  }

  merge(other: PNCounter): PNCounter {
    const mergedInc = new Map(this.increments);
    const mergedDec = new Map(this.decrements);

    for (const [key, val] of other.increments) {
      mergedInc.set(key, Math.max(mergedInc.get(key) ?? 0, val));
    }
    for (const [key, val] of other.decrements) {
      mergedDec.set(key, Math.max(mergedDec.get(key) ?? 0, val));
    }

    return new PNCounter(mergedInc, mergedDec);
  }

  toJSON(): { increments: Record<string, number>; decrements: Record<string, number> } {
    return {
      increments: Object.fromEntries(this.increments),
      decrements: Object.fromEntries(this.decrements),
    };
  }

  static fromJSON(data: {
    increments: Record<string, number>;
    decrements: Record<string, number>;
  }): PNCounter {
    return new PNCounter(
      new Map(Object.entries(data.increments)),
      new Map(Object.entries(data.decrements)),
    );
  }
}
