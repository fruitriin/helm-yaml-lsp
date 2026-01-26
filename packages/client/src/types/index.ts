/**
 * VSCode拡張機能の型定義
 */

/**
 * クライアント設定
 */
export interface ClientSettings {
  trace: 'off' | 'messages' | 'verbose';
  maxNumberOfProblems: number;
}

/**
 * デフォルト設定
 */
export const defaultClientSettings: ClientSettings = {
  trace: 'off',
  maxNumberOfProblems: 1000,
};
