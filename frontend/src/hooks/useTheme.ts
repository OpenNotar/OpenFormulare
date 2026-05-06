import { useEffect } from 'react';

export function useTheme() {
  useEffect(() => {
    const primary = import.meta.env.VITE_COLOR_PRIMARY as string | undefined;
    const primaryDark = import.meta.env.VITE_COLOR_PRIMARY_DARK as string | undefined;
    const accent = import.meta.env.VITE_COLOR_ACCENT as string | undefined;

    if (primary) {
      document.documentElement.style.setProperty('--color-primary', `#${primary}`);
    }
    if (primaryDark) {
      document.documentElement.style.setProperty('--color-primary-dark', `#${primaryDark}`);
    }
    if (accent) {
      document.documentElement.style.setProperty('--color-accent', `#${accent}`);
    }
  }, []);
}
