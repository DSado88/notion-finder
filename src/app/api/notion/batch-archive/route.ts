import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { page_ids } = body;

    if (!Array.isArray(page_ids) || page_ids.length === 0) {
      return NextResponse.json(
        { error: 'page_ids must be a non-empty array' },
        { status: 400 },
      );
    }

    const result = await notionService.batchArchive(page_ids);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
