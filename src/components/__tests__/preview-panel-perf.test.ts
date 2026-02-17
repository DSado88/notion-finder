/**
 * Source-level verification tests for preview-panel performance optimizations.
 *
 * These verify that the remarkPlugins array is a module-level constant
 * (not re-created inside the component) and that PagePreviewContent
 * is wrapped in React.memo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, '../preview/preview-panel.tsx'),
  'utf-8',
);

describe('preview-panel performance optimizations', () => {
  it('should define REMARK_PLUGINS at module level (not inside a component)', () => {
    // The constant should appear before any function definition
    const constIndex = source.indexOf('const REMARK_PLUGINS');
    const firstFunctionIndex = source.indexOf('function ');
    expect(constIndex).toBeGreaterThan(-1);
    expect(constIndex).toBeLessThan(firstFunctionIndex);
  });

  it('should use REMARK_PLUGINS (not inline [remarkGfm]) in ReactMarkdown', () => {
    // Should NOT have inline array creation
    expect(source).not.toMatch(/remarkPlugins=\{\[remarkGfm\]\}/);
    // Should use the stable constant
    expect(source).toMatch(/remarkPlugins=\{REMARK_PLUGINS\}/);
  });

  it('should wrap PagePreviewContent in React.memo', () => {
    expect(source).toMatch(/const PagePreviewContent = memo\(/);
  });
});
