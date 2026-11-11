import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        md: {
          primary: "#3F51B5",
          "primary-container": "#E0E0FF",
          "on-primary": "#FFFFFF",
          "on-primary-container": "#00105C",
          secondary: "#5C5D72",
          "secondary-container": "#E1E0F9",
          tertiary: "#7B5266",
          "tertiary-container": "#FFD8E9",
          surface: "#FDFBFF",
          "surface-container": "#F2ECF4",
          "surface-container-high": "#ECE6EE",
          "on-surface": "#1A1B20",
          outline: "#767680",
        },
      },
      boxShadow: {
        "m3-1": "0px 1px 3px 1px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)",
        "m3-2": "0px 2px 6px 2px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)",
        "m3-3": "0px 4px 8px 3px rgba(0, 0, 0, 0.15), 0px 1px 3px 0px rgba(0, 0, 0, 0.30)",
        "book": "-8px 12px 24px -4px rgba(18, 24, 48, 0.25), -2px 4px 8px rgba(0,0,0,0.12)",
        "book-hover": "-12px 18px 32px -4px rgba(18, 24, 48, 0.35), -3px 6px 12px rgba(0,0,0,0.18)",
      },
    },
  },
  plugins: [],
};
export default config;