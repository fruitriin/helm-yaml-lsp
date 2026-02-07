/**
 * Phase 7: Symbol Mapping Algorithm
 *
 * 3段階のハイブリッドマッピングアルゴリズムで、
 * Helmテンプレート（元ファイル）とレンダリング結果の行マッピングを構築する。
 *
 * 第1段階: Structural Anchoring (confidence: 1.0)
 * 第2段階: Value Matching (confidence: 0.8-0.95)
 * 第3段階: Fuzzy Matching (confidence: 0.5-0.8)
 */

import { Range } from 'vscode-languageserver-types';

import type { Anchor, LineMapping, SymbolMapping, TokenMapping } from '@/types/rendering';

/** Helm テンプレート構文パターン */
const HELM_EXPR_PATTERN = /\{\{-?\s*.*?\s*-?\}\}/g;

/** Helm ブロック制御構文（行全体がこれだけの場合、レンダリング結果に出力されない） */
const HELM_BLOCK_ONLY_PATTERN =
  /^\s*\{\{-?\s*(if|else|else if|end|range|with|define|block|template)\b.*?\}\}\s*$/;

/** YAMLキー検出パターン */
const YAML_KEY_PATTERN = /^(\s*)([\w./-]+)\s*:/;

/** YAML配列要素 name パターン */
const YAML_ARRAY_NAME_PATTERN = /^(\s*)-\s+name:\s*(.+)$/;

/** コメント行パターン */
const COMMENT_PATTERN = /^(\s*)#\s*(.*)$/;

/**
 * テキストからアンカーポイントを抽出
 */
export function extractAnchors(content: string, isTemplate: boolean): Anchor[] {
  const lines = content.split('\n');
  const anchors: Anchor[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // 空行はスキップ
    if (trimmed.trim() === '') {
      continue;
    }

    // Helm制御ブロックのみの行はスキップ（テンプレート側のみ、レンダリング結果にない）
    if (isTemplate && HELM_BLOCK_ONLY_PATTERN.test(trimmed)) {
      continue;
    }

    // コメント行
    const commentMatch = trimmed.match(COMMENT_PATTERN);
    if (commentMatch) {
      const indent = commentMatch[1].length;
      const commentText = commentMatch[2];
      anchors.push({
        line: i,
        key: `#${commentText}`,
        value: trimmed.trim(),
        indent,
        isExactMatch: true,
      });
      continue;
    }

    // Helm式を含まない行はそのまま完全一致アンカー
    if (!isTemplate || !HELM_EXPR_PATTERN.test(trimmed)) {
      // Reset regex lastIndex
      HELM_EXPR_PATTERN.lastIndex = 0;

      const indentMatch = trimmed.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;

      // YAML配列要素 name パターン
      const arrayNameMatch = trimmed.match(YAML_ARRAY_NAME_PATTERN);
      if (arrayNameMatch) {
        anchors.push({
          line: i,
          key: `- name: ${arrayNameMatch[2].trim()}`,
          value: trimmed.trim(),
          indent: arrayNameMatch[1].length,
          isExactMatch: true,
        });
        continue;
      }

      // YAMLキーパターン
      const keyMatch = trimmed.match(YAML_KEY_PATTERN);
      if (keyMatch) {
        anchors.push({
          line: i,
          key: keyMatch[2],
          value: trimmed.trim(),
          indent: keyMatch[1].length,
          isExactMatch: true,
        });
        continue;
      }

      // その他の静的行
      anchors.push({
        line: i,
        key: trimmed.trim(),
        value: trimmed.trim(),
        indent,
        isExactMatch: true,
      });
      continue;
    }

    // Helm式を含むテンプレート行
    HELM_EXPR_PATTERN.lastIndex = 0;

    const indentMatch = trimmed.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // YAML配列要素で name の値にHelm式が含まれる場合
    const arrayNameTemplateMatch = trimmed.match(/^(\s*)-\s+name:\s*\{\{.*?\}\}/);
    if (arrayNameTemplateMatch) {
      anchors.push({
        line: i,
        key: '- name:',
        indent: arrayNameTemplateMatch[1].length,
        isExactMatch: false,
      });
      continue;
    }

    // YAMLキーの値にHelm式が含まれる場合（キー部分のみアンカー化）
    const keyMatch = trimmed.match(YAML_KEY_PATTERN);
    if (keyMatch) {
      anchors.push({
        line: i,
        key: keyMatch[2],
        indent: keyMatch[1].length,
        isExactMatch: false,
      });
      continue;
    }

    // Helm式のみの行（値がすべてHelm式）- 弱いアンカー
    anchors.push({
      line: i,
      key: stripHelmExpressions(trimmed).trim() || `__line_${i}`,
      indent,
      isExactMatch: false,
    });
  }

  return anchors;
}

