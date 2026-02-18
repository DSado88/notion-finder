import { NextResponse } from 'next/server';
import { getSession, toConnectionInfo, isEnvVarMode } from '@/lib/session';
import { getBackendType } from '@/lib/adapters';

/** Return all connected backends (without tokens). */
export async function GET() {
  // In env-var mode, return the configured backend as a "connection"
  if (isEnvVarMode()) {
    const type = getBackendType();
    return NextResponse.json({
      mode: 'env',
      connections: [{
        backend: type,
        workspaceName: `${type} (local config)`,
        isActive: true,
      }],
    });
  }

  const session = await getSession();

  return NextResponse.json({
    mode: 'oauth',
    connections: toConnectionInfo(session.connections, session.activeBackend),
  });
}
