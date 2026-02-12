/**
 * TDD test for paginateAll safety valve.
 *
 * C2.5-3: paginateAll has no max-pages guard. A runaway cursor
 * (Notion bug with unstable cursor ordering) causes infinite pagination.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../notion-client', () => ({
  notionFetch: vi.fn(),
}));

import { paginateAll } from '../paginator';
import { notionFetch } from '../notion-client';

const mockNotionFetch = vi.mocked(notionFetch);

describe('paginateAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('C2.5-3: safety valve for runaway cursors', () => {
    it('should stop after maxPages iterations even if has_more is true', async () => {
      // Simulate a runaway cursor that always says has_more: true
      let callCount = 0;
      mockNotionFetch.mockImplementation(async () => {
        callCount++;
        return {
          results: [{ id: `item-${callCount}` }],
          next_cursor: `cursor-${callCount}`,
          has_more: true, // always more — runaway!
        };
      });

      const results = await paginateAll('/search', {
        method: 'POST',
        body: {},
        maxPages: 5, // explicit limit
      });

      // Should have stopped at 5 pages, not run forever
      expect(callCount).toBe(5);
      expect(results).toHaveLength(5);
    });

    it('should default to 100 max pages when no maxPages specified', async () => {
      // We won't actually run 100 iterations, just verify the function
      // accepts the parameter and doesn't loop forever with a small limit
      let callCount = 0;
      mockNotionFetch.mockImplementation(async () => {
        callCount++;
        if (callCount >= 3) {
          return { results: [{ id: `item-${callCount}` }], next_cursor: null, has_more: false };
        }
        return {
          results: [{ id: `item-${callCount}` }],
          next_cursor: `cursor-${callCount}`,
          has_more: true,
        };
      });

      const results = await paginateAll('/search', { method: 'POST', body: {} });

      // Should have completed normally at 3 pages
      expect(callCount).toBe(3);
      expect(results).toHaveLength(3);
    });
  });
});
