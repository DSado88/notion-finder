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
    const adapter = await getAdapterFromRequest();

    const children =
      id === 'workspace'
        ? await adapter.getRootItems()
        : await adapter.getChildren(id);

    return NextResponse.json({ children });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
