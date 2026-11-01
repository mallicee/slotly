import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // works from any GitHub Pages sub-path
  plugins: [react()],
  server: {
    fs: { allow: ['..'] }, // shared/ lives next to frontend/
  },
  test: {
    environment: 'node',
  },
});
