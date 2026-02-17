import path from 'path';
import { readdir, readFile, writeFile, rename, rm, stat, access } from 'fs/promises';
import simpleGit, { type SimpleGit } from 'simple-git';
import type { BackendAdapter, BackendCapabilities, ContentData, SyncStatus } from './types';
import { AdapterError } from './types';
import type { FinderItem, BatchMoveRequest, BatchMoveResult } from '@/types/finder';

// ─── Helpers ───

const SKIP_NAMES = new Set(['.git', 'node_modules', '.DS_Store', '.obsidian']);
const MD_EXT = '.md';

function shouldSkip(name: string): boolean {
  return name.startsWith('.') || SKIP_NAMES.has(name);
}

/** Extract title from first `# heading` line, falling back to filename. */
function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return filename.replace(/\.md$/i, '');
}

/** Separate YAML frontmatter from body. */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fmMatch) {
    return { frontmatter: fmMatch[0], body: content.slice(fmMatch[0].length) };
  }
  return { frontmatter: '', body: content };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

// ─── Adapter ───

export class GitLocalAdapter implements BackendAdapter {
  readonly name = 'Git (Local)';

  readonly capabilities: BackendCapabilities = {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canMove: true,
    canSearch: true,
    canSync: true,
    canBranch: false,
  };

