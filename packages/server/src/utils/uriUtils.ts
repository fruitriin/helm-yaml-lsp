/**
 * Argo Workflows LSP - URI Utils
 *
 * エディタ非依存なURI処理ユーティリティ (Node.js標準APIのみ使用)
 */

import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * ファイルパスをfile:// URIに変換（クロスプラットフォーム）
 *
 * @param filePath - 変換するファイルパス（相対パスまたは絶対パス）
 * @returns file:// URI文字列
 *
 * @example
 * filePathToUri('/Users/test/file.yaml')
 * // => 'file:///Users/test/file.yaml'
 *
 * filePathToUri('C:\\Users\\test\\file.yaml')  // Windows
 * // => 'file:///C:/Users/test/file.yaml'
 */
export function filePathToUri(filePath: string): string {
  // Node.js標準のpathToFileURLを使用
  // 相対パスは絶対パスに解決してから変換
  const absolutePath = path.resolve(filePath);
  return pathToFileURL(absolutePath).toString();
}

/**
 * file:// URIをファイルパスに変換
 *
 * @param uri - 変換するfile:// URI
 * @returns ファイルパス
 *
 * @example
 * uriToFilePath('file:///Users/test/file.yaml')
 * // => '/Users/test/file.yaml'
 *
 * uriToFilePath('file:///C:/Users/test/file.yaml')  // Windows
 * // => 'C:\\Users\\test\\file.yaml'
 */
export function uriToFilePath(uri: string): string {
  // Node.js標準のfileURLToPathを使用
  return fileURLToPath(uri);
}

/**
 * URIの正規化（パス比較用）
 *
 * URIをファイルパスに変換し、正規化してから再度URIに変換します。
 * これにより、パス区切り文字の違いや '..' などが解決されます。
 *
 * @param uri - 正規化するURI
 * @returns 正規化されたURI
 *
 * @example
 * normalizeUri('file:///Users/test/../test/file.yaml')
 * // => 'file:///Users/test/file.yaml'
 */
export function normalizeUri(uri: string): string {
  const filePath = uriToFilePath(uri);
  const normalized = path.normalize(filePath);
  return filePathToUri(normalized);
}

/**
 * 2つのURIが同じファイルを指すか判定
 *
 * 両方のURIを正規化してから比較します。
 *
 * @param uri1 - 比較するURI 1
 * @param uri2 - 比較するURI 2
 * @returns 同じファイルを指す場合はtrue
 *
 * @example
 * isSameUri(
 *   'file:///Users/test/file.yaml',
 *   'file:///Users/test/./file.yaml'
 * )
 * // => true
 */
export function isSameUri(uri1: string, uri2: string): boolean {
  return normalizeUri(uri1) === normalizeUri(uri2);
}

/**
 * URIのディレクトリ部分を取得
 *
 * @param uri - ファイルURI
 * @returns ディレクトリのURI
 *
 * @example
 * getUriDirectory('file:///Users/test/file.yaml')
 * // => 'file:///Users/test'
 */
export function getUriDirectory(uri: string): string {
  const filePath = uriToFilePath(uri);
  const dirPath = path.dirname(filePath);
  return filePathToUri(dirPath);
}

/**
 * URIのファイル名部分を取得
 *
 * @param uri - ファイルURI
 * @returns ファイル名
 *
 * @example
 * getUriBasename('file:///Users/test/file.yaml')
 * // => 'file.yaml'
 */
export function getUriBasename(uri: string): string {
  const filePath = uriToFilePath(uri);
  return path.basename(filePath);
}

/**
 * URIの拡張子を取得
 *
 * @param uri - ファイルURI
 * @returns 拡張子（ドット付き）
 *
 * @example
 * getUriExtension('file:///Users/test/file.yaml')
 * // => '.yaml'
 */
export function getUriExtension(uri: string): string {
  const filePath = uriToFilePath(uri);
  return path.extname(filePath);
}

/**
 * 2つのURIを結合
 *
 * @param baseUri - ベースURI
 * @param relativePath - 相対パス
 * @returns 結合されたURI
 *
 * @example
 * joinUri('file:///Users/test', 'subdir/file.yaml')
 * // => 'file:///Users/test/subdir/file.yaml'
 */
export function joinUri(baseUri: string, relativePath: string): string {
  const basePath = uriToFilePath(baseUri);
  const joined = path.join(basePath, relativePath);
  return filePathToUri(joined);
}
