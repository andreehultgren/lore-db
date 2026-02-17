import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        kb: {
          bg: "hsl(var(--kb-bg))",
          panel: "hsl(var(--kb-panel))",
          ink: "hsl(var(--kb-ink))",
          soft: "hsl(var(--kb-soft))",
          line: "hsl(var(--kb-line))",
          accent: "hsl(var(--kb-accent))",
          accentStrong: "hsl(var(--kb-accent-strong))",
          danger: "hsl(var(--kb-danger))",
        },
      },
      fontFamily: {
        sans: ["Public Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel:
          "0 1px 2px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.06)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