  private rootDir: string;
  private git: SimpleGit;
  // Write mutex: serialize all git write operations
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.git = simpleGit(this.rootDir);
  }

  // ─── Path safety ───

  private resolveSafe(itemId: string): string {
    const resolved = path.resolve(this.rootDir, itemId);
    if (!resolved.startsWith(this.rootDir + path.sep) && resolved !== this.rootDir) {
      throw new AdapterError('PERMISSION_DENIED', 'Path traversal detected');
    }
    return resolved;
  }

  /** Queue a write operation through the mutex. */
  private enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(fn, fn);
    // Keep the queue chain going regardless of success/failure
    this.writeQueue = result.then(() => {}, () => {});
    return result;
  }

  // ─── Navigation ───

  async getRootItems(): Promise<FinderItem[]> {
    return this.listDir(this.rootDir, '');
  }

  async getChildren(parentId: string): Promise<FinderItem[]> {
    const dirPath = this.resolveSafe(parentId);
    return this.listDir(dirPath, parentId);
  }

  private async listDir(dirPath: string, parentRelative: string): Promise<FinderItem[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const items: FinderItem[] = [];

    for (const entry of entries) {
      if (shouldSkip(entry.name)) continue;

      const isDir = entry.isDirectory();
      const isMarkdown = !isDir && entry.name.endsWith(MD_EXT);
      if (!isDir && !isMarkdown) continue;

      const relativePath = parentRelative
        ? `${parentRelative}/${entry.name}`
        : entry.name;
      const fullPath = path.join(dirPath, entry.name);

      let hasChildren = false;
      if (isDir) {
        try {
          const sub = await readdir(fullPath);
          hasChildren = sub.some(
            (s) => !shouldSkip(s) && (s.endsWith(MD_EXT) || !s.includes('.')),
          );
        } catch {
          // Can't read dir — treat as leaf
        }
      }

      const stats = await stat(fullPath);

      items.push({
        id: relativePath,
        title: isMarkdown ? entry.name.replace(/\.md$/i, '') : entry.name,
        type: 'page' as const,
        icon: null,
        hasChildren,
        createdTime: stats.birthtime.toISOString(),
        lastEditedTime: stats.mtime.toISOString(),
        parentType: parentRelative ? 'page_id' : 'workspace',
        parentId: parentRelative || null,
        url: '',
      });
    }

    // Sort: directories first, then alphabetical
    items.sort((a, b) => {
      const aDir = a.hasChildren ? 0 : 1;
      const bDir = b.hasChildren ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.title.localeCompare(b.title);
    });

    return items;
  }

  // ─── Content ───

  async getContent(itemId: string): Promise<ContentData> {
    const filePath = this.resolveSafe(itemId);

    let stats;
    try {
      stats = await stat(filePath);
    } catch {
      throw new AdapterError('NOT_FOUND', `File not found: ${itemId}`);
    }

    if (stats.isDirectory()) {
      // Directories don't have content — return empty
      return {
        markdown: '',
        title: path.basename(filePath),
        lastEditedTime: stats.mtime.toISOString(),
      };
    }

    const raw = await readFile(filePath, 'utf-8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const title = extractTitle(body, path.basename(filePath));

    return {
      markdown: body,
      title,
      lastEditedTime: stats.mtime.toISOString(),
    };
  }

  async saveContent(itemId: string, markdown: string): Promise<void> {
    const filePath = this.resolveSafe(itemId);

    // Preserve existing frontmatter
    let frontmatter = '';
    try {
      const existing = await readFile(filePath, 'utf-8');
      ({ frontmatter } = splitFrontmatter(existing));
    } catch {
      // New file — no frontmatter to preserve
    }

    await writeFile(filePath, frontmatter + markdown, 'utf-8');
  }

  // ─── CRUD (with git commit) ───

  async createPage(parentId: string, title: string): Promise<FinderItem> {
    return this.enqueueWrite(async () => {
      const dirPath = parentId
        ? this.resolveSafe(parentId)
        : this.rootDir;

      const filename = `${slugify(title)}${MD_EXT}`;
      const filePath = path.join(dirPath, filename);
      const relativePath = path.relative(this.rootDir, filePath);

      // Check for conflict
      try {
        await access(filePath);
        throw new AdapterError('CONFLICT', `File already exists: ${relativePath}`);
      } catch (err) {
        if (err instanceof AdapterError) throw err;
        // File doesn't exist — good
      }

      const content = `# ${title}\n\n`;
      await writeFile(filePath, content, 'utf-8');

      await this.git.add(relativePath);
      await this.git.commit(`Create ${relativePath}`);

      const stats = await stat(filePath);

      return {
        id: relativePath,
        title,
        type: 'page' as const,
        icon: null,
        hasChildren: false,
        createdTime: stats.birthtime.toISOString(),
        lastEditedTime: stats.mtime.toISOString(),
        parentType: parentId ? 'page_id' : 'workspace',
        parentId: parentId || null,
        url: '',
      };
    });
  }

  async renamePage(itemId: string, newTitle: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const oldPath = this.resolveSafe(itemId);
      const oldStats = await stat(oldPath);
      const isDir = oldStats.isDirectory();

      const parentDir = path.dirname(oldPath);
      const newName = isDir ? slugify(newTitle) : `${slugify(newTitle)}${MD_EXT}`;
      const newPath = path.join(parentDir, newName);
      const newRelative = path.relative(this.rootDir, newPath);

      if (oldPath === newPath) return;

      // Check for conflict
      try {
        await access(newPath);
        throw new AdapterError('CONFLICT', `Target already exists: ${newRelative}`);
      } catch (err) {
        if (err instanceof AdapterError) throw err;
      }

      await rename(oldPath, newPath);

      // If it's a markdown file, also update the # heading
      if (!isDir) {
        const raw = await readFile(newPath, 'utf-8');
        const { frontmatter, body } = splitFrontmatter(raw);
        const updatedBody = body.replace(/^#\s+.+$/m, `# ${newTitle}`);
        await writeFile(newPath, frontmatter + updatedBody, 'utf-8');
      }

      await this.git.add([itemId, newRelative]);
      await this.git.commit(`Rename ${itemId} → ${newRelative}`);
    });
  }

  async archivePage(itemId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const filePath = this.resolveSafe(itemId);
      const stats = await stat(filePath);

      if (stats.isDirectory()) {
        await rm(filePath, { recursive: true });
      } else {
        await rm(filePath);
      }

      await this.git.add(itemId);
      await this.git.commit(`Delete ${itemId}`);
    });
  }

  async movePage(itemId: string, newParentId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const oldPath = this.resolveSafe(itemId);
      const newParentPath = newParentId
        ? this.resolveSafe(newParentId)
        : this.rootDir;
      const filename = path.basename(oldPath);
      const newPath = path.join(newParentPath, filename);
      const newRelative = path.relative(this.rootDir, newPath);

      if (oldPath === newPath) return;

      // Check for conflict
      try {
        await access(newPath);
        throw new AdapterError('CONFLICT', `Target already exists: ${newRelative}`);
      } catch (err) {
        if (err instanceof AdapterError) throw err;
      }

      await rename(oldPath, newPath);
      await this.git.add([itemId, newRelative]);
      await this.git.commit(`Move ${itemId} → ${newRelative}`);
    });
  }

  // ─── Batch ───

  async batchMove(
    moves: BatchMoveRequest[],
    options?: { dryRun?: boolean },
  ): Promise<{ results: BatchMoveResult[] }> {
    const results: BatchMoveResult[] = [];

    for (const move of moves) {
      if (options?.dryRun) {
        try {
          this.resolveSafe(move.page_id);
          if (move.new_parent_id) this.resolveSafe(move.new_parent_id);
          results.push({ page_id: move.page_id, new_parent_id: move.new_parent_id, status: 'success' });
        } catch (err) {
          results.push({
            page_id: move.page_id,
            new_parent_id: move.new_parent_id,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
        continue;
      }

      try {
        await this.movePage(move.page_id, move.new_parent_id);
        results.push({ page_id: move.page_id, new_parent_id: move.new_parent_id, status: 'success' });
      } catch (err) {
        results.push({
          page_id: move.page_id,
          new_parent_id: move.new_parent_id,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { results };
  }

  async batchArchive(
    pageIds: string[],
  ): Promise<{ results: { id: string; status: string; error?: string }[] }> {
    const results: { id: string; status: string; error?: string }[] = [];

    for (const id of pageIds) {
      try {
        await this.archivePage(id);
        results.push({ id, status: 'success' });
      } catch (err) {
        results.push({ id, status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return { results };
  }

  // ─── Search ───

  async search(query: string, maxResults: number = 20): Promise<FinderItem[]> {
    // Simple recursive filename + content search
    const results: FinderItem[] = [];
    const lowerQuery = query.toLowerCase();

    const walk = async (dirPath: string, parentRelative: string) => {
      if (results.length >= maxResults) return;

      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        if (shouldSkip(entry.name)) continue;

        const isDir = entry.isDirectory();
        const isMarkdown = !isDir && entry.name.endsWith(MD_EXT);
        if (!isDir && !isMarkdown) continue;

        const relativePath = parentRelative
          ? `${parentRelative}/${entry.name}`
          : entry.name;
        const fullPath = path.join(dirPath, entry.name);

        // Check filename match
        const nameMatch = entry.name.toLowerCase().includes(lowerQuery);

        // Check content match for markdown files
        let contentMatch = false;
        if (isMarkdown && !nameMatch) {
          try {
            const content = await readFile(fullPath, 'utf-8');
            contentMatch = content.toLowerCase().includes(lowerQuery);
          } catch { /* skip unreadable */ }
        }

        if (nameMatch || contentMatch) {
          const stats = await stat(fullPath);
          results.push({
            id: relativePath,
            title: isMarkdown ? entry.name.replace(/\.md$/i, '') : entry.name,
            type: 'page' as const,
            icon: null,
            hasChildren: isDir,
            createdTime: stats.birthtime.toISOString(),
            lastEditedTime: stats.mtime.toISOString(),
            parentType: parentRelative ? 'page_id' : 'workspace',
            parentId: parentRelative || null,
            url: '',
          });
        }

        if (isDir) {
          await walk(fullPath, relativePath);
        }
      }
    };

    await walk(this.rootDir, '');
    return results;
  }

  // ─── Sync Operations ───

  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) {
        return { ahead: 0, behind: 0, hasRemote: false };
      }

      // Fetch to get latest remote state
      await this.git.fetch();

      const status = await this.git.status();
      return {
        ahead: status.ahead,
        behind: status.behind,
        hasRemote: true,
      };
    } catch {
      return { ahead: 0, behind: 0, hasRemote: false };
    }
  }

  async syncPull(): Promise<void> {
    return this.enqueueWrite(async () => {
      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) {
        throw new AdapterError('CONFLICT', 'No remote configured');
      }
      await this.git.pull();
    });
  }

  async syncPush(): Promise<void> {
    return this.enqueueWrite(async () => {
      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) {
        throw new AdapterError('CONFLICT', 'No remote configured');
      }
      await this.git.push();
    });
  }

  async syncCommitAll(message: string): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.git.add('-A');
      const status = await this.git.status();
      if (status.staged.length === 0) return; // nothing to commit
      await this.git.commit(message);
    });
  }
}
