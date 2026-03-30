import { v4 as uuidv4 } from 'uuid';

interface TaggedElement<T> {
  value: T;
  tag: string;
}

export class ORSet<T> {
  private elements: Map<string, TaggedElement<T>>;

  constructor(elements?: Map<string, TaggedElement<T>>) {
    this.elements = elements ?? new Map();
  }

  values(): T[] {
    return Array.from(this.elements.values()).map((el) => el.value);
  }

  has(value: T): boolean {
    for (const el of this.elements.values()) {
      if (el.value === value) return true;
    }
    return false;
  }

  add(value: T): string {
    const tag = uuidv4();
    this.elements.set(tag, { value, tag });
    return tag;
  }

  remove(value: T): string[] {
    const removedTags: string[] = [];
    for (const [tag, el] of this.elements) {
      if (el.value === value) {
        this.elements.delete(tag);
        removedTags.push(tag);
      }
    }
    return removedTags;
  }

  merge(other: ORSet<T>): ORSet<T> {
    const merged = new Map(this.elements);
    for (const [tag, el] of other.elements) {
      merged.set(tag, el);
    }
    return new ORSet(merged);
  }

  toJSON(): Array<{ value: T; tag: string }> {
    return Array.from(this.elements.values());
  }

  static fromJSON<T>(data: Array<{ value: T; tag: string }>): ORSet<T> {
    const elements = new Map<string, TaggedElement<T>>();
    for (const item of data) {
      elements.set(item.tag, item);
    }
    return new ORSet(elements);
  }
}