/**
 * Helm式を除去した文字列を返す
 */
function stripHelmExpressions(text: string): string {
  return text.replace(HELM_EXPR_PATTERN, '').trim();
}

/**
 * 2つの文字列のLCS（最長共通部分列）の長さを計算
 */
function lcsLength(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;

  // メモリ節約のため2行分のみ使用
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[n];
}

/**
 * 2つの文字列のLCS類似度（0.0~1.0）を計算
 */
function lcsSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;
  const len = lcsLength(a, b);
  return (2 * len) / (a.length + b.length);
}

/**
 * 第1段階: Structural Anchoring
 * 完全一致行とキー+インデントでマッチング
 */
function structuralAnchoring(originalAnchors: Anchor[], renderedAnchors: Anchor[]): LineMapping[] {
  const mappings: LineMapping[] = [];
  const usedRendered = new Set<number>();
  const usedOriginal = new Set<number>();

  // パス1: 完全一致行のマッチング（value が一致）
  for (const origAnchor of originalAnchors) {
    if (!origAnchor.isExactMatch || !origAnchor.value) continue;

    for (const rendAnchor of renderedAnchors) {
      if (usedRendered.has(rendAnchor.line)) continue;
      if (!rendAnchor.isExactMatch || !rendAnchor.value) continue;

      if (origAnchor.value === rendAnchor.value) {
        mappings.push({
          renderedLine: rendAnchor.line,
          originalLine: origAnchor.line,
          confidence: 1.0,
          method: 'exact',
        });
        usedRendered.add(rendAnchor.line);
        usedOriginal.add(origAnchor.line);
        break;
      }
    }
  }

  // パス2: キー名+インデントでマッチング（非完全一致アンカー）
  for (const origAnchor of originalAnchors) {
    if (usedOriginal.has(origAnchor.line)) continue;

    for (const rendAnchor of renderedAnchors) {
      if (usedRendered.has(rendAnchor.line)) continue;

      if (origAnchor.key === rendAnchor.key && origAnchor.indent === rendAnchor.indent) {
        mappings.push({
          renderedLine: rendAnchor.line,
          originalLine: origAnchor.line,
          confidence: 1.0,
          method: 'anchor',
        });
        usedRendered.add(rendAnchor.line);
        usedOriginal.add(origAnchor.line);
        break;
      }
    }
  }

  return mappings;
}

/**
 * 第2段階: Value Matching
 * アンカー間のギャップを埋める
 */
