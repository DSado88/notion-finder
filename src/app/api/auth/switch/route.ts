import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';

/** Switch the active backend connection. */
export async function POST(request: NextRequest) {
  const { backend } = await request.json();

  if (!backend) {
    return NextResponse.json({ error: 'Missing backend parameter' }, { status: 400 });
  }

  const session = await getSession();
  const connection = session.connections.find((c) => c.backend === backend);

  if (!connection) {
    return NextResponse.json({ error: `No connection found for ${backend}` }, { status: 404 });
  }

  session.activeBackend = backend;
  await session.save();

  return NextResponse.json({ ok: true, activeBackend: session.activeBackend });
}
