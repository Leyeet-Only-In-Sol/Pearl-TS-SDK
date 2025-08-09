/**
 * Rollup Configuration for Sui DLMM SDK
 * 
 * This configuration builds the SDK for multiple environments:
 * - ESM (ES Modules) for modern bundlers
 * - CommonJS for Node.js compatibility
 * - TypeScript declarations for type safety
 */

import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';
import { readFileSync } from 'fs';

// Package info for banner
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * 
 * Built for Sui DLMM Protocol
 * (c) 2024 Sui DLMM Team
 */`;

// External dependencies that should not be bundled
const external = [
  // Sui SDK dependencies
  '@mysten/sui/client',
  '@mysten/sui/transactions', 
  '@mysten/sui/keypairs/ed25519',
  '@mysten/sui/bcs',
  '@mysten/enoki',
  
  // Node.js built-ins
  'crypto',
  'buffer',
  'stream',
  'util',
  'events',
  
  // Other potential externals
  /^@mysten\//,
  /^node:/
];

// Common plugins
const commonPlugins = [
  resolve({
    preferBuiltins: true,
    exportConditions: ['node', 'default']
  })
];

// Add development build if in development mode
const configs = [
  // ==================== MAIN BUILDS ====================
  
  // ESM Build (primary output)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      banner,
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins: [
      ...commonPlugins,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false, // We'll generate declarations separately
        sourceMap: true,
        exclude: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*']
      })
    ]
  },

  // CommonJS Build (for Node.js compatibility)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      banner,
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins: [
      ...commonPlugins,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        sourceMap: true,
        exclude: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*']
      })
    ]
  },

  // TypeScript Declarations Bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es'
    },
    external,
    plugins: [
      dts({
        tsconfig: './tsconfig.json',
        exclude: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*']
      })
    ]
  }
];

if (process.env.NODE_ENV === 'development') {
  // Development build with faster compilation
  configs.push({
    input: 'src/index.ts',
    output: {
      file: 'dist/index.dev.js',
      format: 'es',
      sourcemap: 'inline'
    },
    external,
    plugins: [
      ...commonPlugins,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        sourceMap: true,
        incremental: true
      })
    ],
    watch: {
      include: 'src/**',
      exclude: 'node_modules/**'
    }
  });
}

export default configs;