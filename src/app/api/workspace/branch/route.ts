import { NextResponse } from 'next/server';
import { getAdapter } from '@/lib/adapters';
import { AdapterError } from '@/lib/adapters/types';

export const dynamic = 'force-dynamic';

/** GET /api/workspace/branch — current branch status */
export async function GET() {
  try {
    const adapter = getAdapter();
    if (!adapter.getBranchStatus) {
      return NextResponse.json(
        { error: 'Branch workflow not supported by this backend' },
        { status: 501 },
      );
    }
    return NextResponse.json(await adapter.getBranchStatus());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/workspace/branch — actions: create-pr, discard */
export async function POST(req: Request) {
  try {
    const adapter = getAdapter();
    const body = await req.json();
    const { action, title } = body as { action: string; title?: string };

    switch (action) {
      case 'create-pr': {
        if (!adapter.createPullRequest) {
          return NextResponse.json({ error: 'Not supported' }, { status: 501 });
        }
        const result = await adapter.createPullRequest(title);
        return NextResponse.json(result);
      }
      case 'discard': {
        if (!adapter.discardWorkingBranch) {
          return NextResponse.json({ error: 'Not supported' }, { status: 501 });
        }
        await adapter.discardWorkingBranch();
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json(
          { error: `Unknown branch action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof AdapterError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
