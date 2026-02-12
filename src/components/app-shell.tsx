'use client';

import { Toolbar } from './toolbar';
import { MillerContainer } from './miller/miller-container';
import { PreviewPanel } from './preview/preview-panel';
import { MoveToast } from './miller/move-toast';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <MillerContainer />
        <PreviewPanel />
      </div>
      <MoveToast />
    </div>
  );
}
