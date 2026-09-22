import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Zipzip/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
