/**
 * Unified Reference Resolution - Formatters
 *
 * ホバーMarkdown構築やコメント抽出の共通ユーティリティ。
 */

/**
 * コメントから説明文を構築
 */
export function buildDescription(
  aboveComment?: string,
  inlineComment?: string
): string | undefined {
  const comments: string[] = [];
  if (aboveComment) comments.push(aboveComment);
  if (inlineComment) comments.push(inlineComment);
  return comments.length > 0 ? comments.join('\n\n') : undefined;
}
