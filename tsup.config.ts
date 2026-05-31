import { defineConfig } from 'tsup'

const sharedExternal = ['@stellar/stellar-sdk', '@stellar/freighter-api', '@lobstrco/signer-extension-api']

export default defineConfig([
  // Browser SDK
  {
    entry: {
      index: 'src/index.ts',
      'wallets/index': 'src/wallets/index.ts',
    },
    format: ['esm', 'cjs'],
    platform: 'browser',
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    treeshake: true,
    external: sharedExternal,
  },

  // CLI (Node.js)
  {
    entry: { 'cli/generate': 'src/cli/generate.ts' },
    format: ['esm'],
    platform: 'node',
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    treeshake: true,
    external: sharedExternal,
    banner: { js: '#!/usr/bin/env node' },
  },
])
