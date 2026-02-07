/**
 * Phase 7: Rendered YAML Parser
 *
 * helm template 出力を解析し、各テンプレートファイルに対応する
 * RenderedDocument に分割する。
 *
 * helm template の出力は以下の形式:
 * ---
 * # Source: chart-name/templates/file.yaml
 * (YAML内容)
 * ---
 * # Source: chart-name/templates/another-file.yaml
 * (YAML内容)
 */

import type { RenderedDocument } from '@/types/rendering';

/**
 * helm template 出力からドキュメントを分割
 *
 * @param output - helm template の標準出力
 * @param chartName - Chartの名前（# Source: の前半部分と照合）
 * @returns 各テンプレートファイルに対応する RenderedDocument の配列
 */
export function parseHelmTemplateOutput(output: string, chartName: string): RenderedDocument[] {
  if (!output.trim()) {
    return [];
  }

  const documents: RenderedDocument[] = [];
  const lines = output.split('\n');

  let currentDoc: {
    sourceTemplatePath: string;
    startLine: number;
    contentLines: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ドキュメントセパレータ
    if (line.trim() === '---') {
      // 現在のドキュメントがあれば保存
      if (currentDoc) {
        documents.push({
          sourceTemplatePath: currentDoc.sourceTemplatePath,
          content: currentDoc.contentLines.join('\n'),
          startLine: currentDoc.startLine,
          endLine: i - 1,
        });
        currentDoc = null;
      }
      continue;
    }

    // # Source: コメントを検出
    const sourceMatch = line.match(/^# Source:\s+(.+)$/);
    if (sourceMatch) {
      const sourcePath = sourceMatch[1];
      // chart-name/templates/xxx.yaml から templates/xxx.yaml を抽出
      const templatePath = extractTemplatePath(sourcePath, chartName);
      if (templatePath) {
        currentDoc = {
          sourceTemplatePath: templatePath,
          startLine: i + 1, // Source コメントの次の行から
          contentLines: [],
        };
      }
      continue;
    }

    // 通常の行
    if (currentDoc) {
      currentDoc.contentLines.push(line);
    }
  }

  // 最後のドキュメント
  if (currentDoc) {
    documents.push({
      sourceTemplatePath: currentDoc.sourceTemplatePath,
      content: currentDoc.contentLines.join('\n'),
      startLine: currentDoc.startLine,
      endLine: lines.length - 1,
    });
  }

  return documents;
}

/**
 * # Source: パスからテンプレート相対パスを抽出
 *
 * @param sourcePath - "chart-name/templates/file.yaml" 形式のパス
 * @param chartName - Chart名
 * @returns "templates/file.yaml" 形式の相対パス、またはnull
 */
export function extractTemplatePath(sourcePath: string, chartName: string): string | null {
  // chart-name/templates/xxx の形式をチェック
  const prefix = `${chartName}/`;
  if (sourcePath.startsWith(prefix)) {
    const remaining = sourcePath.slice(prefix.length);
    // templates/ を含むパスのみ有効
    if (remaining.startsWith('templates/')) {
      return remaining;
    }
    return null;
  }

  // Chart名なしで templates/ から始まる場合
  if (sourcePath.startsWith('templates/')) {
    return sourcePath;
  }

  // 任意のプレフィックス/templates/xxx の形式
  const templatesIdx = sourcePath.indexOf('/templates/');
  if (templatesIdx !== -1) {
    return sourcePath.slice(templatesIdx + 1);
  }

  return null;
}

/**
 * helm template 出力からすべてのソースパスを抽出
 *
 * @param output - helm template の標準出力
 * @returns ソースパスの配列
 */
export function extractAllSourcePaths(output: string): string[] {
  const paths: string[] = [];
  const regex = /^# Source:\s+(.+)$/gm;
  let match: RegExpExecArray | null = regex.exec(output);
  while (match !== null) {
    paths.push(match[1]);
    match = regex.exec(output);
  }
  return paths;
}
