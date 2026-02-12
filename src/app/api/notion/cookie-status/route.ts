import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tokenV2 = process.env.NOTION_TOKEN_V2;

  if (!tokenV2) {
    return NextResponse.json({ status: 'missing' });
  }

  try {
    const res = await fetch('https://www.notion.so/api/v3/getSpaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `token_v2=${tokenV2}`,
      },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      return NextResponse.json({ status: 'valid' });
    }
    return NextResponse.json({ status: 'expired' });
  } catch {
    return NextResponse.json({ status: 'expired' });
  }
}
