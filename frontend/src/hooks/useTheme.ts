import { useBranding } from './useBranding';

// Single source of truth for the runtime theme: the branding settings
// served by `/api/settings/branding`. Build-time VITE_COLOR_* env vars are
// applied once on module load as fallback defaults so an unconfigured
// instance still picks them up; the admin-set values override them as
// soon as the branding fetch resolves.
applyEnvDefaults();

function applyEnvDefaults() {
  if (typeof document === 'undefined') return;
  const primary = import.meta.env.VITE_COLOR_PRIMARY as string | undefined;
  const primaryDark = import.meta.env.VITE_COLOR_PRIMARY_DARK as string | undefined;
  const accent = import.meta.env.VITE_COLOR_ACCENT as string | undefined;
  if (primary) document.documentElement.style.setProperty('--color-primary', `#${primary}`);
  if (primaryDark) document.documentElement.style.setProperty('--color-primary-dark', `#${primaryDark}`);
  if (accent) document.documentElement.style.setProperty('--color-accent', `#${accent}`);
}

export function useTheme() {
  // Trigger the branding fetch + applyTheme side-effect. Every page that
  // calls useTheme now also receives the live admin colors.
  useBranding();
}
