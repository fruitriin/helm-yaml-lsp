/**
 * Argo Workflows LSP - URI Utils Test
 */

import { describe, expect, it } from 'bun:test';
import { platform } from 'node:os';
import * as path from 'node:path';
import {
  filePathToUri,
  getUriBasename,
  getUriDirectory,
  getUriExtension,
  isSameUri,
  joinUri,
  normalizeUri,
  uriToFilePath,
} from '../../src/utils/uriUtils';

describe('URI Utils', () => {
  describe('filePathToUri', () => {
    it('should convert absolute path to file URI', () => {
      const filePath = path.join('/Users', 'test', 'file.yaml');
      const uri = filePathToUri(filePath);

      expect(uri).toMatch(/^file:\/\//);
      expect(uri).toContain('file.yaml');
    });

    it('should handle relative paths', () => {
      const uri = filePathToUri('./test.yaml');

      expect(uri).toMatch(/^file:\/\//);
      expect(uri).toContain('test.yaml');
    });

    it('should handle current directory', () => {
      const uri = filePathToUri('.');

      expect(uri).toMatch(/^file:\/\//);
    });

    // Windows specific test
    if (platform() === 'win32') {
      it('should handle Windows paths', () => {
        const uri = filePathToUri('C:\\Users\\test\\file.yaml');

        expect(uri).toBe('file:///C:/Users/test/file.yaml');
      });
    }

    // Unix specific test
    if (platform() !== 'win32') {
      it('should handle Unix paths', () => {
        const filePath = '/Users/test/file.yaml';
        const uri = filePathToUri(filePath);

        expect(uri).toBe('file:///Users/test/file.yaml');
      });
    }
  });

  describe('uriToFilePath', () => {
    it('should convert file URI to path', () => {
      if (platform() === 'win32') {
        const uri = 'file:///C:/Users/test/file.yaml';
        const filePath = uriToFilePath(uri);

        expect(filePath).toBe('C:\\Users\\test\\file.yaml');
      } else {
        const uri = 'file:///Users/test/file.yaml';
        const filePath = uriToFilePath(uri);

        expect(filePath).toBe('/Users/test/file.yaml');
      }
    });

    it('should handle special characters', () => {
      if (platform() !== 'win32') {
        const uri = 'file:///Users/test/%E3%83%86%E3%82%B9%E3%83%88.yaml'; // "テスト.yaml"
        const filePath = uriToFilePath(uri);

        expect(filePath).toContain('テスト.yaml');
      }
    });
  });

  describe('normalizeUri', () => {
    it('should normalize URI paths with ..', () => {
      if (platform() !== 'win32') {
        const uri1 = filePathToUri('/Users/test/../test/file.yaml');
        const normalized = normalizeUri(uri1);

        expect(normalized).toBe('file:///Users/test/file.yaml');
      }
    });

    it('should normalize URI paths with .', () => {
      if (platform() !== 'win32') {
        const uri1 = filePathToUri('/Users/test/./file.yaml');
        const normalized = normalizeUri(uri1);

        expect(normalized).toBe('file:///Users/test/file.yaml');
      }
    });

    it('should handle multiple path separators', () => {
      if (platform() !== 'win32') {
        const uri = filePathToUri('/Users//test//file.yaml');
        const normalized = normalizeUri(uri);

        expect(normalized).toBe('file:///Users/test/file.yaml');
      }
    });
  });

  describe('isSameUri', () => {
    it('should detect same URIs', () => {
      if (platform() !== 'win32') {
        const uri1 = filePathToUri('/Users/test/file.yaml');
        const uri2 = filePathToUri('/Users/test/./file.yaml');

        expect(isSameUri(uri1, uri2)).toBe(true);
      }
    });

    it('should detect same URIs with different separators', () => {
      if (platform() !== 'win32') {
        const uri1 = filePathToUri('/Users/test/file.yaml');
        const uri2 = filePathToUri('/Users//test//file.yaml');

        expect(isSameUri(uri1, uri2)).toBe(true);
      }
    });

    it('should detect different URIs', () => {
      if (platform() !== 'win32') {
        const uri1 = filePathToUri('/Users/test/file1.yaml');
        const uri2 = filePathToUri('/Users/test/file2.yaml');

        expect(isSameUri(uri1, uri2)).toBe(false);
      }
    });

    it('should detect same URIs with ..', () => {
      if (platform() !== 'win32') {
        const uri1 = filePathToUri('/Users/test/file.yaml');
        const uri2 = filePathToUri('/Users/other/../test/file.yaml');

        expect(isSameUri(uri1, uri2)).toBe(true);
      }
    });
  });

  describe('getUriDirectory', () => {
    it('should get directory from URI', () => {
      if (platform() !== 'win32') {
        const uri = filePathToUri('/Users/test/subdir/file.yaml');
        const dir = getUriDirectory(uri);

        expect(dir).toBe('file:///Users/test/subdir');
      }
    });

    it('should handle root directory', () => {
      if (platform() !== 'win32') {
        const uri = filePathToUri('/file.yaml');
        const dir = getUriDirectory(uri);

        expect(dir).toBe('file:///');
      }
    });
  });

  describe('getUriBasename', () => {
    it('should get basename from URI', () => {
      const uri = filePathToUri('/Users/test/file.yaml');
      const basename = getUriBasename(uri);

      expect(basename).toBe('file.yaml');
    });

    it('should handle files without extension', () => {
      const uri = filePathToUri('/Users/test/README');
      const basename = getUriBasename(uri);

      expect(basename).toBe('README');
    });

    it('should handle files with multiple dots', () => {
      const uri = filePathToUri('/Users/test/file.test.yaml');
      const basename = getUriBasename(uri);

      expect(basename).toBe('file.test.yaml');
    });
  });

  describe('getUriExtension', () => {
    it('should get extension from URI', () => {
      const uri = filePathToUri('/Users/test/file.yaml');
      const ext = getUriExtension(uri);

      expect(ext).toBe('.yaml');
    });

    it('should handle files without extension', () => {
      const uri = filePathToUri('/Users/test/README');
      const ext = getUriExtension(uri);

      expect(ext).toBe('');
    });

    it('should handle multiple extensions', () => {
      const uri = filePathToUri('/Users/test/file.test.yaml');
      const ext = getUriExtension(uri);

      expect(ext).toBe('.yaml');
    });

    it('should handle .yml extension', () => {
      const uri = filePathToUri('/Users/test/file.yml');
      const ext = getUriExtension(uri);

      expect(ext).toBe('.yml');
    });
  });

  describe('joinUri', () => {
    it('should join base URI and relative path', () => {
      if (platform() !== 'win32') {
        const baseUri = filePathToUri('/Users/test');
        const joined = joinUri(baseUri, 'subdir/file.yaml');

        expect(joined).toBe('file:///Users/test/subdir/file.yaml');
      }
    });

    it('should handle single file path', () => {
      if (platform() !== 'win32') {
        const baseUri = filePathToUri('/Users/test');
        const joined = joinUri(baseUri, 'file.yaml');

        expect(joined).toBe('file:///Users/test/file.yaml');
      }
    });

    it('should handle empty relative path', () => {
      if (platform() !== 'win32') {
        const baseUri = filePathToUri('/Users/test');
        const joined = joinUri(baseUri, '');

        expect(joined).toBe('file:///Users/test');
      }
    });

    it('should handle relative path with ..', () => {
      if (platform() !== 'win32') {
        const baseUri = filePathToUri('/Users/test/subdir');
        const joined = joinUri(baseUri, '../file.yaml');

        expect(joined).toBe('file:///Users/test/file.yaml');
      }
    });
  });

  describe('Cross-platform compatibility', () => {
    it('should roundtrip file path to URI and back', () => {
      const originalPath = path.resolve('/Users/test/file.yaml');
      const uri = filePathToUri(originalPath);
      const resultPath = uriToFilePath(uri);

      expect(path.normalize(resultPath)).toBe(path.normalize(originalPath));
    });

    it('should handle current working directory', () => {
      const cwd = process.cwd();
      const uri = filePathToUri(cwd);

      expect(uri).toMatch(/^file:\/\//);

      const resultPath = uriToFilePath(uri);
      expect(path.normalize(resultPath)).toBe(path.normalize(cwd));
    });
  });
});
