'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tryApi } from '@/lib/apiClient';
import type { Business, CallLog } from '@/lib/types2';

/* One fetch for the whole console. Every screen reads the same tenants and
   calls, so loading them per route would just be the same request repeated. */

export interface Stats {
  mrr: number; active: number; total: number; totalRows?: number;
  callsUsed: number; totalCalls: number; connectedCalls?: number;
  answeredSeconds?: number; hotLeads: number;
}

export interface SchemaHealth {
  connected?: boolean;
  healthy?: boolean;
  missingTables?: string[];
  missingColumns?: string[];
  tables?: Record<string, unknown>;
  fix?: string;
  /** ALTER statements for exactly the columns this database lacks. */
  repairSql?: string;
}

interface Ctx {
  businesses: Business[];
  stats: Stats;
  calls: CallLog[];
  duplicates: number;
  services: Record<string, boolean>;
  schema: SchemaHealth | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const EMPTY: Stats = { mrr: 0, active: 0, total: 0, callsUsed: 0, totalCalls: 0, hotLeads: 0 };

const SuperAdminContext = createContext<Ctx>({
  businesses: [], stats: EMPTY, calls: [], duplicates: 0,
  services: {}, schema: null, loading: true, reload: async () => {},
});

export const useSuperAdmin = () => useContext(SuperAdminContext);

export function SuperAdminProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [schema, setSchema] = useState<SchemaHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [res, status, health] = await Promise.all([
      tryApi(() => api.allBusinesses()),
      tryApi(() => api.status()),
      tryApi(() => api.dbHealth()),
    ]);
    if (res) {
      setBusinesses(res.businesses);
      setStats(res.stats);
      setCalls(res.recentCalls);
      setDuplicates((res as { duplicates?: number }).duplicates ?? 0);
    }
    if (status) setServices((status.services as Record<string, boolean>) ?? {});
    if (health) setSchema(health as SchemaHealth);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <SuperAdminContext.Provider
      value={{ businesses, stats, calls, duplicates, services, schema, loading, reload }}
    >
      {children}
    </SuperAdminContext.Provider>
  );
}
