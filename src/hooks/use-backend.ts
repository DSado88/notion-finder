'use client';

import { useEffect, useState, useCallback } from 'react';
import type { BackendCapabilities } from '@/lib/adapters/types';
import type { ConnectionInfo } from '@/lib/session';

interface BackendInfo {
  name: string;
  capabilities: BackendCapabilities;
}

interface ConnectionsData {
  mode: 'env' | 'oauth';
  connections: ConnectionInfo[];
}

let cachedInfo: BackendInfo | null = null;
let cachedConnections: ConnectionsData | null = null;

export function useBackend() {
  const [info, setInfo] = useState<BackendInfo | null>(cachedInfo);
  const [connections, setConnections] = useState<ConnectionsData | null>(cachedConnections);
  const [isLoading, setIsLoading] = useState(!cachedInfo);

  const fetchAll = useCallback((force = false) => {
    if (!force && cachedInfo) return;

    setIsLoading(true);

    Promise.all([
      fetch('/api/workspace/capabilities')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch('/api/auth/connections')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([capData, connData]) => {
      if (capData) {
        cachedInfo = capData;
        setInfo(capData);
      }
      if (connData) {
        cachedConnections = connData;
        setConnections(connData);
      }
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Invalidate cached data and refetch (call after switching backends). */
  const invalidate = useCallback(() => {
    cachedInfo = null;
    cachedConnections = null;
    fetchAll(true);
  }, [fetchAll]);

  return {
    name: info?.name ?? null,
    capabilities: info?.capabilities ?? null,
    connections: connections?.connections ?? [],
    mode: connections?.mode ?? null,
    isLoading,
    invalidate,
  };
}
