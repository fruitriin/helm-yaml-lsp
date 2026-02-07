/**
 * Item Variable Features
 *
 * {{item}} / {{item.xxx}} の検出、withItems/withParam ソース定義の検索を行う。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Position } from 'vscode-languageserver-types';
import { Range as Rng } from 'vscode-languageserver-types';
import type { ItemSourceDefinition, ItemValue, ItemVariableReference } from '@/types/argo';

/**
 * カーソル位置にある {{item}} / {{item.xxx}} を検出
 */
export function findItemVariableAtPosition(
  document: TextDocument,
  position: Position
): ItemVariableReference | undefined {
  const text = document.getText();
  const lines = text.split('\n');
  if (position.line >= lines.length) return undefined;

  const line = lines[position.line];

  // パターン1: {{item.xxx}} (より具体的なのでこちらを先にチェック)
  const propertyPattern = /\{\{item\.([\w-]+)\}\}/g;
  let match: RegExpExecArray | null;

  match = propertyPattern.exec(line);
  while (match !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (position.character >= matchStart && position.character <= matchEnd) {
      // range は {{item.xxx}} 全体
      return {
        type: 'item.property',
        propertyName: match[1],
        range: Rng.create(position.line, matchStart, position.line, matchEnd),
      };
    }
    match = propertyPattern.exec(line);
  }

  // パターン2: {{item}}
  const itemPattern = /\{\{item\}\}/g;
  match = itemPattern.exec(line);
  while (match !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (position.character >= matchStart && position.character <= matchEnd) {
      return {
        type: 'item',
        range: Rng.create(position.line, matchStart, position.line, matchEnd),
      };
    }
    match = itemPattern.exec(line);
  }

  return undefined;
}

/**
 * カーソル位置を含むステップ/タスクブロック内の withItems/withParam ソース定義を検索
 */
export function findItemSourceDefinition(
  document: TextDocument,
  position: Position
): ItemSourceDefinition | undefined {
  const text = document.getText();
  const lines = text.split('\n');

  const block = findEnclosingStepOrTask(lines, position.line);
  if (!block) return undefined;

  // ブロック内で withItems: / withParam: を検索
  for (let i = block.startLine; i <= block.endLine; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // withItems:
    const withItemsMatch = trimmed.match(/^withItems:\s*(.*)?$/);
    if (withItemsMatch) {
      const inlineValue = withItemsMatch[1]?.trim();
      let items: ItemValue[];

      if (inlineValue && inlineValue.startsWith('[')) {
        // インライン形式: withItems: ["a", "b"]
        items = parseInlineArray(inlineValue);
      } else {
        // 複数行形式
        items = parseMultilineWithItems(lines, i);
      }

      const keyStart = line.indexOf('withItems');
      return {
        type: 'withItems',
        items,
        range: Rng.create(i, keyStart, i, keyStart + 'withItems'.length),
        uri: document.uri,
      };
    }

    // withParam:
    const withParamMatch = trimmed.match(/^withParam:\s*"?(.+?)"?\s*$/);
    if (withParamMatch) {
      const keyStart = line.indexOf('withParam');
      return {
        type: 'withParam',
        paramExpression: withParamMatch[1],
        range: Rng.create(i, keyStart, i, keyStart + 'withParam'.length),
        uri: document.uri,
      };
    }
  }

  return undefined;
}

/**
 * カーソル位置を含むステップ/タスクのブロック範囲を返す
 *
 * ステップ/タスクは `- name:` + `template:` を持つブロック。
 * パラメータ定義の `- name:` とは区別する。
 */
