import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';

/** Remove a backend connection from the session. */
export async function POST(request: NextRequest) {
  const { backend } = await request.json();

  if (!backend) {
    return NextResponse.json({ error: 'Missing backend parameter' }, { status: 400 });
  }

  const session = await getSession();
  session.connections = session.connections.filter((c) => c.backend !== backend);

  // If we disconnected the active backend, switch to another or null
  if (session.activeBackend === backend) {
    session.activeBackend = session.connections[0]?.backend ?? null;
  }

  await session.save();

  return NextResponse.json({ ok: true, activeBackend: session.activeBackend });
}
