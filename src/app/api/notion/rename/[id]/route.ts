import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title } = body;

    if (typeof title !== 'string') {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 },
      );
    }

    await notionService.renamePage(id, title);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
