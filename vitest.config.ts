import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vitest/config';

// Separate from vite.config.ts so tests skip the Tailwind plugin and dev-server options.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
