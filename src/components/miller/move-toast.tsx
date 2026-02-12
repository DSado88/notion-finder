'use client';

import { useEffect } from 'react';
import { useDragStore } from '@/stores/drag-store';

export function MoveToast() {
  const isMoving = useDragStore((s) => s.isMoving);
  const moveError = useDragStore((s) => s.moveError);
  const clearError = useDragStore((s) => s.clearError);

  useEffect(() => {
    if (moveError) {
      const timer = setTimeout(clearError, 4000);
      return () => clearTimeout(timer);
    }
  }, [moveError, clearError]);

  if (!isMoving && !moveError) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-lg dark:border-white/15 dark:bg-zinc-800">
      {isMoving && (
        <div className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
          Moving page...
        </div>
      )}
      {moveError && (
        <div className="text-[13px] text-red-600 dark:text-red-400">
          {moveError}
        </div>
      )}
    </div>
  );
}
