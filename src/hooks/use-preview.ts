'use client';

import { useEffect, useState } from 'react';
import type { FinderItem } from '@/types/finder';

interface PagePreview {
  type: 'page';
  title: string;
  icon: string | null;
  markdown: string;
  properties: { name: string; value: string }[];
  url: string;
  lastEditedTime: string;
}

interface DatabasePreview {
  type: 'database';
  title: string;
  url: string;
  lastEditedTime: string;
  schema: { name: string; type: string; id: string }[];
  recentEntries: { id: string; title: string; lastEditedTime: string; url: string }[];
}

export type PreviewData = PagePreview | DatabasePreview;

// Simple cache outside Zustand — large markdown strings shouldn't trigger store notifications
const previewCache = new Map<string, PreviewData>();
const prefetchingIds = new Set<string>();

/** Fire-and-forget prefetch. Call on hover to warm the cache before click. */
export function prefetchPreview(item: FinderItem | null) {
  if (!item) return;
  if (previewCache.has(item.id)) return;
  if (prefetchingIds.has(item.id)) return;
  prefetchingIds.add(item.id);

  const endpoint = item.type === 'database'
    ? `/api/notion/database/${item.id}`
    : `/api/notion/page/${item.id}`;

  fetch(endpoint)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      let preview: PreviewData;
      if (item.type === 'database') {
        preview = {
          type: 'database',
          title: json.database.title,
          url: json.database.url,
          lastEditedTime: json.database.lastEditedTime,
          schema: json.schema,
          recentEntries: json.recentEntries,
        };
      } else {
        preview = {
          type: 'page',
          title: json.page.title,
          icon: json.page.icon?.emoji ?? null,
          markdown: json.markdown,
          properties: json.properties ?? [],
          url: json.page.url,
          lastEditedTime: json.page.lastEditedTime,
        };
      }
      previewCache.set(item.id, preview);
    })
    .catch(() => {})
    .finally(() => prefetchingIds.delete(item.id));
}

export function usePreview(item: FinderItem | null) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setData(null);
      return;
    }

    const cached = previewCache.get(item.id);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const endpoint = item.type === 'database'
      ? `/api/notion/database/${item.id}`
      : `/api/notion/page/${item.id}`;

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;

        let preview: PreviewData;
        if (item.type === 'database') {
          preview = {
            type: 'database',
            title: json.database.title,
            url: json.database.url,
            lastEditedTime: json.database.lastEditedTime,
            schema: json.schema,
            recentEntries: json.recentEntries,
          };
        } else {
          preview = {
            type: 'page',
            title: json.page.title,
            icon: json.page.icon?.emoji ?? null,
            markdown: json.markdown,
            properties: json.properties ?? [],
            url: json.page.url,
            lastEditedTime: json.page.lastEditedTime,
          };
        }

        previewCache.set(item.id, preview);
        setData(preview);
        setIsLoading(false);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [item]);

  return { data, isLoading, error };
}
