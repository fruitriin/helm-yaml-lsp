/**
 * Workflow Variable Handler
 *
 * workflow.name, workflow.namespace 等の組み込み変数、
 * workflow.labels.xxx, workflow.annotations.xxx のサブプロパティ、
 * workflow.parameters.xxx の参照を統一的に処理する。
 *
 * hover/definition の重複ロジック（metadata走査、arguments.parameters走査）を
 * このハンドラーに集約する。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position, Range } from 'vscode-languageserver-types';
import {
  CompletionItemKind,
  MarkupKind,
  Position as Pos,
  Range as Rng,
} from 'vscode-languageserver-types';
import { findWorkflowVariableAtPosition, WORKFLOW_VARIABLES } from '@/features/workflowVariables';
import type { ReferenceHandler } from '../handler';
import type { DetectedReference, ResolvedReference, WorkflowVariableDetails } from '../types';

export function createWorkflowVariableHandler(): ReferenceHandler {
  return {
    kind: 'workflowVariable',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: false,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const result = findWorkflowVariableAtPosition(doc, pos);
      if (!result) return undefined;

      const varName = result.variable.name;
      const parts = varName.split('.');
      let subProperty: string | undefined;
      let subPropertyType:
        | 'labels'
        | 'annotations'
        | 'parameters'
        | 'outputs.parameters'
        | 'outputs.artifacts'
        | undefined;

      if (parts.length >= 3) {
        if (parts[1] === 'outputs' && parts.length >= 4) {
          if (parts[2] === 'parameters') {
            subProperty = parts.slice(3).join('.');
            subPropertyType = 'outputs.parameters';
          } else if (parts[2] === 'artifacts') {
            subProperty = parts.slice(3).join('.');
            subPropertyType = 'outputs.artifacts';
          }
        } else if (parts[1] === 'labels') {
          subProperty = parts.slice(2).join('.');
          subPropertyType = 'labels';
        } else if (parts[1] === 'annotations') {
          subProperty = parts.slice(2).join('.');
          subPropertyType = 'annotations';
        } else if (parts[1] === 'parameters') {
          subProperty = parts.slice(2).join('.');
          subPropertyType = 'parameters';
        }
      }

      return {
        kind: 'workflowVariable',
        range: result.range,
        details: {
          kind: 'workflowVariable',
          variableName: result.variable.name,
          description: result.variable.description,
          example: result.variable.example,
          subProperty,
          subPropertyType,
        },
      };
    },

    async resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as WorkflowVariableDetails;

      const hoverMarkdown = buildWorkflowVariableHover(doc, details);
      const definitionLocation = findWorkflowVariableDefinition(doc, details);

      return {
        detected,
        definitionLocation,
        hoverMarkdown,
        diagnosticMessage: null,
        exists: null,
      };
    },

    complete(_doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = _doc.getText();
      const lines = text.split('\n');
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      if (!/\{\{workflow\.\w*/.test(linePrefix)) return undefined;

      const items: CompletionItem[] = [];
      for (const variableInfo of Object.values(WORKFLOW_VARIABLES)) {
        items.push({
          label: variableInfo.name,
          kind: CompletionItemKind.Property,
          detail: 'Workflow Variable',
          documentation: variableInfo.description,
          insertText: variableInfo.name.replace('workflow.', ''),
        });
      }
      return items;
    },
  };
}

/**
 * Workflow変数のホバーMarkdownを構築
 */
function buildWorkflowVariableHover(doc: TextDocument, details: WorkflowVariableDetails): string {
  // workflow.parameters.xxx → spec.arguments.parameters から詳細を取得
  if (details.subPropertyType === 'parameters' && details.subProperty) {
    return buildWorkflowParameterHover(doc, details.subProperty);
  }

  // workflow.outputs.parameters.xxx / workflow.outputs.artifacts.xxx
  if (details.subPropertyType === 'outputs.parameters' && details.subProperty) {
    return `**Workflow Output Parameter**: \`${details.subProperty}\`  \n  \n**Type**: Workflow Output  \n  \nReferenced from workflow-level \`outputs.parameters\``;
  }
  if (details.subPropertyType === 'outputs.artifacts' && details.subProperty) {
    return `**Workflow Output Artifact**: \`${details.subProperty}\`  \n  \n**Type**: Workflow Output  \n  \nReferenced from workflow-level \`outputs.artifacts\``;
  }

  const parts: string[] = [];
  parts.push(`**Workflow Variable**: \`${details.variableName}\``);
  parts.push('');
  parts.push(details.description);
  if (details.example) {
    parts.push('');
    parts.push(`**Example**: \`${details.example}\``);
  }
  return parts.join('  \n');
}

