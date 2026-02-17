import { NextResponse } from 'next/server';
import { getAdapter, AdapterError } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string[] }> },
) {
  try {
    const { id: segments } = await params;
    const id = segments.join('/');
    const body = await req.json();
    const { markdown } = body;

    if (typeof markdown !== 'string') {
      return NextResponse.json(
        { error: 'markdown is required' },
        { status: 400 },
      );
    }

    await getAdapter().saveContent(id, markdown);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdapterError && err.code === 'READ_ONLY') {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
