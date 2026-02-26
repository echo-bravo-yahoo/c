/**
 * Tests for formatting utilities
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { useFakeTime } from '../setup.js';

// These are pure functions we can test directly
import { relativeTime, shortId } from '../../src/util/format.js';

describe('c > util > format > relativeTime', () => {
  let fakeTime: { restore: () => void };

  beforeEach(() => {
    // Set fake time to 2024-01-15 12:00:00 UTC
    fakeTime = useFakeTime(new Date('2024-01-15T12:00:00Z').getTime());
  });

  afterEach(() => {
    fakeTime.restore();
  });

  it('returns "just now" within 60s', () => {
    const date = new Date('2024-01-15T11:59:30Z'); // 30 seconds ago
    const result = relativeTime(date);
    assert.strictEqual(result, 'just now');
  });

  it('returns "just now" at exactly 59 seconds', () => {
    const date = new Date('2024-01-15T11:59:01Z'); // 59 seconds ago
    const result = relativeTime(date);
    assert.strictEqual(result, 'just now');
  });

  it('returns "Xm ago" for minutes', () => {
    const date = new Date('2024-01-15T11:55:00Z'); // 5 minutes ago
    const result = relativeTime(date);
    assert.strictEqual(result, '5m ago');
  });

  it('returns "1m ago" at 60 seconds', () => {
    const date = new Date('2024-01-15T11:59:00Z'); // exactly 60 seconds ago
    const result = relativeTime(date);
    assert.strictEqual(result, '1m ago');
  });

  it('returns "59m ago" at 59 minutes', () => {
    const date = new Date('2024-01-15T11:01:00Z'); // 59 minutes ago
    const result = relativeTime(date);
    assert.strictEqual(result, '59m ago');
  });

  it('returns "Xh ago" for hours', () => {
    const date = new Date('2024-01-15T09:00:00Z'); // 3 hours ago
    const result = relativeTime(date);
    assert.strictEqual(result, '3h ago');
  });

  it('returns "1h ago" at 60 minutes', () => {
    const date = new Date('2024-01-15T11:00:00Z'); // exactly 1 hour ago
    const result = relativeTime(date);
    assert.strictEqual(result, '1h ago');
  });

  it('returns "23h ago" at 23 hours', () => {
    const date = new Date('2024-01-14T13:00:00Z'); // 23 hours ago
    const result = relativeTime(date);
    assert.strictEqual(result, '23h ago');
  });

  it('returns "Xd ago" for days', () => {
    const date = new Date('2024-01-12T12:00:00Z'); // 3 days ago
    const result = relativeTime(date);
    assert.strictEqual(result, '3d ago');
  });

  it('returns "1d ago" at 24 hours', () => {
    const date = new Date('2024-01-14T12:00:00Z'); // exactly 24 hours ago
    const result = relativeTime(date);
    assert.strictEqual(result, '1d ago');
  });

  it('handles very old dates', () => {
    const date = new Date('2023-01-15T12:00:00Z'); // 365 days ago
    const result = relativeTime(date);
    assert.strictEqual(result, '365d ago');
  });
});

describe('c > util > format > shortId', () => {
  it('returns first 8 characters', () => {
    const result = shortId('abcdefgh-ijkl-mnop-qrst-uvwxyz123456');
    assert.strictEqual(result, 'abcdefgh');
  });

  it('handles UUID format', () => {
    const result = shortId('12345678-1234-1234-1234-123456789012');
    assert.strictEqual(result, '12345678');
  });

  it('handles short input', () => {
    const result = shortId('abc');
    assert.strictEqual(result, 'abc');
  });

  it('handles exactly 8 characters', () => {
    const result = shortId('12345678');
    assert.strictEqual(result, '12345678');
  });
});
