// Curated inline-SVG icon set for dialog tiles on the public overview.
//
// All icons are hand-drawn (24×24 viewbox, stroke-based) so they inherit the
// surrounding font colour via `currentColor` and stay sharp at any size.
// No external icon library is pulled in – keeps the dependency tree minimal
// and avoids any per-icon licensing concerns.

import type { SVGProps } from "react";

export type DialogIconName =
  | "document"
  | "scale"
  | "signature"
  | "house"
  | "building"
  | "briefcase"
  | "users"
  | "ring"
  | "heart"
  | "baby"
  | "tree"
  | "scroll"
  | "shield"
  | "gift"
  | "key"
  | "handshake"
  | "stamp"
  // Erweiterung – typische Notariats-Vorgänge
  | "land-register"
  | "lien"
  | "calendar"
  | "coins"
  | "bank"
  | "folder"
  | "archive"
  | "calculator"
  | "book"
  | "map"
  | "chat"
  | "phone"
  | "mail"
  | "quill"
  | "gavel"
  | "family"
  | "medical"
  | "transfer"
  | "id-card"
  | "flag"
  | "percent"
  | "church"
  | "car"
  | "association";

const STROKE: SVGProps<SVGSVGElement> = {
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const PATHS: Record<DialogIconName, JSX.Element> = {
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v16" />
      <path d="M5 8h14" />
      <path d="M5 8l-3 6h6z" />
      <path d="M19 8l-3 6h6z" />
      <path d="M8 20h8" />
    </>
  ),
  signature: (
    <>
      <path d="M3 17c3 0 4-6 7-6s4 6 7 6" />
      <path d="M3 21h18" />
      <path d="M16 7l3-3 2 2-3 3z" />
    </>
  ),
  house: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  building: (
    <>
      <path d="M4 21h16" />
      <path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 20c0-2 2-4 4-4 1.6 0 3 1.2 3 3" />
    </>
  ),
  ring: (
    <>
      <circle cx="12" cy="15" r="6" />
      <path d="M8 5l4 4 4-4" />
      <path d="M9 5h6" />
    </>
  ),
  heart: (
    <>
      <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />
    </>
  ),
  baby: (
    <>
      <circle cx="12" cy="9" r="4" />
      <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
      <circle cx="10.5" cy="9" r=".7" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="9" r=".7" fill="currentColor" stroke="none" />
      <path d="M11 11.5c.5.4 1.5.4 2 0" />
    </>
  ),
  tree: (
    <>
      <path d="M12 3v18" />
      <path d="M12 7l-5-3M12 7l5-3" />
      <path d="M12 12l-7-3M12 12l7-3" />
      <path d="M12 17l-5-2M12 17l5-2" />
    </>
  ),
  scroll: (
    <>
      <path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V4z" />
      <path d="M6 4a2 2 0 0 0-2 2v2h2" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="10" width="18" height="11" rx="1" />
      <path d="M3 14h18" />
      <path d="M12 10v11" />
      <path d="M12 10c0-3-2-5-4-5s-2 2 0 3 4 2 4 2z" />
      <path d="M12 10c0-3 2-5 4-5s2 2 0 3-4 2-4 2z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="M11 13l9-7" />
      <path d="M17 8l2 2" />
      <path d="M15 10l2 2" />
    </>
  ),
  handshake: (
    <>
      <path d="M3 12l4-4 3 1 4 4-1 2-3 1-4-1z" />
      <path d="M21 12l-4-4-3 1" />
      <path d="M13 17l2 2 2-1 1-2-3-3" />
      <path d="M3 12v3l3 3" />
    </>
  ),
  stamp: (
    <>
      <path d="M9 3h6l1 6a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" />
      <path d="M5 21h14" />
      <path d="M6 17h12l-2-4H8z" />
    </>
  ),
  "land-register": (
    <>
      <path d="M6 3h12v18H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M6 17h12" />
      <path d="M9 8h6M9 11h4" />
    </>
  ),
  lien: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M14 13h-3" />
      <path d="M14 16h-3" />
      <path d="M13 11.5c-1.5 0-2.5 1.5-2.5 3s1 3 2.5 3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8 13h2M14 13h2M8 17h2M14 17h2" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="2.5" />
      <path d="M3 7v3c0 1.5 2.7 2.5 6 2.5s6-1 6-2.5V7" />
      <path d="M3 12v3c0 1.5 2.7 2.5 6 2.5s6-1 6-2.5v-3" />
      <ellipse cx="17" cy="16" rx="4" ry="2" />
      <path d="M13 16v2.5c0 1.1 1.8 2 4 2s4-.9 4-2V16" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10l9-6 9 6" />
      <path d="M3 10h18" />
      <path d="M5 10v9M9 10v9M15 10v9M19 10v9" />
      <path d="M3 21h18" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 13h4" />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <rect x="8" y="6" width="8" height="4" rx="1" />
      <circle cx="9" cy="14" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r=".8" fill="currentColor" stroke="none" />
      <circle cx="9" cy="17" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h12" />
      <path d="M8 7h6M8 11h6" />
    </>
  ),
  map: (
    <>
      <path d="M9 3L3 5v16l6-2 6 2 6-2V3l-6 2z" />
      <path d="M9 3v16M15 5v16" />
    </>
  ),
  chat: (
    <>
      <path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4a8 8 0 1 1 16-4z" />
    </>
  ),
  phone: (
    <>
      <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </>
  ),
  quill: (
    <>
      <path d="M20 4c0 6-4 14-12 14L4 20l2-4C6 9 14 4 20 4z" />
      <path d="M4 20l6-6" />
    </>
  ),
  gavel: (
    <>
      <path d="M14 7l3-3 5 5-3 3z" />
      <path d="M11 10l7 7" />
      <path d="M9 12l3-3" />
      <path d="M4 21l7-7" />
      <path d="M3 21h8" />
    </>
  ),
  family: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="9" r="1.5" />
      <path d="M3 21c0-3 1.5-5 3-5" />
      <path d="M21 21c0-3-1.5-5-3-5" />
      <path d="M9 21c0-2 1.3-3 3-3s3 1 3 3" />
      <path d="M6 8v3M18 8v3M12 10.5v2.5" />
    </>
  ),
  medical: (
    <>
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
    </>
  ),
  transfer: (
    <>
      <path d="M3 8h15" />
      <path d="M14 4l4 4-4 4" />
      <path d="M21 16H6" />
      <path d="M10 12l-4 4 4 4" />
    </>
  ),
  "id-card": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.5" />
      <path d="M5 17c.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5" />
      <path d="M14 10h5M14 13h4" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </>
  ),
  percent: (
    <>
      <path d="M5 19L19 5" />
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
    </>
  ),
  church: (
    <>
      <path d="M12 2v6" />
      <path d="M10 4h4" />
      <path d="M4 21V11l8-3 8 3v10" />
      <path d="M10 21v-5h4v5" />
      <path d="M4 21h16" />
    </>
  ),
  car: (
    <>
      <path d="M3 14l2-6h14l2 6" />
      <path d="M3 14h18v4H3z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  association: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="5.5" r="1.8" />
      <circle cx="12" cy="18.5" r="1.8" />
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </>
  ),
};