/**
 * workflow.parameters.xxx のリッチなホバー情報を構築
 *
 * spec.arguments.parameters から value / description を抽出
 */
function buildWorkflowParameterHover(doc: TextDocument, parameterName: string): string {
  const text = doc.getText();
  const lines = text.split('\n');

  let inArguments = false;
  let inParameters = false;
  let argumentsIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (/^\s*arguments:/.test(line)) {
      inArguments = true;
      inParameters = false;
      argumentsIndent = currentIndent;
      continue;
    }

    if (inArguments && /^\s*parameters:/.test(line) && currentIndent > argumentsIndent) {
      inParameters = true;
      continue;
    }

    if (inArguments && currentIndent <= argumentsIndent && !trimmed.startsWith('#')) {
      inArguments = false;
      inParameters = false;
    }

    if (inParameters) {
      const nameMatch = line.match(/^\s*-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (nameMatch && nameMatch[1] === parameterName) {
        let value: string | undefined;
        let description: string | undefined;
        const paramIndent = currentIndent;

        for (let j = i + 1; j < lines.length; j++) {
          const pLine = lines[j];
          const pTrimmed = pLine.trim();
          if (pTrimmed === '' || pTrimmed.startsWith('#')) continue;
          const pIndent = pLine.match(/^(\s*)/)?.[1].length ?? 0;
          if (pIndent <= paramIndent && !pTrimmed.startsWith('#')) break;

          const valMatch = pLine.match(/^\s*value:\s*['"]?(.+?)['"]?\s*$/);
          if (valMatch) value = valMatch[1];

          const descMatch = pLine.match(/^\s*description:\s*['"]?(.+?)['"]?\s*$/);
          if (descMatch) description = descMatch[1];
        }

        const parts: string[] = [];
        parts.push(`**Workflow Parameter**: \`${parameterName}\``);
        parts.push('');
        parts.push('**Type**: Workflow Argument');
        if (value) parts.push(`**Value**: \`${value}\``);
        if (description) parts.push(`**Description**: ${description}`);
        return parts.join('  \n');
      }
    }
  }

  // Fallback
  return `**Workflow Parameter**: \`${parameterName}\`  \n  \n**Type**: Workflow Argument`;
}

/**
 * Workflow変数の定義位置を検索
 *
 * - workflow.labels.xxx → metadata.labels セクションのキー
 * - workflow.annotations.xxx → metadata.annotations セクションのキー
 * - workflow.parameters.xxx → spec.arguments.parameters セクションの name
 */
function findWorkflowVariableDefinition(
  doc: TextDocument,
  details: WorkflowVariableDetails
): { uri: string; range: Range } | null {
  if (details.subPropertyType === 'labels' && details.subProperty) {
    return findMetadataKey(doc, 'labels', details.subProperty);
  }
  if (details.subPropertyType === 'annotations' && details.subProperty) {
    return findMetadataKey(doc, 'annotations', details.subProperty);
  }
  if (details.subPropertyType === 'parameters' && details.subProperty) {
    return findWorkflowParameterDefinition(doc, details.subProperty);
  }
  if (
    (details.subPropertyType === 'outputs.parameters' ||
      details.subPropertyType === 'outputs.artifacts') &&
    details.subProperty
  ) {
    return findWorkflowOutputDefinition(doc, details.subProperty, details.subPropertyType);
  }

  // Basic workflow variables → corresponding metadata/spec fields
  if (details.variableName === 'workflow.name') {
    return findMetadataField(doc, 'name') ?? findMetadataField(doc, 'generateName');
  }
  if (details.variableName === 'workflow.namespace') {
    return findMetadataField(doc, 'namespace');
  }

  return null;
}

/**
 * metadata 直下のフィールド（name, generateName, namespace）を検索
 */
function findMetadataField(
  doc: TextDocument,
  fieldName: string
): { uri: string; range: Range } | null {
  const text = doc.getText();
  const lines = text.split('\n');

  let inMetadata = false;
  let metadataIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (/^\s*metadata:/.test(line)) {
      inMetadata = true;
      metadataIndent = currentIndent;
      continue;
    }

    if (inMetadata && currentIndent <= metadataIndent) {
      inMetadata = false;
    }

    if (inMetadata) {
      const fieldRegex = new RegExp(`^\\s*${fieldName}:\\s*(\\S.*)`);
      const match = line.match(fieldRegex);
      if (match && currentIndent === metadataIndent + 2) {
        const valueStr = match[1].trim().replace(/^["']|["']$/g, '');
        const valueStart = line.indexOf(valueStr, line.indexOf(':') + 1);
        return {
          uri: doc.uri,
          range: Rng.create(Pos.create(i, valueStart), Pos.create(i, valueStart + valueStr.length)),
        };
      }
    }
  }

  return null;
}

/**
 * metadata.labels / metadata.annotations からキーを検索
 */
function findMetadataKey(
  doc: TextDocument,
  section: 'labels' | 'annotations',
  keyName: string
): { uri: string; range: Range } | null {
  const text = doc.getText();
  const lines = text.split('\n');

  let inMetadata = false;
  let inSection = false;
  let metadataIndent = 0;
  let sectionIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (/^\s*metadata:/.test(line)) {
      inMetadata = true;
      inSection = false;
      metadataIndent = currentIndent;
      continue;
    }

    if (inMetadata && currentIndent <= metadataIndent && !trimmed.startsWith('#')) {
      inMetadata = false;
      inSection = false;
    }

    if (inMetadata) {
      const sectionRegex = new RegExp(`^\\s*${section}:`);
      if (sectionRegex.test(line) && currentIndent > metadataIndent) {
        inSection = true;
        sectionIndent = currentIndent;
        continue;
      }

      if (inSection && currentIndent <= sectionIndent) {
        inSection = false;
      }

      if (inSection) {
        const keyRegex = new RegExp(`^\\s*(${keyName})\\s*:`);
        const keyMatch = line.match(keyRegex);
        if (keyMatch) {
          const keyStart = line.indexOf(keyName);
          return {
            uri: doc.uri,
            range: Rng.create(Pos.create(i, keyStart), Pos.create(i, keyStart + keyName.length)),
          };
        }
      }
    }
  }

  return null;
}

/**
 * spec.arguments.parameters からパラメータ定義を検索
 */
function findWorkflowParameterDefinition(
  doc: TextDocument,
  parameterName: string
): { uri: string; range: Range } | null {
  const text = doc.getText();
  const lines = text.split('\n');

  let inArguments = false;
  let inParameters = false;
  let argumentsIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (/^\s*arguments:/.test(line)) {
      inArguments = true;
      inParameters = false;
      argumentsIndent = currentIndent;
      continue;
    }

    if (inArguments && /^\s*parameters:/.test(line) && currentIndent > argumentsIndent) {
      inParameters = true;
      continue;
    }

    if (inArguments && currentIndent <= argumentsIndent && !trimmed.startsWith('#')) {
      inArguments = false;
      inParameters = false;
    }

    if (inParameters) {
      const nameMatch = line.match(/^\s*-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (nameMatch && nameMatch[1] === parameterName) {
        const nameStart = line.indexOf(parameterName);
        return {
          uri: doc.uri,
          range: Rng.create(
            Pos.create(i, nameStart),
            Pos.create(i, nameStart + parameterName.length)
          ),
        };
      }
    }
  }

  return null;
}

/**
 * workflow.outputs.parameters / workflow.outputs.artifacts の定義位置を検索
 *
 * ドキュメント内で該当パラメータ/アーティファクト名を検索（ベストエフォート）
 */
function findWorkflowOutputDefinition(
  doc: TextDocument,
  name: string,
  type: 'outputs.parameters' | 'outputs.artifacts'
): { uri: string; range: Range } | null {
  const text = doc.getText();
  const lines = text.split('\n');

  const sectionName = type === 'outputs.parameters' ? 'parameters' : 'artifacts';

  let inOutputs = false;
  let inSection = false;
  let outputsIndent = 0;
  let sectionIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (/^\s*outputs:/.test(line)) {
      inOutputs = true;
      inSection = false;
      outputsIndent = currentIndent;
      continue;
    }

    if (inOutputs && currentIndent <= outputsIndent && !trimmed.startsWith('#')) {
      inOutputs = false;
      inSection = false;
    }

    if (inOutputs) {
      const sectionRegex = new RegExp(`^\\s*${sectionName}:`);
      if (sectionRegex.test(line) && currentIndent > outputsIndent) {
        inSection = true;
        sectionIndent = currentIndent;
        continue;
      }

      if (inSection && currentIndent <= sectionIndent && !trimmed.startsWith('-')) {
        inSection = false;
      }

      if (inSection) {
        const nameMatch = line.match(/^\s*-\s*name:\s*['"]?([\w-]+)['"]?/);
        if (nameMatch && nameMatch[1] === name) {
          const nameStart = line.indexOf(name);
          return {
            uri: doc.uri,
            range: Rng.create(Pos.create(i, nameStart), Pos.create(i, nameStart + name.length)),
          };
        }
      }
    }
  }

  return null;
}
