import { LinearClient } from '@linear/sdk';
import type { BackendAdapter, BackendCapabilities, ContentData } from './types';
import { AdapterError } from './types';
import type { FinderItem, BatchMoveRequest, BatchMoveResult } from '@/types/finder';

// ─── ID Encoding ───

type LinearEntityType = 'team' | 'project' | 'document' | 'issue';

function encodeId(type: LinearEntityType, uuid: string): string {
  return `${type}:${uuid}`;
}

function decodeId(encoded: string): { type: LinearEntityType; uuid: string } {
  const colon = encoded.indexOf(':');
  if (colon === -1) throw new AdapterError('NOT_FOUND', `Invalid Linear ID format: ${encoded}`);
  return {
    type: encoded.slice(0, colon) as LinearEntityType,
    uuid: encoded.slice(colon + 1),
  };
}

// ─── Icon helpers ───

import type { NotionIcon } from '@/types/finder';

function lucideIcon(name: string, color?: string): NotionIcon {
  return { type: 'lucide', lucide: { name, color } };
}

const TEAM_ICON = lucideIcon('users');
const PROJECT_ICON = lucideIcon('folder-kanban');
const DOCUMENT_ICON = lucideIcon('file-text');

function stateIcon(stateType: string | undefined): NotionIcon {
  switch (stateType) {
    case 'triage': return lucideIcon('search', '#8b5cf6');
    case 'backlog': return lucideIcon('circle-dashed', '#94a3b8');
    case 'unstarted': return lucideIcon('circle', '#94a3b8');
    case 'started': return lucideIcon('circle-dot', '#eab308');
    case 'completed': return lucideIcon('circle-check-big', '#22c55e');
    case 'canceled': return lucideIcon('ban', '#ef4444');
    default: return lucideIcon('circle', '#94a3b8');
  }
}

const PRIORITY_NAMES = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];

// ─── Cache ───

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// ─── Adapter ───

export class LinearAdapter implements BackendAdapter {
  readonly name = 'Linear';

  readonly capabilities: BackendCapabilities = {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canMove: false,
    canSearch: true,
    canSync: false,
    canBranch: false,
  };

  private client: LinearClient;
  private cache = new Map<string, CacheEntry<FinderItem[]>>();

  constructor(apiKey: string) {
    this.client = new LinearClient({ apiKey });
  }

  // ─── Cache helpers ───

  private getCached(key: string): FinderItem[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: FinderItem[]): void {
    this.cache.set(key, { data, fetchedAt: Date.now() });
  }

  private invalidateChildren(parentId: string): void {
    this.cache.delete(`children:${parentId}`);
  }

  // ─── Navigation ───

  async getRootItems(): Promise<FinderItem[]> {
    const cached = this.getCached('root');
    if (cached) return cached;

    const teams = await this.client.teams({ first: 50 });
    const items: FinderItem[] = teams.nodes.map((team) => ({
      id: encodeId('team', team.id),
      title: team.name,
      type: 'page' as const,
      icon: TEAM_ICON,
      hasChildren: true,
      createdTime: team.createdAt.toISOString(),
      lastEditedTime: team.updatedAt.toISOString(),
      parentType: 'workspace' as const,
      parentId: null,
      url: '',
    }));

    this.setCache('root', items);
    return items;
  }

