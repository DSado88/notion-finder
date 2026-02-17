/**
 * Source-level verification tests for preview-panel performance optimizations.
 *
 * These verify that the PlateEditor is lazy-loaded and that
 * PagePreviewContent is wrapped in React.memo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, '../preview/preview-panel.tsx'),
  'utf-8',
);

describe('preview-panel performance optimizations', () => {
  it('should lazy-load PlateEditor with next/dynamic (no SSR)', () => {
    expect(source).toMatch(/dynamic\(/);
    expect(source).toMatch(/ssr:\s*false/);
  });

  it('should use LazyPlateEditor (not inline import) in render', () => {
    expect(source).toMatch(/<LazyPlateEditor/);
  });

  it('should wrap PagePreviewContent in React.memo', () => {
    expect(source).toMatch(/const PagePreviewContent = memo\(/);
  });
});
