import type { FinderItem, BatchMoveRequest, BatchMoveResult } from '@/types/finder';

// ─── Error Contract ───

export type AdapterErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'READ_ONLY'
  | 'PERMISSION_DENIED'
  | 'CYCLE_DETECTED';

export class AdapterError extends Error {
  constructor(
    public readonly code: AdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

// ─── Content ───

export interface ContentData {
  markdown: string;
  title: string;
  icon?: string | null;
  url?: string;
  lastEditedTime?: string;
  properties?: { name: string; value: string }[];
}

// ─── Capabilities ───

export interface BackendCapabilities {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canMove: boolean;
  canSearch: boolean;
  canSync: boolean;
  canBranch: boolean;
}

export interface SyncStatus {
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

export interface BranchStatus {
  baseBranch: string;
  workingBranch: string | null;
  changedFiles: string[];
}

// ─── Adapter Interface ───

/**
 * Backend adapter contract. All methods are required — adapters that
 * don't support a capability throw AdapterError('READ_ONLY').
 * The `capabilities` object is for UI guards only (hide buttons, set readOnly).
 */
export interface BackendAdapter {
  readonly name: string;
  readonly capabilities: BackendCapabilities;

  // Navigation
  getRootItems(): Promise<FinderItem[]>;
  getChildren(parentId: string): Promise<FinderItem[]>;

  // Content
  getContent(itemId: string): Promise<ContentData>;
  saveContent(itemId: string, markdown: string): Promise<void>;

  // CRUD
  createPage(parentId: string, title: string): Promise<FinderItem>;
  renamePage(itemId: string, newTitle: string): Promise<void>;
  archivePage(itemId: string): Promise<void>;
  movePage(itemId: string, newParentId: string): Promise<void>;

  // Batch operations
  batchMove(
    moves: BatchMoveRequest[],
    options?: { dryRun?: boolean },
  ): Promise<{ results: BatchMoveResult[] }>;
  batchArchive(pageIds: string[]): Promise<{ results: { id: string; status: string; error?: string }[] }>;

  // Search
  search(query: string, maxResults?: number): Promise<FinderItem[]>;

  // Sync (optional — only git-local)
  getSyncStatus?(): Promise<SyncStatus>;
  syncPull?(): Promise<void>;
  syncPush?(): Promise<void>;
  syncCommitAll?(message: string): Promise<void>;

  // Branch workflow (optional — only git-github)
  getBranchStatus?(): Promise<BranchStatus>;
  ensureWorkingBranch?(): Promise<string>;
  createPullRequest?(title?: string): Promise<{ url: string; number: number }>;
  discardWorkingBranch?(): Promise<void>;
}
