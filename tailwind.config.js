/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"]
      },
      colors: {
        tbit: {
          void: "#030712",
          cyan: "#00ffcc",
          magenta: "#ff2d75",
          panel: "rgba(6, 18, 32, 0.68)"
        }
      }
    }
  },
  plugins: []
};
