/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        brand: {
          50: "#E6F4FF",
          100: "#BAE0FF",
          200: "#91CAFF",
          300: "#61B1FF",
          400: "#3898FF",
          500: "#1677FF",
          600: "#0958D9",
          700: "#0E42B3",
          800: "#002C8C",
          900: "#001D66",
        },
        accent: {
          400: "#36CFC9",
          500: "#00B8D9",
          600: "#0897B4",
        },
        success: {
          500: "#52C41A",
          600: "#389E0D",
        },
        warning: {
          500: "#FA8C16",
          600: "#D46B08",
        },
        danger: {
          500: "#FF4D4F",
          600: "#CF1322",
        },
        dark: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
          950: "#020617",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ['"PingFang SC"', '"Microsoft YaHei"', "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "grid-dark":
          "linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)",
        "brand-gradient": "linear-gradient(135deg, #1677FF 0%, #00B8D9 100%)",
        "card-gradient":
          "linear-gradient(135deg, rgba(22,119,255,0.12) 0%, rgba(0,184,217,0.08) 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(22,119,255,0.35)",
        "glow-sm": "0 0 12px rgba(22,119,255,0.25)",
        card: "0 4px 24px -6px rgba(0,0,0,0.4)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "grow-up": {
          "0%": { transform: "scaleY(0)", transformOrigin: "bottom" },
          "100%": { transform: "scaleY(1)", transformOrigin: "bottom" },
        },
        "count-up": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "grow-up": "grow-up 0.8s ease-out both",
      },
    },
  },
  plugins: [],
};
