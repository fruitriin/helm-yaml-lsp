/**
 * Argo Workflows LSP - Parameter Features
 *
 * パラメータ定義と参照の検出（エディタ非依存）
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-types';
import type { ParameterDefinition, ParameterReference } from '@/types/argo';

/**
 * パラメータ定義の上下のコメントを抽出
 */
function extractParameterComments(
  lines: string[],
  lineNum: number
): { aboveComment?: string; inlineComment?: string } {
  const result: { aboveComment?: string; inlineComment?: string } = {};

  // 上のコメント
  const aboveComments: string[] = [];
  for (let i = lineNum - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#')) {
      aboveComments.unshift(trimmed.substring(1).trim());
    } else if (trimmed !== '') {
      break; // コメント以外が出現したら終了
    }
    // 空行はスキップ（continueは不要）
  }
  if (aboveComments.length > 0) {
    result.aboveComment = aboveComments.join('\n');
  }

  // インラインコメント
  const line = lines[lineNum];
  const commentIndex = line.indexOf('#');
  if (commentIndex !== -1) {
    result.inlineComment = line.substring(commentIndex + 1).trim();
  }

  return result;
}

/**
 * ドキュメント内のすべてのパラメータ定義を抽出
 *
 * @param document - LSP TextDocument
 * @returns パラメータ定義の配列
 *
 * @example
 * const definitions = findParameterDefinitions(document);
 * for (const def of definitions) {
 *   console.log(`Parameter: ${def.name}, value: ${def.value}`);
 * }
 */
