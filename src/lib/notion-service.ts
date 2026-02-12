/**
 * NotionService — transport-agnostic core.
 * Both Next.js API routes and MCP tools are thin wrappers over this.
 *
 * Handles: rate-limited Notion calls, caching, pagination,
 * workspace index, batch operations, tree snapshots.
 */

import { notionFetch, NotionApiError } from './notion-client';
import { paginateAll } from './paginator';
import { extractTitle } from './title-extractor';
import type { Priority } from './rate-limiter';
import type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionBlockChildrenResponse,
  FinderItem,
  NotionParent,
  NotionIcon,
  TreeNode,
  TreeSnapshot,
  BatchMoveRequest,
  BatchMoveResult,
  BatchMoveResponse,
} from '@/types/finder';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Cache entry with TTL
interface CacheEntry<T> {
  data: T;
  ts: number;
}

function getParentId(parent: NotionParent): string | null {
  switch (parent.type) {
    case 'workspace':
      return null;
    case 'page_id':
      return parent.page_id ?? null;
    case 'database_id':
      return parent.database_id ?? null;
    case 'block_id':
      return parent.block_id ?? null;
    default:
      return null;
  }
}

function toFinderItem(obj: NotionPage | NotionDatabase): FinderItem {
  const isDatabase = obj.object === 'database';
  return {
    id: obj.id,
    title: extractTitle(obj),
    type: isDatabase ? 'database' : 'page',
    icon: obj.icon as NotionIcon | null,
    // Pages always might have children; databases always do
    hasChildren: true,
    createdTime: obj.created_time,
    lastEditedTime: obj.last_edited_time,
    parentType: obj.parent.type,
    parentId: getParentId(obj.parent),
    url: obj.url,
  };
}

function blockToFinderItem(block: NotionBlock): FinderItem | null {
  if (block.type === 'child_page' || block.type === 'child_database') {
    return {
      id: block.id,
      title: extractTitle(block),
      type: block.type === 'child_database' ? 'database' : 'page',
      icon: null,
      hasChildren: block.has_children,
      createdTime: block.created_time,
      lastEditedTime: block.last_edited_time,
      parentType: block.parent.type,
      parentId: getParentId(block.parent),
      url: `https://www.notion.so/${block.id.replace(/-/g, '')}`,
    };
  }
  return null;
}

const CACHE_DIR = join(process.cwd(), '.cache');
const ROOT_CACHE_FILE = join(CACHE_DIR, 'workspace-index.json');

export class NotionService {
  private cache = new Map<string, CacheEntry<unknown>>();

  // Workspace index: parentId → children
  private workspaceIndex: Map<string, FinderItem[]> | null = null;
  private workspaceIndexBuiltAt: number = 0;
  private workspaceIndexBuildingPromise: Promise<void> | null = null;
  private allItems: FinderItem[] = [];

  // TTLs in milliseconds
  private readonly ROOT_TTL = 30 * 60 * 1000; // 30 min
  private readonly CHILDREN_TTL = 60 * 1000; // 60s
  private readonly CONTENT_TTL = 5 * 60 * 1000; // 5 min

  // ─── Cache helpers ───

