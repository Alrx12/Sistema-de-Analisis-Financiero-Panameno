/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Paleta SAFPRO — navy + naranja
        navy: {
          50:  "#eef1f8",
          100: "#d5dcee",
          200: "#abbad7",
          300: "#7e97bf",
          400: "#5474a7",
          500: "#2d4878",
          600: "#243c63",
          700: "#1c2b4b",   // ← Color principal SAFPRO
          800: "#14203a",
          900: "#0c1526",
        },
        brand: {
          orange: "#e05c19",  // ← Naranja SAFPRO
          navy:   "#1c2b4b",  // ← Navy SAFPRO
        },
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
}
