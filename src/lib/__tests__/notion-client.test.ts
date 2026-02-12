/**
 * TDD test for notion-client Retry-After handling defect.
 *
 * P1-7: When Retry-After header is a non-numeric string (HTTP-date),
 *        parseInt returns NaN → sleep(NaN) fires immediately → no backoff.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the rate limiter before importing notion-client
vi.mock('../rate-limiter', () => ({
  notionLimiter: {
    acquire: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  },
}));

import { notionFetch } from '../notion-client';
import { notionLimiter } from '../rate-limiter';

const mockPause = vi.mocked(notionLimiter.pause);

describe('notionFetch', () => {
  const originalEnv = process.env.NOTION_API_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOTION_API_TOKEN = 'test-token-for-testing';
  });

  afterEach(() => {
    process.env.NOTION_API_TOKEN = originalEnv;
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // P1-7: Retry-After with non-numeric value produces NaN pause
  // ──────────────────────────────────────────────────────────
  describe('P1-7: Retry-After NaN handling', () => {
    it('should pause with a valid duration when Retry-After is a non-numeric string', async () => {
      // First call: 429 with HTTP-date Retry-After (non-numeric)
      // Second call: 200 success
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 429,
          ok: false,
          headers: new Headers({
            'Retry-After': 'Thu, 01 Jan 2026 00:00:00 GMT',
          }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        });

      vi.stubGlobal('fetch', mockFetch);

      await notionFetch('/search', { method: 'POST', body: {} });

      // The limiter should have been paused with a valid number, not NaN
      expect(mockPause).toHaveBeenCalledTimes(1);
      const pauseArg = mockPause.mock.calls[0][0];

      // BUG: parseInt('Thu, 01 Jan...') returns NaN → pause(NaN)
      // FIX: fallback to 1 second → pause(1000)
      expect(Number.isNaN(pauseArg)).toBe(false);
      expect(pauseArg).toBeGreaterThanOrEqual(1000);
    });

    it('should pause with a valid duration when Retry-After header is missing entirely', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          status: 429,
          ok: false,
          headers: new Headers({}), // no Retry-After header at all
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        });

      vi.stubGlobal('fetch', mockFetch);

      await notionFetch('/test');

      expect(mockPause).toHaveBeenCalledTimes(1);
      const pauseArg = mockPause.mock.calls[0][0];

      // With no header, fallback should produce a valid pause duration
      expect(Number.isNaN(pauseArg)).toBe(false);
      expect(pauseArg).toBeGreaterThanOrEqual(1000);
    });
  });
});
