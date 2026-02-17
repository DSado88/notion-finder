'use client';

import { useEffect, useState } from 'react';
import type { BackendCapabilities } from '@/lib/adapters/types';

interface BackendInfo {
  name: string;
  capabilities: BackendCapabilities;
}

let cached: BackendInfo | null = null;

export function useBackend() {
  const [info, setInfo] = useState<BackendInfo | null>(cached);
  const [isLoading, setIsLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;

    fetch('/api/workspace/capabilities')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: BackendInfo) => {
        cached = data;
        setInfo(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  return {
    name: info?.name ?? null,
    capabilities: info?.capabilities ?? null,
    isLoading,
  };
}
