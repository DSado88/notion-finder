import { NextResponse } from 'next/server';
import { getAdapterFromRequest } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { moves, dry_run } = body;

    if (!Array.isArray(moves) || moves.length === 0) {
      return NextResponse.json(
        { error: 'moves array is required and must not be empty' },
        { status: 400 },
      );
    }

    const result = await (await getAdapterFromRequest()).batchMove(moves, {
      dryRun: dry_run ?? false,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
