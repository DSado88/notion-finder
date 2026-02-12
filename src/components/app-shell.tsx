'use client';

import { Toolbar } from './toolbar';
import { MillerContainer } from './miller/miller-container';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <Toolbar />
      <MillerContainer />
    </div>
  );
}
