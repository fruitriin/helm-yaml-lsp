// ESLint Configuration for LSP Server
// エディタ非依存性を保証するための設定

import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // VSCode APIの使用を禁止（エディタ非依存性の保証）
      // vscode-languageserver* パッケージは許可（LSP標準プロトコル）
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vscode'],
              message:
                'VSCode API is not allowed in server code. Use LSP standard protocol (vscode-languageserver) instead.',
            },
            {
              group: ['vscode-uri'],
              message:
                "Use Node.js 'url' and 'path' modules instead of vscode-uri for editor independence.",
            },
          ],
        },
      ],
      // その他の推奨ルール
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
