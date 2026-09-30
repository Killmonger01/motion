import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages, Vercel, local file server).
  base: './',
  server: { host: true },
  test: { environment: 'node' },
});
