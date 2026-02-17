import { NextResponse } from 'next/server';
import { getAdapter } from '@/lib/adapters';

export const dynamic = 'force-dynamic';

/** GET /api/workspace/sync — sync status (ahead/behind) */
export async function GET() {
  try {
    const adapter = getAdapter();
    if (!adapter.getSyncStatus) {
      return NextResponse.json(
        { error: 'Sync not supported by this backend' },
        { status: 501 },
      );
    }
    const status = await adapter.getSyncStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/workspace/sync — pull, push, or commit */
export async function POST(req: Request) {
  try {
    const adapter = getAdapter();
    const body = await req.json();
    const { action, message } = body as { action: string; message?: string };

    switch (action) {
      case 'pull':
        if (!adapter.syncPull) {
          return NextResponse.json({ error: 'Sync not supported' }, { status: 501 });
        }
        await adapter.syncPull();
        return NextResponse.json({ success: true });

      case 'push':
        if (!adapter.syncPush) {
          return NextResponse.json({ error: 'Sync not supported' }, { status: 501 });
        }
        await adapter.syncPush();
        return NextResponse.json({ success: true });

      case 'commit':
        if (!adapter.syncCommitAll) {
          return NextResponse.json({ error: 'Sync not supported' }, { status: 501 });
        }
        await adapter.syncCommitAll(message || 'Save all changes');
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json(
          { error: `Unknown sync action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
