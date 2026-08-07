import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vite loads `.env` from the project root, which here is `apps/web`. Point it
  // at the repo root instead so the monorepo has one `.env` rather than one per
  // app — matching what `.env.example` and the README tell you to create.
  envDir: '../..',
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
  // The workspace packages are consumed from their built `dist/`, so a change
  // to a package needs `npm run build:libs` (or `tsc -b --watch`) to appear.
  // That is deliberate: the app consumes them exactly as an external consumer
  // would, which is the only way to notice a broken `exports` map before a user does.
  optimizeDeps: { include: ['react', 'react-dom'] },
});
