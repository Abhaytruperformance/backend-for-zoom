/**
 * Inline SVG icon set, replacing the emoji that used to stand in for icons.
 *
 * Emoji render as whatever the viewer's OS decides — different artwork, different colour,
 * different optical weight on macOS vs Windows vs Android, and some (the status circles)
 * carry colour we can't restyle or theme. These are stroked paths on a 24px grid that
 * inherit `currentColor` and size from the surrounding text, so they sit on the brand
 * palette and stay consistent everywhere.
 */
export type IconName =
  | "check-circle"
  | "building"
  | "calendar"
  | "mail"
  | "mail-open"
  | "video";

const PATHS: Record<IconName, React.ReactNode> = {
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  building: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15" />
      <path d="M13 21V10h5a1 1 0 0 1 1 1v10" />
      <path d="M8 9h2M8 13h2M8 17h2M16 14h0M16 17h0" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 7.6 5.4a1.5 1.5 0 0 0 1.8 0L20.5 7" />
    </>
  ),
  "mail-open": (
    <>
      <path d="M3 10.5 12 4l9 6.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="m3 10.5 8.1 5.4a1.5 1.5 0 0 0 1.8 0L21 10.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m15 10.5 5-3v9l-5-3z" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number | string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * Connection health indicator. Was a set of coloured-circle emoji, whose colour is fixed by the font,
 * so it could neither match the brand palette nor be the only carrier of meaning. Colour
 * here comes from the design tokens, and the adjacent status badge carries the text, so
 * this stays decorative for anyone who can't distinguish the hues.
 */
export function StatusDot({ tone }: { tone: "ok" | "warn" | "err" | "idle" }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}
