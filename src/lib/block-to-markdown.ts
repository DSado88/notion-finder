/**
 * Convert Notion blocks to markdown.
 * Handles the 10 most common block types, falls back to [unsupported: {type}] for others.
 */

import type { NotionBlock, NotionRichText } from '@/types/finder';

function richTextToMarkdown(richTexts: NotionRichText[]): string {
  if (!richTexts || richTexts.length === 0) return '';
  return richTexts.map((rt) => {
    let text = rt.plain_text;
    if (rt.href) {
      text = `[${text}](${rt.href})`;
    }
    return text;
  }).join('');
}

function getBlockRichText(block: NotionBlock): NotionRichText[] {
  const data = block[block.type] as { rich_text?: NotionRichText[] } | undefined;
  return data?.rich_text ?? [];
}

export function blocksToMarkdown(blocks: NotionBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        lines.push(richTextToMarkdown(getBlockRichText(block)));
        lines.push('');
        break;

      case 'heading_1':
        lines.push(`# ${richTextToMarkdown(getBlockRichText(block))}`);
        lines.push('');
        break;

      case 'heading_2':
        lines.push(`## ${richTextToMarkdown(getBlockRichText(block))}`);
        lines.push('');
        break;

      case 'heading_3':
        lines.push(`### ${richTextToMarkdown(getBlockRichText(block))}`);
        lines.push('');
        break;

      case 'bulleted_list_item':
        lines.push(`- ${richTextToMarkdown(getBlockRichText(block))}`);
        break;

      case 'numbered_list_item':
        lines.push(`1. ${richTextToMarkdown(getBlockRichText(block))}`);
        break;

      case 'to_do': {
        const todoData = block.to_do as { checked?: boolean; rich_text?: NotionRichText[] } | undefined;
        const checked = todoData?.checked ? 'x' : ' ';
        lines.push(`- [${checked}] ${richTextToMarkdown(todoData?.rich_text ?? [])}`);
        break;
      }

      case 'toggle':
        lines.push(`<details><summary>${richTextToMarkdown(getBlockRichText(block))}</summary></details>`);
        lines.push('');
        break;

      case 'code': {
        const codeData = block.code as { language?: string; rich_text?: NotionRichText[] } | undefined;
        const lang = codeData?.language ?? '';
        lines.push(`\`\`\`${lang}`);
        lines.push(richTextToMarkdown(codeData?.rich_text ?? []));
        lines.push('```');
        lines.push('');
        break;
      }

      case 'quote':
        lines.push(`> ${richTextToMarkdown(getBlockRichText(block))}`);
        lines.push('');
        break;

      case 'divider':
        lines.push('---');
        lines.push('');
        break;

      case 'callout': {
        const calloutData = block.callout as { icon?: { emoji?: string }; rich_text?: NotionRichText[] } | undefined;
        const icon = calloutData?.icon?.emoji ?? '💡';
        lines.push(`> ${icon} ${richTextToMarkdown(calloutData?.rich_text ?? [])}`);
        lines.push('');
        break;
      }

      case 'image': {
        const imgData = block.image as { type?: string; file?: { url: string }; external?: { url: string }; caption?: NotionRichText[] } | undefined;
        const url = imgData?.type === 'file' ? imgData.file?.url : imgData?.external?.url;
        const caption = richTextToMarkdown(imgData?.caption ?? []);
        if (url) {
          lines.push(`![${caption || 'image'}](${url})`);
          lines.push('');
        }
        break;
      }

      case 'bookmark': {
        const bmData = block.bookmark as { url?: string; caption?: NotionRichText[] } | undefined;
        if (bmData?.url) {
          const caption = richTextToMarkdown(bmData.caption ?? []);
          lines.push(`[${caption || bmData.url}](${bmData.url})`);
          lines.push('');
        }
        break;
      }

      case 'child_page':
      case 'child_database':
        // Skip — these are navigable items, not content
        break;

      default:
        lines.push(`*[unsupported: ${block.type}]*`);
        lines.push('');
        break;
    }
  }

  return lines.join('\n').trim();
}
