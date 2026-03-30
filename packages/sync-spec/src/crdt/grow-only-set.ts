export class GrowOnlySet<T> {
  private elements: Set<T>;

  constructor(elements?: Iterable<T>) {
    this.elements = new Set(elements);
  }

  values(): T[] {
    return Array.from(this.elements);
  }

  has(value: T): boolean {
    return this.elements.has(value);
  }

  add(value: T): void {
    this.elements.add(value);
  }

  size(): number {
    return this.elements.size;
  }

  merge(other: GrowOnlySet<T>): GrowOnlySet<T> {
    return new GrowOnlySet([...this.elements, ...other.elements]);
  }

  toJSON(): T[] {
    return Array.from(this.elements);
  }

  static fromJSON<T>(data: T[]): GrowOnlySet<T> {
    return new GrowOnlySet(data);
  }
}
