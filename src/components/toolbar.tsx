'use client';

import { useShallow } from 'zustand/react/shallow';
import { useFinderStore } from '@/stores/finder-store';
import { CookieStatus } from './cookie-status';
import { useBackend } from '@/hooks/use-backend';
import { useSync } from '@/hooks/use-sync';
import { useBranch } from '@/hooks/use-branch';

export function Toolbar() {
  const columnPath = useFinderStore(useShallow((s) => s.columnPath));
  const selections = useFinderStore(useShallow((s) => s.selections));
  const itemById = useFinderStore((s) => s.itemById);
  const breadcrumbClick = useFinderStore((s) => s.breadcrumbClick);
  const viewMode = useFinderStore((s) => s.viewMode);
  const setViewMode = useFinderStore((s) => s.setViewMode);
  const { name: backendName, capabilities } = useBackend();
  const canSync = capabilities?.canSync ?? false;
  const canBranch = capabilities?.canBranch ?? false;
  const { status: syncStatus, isSyncing, pull, push } = useSync(canSync);
  const { status: branchStatus, isCreatingPr, createPr, discard } = useBranch(canBranch);
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

      {backendName && (
        <div
          className="flex flex-none items-center gap-1.5 rounded px-2 py-0.5 text-[11px]"
          style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
          title={capabilities ? `Edit: ${capabilities.canEdit ? 'yes' : 'no'} | Create: ${capabilities.canCreate ? 'yes' : 'no'} | Delete: ${capabilities.canDelete ? 'yes' : 'no'} | Move: ${capabilities.canMove ? 'yes' : 'no'} | Search: ${capabilities.canSearch ? 'yes' : 'no'}` : undefined}
        >
          <span className="opacity-60">{backendName}</span>
          {capabilities?.canEdit && (
            <span className="rounded bg-green-500/15 px-1 text-[10px] text-green-600 dark:text-green-400">
              editable
            </span>
          )}
          {capabilities && !capabilities.canEdit && (
            <span className="rounded bg-yellow-500/15 px-1 text-[10px] text-yellow-600 dark:text-yellow-400">
              read-only
            </span>
          )}
        </div>
      )}

      {canSync && syncStatus?.hasRemote && (
        <div className="flex flex-none items-center gap-0.5 rounded p-0.5 text-[11px]" style={{ border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={pull}
            disabled={isSyncing}
            className="rounded px-1.5 py-0.5 opacity-60 hover:bg-black/[0.04] hover:opacity-100 disabled:opacity-30 dark:hover:bg-white/[0.04]"
            title={`Pull from remote${syncStatus.behind > 0 ? ` (${syncStatus.behind} behind)` : ''}`}
          >
            {syncStatus.behind > 0 && (
              <span className="mr-0.5 text-[10px] text-blue-500">{syncStatus.behind}</span>
            )}
            &#x2193;
          </button>
          <button
            type="button"
            onClick={push}
            disabled={isSyncing}
            className="rounded px-1.5 py-0.5 opacity-60 hover:bg-black/[0.04] hover:opacity-100 disabled:opacity-30 dark:hover:bg-white/[0.04]"
            title={`Push to remote${syncStatus.ahead > 0 ? ` (${syncStatus.ahead} ahead)` : ''}`}
          >
            {syncStatus.ahead > 0 && (
              <span className="mr-0.5 text-[10px] text-green-500">{syncStatus.ahead}</span>
            )}
            &#x2191;
          </button>
        </div>
      )}

      {canBranch && branchStatus?.workingBranch && (
        <div
          className="flex flex-none items-center gap-1.5 rounded px-2 py-0.5 text-[11px]"
          style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <span className="max-w-[140px] truncate opacity-60" title={branchStatus.workingBranch}>
            {branchStatus.workingBranch.replace('potion/', '')}
          </span>
          {branchStatus.changedFiles.length > 0 && (
            <span className="rounded bg-blue-500/15 px-1 text-[10px] text-blue-600 dark:text-blue-400">
              {branchStatus.changedFiles.length} changed
            </span>
          )}
          {branchStatus.changedFiles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                createPr()
                  .then((result) => {
                    if (result?.url) window.open(result.url, '_blank');
                  })
                  .catch((err) => {
                    console.error('Create PR failed:', err);
                    alert(err.message || 'Failed to create PR');
                  });
              }}
              disabled={isCreatingPr}
              className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-600 hover:bg-green-500/25 disabled:opacity-30 dark:text-green-400"
            >
              {isCreatingPr ? 'Creating...' : 'Create PR'}
            </button>
          )}
          <button
            type="button"
            onClick={discard}
            className="rounded px-1 py-0.5 text-[10px] opacity-40 hover:text-red-500 hover:opacity-100"
            title="Discard working branch"
          >
            &#x2715;
          </button>
        </div>
      )}

      <CookieStatus />

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
