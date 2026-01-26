/**
 * Argo Workflows LSP - File System Utils
 *
 * エディタ非依存なファイルシステム操作 (Node.js標準API + fast-glob)
 */

import type { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import { filePathToUri, uriToFilePath } from './uriUtils';

/**
 * グロブパターンでファイル検索
 *
 * @param pattern - グロブパターン（例: "**\/*.yaml"）
 * @param cwd - 検索開始ディレクトリ
 * @param ignore - 除外パターン（デフォルト: node_modules）
 * @returns file:// URI文字列の配列
 *
 * @example
 * const files = await findFiles('**\/*.yaml', '/Users/test/project');
 * // => ['file:///Users/test/project/workflow.yaml', ...]
 */
export async function findFiles(
  pattern: string,
  cwd: string,
  ignore?: string[]
): Promise<string[]> {
  const files = await fg(pattern, {
    cwd,
    ignore: ignore || ['**/node_modules/**', '**/.git/**'],
    absolute: true,
    onlyFiles: true,
  });

  return files.map(filePathToUri);
}

/**
 * ファイル内容の読み込み
 *
 * @param uri - file:// URI
 * @returns ファイル内容（UTF-8）
 *
 * @example
 * const content = await readFile('file:///Users/test/file.yaml');
 */
export async function readFile(uri: string): Promise<string> {
  const filePath = uriToFilePath(uri);
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * ファイルに書き込み
 *
 * @param uri - file:// URI
 * @param content - 書き込む内容
 *
 * @example
 * await writeFile('file:///Users/test/file.yaml', 'content');
 */
export async function writeFile(uri: string, content: string): Promise<void> {
  const filePath = uriToFilePath(uri);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * ファイルが存在するかチェック
 *
 * @param uri - file:// URI
 * @returns 存在する場合はtrue
 *
 * @example
 * if (await fileExists('file:///Users/test/file.yaml')) { ... }
 */
export async function fileExists(uri: string): Promise<boolean> {
  try {
    const filePath = uriToFilePath(uri);
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * ディレクトリが存在するかチェック
 *
 * @param dirPath - ディレクトリパス（file://ではなく通常のパス）
 * @returns 存在し、ディレクトリの場合はtrue
 *
 * @example
 * if (await directoryExists('/Users/test/project')) { ... }
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * ディレクトリを作成（親ディレクトリも再帰的に作成）
 *
 * @param dirPath - ディレクトリパス
 *
 * @example
 * await createDirectory('/Users/test/project/subdir');
 */
export async function createDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * ファイルまたはディレクトリを削除
 *
 * @param uri - file:// URI
 * @param recursive - ディレクトリの場合、再帰的に削除するか
 *
 * @example
 * await deleteFile('file:///Users/test/file.yaml');
 * await deleteFile('file:///Users/test/dir', true);
 */
export async function deleteFile(uri: string, recursive = false): Promise<void> {
  const filePath = uriToFilePath(uri);
  await fs.rm(filePath, { recursive, force: true });
}

/**
 * ファイルの統計情報を取得
 *
 * @param uri - file:// URI
 * @returns 統計情報
 *
 * @example
 * const stats = await getFileStat('file:///Users/test/file.yaml');
 * console.log(stats.size, stats.mtime);
 */
export async function getFileStat(uri: string): Promise<Stats | undefined> {
  try {
    const filePath = uriToFilePath(uri);
    return await fs.stat(filePath);
  } catch {
    return undefined;
  }
}

/**
 * ディレクトリ内のファイル一覧を取得
 *
 * @param dirUri - ディレクトリのfile:// URI
 * @returns ファイル名の配列（URIではなくファイル名のみ）
 *
 * @example
 * const files = await readDirectory('file:///Users/test/project');
 * // => ['file1.yaml', 'file2.yaml', 'subdir']
 */
export async function readDirectory(dirUri: string): Promise<string[]> {
  const dirPath = uriToFilePath(dirUri);
  return await fs.readdir(dirPath);
}

/**
 * ファイルがYAMLファイルかチェック
 *
 * @param uri - file:// URI
 * @returns YAMLファイルの場合はtrue
 *
 * @example
 * if (isYamlFile('file:///Users/test/file.yaml')) { ... }
 */
export function isYamlFile(uri: string): boolean {
  return /\.(yaml|yml)$/i.test(uri);
}

/**
 * 複数のグロブパターンでファイル検索
 *
 * @param patterns - グロブパターンの配列
 * @param cwd - 検索開始ディレクトリ
 * @param ignore - 除外パターン
 * @returns file:// URI文字列の配列（重複なし）
 *
 * @example
 * const files = await findFilesMultiple(
 *   ['**\/*.yaml', '**\/*.yml'],
 *   '/Users/test/project'
 * );
 */
export async function findFilesMultiple(
  patterns: string[],
  cwd: string,
  ignore?: string[]
): Promise<string[]> {
  const files = await fg(patterns, {
    cwd,
    ignore: ignore || ['**/node_modules/**', '**/.git/**'],
    absolute: true,
    onlyFiles: true,
  });

  // 重複を除去
  const uniqueFiles = [...new Set(files)];
  return uniqueFiles.map(filePathToUri);
}
