import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';
import { blocksToMarkdown } from '@/lib/block-to-markdown';
import type { NotionBlock, NotionBlockChildrenResponse, NotionRichText } from '@/types/finder';
import { notionFetch } from '@/lib/notion-client';

export const dynamic = 'force-dynamic';

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

/** Convert a Notion property value into a display string. */
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
    case 'select': {
      const s = val as { name?: string };
      return s.name ?? null;
    }
    case 'multi_select': {
      const items = val as { name: string }[];
      return items.length > 0 ? items.map((i) => i.name).join(', ') : null;
    }
    case 'status': {
      const s = val as { name?: string };
      return s.name ?? null;
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
    case 'rollup':
    case 'formula':
    case 'files':
    case 'people':
    case 'created_by':
    case 'last_edited_by':
      return null; // skip complex types
    default:
      return null;
  }
}

/** Extract displayable properties (skip title, skip empty values). */
function extractProperties(
  properties: Record<string, Record<string, unknown>> | undefined,
): { name: string; value: string }[] {
  if (!properties) return [];
  const skip = new Set(['title', 'created_time', 'last_edited_time']);
  const result: { name: string; value: string }[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (skip.has(prop.type as string)) continue;
    if (!name) continue; // skip unnamed properties
    const value = formatPropertyValue(prop);
    if (value !== null) {
      result.push({ name, value });
    }
  }
  return result;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { page, blocks } = await notionService.getPage(id);

    // Fetch children for table blocks (they contain table_row children)
    const tableBlocks = blocks.filter((b) => b.type === 'table' && b.has_children);
    const childrenMap = new Map<string, NotionBlock[]>();
    if (tableBlocks.length > 0) {
      const fetches = tableBlocks.map(async (tb) => {
        const res = await notionFetch<NotionBlockChildrenResponse>(
          `/blocks/${tb.id}/children?page_size=100`,
          { priority: 'high' },
        );
        childrenMap.set(tb.id, res.results);
      });
      await Promise.all(fetches);
    }

    const markdown = blocksToMarkdown(blocks, childrenMap);
    const properties = extractProperties(
      page.properties as Record<string, Record<string, unknown>> | undefined,
    );

    return NextResponse.json({
      page: {
        id: page.id,
        title: extractPageTitle(page.properties) || 'Untitled',
        icon: page.icon,
        lastEditedTime: page.last_edited_time,
        createdTime: page.created_time,
        url: page.url,
      },
      properties,
      markdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
