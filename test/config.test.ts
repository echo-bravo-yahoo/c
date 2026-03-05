/**
 * Tests for config module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeOptions } from '../src/config.js';

describe('config', () => {
  describe('mergeOptions', () => {
    it('CLI wins over defaults', () => {
      const result = mergeOptions({ sort: 'name' }, { sort: 'active' });
      assert.strictEqual(result.sort, 'active');
    });

    it('uses default when CLI undefined', () => {
      const result = mergeOptions({ flat: true }, {} as { flat?: boolean });
      assert.strictEqual(result.flat, true);
    });

    it('CLI false overrides default true', () => {
      const result = mergeOptions({ flat: true }, { flat: false });
      assert.strictEqual(result.flat, false);
    });

    it('handles undefined defaults', () => {
      const result = mergeOptions(undefined, { sort: 'name' });
      assert.strictEqual(result.sort, 'name');
    });
  });
});
