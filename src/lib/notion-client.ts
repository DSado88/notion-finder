/**
 * Low-level Notion API fetch wrapper.
 * Handles auth headers, retry with backoff for 429s, and global rate limiter pause.
 */

import { notionLimiter, type Priority } from './rate-limiter';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_RETRIES = 3;

export class NotionApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotionApiError';
  }
}

interface NotionFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  priority?: Priority;
}

export async function notionFetch<T>(
  path: string,
  options: NotionFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, priority = 'high' } = options;
  const token = process.env.NOTION_API_TOKEN;

  if (!token) {
    throw new Error('NOTION_API_TOKEN is not set');
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Wait for rate limiter
    await notionLimiter.acquire(priority);

    const url = path.startsWith('http') ? path : `${NOTION_API_BASE}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', // Prevent Next.js 15 aggressive caching
    });

    if (res.status === 429) {
      const rawRetryAfter = parseInt(res.headers.get('Retry-After') || '1', 10);
      const retryAfter = Number.isNaN(rawRetryAfter) ? 1 : Math.max(1, rawRetryAfter);
      const pauseMs = retryAfter * 1000;

      // Pause the GLOBAL rate limiter so other concurrent requests also wait
      notionLimiter.pause(pauseMs);
      await sleep(pauseMs);
      continue;
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new NotionApiError(
        res.status,
        (errorBody as Record<string, string>).code || 'unknown',
        (errorBody as Record<string, string>).message || `Notion API error: ${res.status}`,
      );
    }

    return res.json() as Promise<T>;
  }

  throw new NotionApiError(429, 'rate_limited', 'Rate limited after max retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
