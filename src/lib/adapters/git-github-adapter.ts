import { Octokit } from '@octokit/rest';
import type { BackendAdapter, BackendCapabilities, BranchStatus, ContentData } from './types';
import { AdapterError } from './types';
import type { FinderItem, BatchMoveRequest, BatchMoveResult } from '@/types/finder';

// ─── Helpers (shared with git-local) ───

const SKIP_NAMES = new Set(['.git', 'node_modules', '.DS_Store', '.obsidian']);
const MD_EXT = '.md';

function shouldSkip(name: string): boolean {
  return name.startsWith('.') || SKIP_NAMES.has(name);
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return filename.replace(/\.md$/i, '');
}

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

function basename(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}

function dirname(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

// ─── In-memory tree cache ───

interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

// ─── Adapter ───

export class GitHubAdapter implements BackendAdapter {
  readonly name = 'Git (GitHub)';

  readonly capabilities: BackendCapabilities = {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canMove: true,
    canSearch: false,
    canSync: false,
    canBranch: true,
  };

  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private baseBranch: string;

  // Working branch state
  private workingBranch: string | null = null;
  private changedFiles = new Set<string>();
  private branchCreationPromise: Promise<string> | null = null;

  /** The branch all reads and writes target. Working branch if active, base otherwise. */
  private get activeBranch(): string {
    return this.workingBranch ?? this.baseBranch;
  }

  // Full tree cache — fetched once, invalidated on writes
  private treeCache: TreeEntry[] | null = null;
  private shaCache = new Map<string, string>(); // path → blob SHA
  private headSha: string | null = null;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.baseBranch = process.env.GITHUB_BRANCH || 'main';
  }

  // ─── Tree cache ───

  private async ensureTree(): Promise<TreeEntry[]> {
    if (this.treeCache) return this.treeCache;

    // Get HEAD ref
    const refData = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
    });
    this.headSha = refData.data.object.sha;

    // Get commit to find tree SHA
    const commitData = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: this.headSha,
    });

    // Fetch full recursive tree
    const treeData = await this.octokit.rest.git.getTree({
      owner: this.owner,
      repo: this.repo,
      tree_sha: commitData.data.tree.sha,
      recursive: '1',
    });

    this.treeCache = (treeData.data.tree as TreeEntry[]).filter(
      (entry) => {
        const parts = entry.path.split('/');
        return !parts.some((p) => shouldSkip(p));
      },
    );

    // Populate SHA cache
    for (const entry of this.treeCache) {
      if (entry.type === 'blob') {
        this.shaCache.set(entry.path, entry.sha);
      }
    }

    return this.treeCache;
  }

  private invalidateTree(): void {
    this.treeCache = null;
    this.headSha = null;
    this.shaCache.clear();
  }

  /** Get child entries of a directory from the cached tree. */
  private getTreeChildren(parentPath: string): TreeEntry[] {
    const tree = this.treeCache!;
    const prefix = parentPath ? `${parentPath}/` : '';
    const children: TreeEntry[] = [];
    const seen = new Set<string>();

    for (const entry of tree) {
      if (parentPath && !entry.path.startsWith(prefix)) continue;
      if (!parentPath && entry.path.includes('/') && entry.type === 'blob') {
        // Root level — only direct children
        const topDir = entry.path.split('/')[0];
        if (!seen.has(topDir)) {
          seen.add(topDir);
          // Check if it's in tree as explicit dir or just implied by blob paths
          const dirEntry = tree.find((e) => e.path === topDir && e.type === 'tree');
          if (dirEntry) children.push(dirEntry);
          else children.push({ path: topDir, type: 'tree', sha: '' });
        }
        continue;
      }

      const relative = parentPath ? entry.path.slice(prefix.length) : entry.path;
      if (!relative || relative.includes('/')) {
        // Not a direct child — but may imply a subdirectory
        if (relative) {
          const subdir = relative.split('/')[0];
          const subdirPath = parentPath ? `${prefix}${subdir}` : subdir;
          if (!seen.has(subdirPath)) {
            seen.add(subdirPath);
            children.push({ path: subdirPath, type: 'tree', sha: '' });
          }
        }
        continue;
      }

      if (!seen.has(entry.path)) {
        seen.add(entry.path);
        children.push(entry);
      }
    }

    return children;
  }

  private treeEntryToFinderItem(entry: TreeEntry, parentPath: string): FinderItem | null {
    const name = basename(entry.path);
    if (shouldSkip(name)) return null;

    const isDir = entry.type === 'tree';
    const isMarkdown = !isDir && name.endsWith(MD_EXT);
    if (!isDir && !isMarkdown) return null;

    const hasChildren = isDir && this.treeCache!.some(
      (e) => e.path.startsWith(entry.path + '/') && !basename(e.path).startsWith('.'),
    );

    return {
      id: entry.path,
      title: isMarkdown ? name.replace(/\.md$/i, '') : name,
      type: 'page' as const,
      icon: null,
      hasChildren,
      createdTime: new Date().toISOString(), // GitHub doesn't expose this cheaply
      lastEditedTime: new Date().toISOString(),
      parentType: parentPath ? 'page_id' : 'workspace',
      parentId: parentPath || null,
      url: `https://github.com/${this.owner}/${this.repo}/blob/${this.activeBranch}/${entry.path}`,
    };
  }

  // ─── Navigation ───

  async getRootItems(): Promise<FinderItem[]> {
    await this.ensureTree();
    const children = this.getTreeChildren('');
    return children
      .map((e) => this.treeEntryToFinderItem(e, ''))
      .filter((item): item is FinderItem => item !== null)
      .sort((a, b) => {
        const aDir = a.hasChildren ? 0 : 1;
        const bDir = b.hasChildren ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return a.title.localeCompare(b.title);
      });
  }

  async getChildren(parentId: string): Promise<FinderItem[]> {
    await this.ensureTree();
    const children = this.getTreeChildren(parentId);
    return children
      .map((e) => this.treeEntryToFinderItem(e, parentId))
      .filter((item): item is FinderItem => item !== null)
      .sort((a, b) => {
        const aDir = a.hasChildren ? 0 : 1;
        const bDir = b.hasChildren ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return a.title.localeCompare(b.title);
      });
  }

  // ─── Content ───

  async getContent(itemId: string): Promise<ContentData> {
    // Check if it's a directory
    await this.ensureTree();
    const entry = this.treeCache!.find((e) => e.path === itemId);
    if (entry?.type === 'tree') {
      return {
        markdown: '',
        title: basename(itemId),
        url: `https://github.com/${this.owner}/${this.repo}/tree/${this.activeBranch}/${itemId}`,
        lastEditedTime: new Date().toISOString(),
      };
    }

    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: itemId,
        ref: this.activeBranch,
      });

      const data = response.data;
      if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
        throw new AdapterError('NOT_FOUND', `Not a file: ${itemId}`);
      }

      // Update SHA cache
      this.shaCache.set(itemId, data.sha);

      const raw = Buffer.from(data.content, 'base64').toString('utf-8');
      const { body } = splitFrontmatter(raw);
      const title = extractTitle(body, basename(itemId));

      return {
        markdown: body,
        title,
        url: `https://github.com/${this.owner}/${this.repo}/blob/${this.activeBranch}/${itemId}`,
        lastEditedTime: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof AdapterError) throw err;
      const status = (err as { status?: number }).status;
      if (status === 404) {
        throw new AdapterError('NOT_FOUND', `File not found: ${itemId}`);
      }
      throw err;
    }
  }

  async saveContent(itemId: string, markdown: string): Promise<void> {
    await this.ensureWorkingBranch();
    // Preserve frontmatter: fetch existing content first
    let frontmatter = '';
    const freshSha = await this.fetchFileSha(itemId);

    if (freshSha) {
      try {
        const response = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: itemId,
          ref: this.activeBranch,
        });

        const data = response.data;
        if (!Array.isArray(data) && data.type === 'file' && 'content' in data) {
          this.shaCache.set(itemId, data.sha);
          const raw = Buffer.from(data.content, 'base64').toString('utf-8');
          ({ frontmatter } = splitFrontmatter(raw));
        }
      } catch {
        // File may not exist yet
      }
    }

    const sha = this.shaCache.get(itemId);
    if (!sha) {
      throw new AdapterError('CONFLICT', `No SHA cached for ${itemId}. Re-open the file and try again.`);
    }

    const fullContent = frontmatter + markdown;
    const contentBase64 = Buffer.from(fullContent, 'utf-8').toString('base64');

    // Try up to 2 times — retry once with a fresh SHA on conflict
    for (let attempt = 0; attempt < 2; attempt++) {
      const currentSha = this.shaCache.get(itemId) ?? sha;
      try {
        const result = await this.octokit.rest.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path: itemId,
          message: `Update ${itemId}`,
          content: contentBase64,
          sha: currentSha,
          branch: this.activeBranch,
        });

        // Update SHA cache with new blob SHA
        if (result.data.content?.sha) {
          this.shaCache.set(itemId, result.data.content.sha);
        }
        this.changedFiles.add(itemId);
        this.invalidateTree();
        return;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 409 && attempt === 0) {
          // Re-fetch SHA and retry once
          const retrySha = await this.fetchFileSha(itemId);
          if (retrySha) {
            this.shaCache.set(itemId, retrySha);
            continue;
          }
        }
        if (status === 409) {
          this.shaCache.delete(itemId);
          throw new AdapterError('CONFLICT', 'File was modified on GitHub. Please reload and try again.');
        }
        throw err;
      }
    }
  }

  private async fetchFileSha(itemId: string): Promise<string | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: itemId,
        ref: this.activeBranch,
      });
      const data = response.data;
      if (!Array.isArray(data) && data.type === 'file') {
        return data.sha;
      }
    } catch { /* file may not exist */ }
    return null;
  }

  // ─── CRUD ───

  async createPage(parentId: string, title: string): Promise<FinderItem> {
    await this.ensureWorkingBranch();
    const filename = `${slugify(title)}${MD_EXT}`;
    const filePath = parentId ? `${parentId}/${filename}` : filename;
    const content = `# ${title}\n\n`;
    const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');

    const result = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: filePath,
      message: `Create ${filePath}`,
      content: contentBase64,
      branch: this.activeBranch,
    });

    if (result.data.content?.sha) {
      this.shaCache.set(filePath, result.data.content.sha);
    }

    this.changedFiles.add(filePath);
    this.invalidateTree();

    return {
      id: filePath,
      title,
      type: 'page' as const,
      icon: null,
      hasChildren: false,
      createdTime: new Date().toISOString(),
      lastEditedTime: new Date().toISOString(),
      parentType: parentId ? 'page_id' : 'workspace',
      parentId: parentId || null,
      url: `https://github.com/${this.owner}/${this.repo}/blob/${this.activeBranch}/${filePath}`,
    };
  }

  async renamePage(itemId: string, newTitle: string): Promise<void> {
    await this.ensureWorkingBranch();
    // Rename = move to same directory with new filename
    const parent = dirname(itemId);
    const isDir = this.treeCache?.some((e) => e.path === itemId && e.type === 'tree');

    if (isDir) {
      // Directory rename via Trees API
      const newDirName = slugify(newTitle);
      const newDirPath = parent ? `${parent}/${newDirName}` : newDirName;
      await this.moveViaTreesApi(itemId, newDirPath);
    } else {
      const newName = `${slugify(newTitle)}${MD_EXT}`;
      const newPath = parent ? `${parent}/${newName}` : newName;
      if (newPath === itemId) return;

      // Read current content, update heading, write to new path, delete old
      await this.moveFileWithContentUpdate(itemId, newPath, newTitle);
      this.changedFiles.add(itemId);
      this.changedFiles.add(newPath);
    }

    this.invalidateTree();
  }

  async archivePage(itemId: string): Promise<void> {
    await this.ensureWorkingBranch();
    await this.ensureTree();
    const isDir = this.treeCache!.some((e) => e.path === itemId && e.type === 'tree');

    if (isDir) {
      // Delete all files under the directory via Trees API
      await this.deleteDirViaTreesApi(itemId);
    } else {
      const sha = this.shaCache.get(itemId);
      if (!sha) {
        // Fetch it
        const response = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: itemId,
          ref: this.activeBranch,
        });
        const data = response.data;
        if (!Array.isArray(data) && data.type === 'file') {
          this.shaCache.set(itemId, data.sha);
        }
      }

      const fileSha = this.shaCache.get(itemId);
      if (!fileSha) {
        throw new AdapterError('NOT_FOUND', `Cannot find SHA for: ${itemId}`);
      }

      await this.octokit.rest.repos.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path: itemId,
        message: `Delete ${itemId}`,
        sha: fileSha,
        branch: this.activeBranch,
      });

      this.shaCache.delete(itemId);
    }

    this.changedFiles.add(itemId);
    this.invalidateTree();
  }

  async movePage(itemId: string, newParentId: string): Promise<void> {
    await this.ensureWorkingBranch();
    const name = basename(itemId);
    const newPath = newParentId ? `${newParentId}/${name}` : name;
    if (newPath === itemId) return;

    await this.ensureTree();
    const isDir = this.treeCache!.some((e) => e.path === itemId && e.type === 'tree');

    if (isDir) {
      await this.moveViaTreesApi(itemId, newPath);
    } else {
      await this.moveFileSimple(itemId, newPath);
    }

    this.changedFiles.add(itemId);
    this.changedFiles.add(newPath);
    this.invalidateTree();
  }

  // ─── Git Trees API helpers ───

  /** Move a file: read content from old path, create at new path, delete old — single file. */
  private async moveFileSimple(oldPath: string, newPath: string): Promise<void> {
    // Read old content
    const response = await this.octokit.rest.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: oldPath,
      ref: this.activeBranch,
    });
    const data = response.data;
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      throw new AdapterError('NOT_FOUND', `Not a file: ${oldPath}`);
    }

    // Use Trees API for atomic move
    await this.ensureTree();
    const ref = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
    });
    const headCommit = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: ref.data.object.sha,
    });

    const newTree = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: headCommit.data.tree.sha,
      tree: [
        { path: oldPath, mode: '100644', type: 'blob', sha: null as unknown as string }, // delete
        { path: newPath, mode: '100644', type: 'blob', sha: data.sha }, // create with same content
      ],
    });

    const newCommit = await this.octokit.rest.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: `Move ${oldPath} → ${newPath}`,
      tree: newTree.data.sha,
      parents: [ref.data.object.sha],
    });

    await this.octokit.rest.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
      sha: newCommit.data.sha,
    });

    this.shaCache.delete(oldPath);
    this.shaCache.set(newPath, data.sha);
  }

  /** Move a file and update the # heading in content. */
  private async moveFileWithContentUpdate(oldPath: string, newPath: string, newTitle: string): Promise<void> {
    const response = await this.octokit.rest.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: oldPath,
      ref: this.activeBranch,
    });
    const data = response.data;
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      throw new AdapterError('NOT_FOUND', `Not a file: ${oldPath}`);
    }

    const raw = Buffer.from(data.content, 'base64').toString('utf-8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const updatedBody = body.replace(/^#\s+.+$/m, `# ${newTitle}`);
    const updatedContent = frontmatter + updatedBody;

    // Use Trees API for atomic rename with content update
    const ref = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
    });
    const headCommit = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: ref.data.object.sha,
    });

    const newTree = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: headCommit.data.tree.sha,
      tree: [
        { path: oldPath, mode: '100644', type: 'blob', sha: null as unknown as string },
        { path: newPath, mode: '100644', type: 'blob', content: updatedContent },
      ],
    });

    const newCommit = await this.octokit.rest.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: `Rename ${oldPath} → ${newPath}`,
      tree: newTree.data.sha,
      parents: [ref.data.object.sha],
    });

    await this.octokit.rest.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
      sha: newCommit.data.sha,
    });

    this.shaCache.delete(oldPath);
  }

  /** Move a directory: remap all files under old prefix to new prefix via Trees API. */
  private async moveViaTreesApi(oldPrefix: string, newPrefix: string): Promise<void> {
    await this.ensureTree();

    const ref = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
    });
    const headCommit = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: ref.data.object.sha,
    });

    // Find all blobs under old prefix
    const filesToMove = this.treeCache!.filter(
      (e) => e.type === 'blob' && (e.path === oldPrefix || e.path.startsWith(oldPrefix + '/')),
    );

    const treeOps: { path: string; mode: '100644'; type: 'blob'; sha: string | null; content?: string }[] = [];

    for (const file of filesToMove) {
      // Delete old path
      treeOps.push({ path: file.path, mode: '100644', type: 'blob', sha: null as unknown as string });
      // Create at new path
      const newPath = newPrefix + file.path.slice(oldPrefix.length);
      treeOps.push({ path: newPath, mode: '100644', type: 'blob', sha: file.sha });
    }

    const newTree = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: headCommit.data.tree.sha,
      tree: treeOps as { path: string; mode: '100644'; type: 'blob'; sha: string | null }[],
    });

    const newCommit = await this.octokit.rest.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: `Move ${oldPrefix} → ${newPrefix}`,
      tree: newTree.data.sha,
      parents: [ref.data.object.sha],
    });

    await this.octokit.rest.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
      sha: newCommit.data.sha,
    });

    // Update SHA cache
    for (const file of filesToMove) {
      this.shaCache.delete(file.path);
      const newPath = newPrefix + file.path.slice(oldPrefix.length);
      this.shaCache.set(newPath, file.sha);
    }
  }

  /** Delete all files under a directory via Trees API. */
  private async deleteDirViaTreesApi(dirPath: string): Promise<void> {
    await this.ensureTree();

    const ref = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
    });
    const headCommit = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: ref.data.object.sha,
    });

    const filesToDelete = this.treeCache!.filter(
      (e) => e.type === 'blob' && (e.path === dirPath || e.path.startsWith(dirPath + '/')),
    );

    const treeOps = filesToDelete.map((file) => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: null as unknown as string,
    }));

    const newTree = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: headCommit.data.tree.sha,
      tree: treeOps,
    });

    const newCommit = await this.octokit.rest.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: `Delete ${dirPath}`,
      tree: newTree.data.sha,
      parents: [ref.data.object.sha],
    });

    await this.octokit.rest.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.activeBranch}`,
      sha: newCommit.data.sha,
    });

    for (const file of filesToDelete) {
      this.shaCache.delete(file.path);
    }
  }

  // ─── Batch ───

  async batchMove(
    moves: BatchMoveRequest[],
    options?: { dryRun?: boolean },
  ): Promise<{ results: BatchMoveResult[] }> {
    const results: BatchMoveResult[] = [];

    for (const move of moves) {
      if (options?.dryRun) {
        results.push({ page_id: move.page_id, new_parent_id: move.new_parent_id, status: 'success' });
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

  // ─── Branch lifecycle ───

  async ensureWorkingBranch(): Promise<string> {
    if (this.workingBranch) return this.workingBranch;
    if (this.branchCreationPromise) return this.branchCreationPromise;

    this.branchCreationPromise = this._createOrResumeWorkingBranch();
    try {
      return await this.branchCreationPromise;
    } finally {
      this.branchCreationPromise = null;
    }
  }

  private async _createOrResumeWorkingBranch(): Promise<string> {
    // Check for existing session branch to resume
    const existing = await this.findExistingSessionBranch();
    if (existing) {
      this.workingBranch = existing;
      this.invalidateTree();
      await this.computeChangedFiles();
      return this.workingBranch;
    }

    // Create new session branch from base branch HEAD
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const branchName = `potion/session-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

    const ref = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.baseBranch}`,
    });

    await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.data.object.sha,
    });

    this.workingBranch = branchName;
    this.invalidateTree();
    this.changedFiles.clear();
    return branchName;
  }

  private async findExistingSessionBranch(): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.git.listMatchingRefs({
        owner: this.owner,
        repo: this.repo,
        ref: 'heads/potion/session-',
      });
      if (data.length === 0) return null;
      // Sort descending — timestamp in name gives chronological order
      data.sort((a, b) => b.ref.localeCompare(a.ref));
      return data[0].ref.replace('refs/heads/', '');
    } catch {
      return null;
    }
  }

  private async computeChangedFiles(): Promise<void> {
    if (!this.workingBranch) return;
    this.changedFiles.clear();
    try {
      const { data } = await this.octokit.rest.repos.compareCommits({
        owner: this.owner,
        repo: this.repo,
        base: this.baseBranch,
        head: this.workingBranch,
      });
      for (const file of data.files ?? []) {
        this.changedFiles.add(file.filename);
      }
    } catch {
      // Branch may be identical to base
    }
  }

  async getBranchStatus(): Promise<BranchStatus> {
    // Recover working branch after server restart / HMR singleton loss
    if (!this.workingBranch) {
      const existing = await this.findExistingSessionBranch();
      if (existing) {
        this.workingBranch = existing;
        this.invalidateTree();
      }
    }
    // Always compute from GitHub so the status is accurate
    if (this.workingBranch) {
      await this.computeChangedFiles();
    }
    return {
      baseBranch: this.baseBranch,
      workingBranch: this.workingBranch,
      changedFiles: Array.from(this.changedFiles),
    };
  }

  async createPullRequest(title?: string): Promise<{ url: string; number: number }> {
    if (!this.workingBranch) {
      throw new AdapterError('CONFLICT', 'No working branch active');
    }
    // Refresh changed files count
    await this.computeChangedFiles();
    if (this.changedFiles.size === 0) {
      throw new AdapterError('CONFLICT', 'No changes to submit');
    }

    const prTitle = title || `Potion edits ${new Date().toLocaleDateString()}`;
    const body = [
      `## Changed files (${this.changedFiles.size})`,
      '',
      ...Array.from(this.changedFiles).map((f) => `- \`${f}\``),
      '',
      '_Created by Potion_',
    ].join('\n');

    const { data: pr } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: prTitle,
      body,
      head: this.workingBranch,
      base: this.baseBranch,
    });

    return { url: pr.html_url, number: pr.number };
  }

  async discardWorkingBranch(): Promise<void> {
    if (!this.workingBranch) return;

    try {
      await this.octokit.rest.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.workingBranch}`,
      });
    } catch {
      // Branch may already be gone
    }

    this.workingBranch = null;
    this.changedFiles.clear();
    this.invalidateTree();
  }

  // ─── Search ───

  async search(_query: string, _maxResults?: number): Promise<FinderItem[]> {
    throw new AdapterError('READ_ONLY', 'Search not yet supported for GitHub backend');
  }
}
