import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** What src/shared may never import. */
const PURE = [
  { group: ['electron', 'pixi.js', 'react', 'react-dom'], message: 'src/shared stays pure: no Electron, DOM, or Pixi.' },
  { regex: '(^|/)renderer(/|$)', message: 'src/shared may not import the renderer.' },
];
/** What the v1 engine may never import (14, intro): packs, v0 chains, v0 layouts. */
const ENGINE_FENCE = [
  { regex: '(^|/)packs(/|$)', message: 'Engine code may not import a domain pack (14 fence).' },
  { regex: '(^|/)hierarchy/(backlog|sprints)$', message: 'Engine code may not import a v0 chain (14 fence).' },
  { regex: '(^\\.|/project)/(field|system|radar)$', message: 'Engine code may not import a v0 layout (14 fence).' },
  // One carve-out (03 §5d): solar draws its ships with the shared captain projection (14 §6), so
  // projectCaptains and projectGuests (the shared ship placement) are the only names engine code may take from traffic.
  {
    regex: '(^\\.|/project)/traffic$', allowImportNames: ['projectCaptains', 'projectGuests'],
    message: 'Engine code may take only projectCaptains and projectGuests from traffic (14 fence, 03 §5d).',
  },
];

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'test-results/**', 'fixtures/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The agentic sluice's hooks and scripts (sluice/docs/design.md §12) are plain Node.
    files: ['.claude/sluice/**/*.mjs', 'sluice/template/claude/sluice/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // src/shared must stay pure (CLAUDE.md): no Electron, DOM, or Pixi, and nothing from the renderer.
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...PURE] }],
    },
  },
  {
    // The v1 engine fence (14, intro): engine code reads roles, rungs and signals, so it may not
    // reach a domain pack, a v0 chain, or a v0 layout. (Later blocks replace a rule's options, so
    // the purity patterns are repeated.)
    files: ['src/shared/engine/**/*.ts', 'src/shared/scene/project/solar.ts', 'src/shared/scene/project/lists.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...PURE, ...ENGINE_FENCE] }],
    },
  },
);
