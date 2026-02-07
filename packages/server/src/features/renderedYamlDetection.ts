/**
 * Phase 7: Rendered YAML Detection
 *
 * helm template の出力（レンダリング済みYAML）を検出し、
 * ソーステンプレートパスやChart名を抽出する。
 *
 * レンダリング済みYAMLの特徴:
 * - `# Source: chart-name/templates/xxx.yaml` コメントが存在する
 * - `{{ }}` Helmテンプレート構文を含まない（展開済み）
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';

/** # Source: コメントの正規表現 */
const SOURCE_COMMENT_REGEX = /^# Source:\s+(.+)$/m;

/** Helmテンプレート構文の正規表現 ({{ ... }} or {{- ... }}) */
const HELM_TEMPLATE_SYNTAX_REGEX = /\{\{-?\s/;

/**
 * ドキュメントがレンダリング済みYAMLかどうかを判定
 *
 * 判定基準:
 * 1. `# Source:` コメントが存在する
 * 2. `{{ }}` Helmテンプレート構文を含まない
 *
 * @param document - テキストドキュメント
 * @returns レンダリング済みYAMLの場合 true
 */
export function isRenderedYaml(document: TextDocument): boolean {
  const text = document.getText();

  const hasSourceComment = SOURCE_COMMENT_REGEX.test(text);
  if (!hasSourceComment) {
    return false;
  }

  const hasTemplateSyntax = HELM_TEMPLATE_SYNTAX_REGEX.test(text);
  return !hasTemplateSyntax;
}

/**
 * レンダリング済みYAMLからソーステンプレートの相対パスを抽出
 *
 * `# Source: chart-name/templates/xxx.yaml` から `templates/xxx.yaml` を返す
 *
 * @param document - テキストドキュメント
 * @returns テンプレート相対パス、見つからない場合は null
 */
export function extractSourceTemplatePath(document: TextDocument): string | null {
  const text = document.getText();
  const match = text.match(SOURCE_COMMENT_REGEX);
  if (!match) {
    return null;
  }

  const sourcePath = match[1];

  // templates/ を含むパスを抽出
  const templatesIdx = sourcePath.indexOf('templates/');
  if (templatesIdx === -1) {
    return null;
  }

  return sourcePath.slice(templatesIdx);
}

/**
 * レンダリング済みYAMLからChart名を抽出
 *
 * `# Source: chart-name/templates/xxx.yaml` から `chart-name` を返す
 *
 * @param document - テキストドキュメント
 * @returns Chart名、見つからない場合は null
 */
export function extractChartNameFromSource(document: TextDocument): string | null {
  const text = document.getText();
  const match = text.match(SOURCE_COMMENT_REGEX);
  if (!match) {
    return null;
  }

  const sourcePath = match[1];

  // chart-name/templates/xxx.yaml の形式から chart-name を抽出
  const templatesIdx = sourcePath.indexOf('/templates/');
  if (templatesIdx === -1) {
    return null;
  }

  const chartName = sourcePath.slice(0, templatesIdx);
  return chartName || null;
}
