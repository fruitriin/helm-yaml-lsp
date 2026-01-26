/**
 * Argo Workflows LSP - File Watcher Service Test
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { Connection } from 'vscode-languageserver';
import { type DidChangeWatchedFilesParams, FileChangeType } from 'vscode-languageserver-protocol';
import { FileWatcher } from '../../src/services/fileWatcher';

// console.errorをモックしてログ出力を抑制
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = mock(() => {});
});
afterAll(() => {
  console.error = originalConsoleError;
});

// モックConnectionを作成
function createMockConnection(): Connection {
  const didChangeWatchedFilesHandlers: Array<(params: DidChangeWatchedFilesParams) => void> = [];

  return {
    onDidChangeWatchedFiles: (handler: (params: DidChangeWatchedFilesParams) => void) => {
      didChangeWatchedFilesHandlers.push(handler);
      return { dispose: () => {} };
    },
    // モック用のヘルパー：ファイル変更を発火
    _triggerFileChange: (params: DidChangeWatchedFilesParams) => {
      for (const handler of didChangeWatchedFilesHandlers) {
        handler(params);
      }
    },
  } as unknown as Connection;
}

describe('FileWatcher', () => {
  describe('watch', () => {
    it('should register watch patterns', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);

      fileWatcher.watch('**/*.yaml');
      fileWatcher.watch('**/*.yml');

      const patterns = fileWatcher.getWatchedPatterns();
      expect(patterns).toContain('**/*.yaml');
      expect(patterns).toContain('**/*.yml');
      expect(patterns).toHaveLength(2);
    });

    it('should not register duplicate patterns', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);

      fileWatcher.watch('**/*.yaml');
      fileWatcher.watch('**/*.yaml');

      const patterns = fileWatcher.getWatchedPatterns();
      expect(patterns).toHaveLength(1);
    });

    it('should register callback with id', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);
      const callback = mock(() => {});

      fileWatcher.watch('**/*.yaml', 'yaml-files', callback);

      // コールバックが登録されたことを確認（内部的には確認できないが、動作で確認）
      const patterns = fileWatcher.getWatchedPatterns();
      expect(patterns).toContain('**/*.yaml');
    });
  });

  describe('onDidChangeWatchedFiles', () => {
    it('should handle file change notifications', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);
      const callback = mock(() => {});

      fileWatcher.onDidChangeWatchedFiles(callback);

      // ファイル変更を発火
      (mockConnection as any)._triggerFileChange({
        changes: [
          {
            uri: 'file:///test.yaml',
            type: FileChangeType.Changed,
          },
        ],
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('file:///test.yaml', FileChangeType.Changed);
    });

    it('should handle multiple file changes', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);
      const callback = mock(() => {});

      fileWatcher.onDidChangeWatchedFiles(callback);

      // 複数のファイル変更を発火
      (mockConnection as any)._triggerFileChange({
        changes: [
          {
            uri: 'file:///test1.yaml',
            type: FileChangeType.Created,
          },
          {
            uri: 'file:///test2.yaml',
            type: FileChangeType.Changed,
          },
          {
            uri: 'file:///test3.yaml',
            type: FileChangeType.Deleted,
          },
        ],
      });

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should handle different file change types', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);
      const callback = mock(() => {});

      fileWatcher.onDidChangeWatchedFiles(callback);

      // Created
      (mockConnection as any)._triggerFileChange({
        changes: [
          {
            uri: 'file:///created.yaml',
            type: FileChangeType.Created,
          },
        ],
      });

      // Changed
      (mockConnection as any)._triggerFileChange({
        changes: [
          {
            uri: 'file:///changed.yaml',
            type: FileChangeType.Changed,
          },
        ],
      });

      // Deleted
      (mockConnection as any)._triggerFileChange({
        changes: [
          {
            uri: 'file:///deleted.yaml',
            type: FileChangeType.Deleted,
          },
        ],
      });

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, 'file:///created.yaml', FileChangeType.Created);
      expect(callback).toHaveBeenNthCalledWith(2, 'file:///changed.yaml', FileChangeType.Changed);
      expect(callback).toHaveBeenNthCalledWith(3, 'file:///deleted.yaml', FileChangeType.Deleted);
    });
  });

  describe('unwatch', () => {
    it('should remove watch pattern', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);

      fileWatcher.watch('**/*.yaml');
      fileWatcher.watch('**/*.yml');

      expect(fileWatcher.getWatchedPatterns()).toHaveLength(2);

      fileWatcher.unwatch('**/*.yaml');

      const patterns = fileWatcher.getWatchedPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns).not.toContain('**/*.yaml');
      expect(patterns).toContain('**/*.yml');
    });

    it('should handle unwatch of non-existent pattern', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);

      fileWatcher.watch('**/*.yaml');
      fileWatcher.unwatch('**/*.txt'); // 存在しないパターン

      const patterns = fileWatcher.getWatchedPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns).toContain('**/*.yaml');
    });
  });

  describe('removeCallback', () => {
    it('should remove specific callback', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);
      const callback1 = mock(() => {});
      const callback2 = mock(() => {});

      fileWatcher.watch('**/*.yaml', 'callback1', callback1);
      fileWatcher.watch('**/*.yml', 'callback2', callback2);

      // callback1を削除
      fileWatcher.removeCallback('callback1');

      // ファイル変更を発火
      (mockConnection as any)._triggerFileChange({
        changes: [
          {
            uri: 'file:///test.yaml',
            type: FileChangeType.Changed,
          },
        ],
      });

      // callback2のみが呼ばれる（globalコールバックはない場合）
      expect(callback1).toHaveBeenCalledTimes(0);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should clear all watches and callbacks', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);
      const callback = mock(() => {});

      fileWatcher.watch('**/*.yaml');
      fileWatcher.watch('**/*.yml');
      fileWatcher.onDidChangeWatchedFiles(callback);

      fileWatcher.clear();

      expect(fileWatcher.getWatchedPatterns()).toHaveLength(0);

      // ファイル変更を発火してもコールバックは呼ばれない
      (mockConnection as any)._triggerFileChange({
        changes: [
          {
            uri: 'file:///test.yaml',
            type: FileChangeType.Changed,
          },
        ],
      });

      expect(callback).toHaveBeenCalledTimes(0);
    });
  });

  describe('error handling', () => {
    it('should handle callback errors gracefully', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);
      const errorCallback = mock(() => {
        throw new Error('Callback error');
      });
      const normalCallback = mock(() => {});

      // console.errorをモックしてログ出力を抑制
      const originalConsoleError = console.error;
      console.error = mock(() => {});

      fileWatcher.watch('**/*.yaml', 'error', errorCallback);
      fileWatcher.onDidChangeWatchedFiles(normalCallback);

      // エラーが発生してもクラッシュしない
      expect(() => {
        (mockConnection as any)._triggerFileChange({
          changes: [
            {
              uri: 'file:///test.yaml',
              type: FileChangeType.Changed,
            },
          ],
        });
      }).not.toThrow();

      // console.errorが呼ばれたことを確認
      expect(console.error).toHaveBeenCalled();

      // 正常なコールバックは実行される
      expect(normalCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledTimes(1);

      // console.errorを復元
      console.error = originalConsoleError;
    });
  });

  describe('getWatchedPatterns', () => {
    it('should return copy of patterns array', () => {
      const mockConnection = createMockConnection();
      const fileWatcher = new FileWatcher(mockConnection);

      fileWatcher.watch('**/*.yaml');

      const patterns1 = fileWatcher.getWatchedPatterns();
      const patterns2 = fileWatcher.getWatchedPatterns();

      // 異なる配列インスタンスを返す
      expect(patterns1).not.toBe(patterns2);
      // 内容は同じ
      expect(patterns1).toEqual(patterns2);
    });
  });
});
