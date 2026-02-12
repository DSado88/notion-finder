/**
 * Generic cursor-based pagination helper for Notion API endpoints.
 * Exhausts all pages and returns the combined results.
 */

import { notionFetch } from './notion-client';
import type { Priority } from './rate-limiter';

interface PaginatedResponse<T> {
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Fetch all pages of a paginated Notion endpoint.
 *
 * For GET endpoints (like /blocks/{id}/children), pass the path with query params.
 * For POST endpoints (like /search), pass the body.
 */
export async function paginateAll<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    priority?: Priority;
    pageSize?: number;
    maxPages?: number;
  } = {},
): Promise<T[]> {
  const { method = 'GET', body = {}, priority = 'high', pageSize = 100, maxPages = 100 } = options;
  const allResults: T[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    let response: PaginatedResponse<T>;

    if (method === 'POST') {
      response = await notionFetch<PaginatedResponse<T>>(path, {
        method: 'POST',
        body: {
          ...body,
          page_size: pageSize,
          ...(cursor ? { start_cursor: cursor } : {}),
        },
        priority,
      });
    } else {
      const separator = path.includes('?') ? '&' : '?';
      const url = `${path}${separator}page_size=${pageSize}${cursor ? `&start_cursor=${cursor}` : ''}`;
      response = await notionFetch<PaginatedResponse<T>>(url, { priority });
    }

    allResults.push(...response.results);
    pageCount++;
    if (pageCount >= maxPages) break; // safety valve: prevent runaway cursors
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return allResults;
}
