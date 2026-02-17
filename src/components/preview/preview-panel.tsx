'use client';

import { memo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useFinderStore } from '@/stores/finder-store';
import { usePreview, type PreviewData } from '@/hooks/use-preview';
import { useRename } from '@/hooks/use-rename';
import { useBackend } from '@/hooks/use-backend';
import { InlineEdit } from '@/components/inline-edit';

const LazyPlateEditor = dynamic(
  () => import('@/components/editor/plate-editor').then((m) => m.PlateEditor),
  { ssr: false },
);

function EditableTitle({
  itemId,
  data,
}: {
  itemId: string;
  data: Extract<PreviewData, { type: 'page' }>;
}) {
  const { renamePage } = useRename();
  // Use store title (always current via optimistic update) instead of
  // data.title which can be stale from a re-fetch that races the rename.
  const storeTitle = useFinderStore((s) => s.itemById[itemId]?.title);
  const title = storeTitle || data.title || 'Untitled';
  const isEditing = useFinderStore((s) => s.editingItemId === itemId);
  const startEditing = useFinderStore((s) => s.startEditing);
  const stopEditing = useFinderStore((s) => s.stopEditing);

  const handleConfirm = useCallback(
    (newTitle: string) => { renamePage(itemId, newTitle); },
    [itemId, renamePage],
  );

  if (isEditing) {
    return (
      <InlineEdit
        value={title}
        onConfirm={handleConfirm}
        onCancel={stopEditing}
        className="w-full text-2xl font-bold outline-none ring-1 ring-blue-400 rounded-sm px-0.5 bg-white dark:bg-zinc-800"
        style={{ color: 'var(--foreground)' }}
      />
    );
  }

  return (
    <h2
      className="text-2xl font-bold cursor-text"
      style={{ color: 'var(--foreground)' }}
      onDoubleClick={() => startEditing(itemId)}
    >
      {data.icon && <span className="mr-2">{data.icon}</span>}
      {title}
    </h2>
  );
}

const PagePreviewContent = memo(function PagePreviewContent({ itemId, data }: { itemId: string; data: Extract<PreviewData, { type: 'page' }> }) {
  const setPendingDelete = useFinderStore((s) => s.setPendingDelete);
  const item = useFinderStore((s) => s.itemById[itemId]);
  const { capabilities } = useBackend();
  const canEdit = capabilities?.canEdit ?? false;

  const handleSave = useCallback(
    async (markdown: string) => {
      const res = await fetch(`/api/workspace/content/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: HTTP ${res.status}`);
      }
    },
    [itemId],
  );

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-start justify-between gap-2">
        <EditableTitle itemId={itemId} data={data} />
        <div className="mt-1.5 flex flex-none items-center gap-2">
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] opacity-40 hover:opacity-70"
            >
              Open &#x2197;
            </a>
          )}
          {item?.type === 'page' && capabilities?.canDelete !== false && (
            <button
              type="button"
              onClick={() =>
                setPendingDelete({
                  items: [item],
                  parentId: item.parentId ?? 'workspace',
                })
              }
              className="text-[11px] text-red-500/60 hover:text-red-500"
            >
              Archive
            </button>
          )}
        </div>
      </div>
      {data.lastEditedTime && !isNaN(new Date(data.lastEditedTime).getTime()) && (
        <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
          Last edited {new Date(data.lastEditedTime).toLocaleDateString()}
        </p>
      )}
      {data.properties.length > 0 && (
        <div className="mb-4 rounded" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-[13px]">
            <tbody>
              {data.properties.map((prop) => (
                <tr key={prop.name} className="last:border-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-2.5 py-1.5 font-medium" style={{ color: 'var(--muted)', width: '35%' }}>{prop.name}</td>
                  <td className="px-2.5 py-1.5" style={{ color: 'var(--foreground)' }}>{prop.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.markdown ? (
        <LazyPlateEditor
          itemId={itemId}
          initialMarkdown={data.markdown}
          readOnly={!canEdit}
          onSave={canEdit ? handleSave : undefined}
        />
      ) : (
        <p className="text-sm italic" style={{ color: 'var(--muted)' }}>Empty page</p>
      )}
    </div>
  );
});

function DatabasePreviewContent({ data }: { data: Extract<PreviewData, { type: 'database' }> }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {data.title || 'Untitled Database'}
        </h2>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-none text-[11px] text-blue-500 hover:underline"
        >
          Open in Notion
        </a>
      </div>
      <p className="text-[11px] text-gray-400">
        Last edited {new Date(data.lastEditedTime).toLocaleDateString()}
      </p>

      {/* Schema */}
      <div>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
          Schema ({data.schema.length} properties)
        </h3>
        <div className="rounded border border-gray-200 dark:border-white/10">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-white/10 dark:bg-white/[0.02]">
                <th className="px-2 py-1 text-left font-medium text-gray-500">Name</th>
                <th className="px-2 py-1 text-left font-medium text-gray-500">Type</th>
              </tr>
            </thead>
            <tbody>
              {data.schema.map((prop) => (
                <tr key={prop.id} className="border-b border-gray-100 last:border-0 dark:border-white/5">
                  <td className="px-2 py-1 text-gray-900 dark:text-gray-200">{prop.name}</td>
                  <td className="px-2 py-1">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-white/10 dark:text-gray-400">
                      {prop.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent entries */}
      {data.recentEntries.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
            Recent entries ({data.recentEntries.length})
          </h3>
          <div className="flex flex-col gap-0.5">
            {data.recentEntries.map((entry) => (
              <a
                key={entry.id}
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded px-2 py-1 text-[12px] hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <span className="truncate text-gray-900 dark:text-gray-200">
                  {entry.title || 'Untitled'}
                </span>
                <span className="ml-2 flex-none text-[10px] text-gray-400">
                  {new Date(entry.lastEditedTime).toLocaleDateString()}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PreviewPanel() {
  const previewTargetId = useFinderStore((s) => s.previewTargetId);
  const item = useFinderStore((s) =>
    previewTargetId ? s.itemById[previewTargetId] : null,
  );
  const { data, isLoading, error } = usePreview(item ?? null);

  if (!previewTargetId) {
    return (
      <div className="flex h-full min-w-[300px] flex-1 items-center justify-center" style={{ borderLeft: '1px solid var(--border)' }}>
        <p className="text-sm text-gray-400">Select an item to preview</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-[300px] flex-1 flex-col overflow-hidden" style={{ borderLeft: '1px solid var(--border)' }}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading && !data && (
          <div className="flex flex-col">
            {/* Show metadata instantly from store while content loads */}
            {item && (
              <>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                    {item.icon && typeof item.icon === 'object' && 'emoji' in item.icon && (
                      <span className="mr-2">{item.icon.emoji}</span>
                    )}
                    {item.title || 'Untitled'}
                  </h2>
                  <div className="mt-1.5 flex flex-none items-center gap-2">
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[11px] opacity-40 hover:opacity-70">
                        Open in Notion &#x2197;
                      </a>
                    )}
                  </div>
                </div>
                {item.lastEditedTime && (
                  <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
                    Last edited {new Date(item.lastEditedTime).toLocaleDateString()}
                  </p>
                )}
              </>
            )}
            <div className="mt-2 space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="h-4 animate-pulse rounded bg-gray-100 dark:bg-white/5"
                  style={{ width: `${50 + Math.random() * 50}%` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            Failed to load preview: {error}
          </div>
        )}

        {data?.type === 'page' && <PagePreviewContent itemId={previewTargetId} data={data} />}
        {data?.type === 'database' && <DatabasePreviewContent data={data} />}
      </div>
    </div>
  );
}
