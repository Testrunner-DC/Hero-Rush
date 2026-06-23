/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tech: "#E24B4A",
        justice: "#378ADD",
        nature: "#7F77DD",
        agility: "#639922",
        neutral: "#888780",
      },
    },
  },
  plugins: [],
};