function valueMatching(
  originalLines: string[],
  renderedLines: string[],
  existingMappings: LineMapping[]
): LineMapping[] {
  const mappings: LineMapping[] = [];
  const mappedRendered = new Set(existingMappings.map(m => m.renderedLine));
  const mappedOriginal = new Set(existingMappings.map(m => m.originalLine));

  // ソートしたマッピングから区間を作成
  const sorted = [...existingMappings].sort((a, b) => a.renderedLine - b.renderedLine);

  // 区間ごとにギャップを処理
  const segments: Array<{
    renderedStart: number;
    renderedEnd: number;
    originalStart: number;
    originalEnd: number;
  }> = [];

  // 先頭のギャップ
  if (sorted.length > 0) {
    if (sorted[0].renderedLine > 0 || sorted[0].originalLine > 0) {
      segments.push({
        renderedStart: 0,
        renderedEnd: sorted[0].renderedLine - 1,
        originalStart: 0,
        originalEnd: sorted[0].originalLine - 1,
      });
    }
  }

  // アンカー間のギャップ
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (next.renderedLine - curr.renderedLine > 1 && next.originalLine - curr.originalLine > 1) {
      segments.push({
        renderedStart: curr.renderedLine + 1,
        renderedEnd: next.renderedLine - 1,
        originalStart: curr.originalLine + 1,
        originalEnd: next.originalLine - 1,
      });
    }
  }

  // 末尾のギャップ
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (
      last.renderedLine < renderedLines.length - 1 &&
      last.originalLine < originalLines.length - 1
    ) {
      segments.push({
        renderedStart: last.renderedLine + 1,
        renderedEnd: renderedLines.length - 1,
        originalStart: last.originalLine + 1,
        originalEnd: originalLines.length - 1,
      });
    }
  }

  for (const seg of segments) {
    for (let ri = seg.renderedStart; ri <= seg.renderedEnd; ri++) {
      if (mappedRendered.has(ri)) continue;
      const renderedLine = renderedLines[ri];
      const renderedTrimmed = renderedLine.trim();
      if (renderedTrimmed === '') continue;

      const renderedKeyMatch = renderedTrimmed.match(/^([\w./-]+)\s*:|^-\s+name:\s*/);

      let bestMatch: {
        originalLine: number;
        confidence: number;
      } | null = null;

      for (let oi = seg.originalStart; oi <= seg.originalEnd; oi++) {
        if (mappedOriginal.has(oi)) continue;
        const originalLine = originalLines[oi];
        const originalTrimmed = originalLine.trim();
        if (originalTrimmed === '') continue;

        // Helm制御構文のみの行はスキップ
        if (HELM_BLOCK_ONLY_PATTERN.test(originalTrimmed)) continue;

        // 同じキー名を持つ行をマッチング
        if (renderedKeyMatch) {
          const originalKeyMatch = originalTrimmed.match(/^([\w./-]+)\s*:|^-\s+name:\s*/);
          if (originalKeyMatch && originalKeyMatch[0] === renderedKeyMatch[0]) {
            const confidence = 0.95;
            if (!bestMatch || confidence > bestMatch.confidence) {
              bestMatch = { originalLine: oi, confidence };
            }
            continue;
          }
        }

        // Helm式を除去して比較
        const strippedOriginal = stripHelmExpressions(originalTrimmed);
        if (strippedOriginal && renderedTrimmed.includes(strippedOriginal.replace(/:\s*$/, ':'))) {
          const confidence = 0.85;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { originalLine: oi, confidence };
          }
        }
      }

      if (bestMatch) {
        mappings.push({
          renderedLine: ri,
          originalLine: bestMatch.originalLine,
          confidence: bestMatch.confidence,
          method: 'value',
        });
        mappedRendered.add(ri);
        mappedOriginal.add(bestMatch.originalLine);
      }
    }
  }

  return mappings;
}

/**
 * 第3段階: Fuzzy Matching
 * 残りの行のLCS類似度でマッチング
 */
