import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rootId = searchParams.get('root_id') ?? 'workspace';
    const rawDepth = parseInt(searchParams.get('max_depth') ?? '2', 10);
    const maxDepth = Number.isNaN(rawDepth) ? 2 : Math.max(1, Math.min(rawDepth, 5));
    const idsOnly = searchParams.get('ids_only') === 'true';

    const tree = await notionService.getTree(rootId, maxDepth, idsOnly);
    return NextResponse.json(tree);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