  private getCached<T>(key: string, ttlMs: number): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() - entry.ts < ttlMs) {
      return entry.data;
    }
    return null;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, ts: Date.now() });
  }

  invalidateCache(key: string): void {
    this.cache.delete(key);
  }

  // ─── Workspace Index ───

  async ensureWorkspaceIndex(priority: Priority = 'low', allowStale = false): Promise<void> {
    // Already fresh
    if (this.workspaceIndex && Date.now() - this.workspaceIndexBuiltAt < this.ROOT_TTL) {
      return;
    }

    // Have stale data + already rebuilding — return stale data if caller allows it
    if (allowStale && this.workspaceIndex && this.workspaceIndexBuildingPromise) {
      return;
    }

    // Already building
    if (this.workspaceIndexBuildingPromise) {
      await this.workspaceIndexBuildingPromise;
      return;
    }

    // Try loading from disk first (warm-start fallback)
    if (!this.workspaceIndex) {
      await this.loadIndexFromDisk();
      if (this.workspaceIndex) {
        // Revalidate in background
        this.buildWorkspaceIndex(priority).catch(() => {});
        return;
      }
    }

    // Build fresh
    await this.buildWorkspaceIndex(priority);
  }

  private async buildWorkspaceIndex(priority: Priority): Promise<void> {
    // Guard: if another caller already started a build, reuse it
    if (this.workspaceIndexBuildingPromise) {
      await this.workspaceIndexBuildingPromise;
      return;
    }

    this.workspaceIndexBuildingPromise = (async () => {
      try {
        // Paginate through ALL search results
        const allPages = await paginateAll<NotionPage | NotionDatabase>(
          '/search',
          { method: 'POST', body: {}, priority },
        );

        // Deduplicate by ID (Notion search has unstable cursor ordering)
        const seen = new Set<string>();
        const items: FinderItem[] = [];

        for (const obj of allPages) {
          if (seen.has(obj.id)) continue;
          if (obj.in_trash) continue;
          seen.add(obj.id);
          items.push(toFinderItem(obj));
        }

        // Build parent → children index
        const index = new Map<string, FinderItem[]>();

        for (const item of items) {
          const parentKey = item.parentId ?? 'workspace';
          const existing = index.get(parentKey) ?? [];
          existing.push(item);
          index.set(parentKey, existing);
        }

        // Derive hasChildren from the index: if an item appears as a parent key, it has children
        for (const item of items) {
          const children = index.get(item.id);
          item.hasChildren = !!children && children.length > 0;
        }

        this.workspaceIndex = index;
        this.allItems = items;
        this.workspaceIndexBuiltAt = Date.now();

        // Persist to disk
        await this.saveIndexToDisk();
      } finally {
        this.workspaceIndexBuildingPromise = null;
      }
    })();

    await this.workspaceIndexBuildingPromise;
  }

  private async saveIndexToDisk(): Promise<void> {
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      const data = {
        items: this.allItems,
        builtAt: this.workspaceIndexBuiltAt,
      };
      await writeFile(ROOT_CACHE_FILE, JSON.stringify(data));
    } catch {
      // Non-fatal — disk cache is a nice-to-have
    }
  }

  private async loadIndexFromDisk(): Promise<void> {
    try {
      const raw = await readFile(ROOT_CACHE_FILE, 'utf-8');
      const data = JSON.parse(raw) as { items: FinderItem[]; builtAt: number };

      // Build index from disk data
      const index = new Map<string, FinderItem[]>();
      for (const item of data.items) {
        const parentKey = item.parentId ?? 'workspace';
        const existing = index.get(parentKey) ?? [];
        existing.push(item);
        index.set(parentKey, existing);
      }

      // Derive hasChildren from the index
      for (const item of data.items) {
        const children = index.get(item.id);
        item.hasChildren = !!children && children.length > 0;
      }

      this.workspaceIndex = index;
      this.allItems = data.items;
      this.workspaceIndexBuiltAt = data.builtAt;
    } catch {
      // No disk cache — will build fresh
    }
  }

  // ─── In-place index patches (avoid full rebuild) ───

  private patchIndexMove(pageId: string, oldParentId: string | null, newParentId: string): void {
    if (!this.workspaceIndex) return;
    const oldKey = oldParentId ?? 'workspace';
    const newKey = newParentId === 'workspace' ? 'workspace' : newParentId;

    // Find item in allItems
    const itemIdx = this.allItems.findIndex((i) => i.id === pageId);
    if (itemIdx === -1) return;

    // Update parentId
    const updatedItem = {
      ...this.allItems[itemIdx],
      parentId: newParentId === 'workspace' ? null : newParentId,
    };
    this.allItems[itemIdx] = updatedItem;

    // Remove from old parent
    const oldChildren = this.workspaceIndex.get(oldKey);
    if (oldChildren) {
      const filtered = oldChildren.filter((c) => c.id !== pageId);
      this.workspaceIndex.set(oldKey, filtered);
      // Update old parent's hasChildren
      if (oldKey !== 'workspace' && filtered.length === 0) {
        const oldParent = this.allItems.find((i) => i.id === oldKey);
        if (oldParent) oldParent.hasChildren = false;
      }
    }

    // Add to new parent
    const newChildren = this.workspaceIndex.get(newKey) ?? [];
    newChildren.push(updatedItem);
    this.workspaceIndex.set(newKey, newChildren);
    // Update new parent's hasChildren
    if (newKey !== 'workspace') {
      const newParent = this.allItems.find((i) => i.id === newKey);
      if (newParent) newParent.hasChildren = true;
    }

    this.saveIndexToDisk().catch(() => {});
  }

  private patchIndexAdd(item: FinderItem): void {
    if (!this.workspaceIndex) return;
    const parentKey = item.parentId ?? 'workspace';
    const children = this.workspaceIndex.get(parentKey) ?? [];
    children.push(item);
    this.workspaceIndex.set(parentKey, children);
    this.allItems.push(item);
    // Update parent's hasChildren
    if (parentKey !== 'workspace') {
      const parent = this.allItems.find((i) => i.id === parentKey);
      if (parent) parent.hasChildren = true;
    }
    this.saveIndexToDisk().catch(() => {});
  }

  private patchIndexRename(pageId: string, newTitle: string): void {
    if (!this.workspaceIndex) return;
    for (const item of this.allItems) {
      if (item.id === pageId) {
        item.title = newTitle;
        break;
      }
    }
    // Also update in parent's children list (may be separate object)
    for (const [, children] of this.workspaceIndex) {
      for (const child of children) {
        if (child.id === pageId) {
          child.title = newTitle;
          break;
        }
      }
    }
    this.saveIndexToDisk().catch(() => {});
  }

  private patchIndexRemove(pageId: string): void {
    if (!this.workspaceIndex) return;
    // Remove from parent's children and update parent's hasChildren
    for (const [key, children] of this.workspaceIndex) {
      const idx = children.findIndex((c) => c.id === pageId);
      if (idx !== -1) {
        children.splice(idx, 1);
        if (key !== 'workspace' && children.length === 0) {
          const parent = this.allItems.find((i) => i.id === key);
          if (parent) parent.hasChildren = false;
        }
        break;
      }
    }
    // Remove from allItems
    this.allItems = this.allItems.filter((i) => i.id !== pageId);
    // Remove its children entry
    this.workspaceIndex.delete(pageId);
    this.saveIndexToDisk().catch(() => {});
  }

  // ─── Public API ───

  /**
   * Get root-level workspace items (served from workspace index).
   */
  async getRootItems(): Promise<FinderItem[]> {
    await this.ensureWorkspaceIndex('high', /* allowStale */ true);
    return this.workspaceIndex?.get('workspace') ?? [];
  }

  /**
   * Get children of a page. Checks workspace index first,
   * falls back to direct API call for block-level children.
   */
  async getChildren(parentId: string, priority: Priority = 'high'): Promise<FinderItem[]> {
    // Try workspace index first (allow stale to avoid blocking on rebuild)
    await this.ensureWorkspaceIndex(priority, /* allowStale */ true);
    const fromIndex = this.workspaceIndex?.get(parentId);
    if (fromIndex && fromIndex.length > 0) {
      return fromIndex;
    }

    // Cache check for direct API results
    const cacheKey = `children:${parentId}`;
    const cached = this.getCached<FinderItem[]>(cacheKey, this.CHILDREN_TTL);
    if (cached) return cached;

    // Direct API — fetch block children
    const blocks = await paginateAll<NotionBlock>(
      `/blocks/${parentId}/children`,
      { method: 'GET', priority },
    );

    const items: FinderItem[] = [];
    for (const block of blocks) {
      const item = blockToFinderItem(block);
      if (item) items.push(item);
    }

    this.setCache(cacheKey, items);
    return items;
  }

  /**
   * Get page metadata + first level of content blocks.
   */
  async getPage(
    pageId: string,
    priority: Priority = 'high',
  ): Promise<{ page: NotionPage; blocks: NotionBlock[] }> {
    const cacheKey = `page:${pageId}`;
    const cached = this.getCached<{ page: NotionPage; blocks: NotionBlock[] }>(
      cacheKey,
      this.CONTENT_TTL,
    );
    if (cached) return cached;

    const [page, blocksResponse] = await Promise.all([
      notionFetch<NotionPage>(`/pages/${pageId}`, { priority }),
      notionFetch<NotionBlockChildrenResponse>(
        `/blocks/${pageId}/children?page_size=100`,
        { priority },
      ),
    ]);

    const result = { page, blocks: blocksResponse.results };
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get database schema + recent entries.
   */
  async getDatabase(
    dbId: string,
    priority: Priority = 'high',
  ): Promise<{ database: NotionDatabase; entries: NotionPage[] }> {
    const cacheKey = `database:${dbId}`;
    const cached = this.getCached<{ database: NotionDatabase; entries: NotionPage[] }>(
      cacheKey,
      this.CONTENT_TTL,
    );
    if (cached) return cached;

    const [database, queryResult] = await Promise.all([
      notionFetch<NotionDatabase>(`/databases/${dbId}`, { priority }),
      notionFetch<{ results: NotionPage[] }>(`/databases/${dbId}/query`, {
        method: 'POST',
        body: {
          page_size: 10,
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        },
        priority,
      }),
    ]);

    const result = { database, entries: queryResult.results };
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Search the workspace.
   */
  async search(
    query: string,
    filterType?: 'page' | 'database',
    maxResults: number = 20,
    priority: Priority = 'high',
  ): Promise<FinderItem[]> {
    const body: Record<string, unknown> = {
      query,
      page_size: Math.min(maxResults, 100),
    };
    if (filterType) {
      body.filter = { property: 'object', value: filterType };
    }

    const response = await notionFetch<{ results: (NotionPage | NotionDatabase)[] }>(
      '/search',
      { method: 'POST', body, priority },
    );

    return response.results
      .filter((r) => !r.in_trash)
      .slice(0, maxResults)
      .map(toFinderItem);
  }

  /**
   * Move a single page to a new parent.
   */
  async movePage(
    pageId: string,
    newParentId: string,
    priority: Priority = 'high',
  ): Promise<void> {
    // Best-effort cycle detection: use stale index if available (don't block on rebuild).
    // Notion's API validates moves server-side anyway, so stale data is fine here.
    await this.ensureWorkspaceIndex(priority, /* allowStale */ true);
    if (this.workspaceIndex) {
      const parentMap = new Map<string, string | null>();
      for (const item of this.allItems) {
        parentMap.set(item.id, item.parentId);
      }
      if (this.detectCycle(pageId, newParentId, parentMap)) {
        throw new Error('Cycle detected: target is a descendant of the page being moved');
      }
    }

    // Look up old parent before the move so we can invalidate its cache
    const page = await notionFetch<NotionPage>(`/pages/${pageId}`, { priority });
    const oldParentId = getParentId(page.parent);

    if (newParentId === 'workspace') {
      // Public API doesn't support workspace as move target.
      // Use Notion's internal API (submitTransaction) instead.
      await this.moveToWorkspace(pageId, oldParentId);
    } else {
      const parent = { type: 'page_id', page_id: newParentId };
      await notionFetch(`/pages/${pageId}/move`, {
        method: 'POST',
        body: { parent },
        priority,
        apiVersion: '2025-09-03',
      });
    }

    // Invalidate caches for both old and new parents
    this.cache.delete(`children:${newParentId}`);
    if (oldParentId) {
      this.cache.delete(`children:${oldParentId}`);
    }
    // Patch workspace index in-place (avoids 45s full rebuild)
    this.patchIndexMove(pageId, oldParentId, newParentId);
  }

  /**
   * Move a page to workspace root using Notion's internal API.
   * The public API doesn't support workspace as a move target,
   * so we use /api/v3/submitTransaction with the session token.
   */
  private async moveToWorkspace(pageId: string, oldParentId: string | null): Promise<void> {
    const tokenV2 = process.env.NOTION_TOKEN_V2;
    const spaceId = process.env.NOTION_SPACE_ID;
    if (!tokenV2 || !spaceId) {
      throw new Error('NOTION_TOKEN_V2 and NOTION_SPACE_ID are required for workspace moves');
    }

    const operations: Record<string, unknown>[] = [];

    // Remove from old parent's content list
    if (oldParentId) {
      operations.push({
        id: oldParentId,
        table: 'block',
        path: ['content'],
        command: 'listRemove',
        args: { id: pageId },
      });
    }

    // Update the page's parent to workspace
    operations.push({
      id: pageId,
      table: 'block',
      path: [],
      command: 'update',
      args: {
        parent_id: spaceId,
        parent_table: 'space',
        alive: true,
      },
    });

    // Add to workspace's pages list
    operations.push({
      id: spaceId,
      table: 'space',
      path: ['pages'],
      command: 'listAfter',
      args: { id: pageId },
    });

    const res = await fetch('https://www.notion.so/api/v3/submitTransaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `token_v2=${tokenV2}`,
      },
      body: JSON.stringify({ operations }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Workspace move failed: HTTP ${res.status} — ${text}`);
    }
  }

  /**
   * Check if moving pageId under newParentId would create a cycle.
   * Walks up from newParentId; if we hit pageId, it's a cycle.
   */
  private detectCycle(
    pageId: string,
    newParentId: string,
    parentMap: Map<string, string | null>,
  ): boolean {
    if (newParentId === 'workspace') return false;
    let current: string | null = newParentId;
    const visited = new Set<string>();
    while (current) {
      if (current === pageId) return true;
      if (visited.has(current)) return false; // safety against existing cycles
      visited.add(current);
      current = parentMap.get(current) ?? null;
    }
    return false;
  }

  /**
   * Batch move multiple pages.
   */
  async batchMove(
    moves: BatchMoveRequest[],
    options: { dryRun?: boolean; stopOnError?: boolean } = {},
  ): Promise<BatchMoveResponse> {
    const { dryRun = false, stopOnError = false } = options;
    const startTime = Date.now();
    const results: BatchMoveResult[] = [];

    // Build mutable parent map for cycle detection
    await this.ensureWorkspaceIndex();
    const parentMap = new Map<string, string | null>();
    for (const item of this.allItems) {
      parentMap.set(item.id, item.parentId);
    }

    for (const move of moves) {
      // Cycle detection (before dry_run or execution)
      if (this.detectCycle(move.page_id, move.new_parent_id, parentMap)) {
        results.push({
          page_id: move.page_id,
          new_parent_id: move.new_parent_id,
          status: 'failed',
          error: 'Cycle detected: target is a descendant of the page being moved',
        });
        if (stopOnError) {
          for (const remaining of moves.slice(results.length)) {
            results.push({
              page_id: remaining.page_id,
              new_parent_id: remaining.new_parent_id,
              status: 'skipped',
              error: 'Skipped due to stop_on_error',
            });
          }
          break;
        }
        continue;
      }

      if (dryRun) {
        // Validate: check page exists
        try {
          await notionFetch(`/pages/${move.page_id}`, { priority: 'low' });
          // Update parent map so subsequent moves in the batch see this move
          parentMap.set(
            move.page_id,
            move.new_parent_id === 'workspace' ? null : move.new_parent_id,
          );
          results.push({
            page_id: move.page_id,
            new_parent_id: move.new_parent_id,
            status: 'success',
          });
        } catch (err) {
          const msg = err instanceof NotionApiError ? err.message : 'Unknown error';
          results.push({
            page_id: move.page_id,
            new_parent_id: move.new_parent_id,
            status: 'failed',
            error: msg,
          });
        }
        continue;
      }

      try {
        await this.movePage(move.page_id, move.new_parent_id, 'low');
        // Update parent map so subsequent moves see this move
        parentMap.set(
          move.page_id,
          move.new_parent_id === 'workspace' ? null : move.new_parent_id,
        );
        results.push({
          page_id: move.page_id,
          new_parent_id: move.new_parent_id,
          status: 'success',
        });
      } catch (err) {
        const msg = err instanceof NotionApiError ? err.message : 'Unknown error';
        results.push({
          page_id: move.page_id,
          new_parent_id: move.new_parent_id,
          status: 'failed',
          error: msg,
        });

        if (stopOnError) {
          // Mark remaining as skipped
          for (const remaining of moves.slice(results.length)) {
            results.push({
              page_id: remaining.page_id,
              new_parent_id: remaining.new_parent_id,
              status: 'skipped',
              error: 'Skipped due to stop_on_error',
            });
          }
          break;
        }
      }
    }

    return {
      total: moves.length,
      succeeded: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Get ancestry chain from a page up to workspace root.
   */
  async getAncestry(
    pageId: string,
    priority: Priority = 'high',
  ): Promise<Array<{ id: string; title: string; type: string }>> {
    const chain: Array<{ id: string; title: string; type: string }> = [];
    let currentId: string | null = pageId;
    const visited = new Set<string>();
    const MAX_ANCESTRY_DEPTH = 20;

    while (currentId && chain.length < MAX_ANCESTRY_DEPTH) {
      if (visited.has(currentId)) break; // prevent infinite loop on cyclic data
      visited.add(currentId);

      try {
        // Try as page first
        const page = await notionFetch<NotionPage>(`/pages/${currentId}`, {
          priority,
        });
        chain.unshift({
          id: page.id,
          title: extractTitle(page),
          type: 'page',
        });
        currentId = getParentId(page.parent);

        // If parent is a block, resolve the block to get its parent page
        if (page.parent.type === 'block_id' && page.parent.block_id) {
          const block = await notionFetch<NotionBlock>(
            `/blocks/${page.parent.block_id}`,
            { priority },
          );
          currentId = getParentId(block.parent);
        }
      } catch {
        // Might be a database
        try {
          const db = await notionFetch<NotionDatabase>(
            `/databases/${currentId}`,
            { priority },
          );
          chain.unshift({
            id: db.id,
            title: extractTitle(db),
            type: 'database',
          });
          currentId = getParentId(db.parent);
        } catch {
          break; // Can't resolve further
        }
      }
    }

    return chain;
  }

  /**
   * Get workspace tree snapshot.
   */
  async getTree(
    rootId: string = 'workspace',
    maxDepth: number = 2,
    idsOnly: boolean = false,
  ): Promise<TreeSnapshot> {
    await this.ensureWorkspaceIndex();

    // Clamp maxDepth to valid range (NaN, negative, or > 5 all get safe defaults)
    const safeMaxDepth = Number.isNaN(maxDepth) ? 2 : Math.max(1, Math.min(maxDepth, 5));

    const buildNode = (
      itemId: string,
      title: string,
      type: 'page' | 'database',
      depth: number,
    ): TreeNode => {
      const children = this.workspaceIndex?.get(itemId) ?? [];
      const node: TreeNode = {
        id: itemId,
        title: idsOnly ? '' : title,
        type,
        children_count: children.length,
      };

      if (depth < safeMaxDepth && children.length > 0) {
        node.children = children.map((child) =>
          buildNode(child.id, child.title, child.type, depth + 1),
        );
      }

      return node;
    };

    const rootChildren = this.workspaceIndex?.get(rootId === 'workspace' ? 'workspace' : rootId) ?? [];

    const tree: TreeSnapshot = {
      id: 'workspace',
      title: 'Workspace',
      children: rootChildren.map((item) =>
        buildNode(item.id, item.title, item.type, 1),
      ),
      meta: {
        total_nodes: this.allItems.length,
        depth_reached: safeMaxDepth,
        generated_at: new Date().toISOString(),
        cache_age_seconds: Math.round(
          (Date.now() - this.workspaceIndexBuiltAt) / 1000,
        ),
      },
    };

    return tree;
  }

  /**
   * Force rebuild of workspace index.
   */
  async refreshIndex(): Promise<void> {
    this.workspaceIndexBuiltAt = 0;
    this.workspaceIndex = null;
    await this.ensureWorkspaceIndex();
  }

  // ─── Create / Rename / Archive ───

  /**
   * Create a new page under the given parent.
   * For workspace root, uses internal API (public API doesn't support it).
   */
  async createPage(
    parentId: string,
    title: string = 'Untitled',
    priority: Priority = 'high',
  ): Promise<FinderItem> {
    if (parentId === 'workspace') {
      return this.createPageAtWorkspaceRoot(title);
    }

    const page = await notionFetch<NotionPage>('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'page_id', page_id: parentId },
        properties: {
          title: { title: [{ text: { content: title } }] },
        },
      },
      priority,
    });

    const item = toFinderItem(page);

    this.cache.delete(`children:${parentId}`);
    this.patchIndexAdd(item);

    return item;
  }

  /**
   * Create a page at workspace root using Notion's internal API.
   * Public API doesn't support parent: { workspace: true } for POST /v1/pages.
   */
  private async createPageAtWorkspaceRoot(title: string): Promise<FinderItem> {
    const tokenV2 = process.env.NOTION_TOKEN_V2;
    const spaceId = process.env.NOTION_SPACE_ID;
    if (!tokenV2 || !spaceId) {
      throw new Error('NOTION_TOKEN_V2 and NOTION_SPACE_ID are required for workspace root operations');
    }

    const newId = crypto.randomUUID();

    const operations: Record<string, unknown>[] = [
      {
        id: newId,
        table: 'block',
        path: [],
        command: 'set',
        args: {
          type: 'page',
          id: newId,
          parent_id: spaceId,
          parent_table: 'space',
          alive: true,
          properties: {
            title: [[title]],
          },
        },
      },
      {
        id: spaceId,
        table: 'space',
        path: ['pages'],
        command: 'listAfter',
        args: { id: newId },
      },
    ];

    const res = await fetch('https://www.notion.so/api/v3/submitTransaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `token_v2=${tokenV2}`,
      },
      body: JSON.stringify({ operations }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Workspace create failed: HTTP ${res.status} — ${text}`);
    }

    // Construct FinderItem directly — the public API can't see the page
    // until the integration is granted access, which doesn't happen automatically.
    const now = new Date().toISOString();
    const item: FinderItem = {
      id: newId,
      title,
      type: 'page',
      parentId: 'workspace',
      hasChildren: false,
      icon: null,
      createdTime: now,
      lastEditedTime: now,
      parentType: 'workspace',
      url: `https://www.notion.so/${newId.replace(/-/g, '')}`,
    };

    this.cache.delete('children:workspace');
    this.patchIndexAdd(item);

    return item;
  }

  /**
   * Rename a page by updating its title property.
   */
  async renamePage(
    pageId: string,
    newTitle: string,
    priority: Priority = 'high',
  ): Promise<void> {
    await notionFetch(`/pages/${pageId}`, {
      method: 'PATCH',
      body: {
        properties: {
          title: { title: [{ text: { content: newTitle } }] },
        },
      },
      priority,
    });

    this.cache.delete(`page:${pageId}`);
    this.patchIndexRename(pageId, newTitle);
  }

  /**
   * Archive (soft-delete) a page.
   */
  async archivePage(
    pageId: string,
    priority: Priority = 'high',
  ): Promise<void> {
    await notionFetch(`/pages/${pageId}`, {
      method: 'PATCH',
      body: { archived: true },
      priority,
    });

    this.cache.delete(`page:${pageId}`);
    this.patchIndexRemove(pageId);
  }

  /**
   * Batch archive multiple pages sequentially (respects rate limiter).
   */
  async batchArchive(
    pageIds: string[],
    priority: Priority = 'low',
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of pageIds) {
      try {
        await this.archivePage(id, priority);
        succeeded.push(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        failed.push({ id, error: msg });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Get a single block (for ancestry resolution).
   */
  async getBlock(
    blockId: string,
    priority: Priority = 'high',
  ): Promise<NotionBlock> {
    return notionFetch<NotionBlock>(`/blocks/${blockId}`, { priority });
  }
}

// Module-level singleton
export const notionService = new NotionService();
