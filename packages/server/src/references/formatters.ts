/**
 * Unified Reference Resolution - Formatters
 *
 * ホバーMarkdown構築やコメント抽出の共通ユーティリティ。
 */

/**
 * コメントから説明文を構築
 *
 * 行頭の `#` をエスケープしてMarkdown見出しとして解釈されるのを防止
 */
export function buildDescription(
  aboveComment?: string,
  inlineComment?: string
): string | undefined {
  const comments: string[] = [];
  if (aboveComment) comments.push(aboveComment);
  if (inlineComment) comments.push(inlineComment);
  if (comments.length === 0) return undefined;
  return comments
    .join('\n\n')
    .split('\n')
    .map(line => line.replace(/^(#+)/, '\\$1'))
    .join('\n');
}
