'use client';

import { useFinderStore } from '@/stores/finder-store';
import { usePreview, type PreviewData } from '@/hooks/use-preview';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function PagePreviewContent({ data }: { data: Extract<PreviewData, { type: 'page' }> }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {data.title || 'Untitled'}
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
      {data.markdown ? (
        <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.markdown}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">Empty page</p>
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
      <div className="flex flex-1 items-center justify-center border-l border-gray-200 bg-gray-50/30 dark:border-white/10 dark:bg-white/[0.01]">
        <p className="text-sm text-gray-400">Select an item to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-l border-gray-200 dark:border-white/10">
      <div className="flex-1 overflow-y-auto p-4">
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

        {data?.type === 'page' && <PagePreviewContent data={data} />}
        {data?.type === 'database' && <DatabasePreviewContent data={data} />}
      </div>
    </div>
  );
}
