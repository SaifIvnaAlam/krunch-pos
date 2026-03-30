import { VectorClock } from '@universal-pos/types';

export class VectorClockUtil {
  static create(nodeId: string): VectorClock {
    return { [nodeId]: 0 };
  }

  static increment(clock: VectorClock, nodeId: string): VectorClock {
    return {
      ...clock,
      [nodeId]: (clock[nodeId] ?? 0) + 1,
    };
  }

  static merge(a: VectorClock, b: VectorClock): VectorClock {
    const merged: VectorClock = {};
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      merged[key] = Math.max(a[key] ?? 0, b[key] ?? 0);
    }
    return merged;
  }

  static compare(
    a: VectorClock,
    b: VectorClock,
  ): 'before' | 'after' | 'concurrent' | 'equal' {
    let aBefore = false;
    let aAfter = false;
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

    for (const key of allKeys) {
      const aVal = a[key] ?? 0;
      const bVal = b[key] ?? 0;
      if (aVal < bVal) aBefore = true;
      if (aVal > bVal) aAfter = true;
    }

    if (!aBefore && !aAfter) return 'equal';
    if (aBefore && !aAfter) return 'before';
    if (!aBefore && aAfter) return 'after';
    return 'concurrent';
  }
}
