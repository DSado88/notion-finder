/**
 * TDD tests for NotionService defects found during deep review.
 *
 * Each test proves a specific defect exists (RED), then the corresponding
 * fix in the implementation turns it GREEN.
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

// ─── Mocks ───

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
import { notionFetch } from '../notion-client';
import { paginateAll } from '../paginator';

const mockNotionFetch = vi.mocked(notionFetch);
const mockPaginateAll = vi.mocked(paginateAll);

// ─── Helpers ───

function fakePage(
  id: string,
  title: string,
  parentType: 'workspace' | 'page_id' = 'workspace',
  parentId?: string,
) {
  return {
    object: 'page' as const,
    id,
    created_time: '2025-01-01T00:00:00.000Z',
    last_edited_time: '2025-01-01T00:00:00.000Z',
    archived: false,
    in_trash: false,
    parent:
      parentType === 'workspace'
        ? { type: 'workspace' as const, workspace: true }
        : { type: 'page_id' as const, page_id: parentId },
    icon: null,
    properties: {
      title: {
        id: 'title',
        type: 'title',
        title: [{ type: 'text', plain_text: title, href: null }],
      },
    },
    url: `https://www.notion.so/${id.replace(/-/g, '')}`,
  };
}

function fakeChildBlock(
  id: string,
  title: string,
  parentId: string,
  hasChildren = false,
) {
  return {
    object: 'block' as const,
    id,
    type: 'child_page',
    parent: { type: 'page_id' as const, page_id: parentId },
    has_children: hasChildren,
    archived: false,
    in_trash: false,
    created_time: '2025-01-01T00:00:00.000Z',
    last_edited_time: '2025-01-01T00:00:00.000Z',
    child_page: { title },
  };
}

// ─── Tests ───

describe('NotionService', () => {
  let service: NotionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotionService();
  });

  // ──────────────────────────────────────────────────────────
  // P0-2: getTree with NaN maxDepth silently returns no children
  // ──────────────────────────────────────────────────────────
  describe('P0-2: getTree handles NaN maxDepth', () => {
    it('should expand children at depth 1 even when maxDepth is NaN', async () => {
      // Workspace has one root page with a child
      const rootPage = fakePage('root-1', 'Root Page');
      const childPage = fakePage('child-1', 'Child', 'page_id', 'root-1');
      mockPaginateAll.mockResolvedValueOnce([rootPage, childPage]);

      const tree = await service.getTree('workspace', NaN, false);

      // root-1 should appear in tree.children
      expect(tree.children.length).toBe(1);
      // BUG: depth(1) < NaN is always false → children never expanded
      // FIX: NaN defaults to 2, so depth(1) < 2 is true → children appear
      expect(tree.children[0].children).toBeDefined();
      expect(tree.children[0].children!.length).toBe(1);
      expect(tree.children[0].children![0].id).toBe('child-1');
    });
  });

  // ──────────────────────────────────────────────────────────
  // P0-3: Concurrent ensureWorkspaceIndex causes double builds
  // ──────────────────────────────────────────────────────────
  describe('P0-3: ensureWorkspaceIndex race condition', () => {
    it('should build the index exactly once when called concurrently', async () => {
      mockPaginateAll.mockResolvedValue([fakePage('p1', 'Page 1')]);

      // Two concurrent calls — both enter before either sets buildingPromise
      const p1 = service.ensureWorkspaceIndex();
      const p2 = service.ensureWorkspaceIndex();
      await Promise.all([p1, p2]);

      // BUG: both callers pass the buildingPromise guard (null at time of check),
      //       both call buildWorkspaceIndex → paginateAll called 2x
      // FIX: buildWorkspaceIndex checks/reuses existing promise → called 1x
      expect(mockPaginateAll).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // P1-4: movePage doesn't invalidate old parent's children cache
  // ──────────────────────────────────────────────────────────
  describe('P1-4: movePage invalidates old parent cache', () => {
    it('should not serve stale children for the old parent after a move', async () => {
      // 1. Build empty workspace index
      mockPaginateAll.mockResolvedValueOnce([]);
      await service.ensureWorkspaceIndex();

      // 2. Populate children cache for 'old-parent' via block API path
      mockPaginateAll.mockResolvedValueOnce([
        fakeChildBlock('page-1', 'Movable Page', 'old-parent'),
      ]);
      const before = await service.getChildren('old-parent');
      expect(before).toHaveLength(1);
      expect(before[0].id).toBe('page-1');

      // 3. Move page-1 to new-parent
      //    (fix will look up old parent first, so mock the page fetch)
      mockNotionFetch.mockResolvedValueOnce(
        fakePage('page-1', 'Movable Page', 'page_id', 'old-parent'),
      );
      mockNotionFetch.mockResolvedValueOnce({}); // move response
      await service.movePage('page-1', 'new-parent');

      // 4. Fetch children of old-parent again
      //    Workspace index rebuilds (workspaceIndexBuiltAt = 0)
      mockPaginateAll.mockResolvedValueOnce([]); // /search rebuild
      //    If cache was invalidated, falls through to block API:
      mockPaginateAll.mockResolvedValueOnce([]); // old-parent now empty

      const after = await service.getChildren('old-parent');

      // BUG: returns stale cached [page-1] (old parent cache not cleared)
      // FIX: old parent cache cleared → fresh fetch returns []
      expect(after).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // P1-5: batchMove doesn't detect cycles
  // ──────────────────────────────────────────────────────────
  describe('P1-5: batchMove cycle detection', () => {
    it('should reject a move that creates a cycle (A under its own descendant)', async () => {
      // Hierarchy: A (root) → B → C
      const pageA = fakePage('page-a', 'A', 'workspace');
      const pageB = fakePage('page-b', 'B', 'page_id', 'page-a');
      const pageC = fakePage('page-c', 'C', 'page_id', 'page-b');
      mockPaginateAll.mockResolvedValueOnce([pageA, pageB, pageC]);

      // Dry-run: move A under C (would create cycle: C → A → B → C)
      // Mock the page existence check that dry_run does
      mockNotionFetch.mockResolvedValueOnce(pageA);

      const result = await service.batchMove(
        [{ page_id: 'page-a', new_parent_id: 'page-c' }],
        { dryRun: true },
      );

      // BUG: dry_run only checks page existence, not cycles → status: 'success'
      // FIX: builds directed graph, detects A→C would create cycle → status: 'failed'
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toMatch(/cycle/i);
    });
  });

  // ──────────────────────────────────────────────────────────
  // P1-6: movePage sends workspace: 'true' (string) not true (boolean)
  // ──────────────────────────────────────────────────────────
  describe('P1-6: movePage workspace parent shape', () => {
    it('should pass workspace: true (boolean) when moving to workspace root', async () => {
      // Mock: page lookup (for old parent) + move call
      mockNotionFetch.mockResolvedValueOnce(
        fakePage('page-1', 'Page', 'page_id', 'some-parent'),
      );
      mockNotionFetch.mockResolvedValueOnce({}); // move response
      // Workspace index rebuild after move
      mockPaginateAll.mockResolvedValue([]);

      await service.movePage('page-1', 'workspace');

      // Find the POST /move call
      const moveCall = mockNotionFetch.mock.calls.find(
        ([path]) => typeof path === 'string' && path.includes('/move'),
      );
      expect(moveCall).toBeDefined();

      const body = moveCall![1]?.body as { parent: Record<string, unknown> };

      // BUG: workspace is 'true' (string) due to Record<string, string> type
      // FIX: workspace is true (boolean)
      expect(body.parent.workspace).toBe(true);
      expect(typeof body.parent.workspace).toBe('boolean');
    });
  });

  // ──────────────────────────────────────────────────────────
  // C2.5-1: Single movePage lacks cycle detection
  // ──────────────────────────────────────────────────────────
  describe('C2.5-1: movePage cycle detection', () => {
    it('should reject a single move that creates a cycle', async () => {
      // Hierarchy: A (root) → B → C
      const pageA = fakePage('page-a', 'A', 'workspace');
      const pageB = fakePage('page-b', 'B', 'page_id', 'page-a');
      const pageC = fakePage('page-c', 'C', 'page_id', 'page-b');
      mockPaginateAll.mockResolvedValueOnce([pageA, pageB, pageC]);

      // Try to move A under C (creates cycle)
      // movePage will look up page to find old parent
      mockNotionFetch.mockResolvedValueOnce(pageA);

      await expect(
        service.movePage('page-a', 'page-c'),
      ).rejects.toThrow(/cycle/i);
    });
  });

  // ──────────────────────────────────────────────────────────
  // C2.5-2: getAncestry infinite loop protection
  // ──────────────────────────────────────────────────────────
  describe('C2.5-2: getAncestry max depth bail', () => {
    it('should bail after 20 iterations to prevent infinite loops', async () => {
      // Create a chain of 25 pages, each parenting the next
      // getAncestry should bail at 20, not try all 25
      let callCount = 0;
      mockNotionFetch.mockImplementation(async (path: string) => {
        callCount++;
        const id = `page-${callCount}`;
        // Always return a page with a parent pointing to the "next" page
        return fakePage(id, `Page ${callCount}`, 'page_id', `page-${callCount + 1}`);
      });

      const chain = await service.getAncestry('page-1');

      // Should have bailed at 20, not gone to 25+
      expect(chain.length).toBeLessThanOrEqual(20);
      // Should have stopped making API calls at 20
      expect(callCount).toBeLessThanOrEqual(20);
    });
  });
});
