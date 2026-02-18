import { NextResponse } from 'next/server';
import { getAdapterFromRequest } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string[] }> },
) {
  try {
    const { id: segments } = await params;
    const id = segments.join('/');
    const content = await (await getAdapterFromRequest()).getContent(id);

    return NextResponse.json({
      page: {
        id,
        title: content.title,
        icon: content.icon ? { emoji: content.icon } : null,
        lastEditedTime: content.lastEditedTime,
        url: content.url,
      },
      properties: content.properties ?? [],
      markdown: content.markdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
