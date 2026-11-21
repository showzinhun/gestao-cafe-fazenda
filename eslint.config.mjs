import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', 'public/sw.js'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Regra do projeto (CLAUDE.md, item 14): confirmações sempre na página.
      'no-restricted-globals': ['error', { name: 'confirm', message: 'Use confirmação na própria página.' }, { name: 'prompt', message: 'Use um campo na própria página.' }],
      'no-restricted-properties': ['error', { object: 'window', property: 'confirm' }, { object: 'window', property: 'prompt' }],
    },
  },
  {
    // Regras de negócio só em src/dominio e src/servicos; o domínio não conhece Prisma nem Next.
    files: ['src/dominio/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@prisma/*', 'next', 'next/*', '@/servicos/*', '@/lib/prisma'] }] },
  },
];

export default config;
