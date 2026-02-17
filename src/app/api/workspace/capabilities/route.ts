import { NextResponse } from 'next/server';
import { getAdapter } from '@/lib/adapters';

export async function GET() {
  const adapter = getAdapter();
  return NextResponse.json({
    name: adapter.name,
    capabilities: adapter.capabilities,
  });
}
