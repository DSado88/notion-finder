import { NextResponse } from 'next/server';
import { getAdapterFromRequest } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { parent_id, title } = body;

    if (!parent_id || typeof parent_id !== 'string') {
      return NextResponse.json(
        { error: 'parent_id is required' },
        { status: 400 },
      );
    }

    const item = await (await getAdapterFromRequest()).createPage(parent_id, title ?? 'Untitled');
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
