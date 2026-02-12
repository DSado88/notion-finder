'use client';

import { useShallow } from 'zustand/react/shallow';
import { useFinderStore } from '@/stores/finder-store';

export function Toolbar() {
  const columnPath = useFinderStore(useShallow((s) => s.columnPath));
  const selections = useFinderStore(useShallow((s) => s.selections));
  const itemById = useFinderStore((s) => s.itemById);
  const breadcrumbClick = useFinderStore((s) => s.breadcrumbClick);
  const viewMode = useFinderStore((s) => s.viewMode);
  const setViewMode = useFinderStore((s) => s.setViewMode);
  // Build breadcrumb segments from columnPath + selections
  const segments: { label: string; index: number }[] = columnPath.map(
    (parentId, i) => {
      if (parentId === 'workspace') {
        return { label: 'Workspace', index: i };
      }
      const item = itemById[parentId];
      return { label: item?.title || parentId.slice(0, 8), index: i };
    },
  );

  // Append the selected item in the last column if it exists
  const lastColIndex = columnPath.length - 1;
  const lastSelection = selections[lastColIndex];
  if (lastSelection) {
    const item = itemById[lastSelection];
    if (item && !item.hasChildren) {
      segments.push({
        label: item.title || 'Untitled',
        index: -1, // non-clickable
      });
    }
  }

  return (
    <div className="flex h-9 flex-none items-center gap-1 px-3" style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Breadcrumbs */}
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-[12px]">
        {segments.map((seg, i) => (
          <span key={`${seg.index}-${i}`} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className="text-gray-400 dark:text-gray-500">/</span>
            )}
            {seg.index >= 0 ? (
              <button
                type="button"
                onClick={() => breadcrumbClick(seg.index)}
                className="truncate rounded px-1 py-0.5 opacity-50 hover:bg-black/[0.04] hover:opacity-80 dark:hover:bg-white/[0.04]"
              >
                {seg.label}
              </button>
            ) : (
              <span className="truncate px-1 py-0.5 font-medium">
                {seg.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* View toggle */}
      <div className="flex flex-none items-center gap-0.5 rounded p-0.5" style={{ border: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setViewMode('miller')}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
            viewMode === 'miller'
              ? 'bg-black/[0.06] dark:bg-white/[0.1]'
              : 'opacity-40 hover:opacity-70'
          }`}
          title="Columns view"
        >
          |||
        </button>
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
            viewMode === 'list'
              ? 'bg-black/[0.06] dark:bg-white/[0.1]'
              : 'opacity-40 hover:opacity-70'
          }`}
          title="List view"
        >
          &#x2630;
        </button>
      </div>
    </div>
  );
}
