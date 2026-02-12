import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';
import { blocksToMarkdown } from '@/lib/block-to-markdown';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { page, blocks } = await notionService.getPage(id);
    const markdown = blocksToMarkdown(blocks);

    return NextResponse.json({
      page: {
        id: page.id,
        title: page.properties?.title?.title
          ?.map((t: { plain_text: string }) => t.plain_text)
          .join('') || 'Untitled',
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
