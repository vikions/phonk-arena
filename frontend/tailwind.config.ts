import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          950: "#05070d",
          900: "#090f1e",
          800: "#101a35",
          cyan: "#4efcf5",
          red: "#ff365f",
          amber: "#ffb84d",
        },
      },
      boxShadow: {
        neon: "0 0 22px rgba(78, 252, 245, 0.45)",
        blood: "0 0 22px rgba(255, 54, 95, 0.45)",
      },
      backgroundImage: {
        "arena-grid":
          "linear-gradient(rgba(78,252,245,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(78,252,245,0.12) 1px, transparent 1px)",
      },
      animation: {
        pulseSlow: "pulseSlow 2.5s ease-in-out infinite",
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "0.65" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
