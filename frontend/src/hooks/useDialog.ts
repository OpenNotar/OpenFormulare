// Loads a single dialog (by route/id) on demand and caches it. Used by the
// EmbedField renderer so several embeds of the same dialog share one fetch.

import { useEffect, useState } from 'react';
import { getDialog, type DialogRecord } from '../lib/dialogsApi';

const cache = new Map<string, DialogRecord>();
const inflight = new Map<string, Promise<DialogRecord>>();

export interface DialogState {
  dialog: DialogRecord | null;
  error: string | null;
  loading: boolean;
}

async function load(id: string): Promise<DialogRecord> {
  const cached = cache.get(id);
  if (cached) return cached;
  let p = inflight.get(id);
  if (!p) {
    p = getDialog(id).then((d) => {
      cache.set(id, d);
      inflight.delete(id);
      return d;
    }).catch((err) => {
      inflight.delete(id);
      throw err;
    });
    inflight.set(id, p);
  }
  return p;
}

export function clearDialogCache(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}

export function useDialog(id: string | undefined): DialogState {
  const [state, setState] = useState<DialogState>(() => ({
    dialog: id ? cache.get(id) ?? null : null,
    error: null,
    loading: !!id && !cache.has(id),
  }));

  useEffect(() => {
    if (!id) {
      setState({ dialog: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    if (cache.has(id)) {
      setState({ dialog: cache.get(id) ?? null, error: null, loading: false });
      return;
    }
    setState({ dialog: null, error: null, loading: true });
    load(id)
      .then((d) => {
        if (!cancelled) setState({ dialog: d, error: null, loading: false });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ dialog: null, error: err.message, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