function fuzzyMatching(
  originalLines: string[],
  renderedLines: string[],
  existingMappings: LineMapping[]
): LineMapping[] {
  const mappings: LineMapping[] = [];
  const mappedRendered = new Set(existingMappings.map(m => m.renderedLine));
  const mappedOriginal = new Set(existingMappings.map(m => m.originalLine));

  // ソート済みマッピングから最も近いアンカーを探す
  const sorted = [...existingMappings].sort((a, b) => a.renderedLine - b.renderedLine);

  for (let ri = 0; ri < renderedLines.length; ri++) {
    if (mappedRendered.has(ri)) continue;
    const renderedTrimmed = renderedLines[ri].trim();
    if (renderedTrimmed === '') continue;

    // 近傍のオリジナル行の範囲を推定
    let origStart = 0;
    let origEnd = originalLines.length - 1;

    // 前後のアンカーから範囲を絞り込み
    let prevAnchor: LineMapping | undefined;
    let nextAnchor: LineMapping | undefined;
    for (const m of sorted) {
      if (m.renderedLine < ri) prevAnchor = m;
      if (m.renderedLine > ri && !nextAnchor) nextAnchor = m;
    }
    if (prevAnchor) origStart = prevAnchor.originalLine;
    if (nextAnchor) origEnd = nextAnchor.originalLine;

    let bestMatch: {
      originalLine: number;
      similarity: number;
    } | null = null;

    for (let oi = origStart; oi <= origEnd; oi++) {
      if (mappedOriginal.has(oi)) continue;
      const originalTrimmed = originalLines[oi].trim();
      if (originalTrimmed === '') continue;
      if (HELM_BLOCK_ONLY_PATTERN.test(originalTrimmed)) continue;

      const strippedOriginal = stripHelmExpressions(originalTrimmed);
      const similarity = lcsSimilarity(strippedOriginal, renderedTrimmed);

      if (similarity > 0.3 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { originalLine: oi, similarity };
      }
    }

    if (bestMatch) {
      // confidence を 0.5~0.8 にスケール
      const confidence = 0.5 + bestMatch.similarity * 0.3;
      mappings.push({
        renderedLine: ri,
        originalLine: bestMatch.originalLine,
        confidence: Math.min(confidence, 0.8),
        method: 'fuzzy',
      });
      mappedRendered.add(ri);
      mappedOriginal.add(bestMatch.originalLine);
    }
  }

  return mappings;
}

/**
 * Helm テンプレート式を検出してトークンマッピングを生成
 */
function extractTokenMappings(
  originalContent: string,
  renderedContent: string,
  lineMappings: LineMapping[]
): TokenMapping[] {
  const tokenMappings: TokenMapping[] = [];
  const originalLines = originalContent.split('\n');
  const renderedLines = renderedContent.split('\n');

  // renderedLine → originalLine のマップを構築
  const lineMap = new Map<number, { originalLine: number; confidence: number }>();
  for (const m of lineMappings) {
    lineMap.set(m.renderedLine, {
      originalLine: m.originalLine,
      confidence: m.confidence,
    });
  }

  for (const [renderedLine, mapping] of lineMap) {
    const origLine = originalLines[mapping.originalLine];
    if (!origLine) continue;

    // Helm 式を検出
    const helmExprRegex = /\{\{-?\s*(.*?)\s*-?\}\}/g;
    let match: RegExpExecArray | null = helmExprRegex.exec(origLine);

    while (match !== null) {
      const fullExpr = match[0];
      const exprStart = match.index;
      const exprEnd = exprStart + fullExpr.length;

      // テンプレート行からHelm式前後のテキストを取得
      const beforeExpr = origLine.slice(0, exprStart);
      const afterExpr = origLine.slice(exprEnd);

      // レンダリング結果で対応する値を探す
      const rendLine = renderedLines[renderedLine];
      if (rendLine) {
        // 式の前のテキストでレンダリング結果内の開始位置を推定
        const strippedBefore = stripHelmExpressions(beforeExpr);
        const renderedStart = strippedBefore.length;

        // 式の後のテキストでレンダリング結果内の終了位置を推定
        const strippedAfter = stripHelmExpressions(afterExpr).trim();
        let renderedEnd: number;
        if (strippedAfter) {
          const afterIdx = rendLine.indexOf(strippedAfter, renderedStart);
          renderedEnd = afterIdx > renderedStart ? afterIdx : rendLine.length;
        } else {
          renderedEnd = rendLine.length;
        }

        // 末尾空白を除去
        const renderedValue = rendLine.slice(renderedStart, renderedEnd).trim();

        if (renderedValue) {
          // レンダリング結果中の実際の開始位置を再計算
          const actualStart = rendLine.indexOf(renderedValue, renderedStart);
          if (actualStart >= 0) {
            tokenMappings.push({
              renderedRange: Range.create(
                renderedLine,
                actualStart,
                renderedLine,
                actualStart + renderedValue.length
              ),
              originalRange: Range.create(
                mapping.originalLine,
                exprStart,
                mapping.originalLine,
                exprEnd
              ),
              originalExpression: fullExpr,
              renderedValue,
              confidence: mapping.confidence,
            });
          }
        }
      }

      match = helmExprRegex.exec(origLine);
    }
  }

  return tokenMappings;
}

