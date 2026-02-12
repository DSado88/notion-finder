'use client';

import { useShallow } from 'zustand/react/shallow';
import { useFinderStore } from '@/stores/finder-store';

export function Toolbar() {
  const columnPath = useFinderStore(useShallow((s) => s.columnPath));
  const selections = useFinderStore(useShallow((s) => s.selections));
  const itemById = useFinderStore((s) => s.itemById);
  const breadcrumbClick = useFinderStore((s) => s.breadcrumbClick);

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
    <div className="flex h-9 flex-none items-center gap-1 border-b border-gray-200 bg-gray-50/80 px-3 dark:border-white/10 dark:bg-white/[0.02]">
      {/* Breadcrumbs */}
      <nav className="flex min-w-0 items-center gap-0.5 text-[12px]">
        {segments.map((seg, i) => (
          <span key={`${seg.index}-${i}`} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className="text-gray-400 dark:text-gray-500">/</span>
            )}
            {seg.index >= 0 ? (
              <button
                type="button"
                onClick={() => breadcrumbClick(seg.index)}
                className="truncate rounded px-1 py-0.5 text-gray-600 hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-gray-100"
              >
                {seg.label}
              </button>
            ) : (
              <span className="truncate px-1 py-0.5 font-medium text-gray-900 dark:text-gray-100">
                {seg.label}
              </span>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