function findEnclosingStepOrTask(
  lines: string[],
  lineNum: number
): { startLine: number; endLine: number; indent: number } | undefined {
  // 上方向に `- name:` を検索し、それがステップ/タスクかを検証
  for (let i = lineNum; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // `- name:` or `- - name:` pattern
    const nameMatch = line.match(/^(\s*)-\s+(?:-\s+)?name:\s/);
    if (!nameMatch) continue;

    const blockIndent = nameMatch[1].length;

    // ブロック終了を検出
    let endLine = i;
    let hasTemplate = false;
    let hasWithItems = false;
    let hasWithParam = false;

    for (let j = i + 1; j < lines.length; j++) {
      const bLine = lines[j];
      const bTrimmed = bLine.trim();
      if (bTrimmed === '' || bTrimmed.startsWith('#')) {
        endLine = j;
        continue;
      }

      const bIndent = bLine.match(/^(\s*)/)?.[1].length ?? 0;
      if (bIndent <= blockIndent) break;

      endLine = j;

      if (bTrimmed.startsWith('template:')) hasTemplate = true;
      if (bTrimmed.startsWith('withItems:')) hasWithItems = true;
      if (bTrimmed.startsWith('withParam:')) hasWithParam = true;
    }

    // ステップ/タスクの判定: template: がある、または withItems/withParam がある
    if (hasTemplate || hasWithItems || hasWithParam) {
      // カーソル位置がこのブロック範囲内か確認
      if (lineNum >= i && lineNum <= endLine) {
        return { startLine: i, endLine, indent: blockIndent };
      }
    }
    // このブロックがステップ/タスクでない場合、さらに上方向を検索
  }

  return undefined;
}

/**
 * インライン配列を解析: ["a", "b", 1, true]
 */
function parseInlineArray(value: string): ItemValue[] {
  const items: ItemValue[] = [];

  // 簡易JSONパース - 角括弧を除去して要素を分割
  const inner = value.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return items;

  // JSONパースを試みる
  try {
    const parsed = JSON.parse(`[${inner}]`);
    if (Array.isArray(parsed)) {
      for (const val of parsed) {
        if (typeof val === 'object' && val !== null) {
          items.push({
            value: JSON.stringify(val),
            valueType: 'object',
            properties: Object.keys(val),
          });
        } else if (typeof val === 'number') {
          items.push({ value: String(val), valueType: 'number' });
        } else if (typeof val === 'boolean') {
          items.push({ value: String(val), valueType: 'boolean' });
        } else {
          items.push({ value: String(val), valueType: 'string' });
        }
      }
    }
  } catch {
    // JSON parse失敗 → 個別要素を文字列として扱う
    const parts = inner.split(',').map(s => s.trim());
    for (const part of parts) {
      const unquoted = part.replace(/^["']|["']$/g, '');
      items.push({ value: unquoted, valueType: 'string' });
    }
  }

  return items;
}

/**
 * 複数行 withItems 配列を解析
 *
 * ```yaml
 * withItems:
 *   - "apple"
 *   - { name: "foo", count: 1 }
 * ```
 */
function parseMultilineWithItems(lines: string[], startLine: number): ItemValue[] {
  const items: ItemValue[] = [];
  const baseLine = lines[startLine];
  const baseIndent = baseLine.match(/^(\s*)/)?.[1].length ?? 0;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (currentIndent <= baseIndent) break;

    // list item: - xxx
    const listMatch = trimmed.match(/^-\s+(.*)/);
    if (!listMatch) continue;

    const val = listMatch[1].trim();

    // オブジェクト形式: { key: val, ... }
    if (val.startsWith('{') && val.endsWith('}')) {
      const props = parseObjectProperties(val);
      items.push({
        value: val,
        valueType: 'object',
        properties: props,
      });
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      // 数値
      items.push({ value: val, valueType: 'number' });
    } else if (val === 'true' || val === 'false') {
      // ブーリアン
      items.push({ value: val, valueType: 'boolean' });
    } else {
      // 文字列（クォート除去）
      const unquoted = val.replace(/^["']|["']$/g, '');
      items.push({ value: unquoted, valueType: 'string' });
    }
  }

  return items;
}

/**
 * YAML インラインオブジェクトからプロパティ名を抽出
 * { name: "foo", count: 1 } → ["name", "count"]
 */
function parseObjectProperties(objStr: string): string[] {
  const inner = objStr.replace(/^\{/, '').replace(/\}$/, '').trim();
  const props: string[] = [];

  // key: value のペアを分割
  const pairs = inner.split(',');
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx > 0) {
      const key = pair
        .substring(0, colonIdx)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (key) props.push(key);
    }
  }

  return props;
}