export const DIALOG_ICON_NAMES: DialogIconName[] = Object.keys(PATHS) as DialogIconName[];

// Human-readable labels for the picker dropdown.
export const DIALOG_ICON_LABELS: Record<DialogIconName, string> = {
  document: "Dokument",
  scale: "Waage",
  signature: "Unterschrift",
  house: "Haus",
  building: "Gebäude",
  briefcase: "Aktentasche",
  users: "Personen",
  ring: "Ring",
  heart: "Herz",
  baby: "Baby",
  tree: "Stammbaum",
  scroll: "Schriftrolle",
  shield: "Schild",
  gift: "Geschenk",
  key: "Schlüssel",
  handshake: "Handschlag",
  stamp: "Siegel",
  "land-register": "Grundbuch",
  lien: "Grundschuld / Hypothek",
  calendar: "Kalender / Termin",
  coins: "Geld / Vermögen",
  bank: "Bank / Behörde",
  folder: "Akte / Ordner",
  archive: "Archiv",
  calculator: "Rechner / Steuer",
  book: "Gesetz / Vorschrift",
  map: "Karte / Lageplan",
  chat: "Beratung / Chat",
  phone: "Telefon",
  mail: "E-Mail",
  quill: "Vollmacht / Schrift",
  gavel: "Recht / Gericht",
  family: "Familie",
  medical: "Patientenverfügung",
  transfer: "Übertragung / Tausch",
  "id-card": "Ausweis",
  flag: "Staatsangehörigkeit",
  percent: "Anteil / Quote",
  church: "Stiftung / Kirche",
  car: "Kfz / Fahrzeug",
  association: "Verein",
};

export function isDialogIconName(value: unknown): value is DialogIconName {
  return typeof value === "string" && value in PATHS;
}

interface DialogIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: string | undefined;
}

export function DialogIcon({ name, className, ...rest }: DialogIconProps) {
  if (!isDialogIconName(name)) return null;
  return (
    <svg className={className} {...STROKE} {...rest}>
      {PATHS[name]}
    </svg>
  );
}
