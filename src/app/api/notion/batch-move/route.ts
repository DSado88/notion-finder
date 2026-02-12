import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { moves, dry_run, stop_on_error } = body;

    if (!Array.isArray(moves) || moves.length === 0) {
      return NextResponse.json(
        { error: 'moves array is required and must not be empty' },
        { status: 400 },
      );
    }

    const result = await notionService.batchMove(moves, {
      dryRun: dry_run ?? false,
      stopOnError: stop_on_error ?? false,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
