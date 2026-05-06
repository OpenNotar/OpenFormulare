import { useEffect, useState } from 'react';

const apiUrl = import.meta.env.VITE_API_URL ?? '';

export interface Branding {
  notarName?: string;
  titleTemplate?: string;
  primaryColor?: string;
  colors?: {
    primary?: string;
    primaryDark?: string;
    accent?: string;
  };
  faviconUrl?: string;
  logoUrl?: string;
}

let cache: Branding | null = null;
let inflight: Promise<Branding> | null = null;

async function load(): Promise<Branding> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${apiUrl}/api/settings/branding`);
      if (!res.ok) throw new Error(String(res.status));
      cache = (await res.json()) as Branding;
      return cache;
    } catch {
      cache = {};
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearBrandingCache() {
  cache = null;
}

function applyTheme(branding: Branding) {
  const colors = branding.colors;
  if (colors?.primary) document.documentElement.style.setProperty('--color-primary', colors.primary.startsWith('#') ? colors.primary : `#${colors.primary}`);
  if (colors?.primaryDark) document.documentElement.style.setProperty('--color-primary-dark', colors.primaryDark.startsWith('#') ? colors.primaryDark : `#${colors.primaryDark}`);
  if (colors?.accent) document.documentElement.style.setProperty('--color-accent', colors.accent.startsWith('#') ? colors.accent : `#${colors.accent}`);

  if (branding.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.faviconUrl;
  }
}

export function useBranding(): Branding | null {
  const [branding, setBranding] = useState<Branding | null>(cache);

  useEffect(() => {
    let cancelled = false;
    load().then((b) => {
      if (cancelled) return;
      setBranding(b);
      applyTheme(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return branding;
}