/**
 * 元テンプレートとレンダリング結果からマッピングを作成
 */
export function createSymbolMapping(
  originalContent: string,
  renderedContent: string,
  originalUri: string,
  chartName: string,
  chartDir: string,
  originalRelativePath: string
): SymbolMapping {
  const originalLines = originalContent.split('\n');
  const renderedLines = renderedContent.split('\n');

  // アンカー抽出
  const originalAnchors = extractAnchors(originalContent, true);
  const renderedAnchors = extractAnchors(renderedContent, false);

  // 第1段階: Structural Anchoring
  const stage1 = structuralAnchoring(originalAnchors, renderedAnchors);

  // 第2段階: Value Matching
  const stage2 = valueMatching(originalLines, renderedLines, stage1);

  // 第3段階: Fuzzy Matching
  const allBeforeFuzzy = [...stage1, ...stage2];
  const stage3 = fuzzyMatching(originalLines, renderedLines, allBeforeFuzzy);

  const lineMappings = [...stage1, ...stage2, ...stage3].sort(
    (a, b) => a.renderedLine - b.renderedLine
  );

  // トークンマッピング
  const tokenMappings = extractTokenMappings(originalContent, renderedContent, lineMappings);

  return {
    chartName,
    chartDir,
    originalUri,
    originalRelativePath,
    lineMappings,
    tokenMappings,
    createdAt: Date.now(),
  };
}

/**
 * レンダリング済みYAMLの位置から元テンプレートの位置を検索
 */
export function findOriginalPosition(
  mapping: SymbolMapping,
  renderedLine: number,
  renderedCharacter: number
): { line: number; character: number; confidence: number } | null {
  // まずトークンマッピングで正確な位置を探す
  for (const tm of mapping.tokenMappings) {
    if (
      renderedLine === tm.renderedRange.start.line &&
      renderedCharacter >= tm.renderedRange.start.character &&
      renderedCharacter <= tm.renderedRange.end.character
    ) {
      return {
        line: tm.originalRange.start.line,
        character: tm.originalRange.start.character,
        confidence: tm.confidence,
      };
    }
  }

  // 行マッピングで検索
  const lineMapping = mapping.lineMappings.find(m => m.renderedLine === renderedLine);

  if (lineMapping) {
    return {
      line: lineMapping.originalLine,
      character: renderedCharacter,
      confidence: lineMapping.confidence,
    };
  }

  // 最近傍の行マッピングから推定
  let closest: LineMapping | null = null;
  let closestDist = Number.POSITIVE_INFINITY;

  for (const m of mapping.lineMappings) {
    const dist = Math.abs(m.renderedLine - renderedLine);
    if (dist < closestDist) {
      closestDist = dist;
      closest = m;
    }
  }

  if (closest && closestDist <= 3) {
    const offset = renderedLine - closest.renderedLine;
    return {
      line: closest.originalLine + offset,
      character: renderedCharacter,
      confidence: Math.max(closest.confidence - closestDist * 0.15, 0.2),
    };
  }

  return null;
}

/**
 * レンダリング済みYAMLの位置に対応する元テンプレートのHelm式を検索
 */
export function findOriginalExpression(
  mapping: SymbolMapping,
  renderedLine: number,
  renderedCharacter: number
): {
  expression: string;
  range: Range;
  confidence: number;
} | null {
  for (const tm of mapping.tokenMappings) {
    if (
      renderedLine === tm.renderedRange.start.line &&
      renderedCharacter >= tm.renderedRange.start.character &&
      renderedCharacter <= tm.renderedRange.end.character &&
      tm.originalExpression
    ) {
      return {
        expression: tm.originalExpression,
        range: tm.originalRange,
        confidence: tm.confidence,
      };
    }
  }

  return null;
}
