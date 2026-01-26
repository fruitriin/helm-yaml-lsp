/**
 * Argo Workflows LSP - File Watcher Service
 *
 * エディタ非依存なファイル監視抽象化 (LSP標準のdidChangeWatchedFiles使用)
 */

import type { Connection } from 'vscode-languageserver';
import type { DidChangeWatchedFilesParams, FileChangeType } from 'vscode-languageserver-protocol';

/**
 * ファイル監視サービス
 *
 * vscode.FileSystemWatcherを使用せず、LSP標準のworkspace/didChangeWatchedFilesを使用
 */
export class FileWatcher {
  private watchedPatterns: string[] = [];
  private callbacks: Map<string, (uri: string, changeType: FileChangeType) => void> = new Map();

  constructor(private connection: Connection) {
    this.setupListeners();
  }

  /**
   * LSPのdidChangeWatchedFilesリスナーを設定
   */
  private setupListeners(): void {
    this.connection.onDidChangeWatchedFiles(params => {
      this.handleFileChanges(params);
    });
  }

  /**
   * ファイルパターンの監視を開始
   *
   * クライアント側に監視を委譲（LSP標準）
   *
   * @param pattern - グロブパターン（例: "**\/*.yaml"）
   * @param id - コールバック識別子（オプション）
   * @param callback - 変更時のコールバック
   *
   * @example
   * fileWatcher.watch('**\/*.yaml', 'yaml-files', (uri, changeType) => {
   *   console.log(`File ${uri} changed: ${changeType}`);
   * });
   */
  watch(
    pattern: string,
    id?: string,
    callback?: (uri: string, changeType: FileChangeType) => void
  ): void {
    if (!this.watchedPatterns.includes(pattern)) {
      this.watchedPatterns.push(pattern);
      console.error(`[FileWatcher] Watching: ${pattern}`);
    }

    if (id && callback) {
      this.callbacks.set(id, callback);
    }
  }

  /**
   * ファイル変更通知のハンドリング
   *
   * @param callback - 変更時のコールバック
   */
  onDidChangeWatchedFiles(callback: (uri: string, changeType: FileChangeType) => void): void {
    this.callbacks.set('global', callback);
  }

  /**
   * 特定のパターンの監視を解除
   *
   * @param pattern - グロブパターン
   */
  unwatch(pattern: string): void {
    const index = this.watchedPatterns.indexOf(pattern);
    if (index !== -1) {
      this.watchedPatterns.splice(index, 1);
      console.error(`[FileWatcher] Unwatching: ${pattern}`);
    }
  }

  /**
   * 特定のコールバックを削除
   *
   * @param id - コールバック識別子
   */
  removeCallback(id: string): void {
    this.callbacks.delete(id);
  }

  /**
   * ファイル変更イベントを処理
   *
   * @param params - didChangeWatchedFiles パラメータ
   */
  private handleFileChanges(params: DidChangeWatchedFilesParams): void {
    for (const change of params.changes) {
      console.error(`[FileWatcher] File changed: ${change.uri} (type: ${change.type})`);

      // すべてのコールバックを実行
      for (const callback of this.callbacks.values()) {
        try {
          callback(change.uri, change.type);
        } catch (error) {
          console.error(`[FileWatcher] Callback error for ${change.uri}:`, error);
        }
      }
    }
  }

  /**
   * 監視中のパターン一覧を取得
   *
   * @returns 監視中のグロブパターン配列
   */
  getWatchedPatterns(): string[] {
    return [...this.watchedPatterns];
  }

  /**
   * すべての監視とコールバックをクリア
   */
  clear(): void {
    this.watchedPatterns = [];
    this.callbacks.clear();
    console.error('[FileWatcher] Cleared all watches and callbacks');
  }
}
