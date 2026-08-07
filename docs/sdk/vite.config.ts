import { defineConfig } from 'vite';

// Static docs — no framework, no build-time dependency on the packages it
// documents. Deploys to Vercel/Netlify/Pages with `dist` as the output dir.
export default defineConfig({
  build: { outDir: 'dist' },
  server: { port: 5174 },
});
