import { VectorClockUtil } from '../vector-clock';

describe('VectorClockUtil', () => {
  it('creates a clock for a node', () => {
    const clock = VectorClockUtil.create('node-1');
    expect(clock).toEqual({ 'node-1': 0 });
  });

  it('increments a clock', () => {
    const clock = VectorClockUtil.create('node-1');
    const next = VectorClockUtil.increment(clock, 'node-1');
    expect(next['node-1']).toBe(1);
  });

  it('merges two clocks taking max', () => {
    const a = { 'node-1': 3, 'node-2': 1 };
    const b = { 'node-1': 1, 'node-2': 5, 'node-3': 2 };
    const merged = VectorClockUtil.merge(a, b);
    expect(merged).toEqual({ 'node-1': 3, 'node-2': 5, 'node-3': 2 });
  });

  it('compares equal clocks', () => {
    const a = { 'node-1': 2 };
    const b = { 'node-1': 2 };
    expect(VectorClockUtil.compare(a, b)).toBe('equal');
  });

  it('detects before relationship', () => {
    const a = { 'node-1': 1 };
    const b = { 'node-1': 2 };
    expect(VectorClockUtil.compare(a, b)).toBe('before');
  });

  it('detects after relationship', () => {
    const a = { 'node-1': 3 };
    const b = { 'node-1': 1 };
    expect(VectorClockUtil.compare(a, b)).toBe('after');
  });

  it('detects concurrent clocks', () => {
    const a = { 'node-1': 2, 'node-2': 1 };
    const b = { 'node-1': 1, 'node-2': 3 };
    expect(VectorClockUtil.compare(a, b)).toBe('concurrent');
  });
});
