/**
 * Extract plain-text title from any Notion object.
 * Handles pages, databases, blocks (child_page, child_database).
 */

import type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionRichText,
} from '@/types/finder';

function richTextToPlain(richText: NotionRichText[]): string {
  return richText.map((t) => t.plain_text).join('');
}

export function extractTitle(
  obj: NotionPage | NotionDatabase | NotionBlock,
): string {
  // Database — title is a top-level array
  if (obj.object === 'database') {
    const db = obj as NotionDatabase;
    if (db.title?.length) {
      return richTextToPlain(db.title);
    }
    return 'Untitled Database';
  }

  // Block — child_page and child_database have inline titles
  if (obj.object === 'block') {
    const block = obj as NotionBlock;
    if (block.type === 'child_page') {
      const childPage = block.child_page as { title?: string } | undefined;
      return childPage?.title || 'Untitled';
    }
    if (block.type === 'child_database') {
      const childDb = block.child_database as { title?: string } | undefined;
      return childDb?.title || 'Untitled Database';
    }
    return `[${block.type}]`;
  }

  // Page — title is in a property with type "title"
  if (obj.object === 'page') {
    const page = obj as NotionPage;
    for (const prop of Object.values(page.properties)) {
      if (prop.type === 'title' && prop.title?.length) {
        return richTextToPlain(prop.title);
      }
    }
    return 'Untitled';
  }

  return 'Untitled';
}
