import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parentId = id === 'workspace' ? 'workspace' : id;

    const children =
      parentId === 'workspace'
        ? await notionService.getRootItems()
        : await notionService.getChildren(parentId);

    return NextResponse.json({ children });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
