/**
 * Token-bucket rate limiter with priority queue.
 *
 * CONSTRAINT: This singleton only works in single-process mode (next start).
 * Do NOT deploy to Vercel/serverless without migrating to Upstash Redis.
 *
 * Priority levels:
 * - HIGH: UI requests (user is waiting, served first)
 * - LOW: AI/batch operations (can wait, served when capacity available)
 */

export type Priority = 'high' | 'low';

interface QueueEntry {
  resolve: () => void;
  priority: Priority;
  enqueuedAt: number;
}

class TokenBucketRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillIntervalMs: number;
  private lastRefillTime: number;
  private queue: QueueEntry[] = [];
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private pauseUntil = 0;

  constructor(maxTokens: number, windowMs: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillIntervalMs = windowMs / maxTokens; // 333ms for 3/sec
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();

    // If paused (from a 429), check if pause has expired
    if (this.paused && now < this.pauseUntil) {
      return;
    }
    if (this.paused && now >= this.pauseUntil) {
      this.paused = false;
    }

    const elapsed = now - this.lastRefillTime;
    const newTokens = Math.floor(elapsed / this.refillIntervalMs);
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefillTime = now;
    }
  }

  /**
   * Pause the entire limiter for a duration (called when we get a 429).
   * This prevents other concurrent requests from also getting 429'd.
   */
  pause(durationMs: number): void {
    this.paused = true;
    this.pauseUntil = Date.now() + durationMs;
    this.tokens = 0;

    // Schedule drain after pause expires
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(() => this.drainQueue(), durationMs + 50);
  }

  async acquire(priority: Priority = 'high'): Promise<void> {
    this.refill();

    if (!this.paused && this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Enqueue and wait
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve, priority, enqueuedAt: Date.now() });
      // Sort: high priority first, then by enqueue time
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority === 'high' ? -1 : 1;
        }
        return a.enqueuedAt - b.enqueuedAt;
      });

      this.scheduleDrain();
    });
  }

  private scheduleDrain(): void {
    if (this.drainTimer) return;

    const delayMs = this.paused
      ? Math.max(0, this.pauseUntil - Date.now()) + 50
      : this.refillIntervalMs;

    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drainQueue();
    }, delayMs);
  }

  private drainQueue(): void {
    this.refill();

    while (this.tokens > 0 && this.queue.length > 0) {
      this.tokens--;
      const entry = this.queue.shift()!;
      entry.resolve();
    }

    if (this.queue.length > 0) {
      this.scheduleDrain();
    }
  }
}

// Module-level singleton — shared across all route handlers in the same process
export const notionLimiter = new TokenBucketRateLimiter(3, 1000);
