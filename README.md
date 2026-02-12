# Notion Finder

A macOS Finder-style file browser for your Notion workspace. Navigate pages and databases in Miller columns with instant preview, drag-and-drop moves, inline rename, and bulk operations.

Built with Next.js 16, React 19, Zustand, and the Notion API.

## Features

- **Miller columns** — Navigate your workspace hierarchy like macOS Finder. Click to drill down, breadcrumb to go back.
- **Preview panel** — Select any page to see its content rendered as markdown. Database previews show schema and recent entries.
- **Drag and drop** — Move pages between parents by dragging. Supports workspace-root moves via Notion's internal API.
- **Inline rename** — Double-click, press Enter, or F2 to rename. Optimistic updates with rollback on failure.
- **Create pages** — "+" button in column headers. New pages auto-enter rename mode.
- **Archive** — Delete key or context menu. Confirmation modal with child-count warning. Bulk archive for multi-select.
- **Multi-select** — Cmd+Click to toggle, Shift+Click for range. Operates on the sorted column order.
- **Hover prefetch** — Preview data prefetches on hover (150ms debounce) so clicks feel instant.
- **Virtualized columns** — Handles thousands of items via `@tanstack/react-virtual`.
- **Per-column sort** — Sort by title, type, or last edited, ascending or descending.
- **Dark mode** — Respects system preference.

## Setup

### 1. Notion Integration

Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations):

1. Create a new integration with "Read content", "Update content", and "Insert content" capabilities
2. Copy the API token

### 2. Environment Variables

```bash
cp .env.example .env.local
```

```env
# Required — Notion API integration token
NOTION_API_TOKEN=ntn_...

# Optional — for workspace-root moves and page creation at root level
# Run `npm run setup:token` to grab these automatically
NOTION_TOKEN_V2=...
NOTION_SPACE_ID=...
```

The `NOTION_TOKEN_V2` and `NOTION_SPACE_ID` are only needed for operations that the public Notion API doesn't support (creating pages at workspace root, moving pages to workspace root). The interactive setup script opens a browser for you to log in and extracts the session cookie automatically.

### 3. Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3099](http://localhost:3099).

## Architecture

```
src/
├── app/api/notion/     # Next.js API routes (proxy to Notion API)
├── components/
│   ├── miller/         # Column browser (container, column, item, context menu)
│   └── preview/        # Preview panel (page content, database schema)
├── hooks/              # use-create, use-rename, use-delete, use-preview, etc.
├── lib/
│   ├── notion-service  # Server-side Notion client with workspace index + caching
│   ├── rate-limiter    # Token bucket (3 req/s) for Notion API
│   └── paginator       # Cursor-based pagination helper
├── stores/
│   └── finder-store    # Zustand store — navigation, selection, optimistic mutations
└── types/
    └── finder          # FinderItem, NotionIcon, sort types
```

**Key design decisions:**

- **Workspace index** — On first load, paginates through all items via `/search` and builds a `parentId → children[]` map. Subsequent navigations are instant (no API calls). Index persists to disk with 30-min TTL.
- **In-place index patches** — CRUD operations surgically update the index instead of triggering full rebuilds.
- **Optimistic mutations** — All writes update the UI immediately. Failures roll back to the previous state.
- **Preview cache** — Module-level Map (outside Zustand) avoids store notifications for large markdown strings. 5-minute server-side content cache.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3099 |
| `npm run build` | Production build |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run setup:token` | Interactive browser login to grab `NOTION_TOKEN_V2` |

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router)
- [React 19](https://react.dev/)
- [Zustand 5](https://zustand.docs.pmnd.rs/) (state management)
- [TanStack Virtual](https://tanstack.com/virtual) (virtualized lists)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Vitest](https://vitest.dev/) (testing)

## License

MIT
