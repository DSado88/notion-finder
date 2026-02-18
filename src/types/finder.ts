// Notion API response types (subset we care about)

export interface NotionRichText {
  type: string;
  plain_text: string;
  href: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

export interface NotionParent {
  type: 'workspace' | 'page_id' | 'database_id' | 'block_id';
  workspace?: true;
  page_id?: string;
  database_id?: string;
  block_id?: string;
}

export interface NotionIcon {
  type: 'emoji' | 'external' | 'file' | 'lucide';
  emoji?: string;
  external?: { url: string };
  file?: { url: string };
  lucide?: { name: string; color?: string };
}

export interface NotionPage {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  in_trash: boolean;
  parent: NotionParent;
  icon: NotionIcon | null;
  properties: Record<string, NotionProperty>;
  url: string;
}

export interface NotionDatabase {
  object: 'database';
  id: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  in_trash: boolean;
  parent: NotionParent;
  icon: NotionIcon | null;
  title: NotionRichText[];
  properties: Record<string, NotionDatabaseProperty>;
  url: string;
}

export interface NotionBlock {
  object: 'block';
  id: string;
  type: string;
  parent: NotionParent;
  has_children: boolean;
  archived: boolean;
  in_trash: boolean;
  created_time: string;
  last_edited_time: string;
  [key: string]: unknown;
}

export interface NotionProperty {
  id: string;
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  [key: string]: unknown;
}

export interface NotionDatabaseProperty {
  id: string;
  type: string;
  name: string;
  [key: string]: unknown;
}

export interface NotionSearchResponse {
  object: 'list';
  results: (NotionPage | NotionDatabase)[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionBlockChildrenResponse {
  object: 'list';
  results: NotionBlock[];
  next_cursor: string | null;
  has_more: boolean;
}

// App-level types

export interface FinderItem {
  id: string;
  title: string;
  type: 'page' | 'database';
  icon: NotionIcon | null;
  hasChildren: boolean;
  createdTime: string;
  lastEditedTime: string;
  parentType: NotionParent['type'];
  parentId: string | null;
  url: string;
}

export type SortField = 'title' | 'lastEdited' | 'created';
export type SortDirection = 'asc' | 'desc';

export interface ColumnState {
  parentId: string | null; // null = workspace root
  parentTitle: string;
  items: FinderItem[];
  selectedItemId: string | null;
}

export interface PathSegment {
  id: string | null; // null = workspace root
  title: string;
  type: string;
}

export interface TreeNode {
  id: string;
  title: string;
  type: 'page' | 'database';
  children_count: number;
  children?: TreeNode[];
}

export interface TreeSnapshot {
  id: 'workspace';
  title: 'Workspace';
  children: TreeNode[];
  meta: {
    total_nodes: number;
    depth_reached: number;
    generated_at: string;
    cache_age_seconds: number;
  };
}

export interface BatchMoveRequest {
  page_id: string;
  new_parent_id: string;
}

export interface BatchMoveResult {
  page_id: string;
  new_parent_id: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

export interface BatchMoveResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchMoveResult[];
  duration_ms: number;
}
