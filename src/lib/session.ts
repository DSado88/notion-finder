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

/** Check whether we're running in env-var fallback mode (self-hosted/dev). */
export function isEnvVarMode(): boolean {
  return !!process.env.BACKEND_TYPE;
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
