import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false, allowedHosts: ['ignitinginnovation.simonaatula.fi'] },
  build: { target: 'es2022' },
});
