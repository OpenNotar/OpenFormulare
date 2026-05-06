import { useEffect, useState } from 'react';
import type { FormField } from '../types/schema';
import { getDemoHeaders } from '../lib/runtimeMode';

const apiUrl = import.meta.env.VITE_API_URL ?? '';

export interface PersonTemplates {
  natural: FormField[] | null;
  legal: FormField[] | null;
}

let cache: PersonTemplates | null = null;
let inflight: Promise<PersonTemplates> | null = null;

async function load(): Promise<PersonTemplates> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${apiUrl}/api/settings/person-templates`, {
        headers: getDemoHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
      const payload = (await res.json()) as PersonTemplates;
      cache = {
        natural: payload.natural ?? null,
        legal: payload.legal ?? null,
      };
      return cache;
    } catch {
      cache = { natural: null, legal: null };
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearPersonTemplatesCache() {
  cache = null;
}

export function usePersonTemplates() {
  const [templates, setTemplates] = useState<PersonTemplates>(cache ?? { natural: null, legal: null });

  useEffect(() => {
    let cancelled = false;
    load().then((t) => {
      if (!cancelled) setTemplates(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    naturalTemplate: templates.natural,
    legalTemplate: templates.legal,
  };
}
