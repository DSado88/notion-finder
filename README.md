# Potion

A fast, pluggable markdown browser and editor. Navigate content in Miller columns, edit with a rich block editor, and connect to wherever your markdown already lives — GitHub repos, Notion workspaces, local git directories, or anything with an adapter.

Built with Next.js 16, React 19, Plate.js, Zustand, and a backend adapter pattern that treats storage as swappable.

## Thesis

Markdown is becoming the shared language between humans and AI. Agents write it, config files are written in it (CLAUDE.md, .cursorrules, skill files), slash commands operate on it, and every major AI model outputs it natively. Cloudflare just started auto-converting the web to markdown for AI agents. It's the lingua franca.

But there's no good way to *browse and edit* markdown across the places it already lives. Obsidian is vault-bound. Notion converts it to proprietary blocks. GitHub renders it but editing is painful. VS Code is for developers. Every tool either owns the storage or is just an editor for a single file.

The missing piece is a **multi-backend markdown surface** — something that treats a GitHub repo, a Notion workspace, a Linear project, or a Supabase table as interchangeable sources of navigable, editable markdown. The tool is the viewing/editing layer. Storage is pluggable.

That's what this is. The adapter interface (`BackendAdapter`) already supports three backends through the same UI. Adding a new one means implementing ~14 methods. The editor doesn't know or care where the content comes from.

As AI tools generate more markdown — docs, specs, changelogs, agent output — the need for a fast, universal way to read and manage it across services will only grow. Right now that lane is open.

## Features

- **Miller columns** — Navigate content hierarchy like macOS Finder. Click to drill down, breadcrumb to go back.
- **Rich editor** — Plate.js block editor with headings, lists, code blocks, tables, links, slash commands, and a floating toolbar. Auto-saves on edit.
- **Table manipulation** — Floating toolbar when cursor is in a table: insert/delete rows and columns.
- **Block handles** — Hover to reveal drag handle and "+" button for adding blocks, following Plate's official DnD pattern.
- **Multiple backends** — Swap between Notion, GitHub, or local git via `BACKEND_TYPE` env var. Same UI, same editor, different storage.
- **Branch workflow** — On GitHub backend, edits go to a working branch. Create a PR when ready.
- **Drag and drop** — Move pages between parents by dragging.
- **Inline rename** — Double-click, press Enter, or F2 to rename. Optimistic updates with rollback on failure.
- **Create pages** — "+" button in column headers. New pages auto-enter rename mode.
- **Archive** — Delete key or context menu. Confirmation modal with child-count warning. Bulk archive for multi-select.
- **Multi-select** — Cmd+Click to toggle, Shift+Click for range.
- **Hover prefetch** — Preview data prefetches on hover (150ms debounce) so clicks feel instant.
- **Virtualized columns** — Handles thousands of items via `@tanstack/react-virtual`.
- **Per-column sort** — Sort by title, type, or last edited, ascending or descending.
- **Dark mode** — Respects system preference.

## Setup

### Quick Start (GitHub backend)

```env
BACKEND_TYPE=git-github
GITHUB_TOKEN=ghp_...
GITHUB_REPO=owner/repo
GITHUB_BRANCH=main
```

### Quick Start (Local git backend)

```env
BACKEND_TYPE=git-local
GIT_REPO_PATH=/path/to/your/repo
```

### Notion backend

```env
BACKEND_TYPE=notion
NOTION_API_TOKEN=ntn_...

# Optional — for workspace-root moves
NOTION_TOKEN_V2=...
NOTION_SPACE_ID=...
```

Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) with read/update/insert capabilities.

### Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3099](http://localhost:3099).

## Architecture

```
src/
├── app/api/workspace/  # Generic API routes — all go through getAdapter()
├── components/
│   ├── miller/         # Column browser (container, column, item, context menu)
│   ├── editor/         # Plate.js editor (block draggable, floating toolbars, table elements)
│   └── preview/        # Preview panel (page content, database schema)
├── hooks/              # use-create, use-rename, use-delete, use-preview, etc.
├── lib/
│   ├── adapters/       # BackendAdapter interface + factory + implementations
│   │   ├── types.ts          # Interface: 14 methods + BackendCapabilities
│   │   ├── factory.ts        # BACKEND_TYPE → adapter singleton
│   │   ├── notion-adapter.ts
│   │   ├── git-github-adapter.ts
│   │   └── git-local-adapter.ts
│   ├── notion-service  # Server-side Notion client (used by notion adapter)
│   └── rate-limiter    # Token bucket for API rate limiting
├── stores/
│   └── finder-store    # Zustand store — navigation, selection, optimistic mutations
└── types/
    └── finder          # FinderItem, sort types
```

**Key design decisions:**

- **Adapter pattern** — `BackendAdapter` interface with `BackendCapabilities` feature flags. UI components check capabilities at runtime to show/hide features (edit, branch, sync). Adding a new backend = implement the interface + add a factory case.
- **Generic API layer** — All `/api/workspace/*` routes call `getAdapter()`. Zero backend-specific code in the API layer.
- **Optimistic mutations** — All writes update the UI immediately. Failures roll back.
- **Preview cache** — Module-level Map (outside Zustand) avoids store notifications for large markdown strings. Tracks data-to-item-ID mapping to prevent stale content on page switches.

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
- [Plate.js](https://platejs.org/) (block editor)
- [Zustand 5](https://zustand.docs.pmnd.rs/) (state management)
- [TanStack Virtual](https://tanstack.com/virtual) (virtualized lists)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Vitest](https://vitest.dev/) (testing)

## License

MIT
