/**
 * Argo Workflows LSP - File System Utils Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  createDirectory,
  deleteFile,
  directoryExists,
  fileExists,
  findFiles,
  findFilesMultiple,
  getFileStat,
  isYamlFile,
  readDirectory,
  readFile,
  writeFile,
} from '../../src/utils/fileSystem';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('FileSystem Utils', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `lsp-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('findFiles', () => {
    it('should find YAML files', async () => {
      await fs.writeFile(path.join(testDir, 'test.yaml'), 'content');
      await fs.writeFile(path.join(testDir, 'test.txt'), 'content');

      const files = await findFiles('**/*.yaml', testDir);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain('test.yaml');
    });

    it('should find files with multiple extensions', async () => {
      await fs.writeFile(path.join(testDir, 'test1.yaml'), 'content');
      await fs.writeFile(path.join(testDir, 'test2.yml'), 'content');

      const files = await findFiles('**/*.{yaml,yml}', testDir);

      expect(files).toHaveLength(2);
    });

    it('should ignore node_modules by default', async () => {
      const nodeModules = path.join(testDir, 'node_modules');
      await fs.mkdir(nodeModules);
      await fs.writeFile(path.join(nodeModules, 'test.yaml'), 'content');
      await fs.writeFile(path.join(testDir, 'test.yaml'), 'content');

      const files = await findFiles('**/*.yaml', testDir);

      expect(files).toHaveLength(1);
      expect(files[0]).not.toContain('node_modules');
    });

    it('should respect custom ignore patterns', async () => {
      const buildDir = path.join(testDir, 'build');
      await fs.mkdir(buildDir);
      await fs.writeFile(path.join(buildDir, 'test.yaml'), 'content');
      await fs.writeFile(path.join(testDir, 'test.yaml'), 'content');

      const files = await findFiles('**/*.yaml', testDir, ['**/build/**']);

      expect(files).toHaveLength(1);
      expect(files[0]).not.toContain('build');
    });

    it('should find files in subdirectories', async () => {
      const subDir = path.join(testDir, 'sub', 'deep');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, 'test.yaml'), 'content');

      const files = await findFiles('**/*.yaml', testDir);

      expect(files).toHaveLength(1);
      expect(files[0]).toContain('sub');
      expect(files[0]).toContain('deep');
    });
  });

  describe('readFile / writeFile', () => {
    it('should read file content', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      await fs.writeFile(filePath, 'test content');

      const uri = filePathToUri(filePath);
      const content = await readFile(uri);

      expect(content).toBe('test content');
    });

    it('should write file content', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      const uri = filePathToUri(filePath);

      await writeFile(uri, 'new content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('new content');
    });

    it('should handle UTF-8 content', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      const uri = filePathToUri(filePath);
      const japaneseContent = 'テスト内容: こんにちは';

      await writeFile(uri, japaneseContent);
      const content = await readFile(uri);

      expect(content).toBe(japaneseContent);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      await fs.writeFile(filePath, 'content');

      const uri = filePathToUri(filePath);
      const exists = await fileExists(uri);

      expect(exists).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = path.join(testDir, 'nonexistent.yaml');
      const uri = filePathToUri(filePath);

      const exists = await fileExists(uri);

      expect(exists).toBe(false);
    });
  });

  describe('directoryExists', () => {
    it('should return true for existing directory', async () => {
      const exists = await directoryExists(testDir);

      expect(exists).toBe(true);
    });

    it('should return false for non-existing directory', async () => {
      const exists = await directoryExists('/non/existing/path');

      expect(exists).toBe(false);
    });

    it('should return false for files', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      await fs.writeFile(filePath, 'content');

      const exists = await directoryExists(filePath);

      expect(exists).toBe(false);
    });
  });

  describe('createDirectory', () => {
    it('should create directory', async () => {
      const newDir = path.join(testDir, 'newdir');

      await createDirectory(newDir);

      const exists = await directoryExists(newDir);
      expect(exists).toBe(true);
    });

    it('should create nested directories', async () => {
      const nestedDir = path.join(testDir, 'a', 'b', 'c');

      await createDirectory(nestedDir);

      const exists = await directoryExists(nestedDir);
      expect(exists).toBe(true);
    });
  });

  describe('deleteFile', () => {
    it('should delete file', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      await fs.writeFile(filePath, 'content');
      const uri = filePathToUri(filePath);

      await deleteFile(uri);

      const exists = await fileExists(uri);
      expect(exists).toBe(false);
    });

    it('should delete directory recursively', async () => {
      const dirPath = path.join(testDir, 'subdir');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'test.yaml'), 'content');
      const uri = filePathToUri(dirPath);

      await deleteFile(uri, true);

      const exists = await directoryExists(dirPath);
      expect(exists).toBe(false);
    });
  });

  describe('getFileStat', () => {
    it('should get file stats', async () => {
      const filePath = path.join(testDir, 'test.yaml');
      const content = 'test content';
      await fs.writeFile(filePath, content);
      const uri = filePathToUri(filePath);

      const stats = await getFileStat(uri);

      expect(stats).toBeDefined();
      expect(stats?.size).toBe(content.length);
      expect(stats?.isFile()).toBe(true);
    });

    it('should return undefined for non-existing file', async () => {
      const filePath = path.join(testDir, 'nonexistent.yaml');
      const uri = filePathToUri(filePath);

      const stats = await getFileStat(uri);

      expect(stats).toBeUndefined();
    });
  });

  describe('readDirectory', () => {
    it('should read directory contents', async () => {
      await fs.writeFile(path.join(testDir, 'file1.yaml'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content');
      await fs.mkdir(path.join(testDir, 'subdir'));

      const uri = filePathToUri(testDir);
      const files = await readDirectory(uri);

      expect(files).toContain('file1.yaml');
      expect(files).toContain('file2.txt');
      expect(files).toContain('subdir');
    });

    it('should return empty array for empty directory', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir);

      const uri = filePathToUri(emptyDir);
      const files = await readDirectory(uri);

      expect(files).toHaveLength(0);
    });
  });

  describe('isYamlFile', () => {
    it('should return true for .yaml files', () => {
      expect(isYamlFile('file:///test/file.yaml')).toBe(true);
    });

    it('should return true for .yml files', () => {
      expect(isYamlFile('file:///test/file.yml')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isYamlFile('file:///test/file.YAML')).toBe(true);
      expect(isYamlFile('file:///test/file.YML')).toBe(true);
    });

    it('should return false for non-YAML files', () => {
      expect(isYamlFile('file:///test/file.txt')).toBe(false);
      expect(isYamlFile('file:///test/file.json')).toBe(false);
    });
  });

  describe('findFilesMultiple', () => {
    it('should find files with multiple patterns', async () => {
      await fs.writeFile(path.join(testDir, 'test1.yaml'), 'content');
      await fs.writeFile(path.join(testDir, 'test2.yml'), 'content');
      await fs.writeFile(path.join(testDir, 'test3.txt'), 'content');

      const files = await findFilesMultiple(['**/*.yaml', '**/*.yml'], testDir);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.includes('test1.yaml'))).toBe(true);
      expect(files.some(f => f.includes('test2.yml'))).toBe(true);
      expect(files.some(f => f.includes('test3.txt'))).toBe(false);
    });

    it('should remove duplicates', async () => {
      await fs.writeFile(path.join(testDir, 'test.yaml'), 'content');

      const files = await findFilesMultiple(['**/*.yaml', '**/*.{yaml,yml}'], testDir);

      // test.yamlは両方のパターンにマッチするが、重複は除去される
      expect(files).toHaveLength(1);
    });
  });

  describe('Integration tests', () => {
    it('should handle complete file lifecycle', async () => {
      const filePath = path.join(testDir, 'lifecycle.yaml');
      const uri = filePathToUri(filePath);

      // File should not exist initially
      expect(await fileExists(uri)).toBe(false);

      // Write file
      await writeFile(uri, 'initial content');
      expect(await fileExists(uri)).toBe(true);

      // Read file
      let content = await readFile(uri);
      expect(content).toBe('initial content');

      // Update file
      await writeFile(uri, 'updated content');
      content = await readFile(uri);
      expect(content).toBe('updated content');

      // Get stats
      const stats = await getFileStat(uri);
      expect(stats?.size).toBe('updated content'.length);

      // Delete file
      await deleteFile(uri);
      expect(await fileExists(uri)).toBe(false);
    });

    it('should handle complex directory structures', async () => {
      // Create structure
      const dirs = ['templates', 'values', 'charts'];
      for (const dir of dirs) {
        await createDirectory(path.join(testDir, dir));
      }

      // Create files
      await fs.writeFile(path.join(testDir, 'templates', 'workflow.yaml'), 'content');
      await fs.writeFile(path.join(testDir, 'values', 'values.yaml'), 'content');

      // Find all YAML files
      const files = await findFiles('**/*.yaml', testDir);

      expect(files).toHaveLength(2);
      expect(files.some(f => f.includes('templates'))).toBe(true);
      expect(files.some(f => f.includes('values'))).toBe(true);
    });
  });
});
