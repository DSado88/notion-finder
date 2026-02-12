'use client';

import { useEffect, useState } from 'react';
import { useFinderStore } from '@/stores/finder-store';

/**
 * Fetch children for a parent ID. Returns cached data from Zustand
 * if available, otherwise fetches from the API route.
 */
export function useChildren(parentId: string) {
  const children = useFinderStore((s) => s.childrenByParentId[parentId]);
  const setChildren = useFinderStore((s) => s.setChildren);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (children) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/notion/children/${parentId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { children: Parameters<typeof setChildren>[1] }) => {
        if (!cancelled) {
          setChildren(parentId, data.children);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parentId, children, setChildren]);

  return { children: children ?? [], isLoading, error };
}
