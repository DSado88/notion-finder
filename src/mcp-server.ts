/**
 * Notion Finder MCP Server
 *
 * Standalone entry point for Claude Code integration via stdio transport.
 * Imports the shared NotionService — same core that powers the web UI.
 *
 * Usage:
 *   claude mcp add notion-finder -- node --import=tsx /path/to/mcp-server.ts
 *
 * Or in claude_desktop_config.json:
 *   { "command": "node", "args": ["--import=tsx", "src/mcp-server.ts"], "env": { "NOTION_API_TOKEN": "..." } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { NotionService } from './lib/notion-service.js';

const service = new NotionService();

const server = new McpServer({
  name: 'notion-finder',
  version: '1.0.0',
});

// ─── Tool: Browse Children ───

server.tool(
  'notion_browse_children',
  'List the immediate children of a Notion page or database. Pass parent_id="workspace" to list root-level items.',
  {
    parent_id: z
      .string()
      .describe(
        'The UUID of the parent page/database, or "workspace" for root items',
      ),
  },
  async ({ parent_id }) => {
    try {
      const children =
        parent_id === 'workspace'
          ? await service.getRootItems()
          : await service.getChildren(parent_id, 'low');

      const text = children
        .map(
          (c) =>
            `${c.type === 'database' ? '📊' : '📄'} ${c.title} (${c.id})${c.hasChildren ? ' [has children]' : ''}`,
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `${children.length} items:\n\n${text}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: Get Tree ───

server.tool(
  'notion_get_tree',
  'Get a snapshot of the workspace hierarchy as a nested JSON tree. Use max_depth to control traversal depth (default 2, max 5). WARNING: depth 3+ on the full workspace is slow due to data volume.',
  {
    root_id: z
      .string()
      .optional()
      .default('workspace')
      .describe('Start tree from this node ID. Default: "workspace"'),
    max_depth: z
      .number()
      .optional()
      .default(2)
      .describe('Maximum depth to traverse (1-5, default 2)'),
    ids_only: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, return only IDs and titles (less data)'),
  },
  async ({ root_id, max_depth, ids_only }) => {
    try {
      const tree = await service.getTree(
        root_id,
        Math.min(max_depth, 5),
        ids_only,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: Search ───

server.tool(
  'notion_search',
  'Search the Notion workspace by text query. Returns matching pages and databases.',
  {
    query: z.string().describe('Search text'),
    filter_type: z
      .enum(['page', 'database'])
      .optional()
      .describe('Filter to only pages or only databases'),
    max_results: z
      .number()
      .optional()
      .default(20)
      .describe('Maximum results to return (default 20, max 100)'),
  },
  async ({ query, filter_type, max_results }) => {
    try {
      const results = await service.search(
        query,
        filter_type,
        max_results,
        'low',
      );

      const text = results
        .map(
          (r) =>
            `${r.type === 'database' ? '📊' : '📄'} ${r.title} (${r.id}) — parent: ${r.parentType}${r.parentId ? `=${r.parentId}` : ''}`,
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `${results.length} results:\n\n${text}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: Read Page ───

server.tool(
  'notion_read_page',
  "Read a Notion page's metadata and block content. Returns page title, properties, and content blocks as simplified text.",
  {
    page_id: z.string().describe('The Notion page ID'),
    include_children: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, also list child pages/databases'),
  },
  async ({ page_id, include_children }) => {
    try {
      const { page, blocks } = await service.getPage(page_id, 'low');

      // Extract title
      let title = 'Untitled';
      for (const prop of Object.values(page.properties)) {
        if (prop.type === 'title' && prop.title?.length) {
          title = prop.title.map((t) => t.plain_text).join('');
          break;
        }
      }

      // Simplified block content
      const content = blocks
        .map((b) => {
          const blockData = b[b.type] as
            | { rich_text?: Array<{ plain_text: string }>; title?: string }
            | undefined;
          if (blockData?.rich_text) {
            return blockData.rich_text
              .map((t: { plain_text: string }) => t.plain_text)
              .join('');
          }
          if (b.type === 'child_page') {
            return `[child_page: ${blockData?.title || 'Untitled'}]`;
          }
          if (b.type === 'child_database') {
            return `[child_database: ${blockData?.title || 'Untitled'}]`;
          }
          return `[${b.type}]`;
        })
        .filter(Boolean)
        .join('\n');

      let result = `# ${title}\n\nID: ${page.id}\nURL: ${page.url}\nParent: ${page.parent.type}\nLast edited: ${page.last_edited_time}\n\n---\n\n${content}`;

      if (include_children) {
        const children = await service.getChildren(page_id, 'low');
        const childList = children
          .map((c) => `  - ${c.type === 'database' ? '📊' : '📄'} ${c.title} (${c.id})`)
          .join('\n');
        result += `\n\n---\n\nChildren (${children.length}):\n${childList}`;
      }

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: Move Page ───

server.tool(
  'notion_move_page',
  'Move a single Notion page to a new parent. Fails if the target is invalid.',
  {
    page_id: z.string().describe('The page to move'),
    new_parent_id: z
      .string()
      .describe('Destination parent page ID, or "workspace" for root level'),
  },
  async ({ page_id, new_parent_id }) => {
    try {
      await service.movePage(page_id, new_parent_id, 'low');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Moved page ${page_id} to parent ${new_parent_id}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error moving page: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: Batch Move ───

server.tool(
  'notion_batch_move',
  'Move multiple pages to new parents in one operation. Handles rate limiting internally. Use dry_run to validate before executing.',
  {
    moves: z
      .array(
        z.object({
          page_id: z.string(),
          new_parent_id: z.string(),
        }),
      )
      .describe('Array of {page_id, new_parent_id} moves to execute'),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, validate all moves without executing'),
    stop_on_error: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, stop after first failure'),
  },
  async ({ moves, dry_run, stop_on_error }) => {
    try {
      const result = await service.batchMove(moves, {
        dryRun: dry_run,
        stopOnError: stop_on_error,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool: Get Ancestry ───

server.tool(
  'notion_get_ancestry',
  'Resolve the full parent chain from a page up to the workspace root. Useful for understanding where an item lives in the hierarchy.',
  {
    page_id: z.string().describe('The page or database to resolve ancestry for'),
  },
  async ({ page_id }) => {
    try {
      const chain = await service.getAncestry(page_id, 'low');

      const text = chain
        .map((node, i) => `${'  '.repeat(i)}${node.type === 'database' ? '📊' : '📄'} ${node.title} (${node.id})`)
        .join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Ancestry (${chain.length} levels):\n\n🏠 Workspace\n${text}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Start Server ───

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
