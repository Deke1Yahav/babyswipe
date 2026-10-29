import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works on GitHub Pages under /babyswipe/ as well as at a domain root.
export default defineConfig({ base: "./", plugins: [react()] });
