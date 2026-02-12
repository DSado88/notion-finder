import { NextResponse } from 'next/server';
import { notionService } from '@/lib/notion-service';
import { extractTitle } from '@/lib/title-extractor';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { database, entries } = await notionService.getDatabase(id);

    const schema = Object.entries(database.properties).map(([name, prop]) => ({
      name,
      type: prop.type,
      id: prop.id,
    }));

    const recentEntries = entries.map((entry) => ({
      id: entry.id,
      title: extractTitle(entry),
      lastEditedTime: entry.last_edited_time,
      url: entry.url,
    }));

    return NextResponse.json({
      database: {
        id: database.id,
        title: extractTitle(database),
        icon: database.icon,
        lastEditedTime: database.last_edited_time,
        url: database.url,
      },
      schema,
      recentEntries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
