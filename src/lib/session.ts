import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

// ─── Types ───

export type OAuthBackend = 'notion' | 'linear' | 'git-github';

export interface Connection {
  backend: OAuthBackend;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Unix ms — only Linear tokens expire
  workspaceName: string;
  workspaceIcon?: string;
  /** GitHub only: "owner/repo" */
  githubRepo?: string;
}

/** Serialized into an encrypted HTTP-only cookie via iron-session. */
export interface SessionData {
  connections: Connection[];
  activeBackend: OAuthBackend | null;
  /** CSRF state tokens for in-flight OAuth flows */
  oauthState?: string;
}

// ─── Config ───

const SESSION_SECRET = process.env.SESSION_SECRET || 'UNSAFE_DEV_SECRET_CHANGE_ME_IN_PRODUCTION_32';

export const sessionOptions: SessionOptions = {
  password: SESSION_SECRET,
  cookieName: 'potion_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  },
};

// ─── Helpers ───

const defaultSession: SessionData = {
  connections: [],
  activeBackend: null,
};

/** Get the session from Next.js cookies (server components & route handlers). */
export async function getSession(): Promise<SessionData & { save: () => Promise<void> }> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  // Initialize defaults if empty
  if (!session.connections) {
    session.connections = defaultSession.connections;
    session.activeBackend = defaultSession.activeBackend;
  }

  return session as SessionData & { save: () => Promise<void> };
}

/** Find the active connection, if any. */
export function getActiveConnection(session: SessionData): Connection | null {
  if (!session.activeBackend) return null;
  return session.connections.find((c) => c.backend === session.activeBackend) ?? null;
}

/** Return which backends have tokens configured via env vars. */
export function getConfiguredEnvBackends(): OAuthBackend[] {
  // If BACKEND_TYPE is set, only return that one (legacy single-backend mode)
  if (process.env.BACKEND_TYPE) {
    return [process.env.BACKEND_TYPE as OAuthBackend];
  }
  const backends: OAuthBackend[] = [];
  if (process.env.NOTION_API_TOKEN) backends.push('notion');
  if (process.env.LINEAR_API_KEY) backends.push('linear');
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) backends.push('git-github');
  return backends;
}

/** Check whether we're running in env-var mode (any tokens configured). */
export function isEnvVarMode(): boolean {
  return getConfiguredEnvBackends().length > 0;
}

/** Public-safe connection info (no tokens). */
export interface ConnectionInfo {
  backend: OAuthBackend;
  workspaceName: string;
  workspaceIcon?: string;
  isActive: boolean;
  /** GitHub only: "owner/repo" — needed for display + setup check */
  githubRepo?: string;
}

export function toConnectionInfo(connections: Connection[], activeBackend: OAuthBackend | null): ConnectionInfo[] {
  return connections.map((c) => ({
    backend: c.backend,
    workspaceName: c.workspaceName,
    workspaceIcon: c.workspaceIcon,
    isActive: c.backend === activeBackend,
    githubRepo: c.githubRepo,
  }));
}
