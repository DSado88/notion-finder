'use client';

import { Toolbar } from './toolbar';
import { MillerContainer } from './miller/miller-container';
import { PreviewPanel } from './preview/preview-panel';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <MillerContainer />
        </div>
        <div className="w-[380px] flex-none">
          <PreviewPanel />
        </div>
      </div>
    </div>
  );
}