export function findParameterDefinitions(document: TextDocument): ParameterDefinition[] {
  const definitions: ParameterDefinition[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  let inInputsSection = false;
  let inOutputsSection = false;
  let inParametersSection = false;
  let parametersIndent = 0;
  let sectionIndent = 0;
  let currentTemplateName: string | undefined;
  let inTemplatesSection = false;
  let templatesIndent = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const trimmed = line.trim();

    // 空行やコメント行はスキップ
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    // templates: セクションの検出
    const templatesMatch = line.match(/^(\s*)templates:/);
    if (templatesMatch) {
      inTemplatesSection = true;
      templatesIndent = templatesMatch[1].length;
      continue;
    }

    // templates セクション内でテンプレート名を検出
    if (inTemplatesSection) {
      // テンプレート定義: "- name: xxx"
      const templateNameMatch = line.match(/^(\s*)-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (templateNameMatch) {
        const matchIndent = templateNameMatch[1].length;
        const expectedTemplateIndent = templatesIndent + 4;
        if (Math.abs(matchIndent - expectedTemplateIndent) <= 2) {
          currentTemplateName = templateNameMatch[2];
        }
      }

      // templates セクション終了の検出
      if (currentIndent <= templatesIndent && !trimmed.startsWith('-')) {
        inTemplatesSection = false;
        currentTemplateName = undefined;
      }
    }

    // inputs: セクションの検出
    const inputsMatch = line.match(/^(\s*)inputs:/);
    if (inputsMatch) {
      inInputsSection = true;
      inOutputsSection = false;
      inParametersSection = false;
      sectionIndent = inputsMatch[1].length;
      continue;
    }

    // outputs: セクションの検出
    const outputsMatch = line.match(/^(\s*)outputs:/);
    if (outputsMatch) {
      inOutputsSection = true;
      inInputsSection = false;
      inParametersSection = false;
      sectionIndent = outputsMatch[1].length;
      continue;
    }

    // inputs/outputs セクション終了の検出
    // テンプレートレベルの "- name:" でもセクション終了
    const isTemplateStart = trimmed.startsWith('- name:') && currentIndent <= sectionIndent;
    if (
      (inInputsSection || inOutputsSection) &&
      ((currentIndent <= sectionIndent && !trimmed.startsWith('-')) || isTemplateStart)
    ) {
      inInputsSection = false;
      inOutputsSection = false;
      inParametersSection = false;
    }

    // parameters: セクションの検出
    const parametersMatch = line.match(/^(\s*)parameters:/);
    if (parametersMatch && (inInputsSection || inOutputsSection)) {
      inParametersSection = true;
      parametersIndent = parametersMatch[1].length;
      continue;
    }

    // parameters セクション終了の検出
    if (inParametersSection && currentIndent <= parametersIndent && !trimmed.startsWith('-')) {
      inParametersSection = false;
    }

    // parameters セクション内でパラメータ定義を検索
    if (inParametersSection) {
      // パラメータ定義: "- name: xxx"
      const nameMatch = line.match(/^(\s*)-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (nameMatch) {
        const parameterName = nameMatch[2];
        const nameStart = line.indexOf(parameterName);

        // コメントを抽出
        const comments = extractParameterComments(lines, lineNum);

        // デフォルト値を検索（次の行から）
        let value: string | undefined;
        let valueAboveComment: string | undefined;
        let valueInlineComment: string | undefined;

        for (let i = lineNum + 1; i < lines.length; i++) {
          const nextLine = lines[i];
          const nextTrimmed = nextLine.trim();
          const nextIndent = nextLine.match(/^(\s*)/)?.[1].length ?? 0;

          // インデントが戻ったら終了
          if (nextTrimmed && nextIndent <= currentIndent && !nextTrimmed.startsWith('#')) {
            break;
          }

          // value: フィールド
          const valueMatch = nextLine.match(/^\s*value:\s*(.+)$/);
          if (valueMatch) {
            value = valueMatch[1].trim();
            // クオートを削除
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.substring(1, value.length - 1);
            }

            // value のコメントを抽出
            const valueComments = extractParameterComments(lines, i);
            valueAboveComment = valueComments.aboveComment;
            const commentIdx = nextLine.indexOf('#');
            if (commentIdx !== -1) {
              valueInlineComment = nextLine.substring(commentIdx + 1).trim();
            }
            break;
          }
        }

        definitions.push({
          name: parameterName,
          type: inInputsSection ? 'input' : 'output',
          templateName: currentTemplateName,
          range: Range.create(
            Position.create(lineNum, nameStart),
            Position.create(lineNum, nameStart + parameterName.length)
          ),
          uri: document.uri,
          value,
          valueAboveComment,
          valueInlineComment,
          aboveComment: comments.aboveComment,
          inlineComment: comments.inlineComment,
        });
      }
    }
  }

  return definitions;
}

/**
 * 指定位置にあるパラメータ参照を取得
 *
 * @param document - LSP TextDocument
 * @param position - カーソル位置
 * @returns パラメータ参照、または undefined
 *
 * @example
 * const ref = findParameterReferenceAtPosition(document, position);
 * if (ref && ref.type === 'inputs.parameters') {
 *   console.log(`Parameter: ${ref.parameterName}`);
 * }
 */
export function findParameterReferenceAtPosition(
  document: TextDocument,
  position: Position
): ParameterReference | undefined {
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[position.line];

  // パラメータ参照のパターン:
  // {{inputs.parameters.xxx}}
  // {{outputs.parameters.xxx}}
  // {{steps.xxx.outputs.parameters.yyy}}
  // {{tasks.xxx.outputs.parameters.yyy}}
  // {{workflow.parameters.xxx}}

  // 正規表現で参照を検出
  const patterns = [
    // inputs.parameters.xxx
    {
      regex: /\{\{inputs\.parameters\.([\w-]+)\}\}/g,
      type: 'inputs.parameters' as const,
    },
    // outputs.parameters.xxx
    {
      regex: /\{\{outputs\.parameters\.([\w-]+)\}\}/g,
      type: 'outputs.parameters' as const,
    },
    // steps.xxx.outputs.parameters.yyy
    {
      regex: /\{\{steps\.([\w-]+)\.outputs\.parameters\.([\w-]+)\}\}/g,
      type: 'steps.outputs.parameters' as const,
    },
    // tasks.xxx.outputs.parameters.yyy
    {
      regex: /\{\{tasks\.([\w-]+)\.outputs\.parameters\.([\w-]+)\}\}/g,
      type: 'tasks.outputs.parameters' as const,
    },
    // workflow.parameters.xxx
    {
      regex: /\{\{workflow\.parameters\.([\w-]+)\}\}/g,
      type: 'workflow.parameters' as const,
    },
  ];

  for (const pattern of patterns) {
    const matches = [...line.matchAll(pattern.regex)];
    for (const match of matches) {
      const fullMatch = match[0];
      const matchStart = match.index ?? 0;
      const matchEnd = matchStart + fullMatch.length;

      // カーソルがマッチ範囲内にあるかチェック
      if (position.character >= matchStart && position.character <= matchEnd) {
        if (
          pattern.type === 'steps.outputs.parameters' ||
          pattern.type === 'tasks.outputs.parameters'
        ) {
          const stepOrTaskName = match[1];
          const parameterName = match[2];

          return {
            type: pattern.type,
            parameterName,
            stepOrTaskName,
            range: Range.create(
              Position.create(position.line, matchStart),
              Position.create(position.line, matchEnd)
            ),
          };
        }

        const parameterName = match[1];
        return {
          type: pattern.type,
          parameterName,
          range: Range.create(
            Position.create(position.line, matchStart),
            Position.create(position.line, matchEnd)
          ),
        };
      }
    }
  }

  return undefined;
}

/**
 * ドキュメント内のすべてのパラメータ参照を取得
 *
 * @param document - LSP TextDocument
 * @returns パラメータ参照の配列
 *
 * @example
 * const references = findAllParameterReferences(document);
 * for (const ref of references) {
 *   console.log(`Parameter reference: ${ref.parameterName}`);
 * }
 */
export function findAllParameterReferences(document: TextDocument): ParameterReference[] {
  const references: ParameterReference[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  // パラメータ参照のパターン
  const patterns = [
    { pattern: /\{\{inputs\.parameters\.([\w-]+)\}\}/g, type: 'inputs.parameters' as const },
    { pattern: /\{\{outputs\.parameters\.([\w-]+)\}\}/g, type: 'outputs.parameters' as const },
    {
      pattern: /\{\{workflow\.parameters\.([\w-]+)\}\}/g,
      type: 'workflow.parameters' as const,
    },
    {
      pattern: /\{\{steps\.([\w-]+)\.outputs\.parameters\.([\w-]+)\}\}/g,
      type: 'steps.outputs.parameters' as const,
    },
    {
      pattern: /\{\{tasks\.([\w-]+)\.outputs\.parameters\.([\w-]+)\}\}/g,
      type: 'tasks.outputs.parameters' as const,
    },
  ];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Skip comment lines - parameter references in comments should not be flagged
    if (line.trim().startsWith('#')) continue;

    for (const { pattern, type } of patterns) {
      const matches = [...line.matchAll(pattern)];

      for (const match of matches) {
        const fullMatch = match[0];
        const matchStart = match.index ?? 0;
        const matchEnd = matchStart + fullMatch.length;

        // パラメータ名を抽出
        let parameterName: string;
        if (type === 'steps.outputs.parameters' || type === 'tasks.outputs.parameters') {
          parameterName = match[2]; // steps/tasks の場合は2番目のキャプチャグループ
        } else {
          parameterName = match[1];
        }

        references.push({
          type,
          parameterName,
          range: Range.create(
            Position.create(lineNum, matchStart),
            Position.create(lineNum, matchEnd)
          ),
        });
      }
    }
  }

  return references;
}
