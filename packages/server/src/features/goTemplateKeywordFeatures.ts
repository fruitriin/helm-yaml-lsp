/**
 * Go Template Keyword Features Module
 *
 * Detects Go template control keywords at cursor position:
 * - {{ if ... }}, {{ else }}, {{ else if ... }}
 * - {{ range ... }}, {{ with ... }}
 * - {{ define "name" }}, {{ template "name" }}, {{ block "name" }}
 * - {{ end }}
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Position, Range } from 'vscode-languageserver-types';
import { Range as LSPRange } from 'vscode-languageserver-types';

/**
 * Go テンプレートキーワード参照
 */
export type GoTemplateKeywordReference = {
  /** キーワード名 */
  keywordName: string;
  /** キーワードの位置範囲 */
  range: Range;
};

/**
 * キーワード検出パターン
 *
 * マッチグループ:
 * - group[1]: 'else if' (else\s+if)
 * - group[2]: 単独キーワード (if|else|range|with|define|block|end|template)
 *
 * 'else if' を先にマッチさせることで正しく検出する
 */
const KEYWORD_PATTERN =
  /\{\{-?\s*(else\s+if)\b|\{\{-?\s*(if|else|range|with|define|block|end|template)\b/g;

/**
 * カーソル位置の Go テンプレートキーワードを検出
 */
export function findGoTemplateKeywordReference(
  document: TextDocument,
  position: Position
): GoTemplateKeywordReference | undefined {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  // コメント行はスキップ
  if (line.trim().startsWith('#')) return undefined;

  const references = findAllKeywordsInLine(line, position.line);

  for (const ref of references) {
    if (
      position.character >= ref.range.start.character &&
      position.character <= ref.range.end.character
    ) {
      return ref;
    }
  }

  return undefined;
}

/**
 * 行内の全キーワードを検出
 */
function findAllKeywordsInLine(line: string, lineNumber: number): GoTemplateKeywordReference[] {
  const references: GoTemplateKeywordReference[] = [];

  // パターンの lastIndex をリセット
  KEYWORD_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = KEYWORD_PATTERN.exec(line)) !== null) {
    // group[1] = 'else if', group[2] = 単独キーワード
    const keywordName = match[1] || match[2];

    // キーワードの開始位置を計算（{{ の後のスペースを飛ばしてキーワード本体の位置）
    const fullMatch = match[0];
    const keywordStart = match.index + fullMatch.indexOf(keywordName);
    const keywordEnd = keywordStart + keywordName.length;

    const range = LSPRange.create(
      { line: lineNumber, character: keywordStart },
      { line: lineNumber, character: keywordEnd }
    );

    references.push({ keywordName, range });
  }

  return references;
}
