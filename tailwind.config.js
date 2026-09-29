/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e3f2fd",
          100: "#bbdefb",
          500: "#1565c0",
          600: "#0d47a1",
          700: "#0a3d91",
        },
      },
    },
  },
  plugins: [],
};
