import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./desktop/renderer/index.html", "./desktop/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "PingFang SC",
          "Microsoft YaHei",
          "Noto Sans CJK SC",
          "system-ui",
          "sans-serif"
        ]
      },
      colors: {
        surface: {
          950: "#101113",
          900: "#17191d",
          850: "#1f2228",
          800: "#282c34"
        },
        brand: {
          500: "#18c29c",
          600: "#10a884"
        }
      }
    }
  },
  plugins: []
} satisfies Config;
