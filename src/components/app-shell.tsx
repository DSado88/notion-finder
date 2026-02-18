'use client';

import { Toolbar } from './toolbar';
import { MillerContainer } from './miller/miller-container';
import { PreviewPanel } from './preview/preview-panel';
import { MoveToast } from './miller/move-toast';
import { DeleteConfirmModal } from './delete-confirm-modal';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: 'var(--background)' }}>
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <MillerContainer />
        <PreviewPanel />
      </div>
      <MoveToast />
      <DeleteConfirmModal />
    </div>
  );
}
