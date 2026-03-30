export class LWWRegister<T> {
  private value: T;
  private timestamp: number;

  constructor(initialValue: T, timestamp: number = Date.now()) {
    this.value = initialValue;
    this.timestamp = timestamp;
  }

  get(): T {
    return this.value;
  }

  getTimestamp(): number {
    return this.timestamp;
  }

  set(newValue: T, timestamp: number = Date.now()): boolean {
    if (timestamp > this.timestamp) {
      this.value = newValue;
      this.timestamp = timestamp;
      return true;
    }
    return false;
  }

  merge(other: LWWRegister<T>): LWWRegister<T> {
    if (other.timestamp > this.timestamp) {
      return new LWWRegister(other.value, other.timestamp);
    }
    return new LWWRegister(this.value, this.timestamp);
  }

  toJSON(): { value: T; timestamp: number } {
    return { value: this.value, timestamp: this.timestamp };
  }

  static fromJSON<T>(data: { value: T; timestamp: number }): LWWRegister<T> {
    return new LWWRegister(data.value, data.timestamp);
  }
}
