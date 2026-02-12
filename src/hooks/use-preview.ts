'use client';

import { useEffect, useState } from 'react';
import type { FinderItem } from '@/types/finder';

interface PagePreview {
  type: 'page';
  title: string;
  markdown: string;
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
            markdown: json.markdown,
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
