import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativo: l'app funziona sia su un dominio sia in una sottocartella (es. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
});
