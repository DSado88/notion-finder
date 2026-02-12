'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFinderStore } from '@/stores/finder-store';
import { useDelete } from '@/hooks/use-delete';

export function DeleteConfirmModal() {
  const pendingDelete = useFinderStore((s) => s.pendingDelete);
  const setPendingDelete = useFinderStore((s) => s.setPendingDelete);
  const { archivePage, batchArchive } = useDelete();
  const [isArchiving, setIsArchiving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    if (!isArchiving) setPendingDelete(null);
  }, [isArchiving, setPendingDelete]);

  // Escape to dismiss
  useEffect(() => {
    if (!pendingDelete) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [pendingDelete, dismiss]);

  // Click outside to dismiss
  useEffect(() => {
    if (!pendingDelete) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) dismiss();
    };
    // Use setTimeout to avoid the event that triggered the modal from closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handle);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handle);
    };
  }, [pendingDelete, dismiss]);

  const handleArchive = useCallback(async () => {
    if (!pendingDelete) return;
    setIsArchiving(true);
    try {
      if (pendingDelete.items.length === 1) {
        await archivePage(pendingDelete.items[0].id, pendingDelete.parentId);
      } else {
        const ids = pendingDelete.items.map((item) => item.id);
        await batchArchive(ids, pendingDelete.parentId);
      }
      setPendingDelete(null);
    } catch {
      // Errors handled by hooks (rollback). Still close modal.
      setPendingDelete(null);
    } finally {
      setIsArchiving(false);
    }
  }, [pendingDelete, archivePage, batchArchive, setPendingDelete]);

  if (!pendingDelete) return null;

  const { items } = pendingDelete;
  const isBulk = items.length > 1;
  const hasChildren = items.some((i) => i.hasChildren);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        ref={ref}
        className="w-[340px] rounded-lg border border-gray-200 bg-white p-5 shadow-xl dark:border-white/15 dark:bg-zinc-800"
      >
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {isBulk
            ? `Archive ${items.length} pages?`
            : `Archive "${items[0].title || 'Untitled'}"?`}
        </h3>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          {hasChildren
            ? 'All sub-pages will also be archived.'
            : 'This page will be moved to the trash in Notion.'}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            disabled={isArchiving}
            className="rounded px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={isArchiving}
            className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {isArchiving ? 'Archiving...' : 'Archive'}
          </button>
        </div>
      </div>
    </div>
  );
}
