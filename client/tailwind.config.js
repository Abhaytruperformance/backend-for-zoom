/** @type {import('tailwindcss').Config} */
export default {
  // Scoped to the landing page only — the rest of the app uses its own hand-rolled
  // CSS system (src/index.css). Preflight is off so Tailwind's reset never touches
  // global elements (button/input/h1/etc.) that the authenticated app already styles.
  content: ["./src/landing/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        primary: "var(--lp-primary)",
        "primary-foreground": "var(--lp-primary-foreground)",
        secondary: "var(--lp-secondary)",
        "secondary-foreground": "var(--lp-secondary-foreground)",
        destructive: "var(--lp-destructive)",
        "destructive-foreground": "var(--lp-destructive-foreground)",
        border: "var(--lp-border)",
        foreground: "var(--lp-foreground)",
        "card-foreground": "var(--lp-card-foreground)",
        "muted-foreground": "var(--lp-muted-foreground)",
      },
    },
  },
  plugins: [],
};
