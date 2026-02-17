import { NextResponse } from 'next/server';
import { getAdapter } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string[] }> },
) {
  try {
    const { id: segments } = await params;
    const id = segments.join('/');
    await getAdapter().archivePage(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
