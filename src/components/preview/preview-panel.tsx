'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useFinderStore } from '@/stores/finder-store';
import { usePreview, type PreviewData } from '@/hooks/use-preview';
import { useRename } from '@/hooks/use-rename';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function EditableTitle({
  itemId,
  data,
}: {
  itemId: string;
  data: Extract<PreviewData, { type: 'page' }>;
}) {
  const { renamePage } = useRename();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(data.title || 'Untitled');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      confirmedRef.current = false;
      readyRef.current = false;
      setDraft(data.title || 'Untitled');
      const rafId = requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
          readyRef.current = true;
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [isEditing, data.title]);

  const confirm = useCallback(() => {
    if (!readyRef.current) return;
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    renamePage(itemId, draft);
    setIsEditing(false);
  }, [itemId, draft, renamePage]);

  const cancel = useCallback(() => {
    confirmedRef.current = true;
    setIsEditing(false);
  }, []);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); confirm(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onBlur={confirm}
        className="w-full text-2xl font-bold outline-none ring-1 ring-blue-400 rounded-sm px-0.5 bg-white dark:bg-zinc-800"
        style={{ color: 'var(--foreground)' }}
      />
    );
  }

  return (
    <h2
      className="text-2xl font-bold cursor-text"
      style={{ color: 'var(--foreground)' }}
      onDoubleClick={() => setIsEditing(true)}
    >
      {data.icon && <span className="mr-2">{data.icon}</span>}
      {data.title || 'Untitled'}
    </h2>
  );
}

function PagePreviewContent({ itemId, data }: { itemId: string; data: Extract<PreviewData, { type: 'page' }> }) {
  const setPendingDelete = useFinderStore((s) => s.setPendingDelete);
  const item = useFinderStore((s) => s.itemById[itemId]);

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-start justify-between gap-2">
        <EditableTitle itemId={itemId} data={data} />
        <div className="mt-1.5 flex flex-none items-center gap-2">
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] opacity-40 hover:opacity-70"
          >
            Open in Notion &#x2197;
          </a>
          {item?.type === 'page' && (
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
      <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
        Last edited {new Date(data.lastEditedTime).toLocaleDateString()}
      </p>
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
        <div className="prose prose-base dark:prose-invert max-w-none leading-relaxed prose-headings:font-semibold prose-p:my-1 prose-li:my-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.markdown}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm italic" style={{ color: 'var(--muted)' }}>Empty page</p>
      )}
    </div>
  );
}

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
        {isLoading && (
          <div className="flex flex-col gap-3">
            <div className="h-6 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
            <div className="mt-2 space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
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
