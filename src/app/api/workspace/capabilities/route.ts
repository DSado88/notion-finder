import { NextResponse } from 'next/server';
import { getAdapterFromRequest, AdapterResolutionError } from '@/lib/adapters';

export async function GET() {
  try {
    const adapter = await getAdapterFromRequest();
    return NextResponse.json({
      name: adapter.name,
      capabilities: adapter.capabilities,
    });
  } catch (err) {
    if (err instanceof AdapterResolutionError) {
      return NextResponse.json({ error: 'No active connection' }, { status: 401 });
    }
    throw err;
  }
}
