import { NextResponse } from 'next/server';
import { getAdapterFromRequest } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query = '', max_results = 20 } = body;

    const results = await (await getAdapterFromRequest()).search(query, max_results);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
