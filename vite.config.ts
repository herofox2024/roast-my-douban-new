import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  build: {
    target: 'es2015',
    cssTarget: ['chrome64', 'edge79', 'firefox62', 'safari11.1', 'ios11.1']
  },
  preview: {
    host: '0.0.0.0',
    port: parsePort(process.env.PORT, 4173),
    allowedHosts: [
      'roast-my-douban-new.onrender.com',
      '.onrender.com'
    ]
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
