// Test runner config for Qalandarana.
// Vitest is like Jest but faster and TypeScript-native. Every later task's
// unit tests (status-machine transitions, adapters, the pipeline fixture)
// run through this config, so it's the shared harness the whole repo relies on.
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // environment 'node' (not jsdom): our tests are backend logic, not DOM.
  // include: only *.test.ts under src/ counts as a test file.
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  // CONCEPT: path alias — lets tests import '@/lib/...' instead of long
  // relative paths. Must mirror the "@/*" alias in tsconfig.json.
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
