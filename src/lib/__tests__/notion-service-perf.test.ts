/**
 * Tests for performance optimizations in NotionService.
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../notion-client', () => ({
  notionFetch: vi.fn(),
  NotionApiError: class extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock('../paginator', () => ({
  paginateAll: vi.fn(),
}));

import { NotionService } from '../notion-service';
import { paginateAll } from '../paginator';

const mockPaginateAll = vi.mocked(paginateAll);

function fakeChildBlock(id: string, title: string, parentId: string) {
  return {
    object: 'block' as const,
    id,
    type: 'child_page',
    parent: { type: 'page_id' as const, page_id: parentId },
    has_children: false,
    archived: false,
    in_trash: false,
    created_time: '2025-01-01T00:00:00.000Z',
    last_edited_time: '2025-01-01T00:00:00.000Z',
    child_page: { title },
  };
}

describe('NotionService performance', () => {
  let service: NotionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotionService();
  });

  describe('CHILDREN_TTL = 5 minutes', () => {
    it('should use 300_000ms for CHILDREN_TTL', () => {
      const ttl = (service as unknown as Record<string, number>)['CHILDREN_TTL'];
      expect(ttl).toBe(5 * 60 * 1000);
    });

    it('should serve cached children within 5 minutes without re-fetching', async () => {
      // Build empty workspace index first
      mockPaginateAll.mockResolvedValueOnce([]);
      await service.ensureWorkspaceIndex();

      // First call — fetches from API
      mockPaginateAll.mockResolvedValueOnce([
        fakeChildBlock('c1', 'Child 1', 'parent-1'),
      ]);
      const first = await service.getChildren('parent-1');
      expect(first).toHaveLength(1);
      expect(mockPaginateAll).toHaveBeenCalledTimes(2); // 1 for workspace index + 1 for children

      // Second call within TTL — should come from cache, no new API call
      const second = await service.getChildren('parent-1');
      expect(second).toHaveLength(1);
      expect(mockPaginateAll).toHaveBeenCalledTimes(2); // still 2, no new call
    });

    it('should re-fetch children after TTL expires', async () => {
      // Use fake timers from the start so cache timestamps are consistent
      vi.useFakeTimers();

      // Build empty workspace index
      mockPaginateAll.mockResolvedValueOnce([]);
      await service.ensureWorkspaceIndex();

      // First call — cached at current fake time
      mockPaginateAll.mockResolvedValueOnce([
        fakeChildBlock('c1', 'Child 1', 'parent-1'),
      ]);
      await service.getChildren('parent-1');
      expect(mockPaginateAll).toHaveBeenCalledTimes(2);

      // Fast-forward past the 5-minute CHILDREN_TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Should re-fetch since cache expired
      // Workspace index TTL (30 min) hasn't expired, so only children refetch
      mockPaginateAll.mockResolvedValueOnce([
        fakeChildBlock('c1', 'Child 1 updated', 'parent-1'),
      ]);
      const after = await service.getChildren('parent-1');
      expect(after).toHaveLength(1);
      expect(mockPaginateAll.mock.calls.length).toBeGreaterThan(2);

      vi.useRealTimers();
    });
  });
});
