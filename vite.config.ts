import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/crypto-lab-split-point/',
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/dpf/**/*.ts', 'src/pir/**/*.ts', 'src/attack/**/*.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85
      }
    }
  }
});