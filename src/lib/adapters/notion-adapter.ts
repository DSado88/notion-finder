import { notionService } from '@/lib/notion-service';
import { blocksToMarkdown } from '@/lib/block-to-markdown';
import { notionFetch } from '@/lib/notion-client';
import { AdapterError } from './types';
import type {
  BackendAdapter,
  BackendCapabilities,
  ContentData,
} from './types';
import type {
  FinderItem,
  NotionBlock,
  NotionBlockChildrenResponse,
  NotionRichText,
  BatchMoveRequest,
  BatchMoveResult,
} from '@/types/finder';

// ─── Property helpers (moved from page route) ───

function extractPageTitle(properties: Record<string, unknown> | undefined): string {
  if (!properties) return '';
  for (const prop of Object.values(properties)) {
    const p = prop as { type?: string; title?: { plain_text: string }[] };
    if (p.type === 'title' && Array.isArray(p.title)) {
      return p.title.map((t) => t.plain_text).join('');
    }
  }
  return '';
}

function formatPropertyValue(prop: Record<string, unknown>): string | null {
  const type = prop.type as string;
  const val = prop[type];
  if (val === null || val === undefined) return null;

  switch (type) {
    case 'title':
    case 'rich_text': {
      const arr = val as NotionRichText[];
      const text = arr.map((t) => t.plain_text).join('');
      return text || null;
    }
    case 'select':
    case 'status': {
      const s = val as { name?: string };
      return s.name ?? null;
    }
    case 'multi_select': {
      const items = val as { name: string }[];
      return items.length > 0 ? items.map((i) => i.name).join(', ') : null;
    }
    case 'checkbox':
      return val ? 'Yes' : 'No';
    case 'number':
      return String(val);
    case 'date': {
      const d = val as { start?: string; end?: string };
      if (!d.start) return null;
      return d.end ? `${d.start} → ${d.end}` : d.start;
    }
    case 'url':
    case 'email':
    case 'phone_number':
      return val as string;
    case 'created_time':
    case 'last_edited_time':
      return new Date(val as string).toLocaleString();
    case 'relation': {
      const rels = val as { id: string }[];
      return rels.length > 0 ? `${rels.length} linked` : null;
    }
    default:
      return null;
  }
}

function extractProperties(
  properties: Record<string, Record<string, unknown>> | undefined,
): { name: string; value: string }[] {
  if (!properties) return [];
  const skip = new Set(['title', 'created_time', 'last_edited_time']);
  const result: { name: string; value: string }[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (skip.has(prop.type as string)) continue;
    if (!name) continue;
    const value = formatPropertyValue(prop);
    if (value !== null) {
      result.push({ name, value });
    }
  }
  return result;
}

// ─── Adapter ───

export class NotionAdapter implements BackendAdapter {
  readonly name = 'Notion';

  readonly capabilities: BackendCapabilities = {
    canCreate: true,
    canEdit: false,
    canDelete: true,
    canMove: true,
    canSearch: true,
    canSync: false,
  };

  async getRootItems(): Promise<FinderItem[]> {
    return notionService.getRootItems();
  }

  async getChildren(parentId: string): Promise<FinderItem[]> {
    return notionService.getChildren(parentId);
  }

  async getContent(itemId: string): Promise<ContentData> {
    const { page, blocks } = await notionService.getPage(itemId);

    // Fetch children for table blocks (they contain table_row children)
    const tableBlocks = blocks.filter((b) => b.type === 'table' && b.has_children);
    const childrenMap = new Map<string, NotionBlock[]>();
    if (tableBlocks.length > 0) {
      await Promise.all(
        tableBlocks.map(async (tb) => {
          const res = await notionFetch<NotionBlockChildrenResponse>(
            `/blocks/${tb.id}/children?page_size=100`,
            { priority: 'high' },
          );
          childrenMap.set(tb.id, res.results);
        }),
      );
    }

    const markdown = blocksToMarkdown(blocks, childrenMap);
    const properties = extractProperties(
      page.properties as Record<string, Record<string, unknown>> | undefined,
    );

    return {
      markdown,
      title: extractPageTitle(page.properties) || 'Untitled',
      icon: page.icon?.emoji ?? null,
      url: page.url,
      lastEditedTime: page.last_edited_time,
      properties,
    };
  }

  async saveContent(): Promise<void> {
    throw new AdapterError('READ_ONLY', 'Notion content is read-only through this adapter');
  }

  async createPage(parentId: string, title: string): Promise<FinderItem> {
    return notionService.createPage(parentId, title);
  }

  async renamePage(itemId: string, newTitle: string): Promise<void> {
    return notionService.renamePage(itemId, newTitle);
  }

  async archivePage(itemId: string): Promise<void> {
    return notionService.archivePage(itemId);
  }

  async movePage(itemId: string, newParentId: string): Promise<void> {
    return notionService.movePage(itemId, newParentId);
  }

  async batchMove(
    moves: BatchMoveRequest[],
    options?: { dryRun?: boolean },
  ): Promise<{ results: BatchMoveResult[] }> {
    const response = await notionService.batchMove(moves, options);
    return { results: response.results };
  }

  async batchArchive(
    pageIds: string[],
  ): Promise<{ results: { id: string; status: string; error?: string }[] }> {
    const { succeeded, failed } = await notionService.batchArchive(pageIds);
    return {
      results: [
        ...succeeded.map((id) => ({ id, status: 'success' as const })),
        ...failed.map(({ id, error }) => ({ id, status: 'failed' as const, error })),
      ],
    };
  }

  async search(query: string, maxResults?: number): Promise<FinderItem[]> {
    return notionService.search(query, undefined, maxResults);
  }
}
