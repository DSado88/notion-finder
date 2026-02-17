import { Octokit } from '@octokit/rest';
import type { BackendAdapter, BackendCapabilities, ContentData } from './types';
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
  };

  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;

  // Full tree cache — fetched once, invalidated on writes
  private treeCache: TreeEntry[] | null = null;
  private shaCache = new Map<string, string>(); // path → blob SHA
  private headSha: string | null = null;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.branch = process.env.GITHUB_BRANCH || 'main';
  }

  // ─── Tree cache ───

  private async ensureTree(): Promise<TreeEntry[]> {
    if (this.treeCache) return this.treeCache;

    // Get HEAD ref
    const refData = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.branch}`,
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
      url: `https://github.com/${this.owner}/${this.repo}/blob/${this.branch}/${entry.path}`,
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
        url: `https://github.com/${this.owner}/${this.repo}/tree/${this.branch}/${itemId}`,
        lastEditedTime: new Date().toISOString(),
      };
    }

    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: itemId,
        ref: this.branch,
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
        url: `https://github.com/${this.owner}/${this.repo}/blob/${this.branch}/${itemId}`,
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
    // Preserve frontmatter: fetch existing content first
    let frontmatter = '';
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: itemId,
        ref: this.branch,
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

    const sha = this.shaCache.get(itemId);
    if (!sha) {
      throw new AdapterError('CONFLICT', `No SHA cached for ${itemId}. Re-open the file and try again.`);
    }

    const fullContent = frontmatter + markdown;
    const contentBase64 = Buffer.from(fullContent, 'utf-8').toString('base64');

    try {
      const result = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: itemId,
        message: `Update ${itemId}`,
        content: contentBase64,
        sha,
        branch: this.branch,
      });

      // Update SHA cache with new blob SHA
      if (result.data.content?.sha) {
        this.shaCache.set(itemId, result.data.content.sha);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        this.shaCache.delete(itemId);
        throw new AdapterError('CONFLICT', 'File was modified on GitHub. Please reload and try again.');
      }
      throw err;
    }

    this.invalidateTree();
  }

  // ─── CRUD ───

  async createPage(parentId: string, title: string): Promise<FinderItem> {
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
      branch: this.branch,
    });

    if (result.data.content?.sha) {
      this.shaCache.set(filePath, result.data.content.sha);
    }

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
      url: `https://github.com/${this.owner}/${this.repo}/blob/${this.branch}/${filePath}`,
    };
  }

  async renamePage(itemId: string, newTitle: string): Promise<void> {
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
    }

    this.invalidateTree();
  }

  async archivePage(itemId: string): Promise<void> {
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
          ref: this.branch,
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
        branch: this.branch,
      });

      this.shaCache.delete(itemId);
    }

    this.invalidateTree();
  }

  async movePage(itemId: string, newParentId: string): Promise<void> {
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
      ref: this.branch,
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
      ref: `heads/${this.branch}`,
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
      ref: `heads/${this.branch}`,
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
      ref: this.branch,
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
      ref: `heads/${this.branch}`,
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
      ref: `heads/${this.branch}`,
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
      ref: `heads/${this.branch}`,
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
      ref: `heads/${this.branch}`,
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
      ref: `heads/${this.branch}`,
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
      ref: `heads/${this.branch}`,
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

  // ─── Search ───

  async search(_query: string, _maxResults?: number): Promise<FinderItem[]> {
    throw new AdapterError('READ_ONLY', 'Search not yet supported for GitHub backend');
  }
}