  async getChildren(parentId: string): Promise<FinderItem[]> {
    const cacheKey = `children:${parentId}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { type, uuid } = decodeId(parentId);
    let items: FinderItem[];

    switch (type) {
      case 'team':
        items = await this.getTeamChildren(uuid, parentId);
        break;
      case 'project':
        items = await this.getProjectChildren(uuid, parentId);
        break;
      case 'issue':
        items = await this.getIssueChildren(uuid, parentId);
        break;
      default:
        items = [];
    }

    this.setCache(cacheKey, items);
    return items;
  }

  private async getTeamChildren(teamUuid: string, parentId: string): Promise<FinderItem[]> {
    const team = await this.client.team(teamUuid);
    const projects = await team.projects({ first: 50 });

    return projects.nodes.map((project) => ({
      id: encodeId('project', project.id),
      title: project.name,
      type: 'page' as const,
      icon: PROJECT_ICON,
      hasChildren: true,
      createdTime: project.createdAt.toISOString(),
      lastEditedTime: project.updatedAt.toISOString(),
      parentType: 'page_id' as const,
      parentId,
      url: project.url,
    }));
  }

  private async getProjectChildren(projectUuid: string, parentId: string): Promise<FinderItem[]> {
    const project = await this.client.project(projectUuid);

    const [documents, issues] = await Promise.all([
      project.documents({ first: 50 }),
      project.issues({ first: 50 }),
    ]);

    const docItems: FinderItem[] = documents.nodes.map((doc) => ({
      id: encodeId('document', doc.id),
      title: doc.title,
      type: 'page' as const,
      icon: DOCUMENT_ICON,
      hasChildren: false,
      createdTime: doc.createdAt.toISOString(),
      lastEditedTime: doc.updatedAt.toISOString(),
      parentType: 'page_id' as const,
      parentId,
      url: doc.url,
    }));

    // Resolve states in parallel for issue icons
    const statePromises = issues.nodes.map((issue) =>
      issue.state?.then((s) => s?.type).catch(() => undefined) ?? Promise.resolve(undefined)
    );
    const stateTypes = await Promise.all(statePromises);

    const childCountPromises = issues.nodes.map((issue) =>
      issue.children({ first: 0 })
        .then((c) => c.nodes.length > 0)
        .catch(() => false)
    );
    const hasChildrenArr = await Promise.all(childCountPromises);

    const issueItems: FinderItem[] = issues.nodes.map((issue, i) => ({
      id: encodeId('issue', issue.id),
      title: `${issue.identifier} ${issue.title}`,
      type: 'page' as const,
      icon: stateIcon(stateTypes[i]),
      hasChildren: hasChildrenArr[i],
      createdTime: issue.createdAt.toISOString(),
      lastEditedTime: issue.updatedAt.toISOString(),
      parentType: 'page_id' as const,
      parentId,
      url: issue.url,
    }));

    return [...docItems, ...issueItems];
  }

  private async getIssueChildren(issueUuid: string, parentId: string): Promise<FinderItem[]> {
    const issue = await this.client.issue(issueUuid);
    const children = await issue.children({ first: 50 });

    const statePromises = children.nodes.map((child) =>
      child.state?.then((s) => s?.type).catch(() => undefined) ?? Promise.resolve(undefined)
    );
    const stateTypes = await Promise.all(statePromises);

    return children.nodes.map((child, i) => ({
      id: encodeId('issue', child.id),
      title: `${child.identifier} ${child.title}`,
      type: 'page' as const,
      icon: stateIcon(stateTypes[i]),
      hasChildren: false,
      createdTime: child.createdAt.toISOString(),
      lastEditedTime: child.updatedAt.toISOString(),
      parentType: 'page_id' as const,
      parentId,
      url: child.url,
    }));
  }

  // ─── Content ───

  async getContent(itemId: string): Promise<ContentData> {
    const { type, uuid } = decodeId(itemId);

    switch (type) {
      case 'document':
        return this.getDocumentContent(uuid);
      case 'issue':
        return this.getIssueContent(uuid);
      case 'team':
        return this.getTeamContent(uuid);
      case 'project':
        return this.getProjectContent(uuid);
      default:
        throw new AdapterError('NOT_FOUND', `Unknown entity type: ${type}`);
    }
  }

  private async getDocumentContent(uuid: string): Promise<ContentData> {
    const doc = await this.client.document(uuid);
    return {
      markdown: doc.content ?? '',
      title: doc.title,
      url: doc.url,
      lastEditedTime: doc.updatedAt.toISOString(),
    };
  }

  private async getIssueContent(uuid: string): Promise<ContentData> {
    const issue = await this.client.issue(uuid);

    const [state, assignee, labels] = await Promise.all([
      issue.state ?? Promise.resolve(undefined),
      issue.assignee ?? Promise.resolve(undefined),
      issue.labels({ first: 20 }),
    ]);

    const properties: { name: string; value: string }[] = [];
    if (state) properties.push({ name: 'Status', value: state.name });
    if (assignee) properties.push({ name: 'Assignee', value: assignee.displayName ?? assignee.name });
    if (issue.priority !== undefined && issue.priority !== 0) {
      properties.push({ name: 'Priority', value: PRIORITY_NAMES[issue.priority] ?? String(issue.priority) });
    }
    if (labels.nodes.length > 0) {
      properties.push({ name: 'Labels', value: labels.nodes.map((l) => l.name).join(', ') });
    }
    if (issue.estimate) {
      properties.push({ name: 'Estimate', value: String(issue.estimate) });
    }
    if (issue.dueDate) {
      properties.push({ name: 'Due Date', value: String(issue.dueDate) });
    }

    let markdown = issue.description ?? '';

    // Append comments as a read-only section
    const comments = await issue.comments({ first: 50 });
    if (comments.nodes.length > 0) {
      markdown += '\n\n---\n\n## Comments\n\n';
      for (const comment of comments.nodes) {
        const author = await (comment.user ?? Promise.resolve(undefined));
        const authorName = author?.displayName ?? author?.name ?? 'Unknown';
        const date = comment.createdAt.toISOString().split('T')[0];
        markdown += `**${authorName}** (${date}):\n\n${comment.body}\n\n`;
      }
    }

    return {
      markdown,
      title: `${issue.identifier} ${issue.title}`,
      url: issue.url,
      lastEditedTime: issue.updatedAt.toISOString(),
      properties,
    };
  }

  private async getTeamContent(uuid: string): Promise<ContentData> {
    const team = await this.client.team(uuid);
    return {
      markdown: team.description ?? '',
      title: team.name,
      url: '',
      lastEditedTime: team.updatedAt.toISOString(),
    };
  }

  private async getProjectContent(uuid: string): Promise<ContentData> {
    const project = await this.client.project(uuid);
    const properties: { name: string; value: string }[] = [];
    if (project.state) properties.push({ name: 'State', value: project.state });
    if (project.targetDate) properties.push({ name: 'Target Date', value: String(project.targetDate) });
    if (project.progress !== undefined) {
      properties.push({ name: 'Progress', value: `${Math.round(project.progress * 100)}%` });
    }

    return {
      markdown: project.description ?? '',
      title: project.name,
      url: project.url,
      lastEditedTime: project.updatedAt.toISOString(),
      properties,
    };
  }

  // ─── Save ───

  async saveContent(itemId: string, markdown: string): Promise<void> {
    const { type, uuid } = decodeId(itemId);

    switch (type) {
      case 'document':
        await this.client.updateDocument(uuid, { content: markdown });
        this.invalidateChildren(itemId);
        return;
      case 'issue': {
        // Strip the read-only comments section before saving
        const separator = '\n\n---\n\n## Comments\n\n';
        const sepIdx = markdown.indexOf(separator);
        const description = sepIdx >= 0 ? markdown.slice(0, sepIdx) : markdown;
        await this.client.updateIssue(uuid, { description });
        this.invalidateChildren(itemId);
        return;
      }
      default:
        throw new AdapterError('READ_ONLY', `Cannot edit ${type} content`);
    }
  }

  // ─── CRUD ───

  async createPage(parentId: string, title: string): Promise<FinderItem> {
    const { type, uuid } = decodeId(parentId);

    if (type === 'project') {
      // Create a document under the project
      const payload = await this.client.createDocument({ title, content: '', projectId: uuid });
      const doc = await (payload.document ?? Promise.resolve(undefined));
      if (!doc) throw new AdapterError('CONFLICT', 'Failed to create document');

      this.invalidateChildren(parentId);
      return {
        id: encodeId('document', doc.id),
        title: doc.title,
        type: 'page',
        icon: DOCUMENT_ICON,
        hasChildren: false,
        createdTime: doc.createdAt.toISOString(),
        lastEditedTime: doc.updatedAt.toISOString(),
        parentType: 'page_id',
        parentId,
        url: doc.url,
      };
    }

    if (type === 'team') {
      // Create an issue under the team
      const payload = await this.client.createIssue({ title, teamId: uuid });
      const issue = await (payload.issue ?? Promise.resolve(undefined));
      if (!issue) throw new AdapterError('CONFLICT', 'Failed to create issue');

      this.invalidateChildren(parentId);
      return {
        id: encodeId('issue', issue.id),
        title: `${issue.identifier} ${issue.title}`,
        type: 'page',
        icon: stateIcon('unstarted'),
        hasChildren: false,
        createdTime: issue.createdAt.toISOString(),
        lastEditedTime: issue.updatedAt.toISOString(),
        parentType: 'page_id',
        parentId,
        url: issue.url,
      };
    }

    if (type === 'issue') {
      // Create a sub-issue
      const parent = await this.client.issue(uuid);
      const teamId = parent.teamId;
      if (!teamId) throw new AdapterError('NOT_FOUND', 'Cannot determine team for sub-issue');

      const payload = await this.client.createIssue({ title, teamId, parentId: uuid });
      const issue = await (payload.issue ?? Promise.resolve(undefined));
      if (!issue) throw new AdapterError('CONFLICT', 'Failed to create sub-issue');

      this.invalidateChildren(parentId);
      return {
        id: encodeId('issue', issue.id),
        title: `${issue.identifier} ${issue.title}`,
        type: 'page',
        icon: stateIcon('unstarted'),
        hasChildren: false,
        createdTime: issue.createdAt.toISOString(),
        lastEditedTime: issue.updatedAt.toISOString(),
        parentType: 'page_id',
        parentId,
        url: issue.url,
      };
    }

    throw new AdapterError('READ_ONLY', `Cannot create items under ${type}`);
  }

  async renamePage(itemId: string, newTitle: string): Promise<void> {
    const { type, uuid } = decodeId(itemId);

    switch (type) {
      case 'document':
        await this.client.updateDocument(uuid, { title: newTitle });
        break;
      case 'issue':
        await this.client.updateIssue(uuid, { title: newTitle });
        break;
      default:
        throw new AdapterError('READ_ONLY', `Cannot rename ${type}`);
    }

    // Invalidate parent caches
    this.cache.clear();
  }

  async archivePage(itemId: string): Promise<void> {
    const { type, uuid } = decodeId(itemId);

    switch (type) {
      case 'document':
        await this.client.deleteDocument(uuid);
        break;
      case 'issue':
        await this.client.archiveIssue(uuid);
        break;
      default:
        throw new AdapterError('READ_ONLY', `Cannot archive ${type}`);
    }

    this.cache.clear();
  }

  async movePage(_itemId: string, _newParentId: string): Promise<void> {
    throw new AdapterError('READ_ONLY', 'Moving items is not supported for the Linear backend');
  }

  // ─── Batch ───

  async batchMove(
    _moves: BatchMoveRequest[],
    _options?: { dryRun?: boolean },
  ): Promise<{ results: BatchMoveResult[] }> {
    throw new AdapterError('READ_ONLY', 'Batch move is not supported for the Linear backend');
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
        results.push({
          id,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    return { results };
  }

  // ─── Search ───

  async search(query: string, maxResults: number = 20): Promise<FinderItem[]> {
    const [issueResults, docResults] = await Promise.all([
      this.client.searchIssues(query, { first: maxResults }),
      this.client.searchDocuments(query, { first: maxResults }),
    ]);

    const items: FinderItem[] = [];

    for (const doc of docResults.nodes) {
      items.push({
        id: encodeId('document', doc.id),
        title: doc.title,
        type: 'page',
        icon: DOCUMENT_ICON,
        hasChildren: false,
        createdTime: doc.createdAt.toISOString(),
        lastEditedTime: doc.updatedAt.toISOString(),
        parentType: 'page_id',
        parentId: null,
        url: doc.url,
      });
    }

    for (const issue of issueResults.nodes) {
      items.push({
        id: encodeId('issue', issue.id),
        title: `${issue.identifier} ${issue.title}`,
        type: 'page',
        icon: stateIcon('unstarted'),
        hasChildren: false,
        createdTime: issue.createdAt.toISOString(),
        lastEditedTime: issue.updatedAt.toISOString(),
        parentType: 'page_id',
        parentId: null,
        url: issue.url,
      });
    }

    return items.slice(0, maxResults);
  }
}
