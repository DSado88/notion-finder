import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';
import { blocksToMarkdown } from '@/lib/block-to-markdown';
import type { NotionBlock, NotionBlockChildrenResponse } from '@/types/finder';
import { notionFetch } from '@/lib/notion-client';

export const dynamic = 'force-dynamic';

function extractPageTitle(properties: Record<string, unknown> | undefined): string {
  if (!properties) return '';
  // Find the property with type "title" (name varies — "title", "Name", "Task", etc.)
  for (const prop of Object.values(properties)) {
    const p = prop as { type?: string; title?: { plain_text: string }[] };
    if (p.type === 'title' && Array.isArray(p.title)) {
      return p.title.map((t) => t.plain_text).join('');
    }
  }
  return '';
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

    return NextResponse.json({
      page: {
        id: page.id,
        title: extractPageTitle(page.properties) || 'Untitled',
        icon: page.icon,
        lastEditedTime: page.last_edited_time,
        createdTime: page.created_time,
        url: page.url,
      },
      markdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
