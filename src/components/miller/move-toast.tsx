'use client';

import { useEffect } from 'react';
import { useDragStore } from '@/stores/drag-store';

export function MoveToast() {
  const moveError = useDragStore((s) => s.moveError);
  const clearError = useDragStore((s) => s.clearError);

  useEffect(() => {
    if (moveError) {
      const timer = setTimeout(clearError, 4000);
      return () => clearTimeout(timer);
    }
  }, [moveError, clearError]);

  if (!moveError) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-lg dark:border-white/15 dark:bg-zinc-800">
      <div className="text-[13px] text-red-600 dark:text-red-400">
        {moveError}
      </div>
    </div>
  );
}
