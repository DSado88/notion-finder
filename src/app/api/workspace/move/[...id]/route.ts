import { NextResponse } from 'next/server';
import { getAdapterFromRequest, AdapterError } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string[] }> },
) {
  try {
    const { id: segments } = await params;
    const id = segments.join('/');
    const body = await req.json();
    const { new_parent_id } = body;

    if (!new_parent_id || typeof new_parent_id !== 'string') {
      return NextResponse.json(
        { error: 'new_parent_id is required' },
        { status: 400 },
      );
    }

    await (await getAdapterFromRequest()).movePage(id, new_parent_id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdapterError && err.code === 'CYCLE_DETECTED') {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('Cycle detected') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
