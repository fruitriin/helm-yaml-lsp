/**
 * Helm Values Handler
 *
 * .Values.xxx 参照の検出・解決・補完を統一的に処理する。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import {
  extractValuePathForCompletion,
  findAllValuesReferences,
  findValuesReference,
} from '@/features/valuesReferenceFeatures';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { ValuesIndex } from '@/services/valuesIndex';
import type { ReferenceHandler } from '../handler';
import type { DetectedReference, HelmValuesDetails, ResolvedReference } from '../types';

export function createHelmValuesHandler(
  helmChartIndex: HelmChartIndex,
  valuesIndex: ValuesIndex
): ReferenceHandler {
  return {
    kind: 'helmValues',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: true,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findValuesReference(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'helmValues',
        range: ref.range,
        details: {
          kind: 'helmValues',
          valuePath: ref.valuePath,
          fullExpression: ref.fullExpression,
        },
      };
    },

    async resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as HelmValuesDetails;
      const chart = helmChartIndex.findChartForFile(doc.uri);
      if (!chart) {
        return {
          detected,
          definitionLocation: null,
          hoverMarkdown: null,
          diagnosticMessage: null,
          exists: null,
        };
      }

      const valueDef = valuesIndex.findValue(chart.name, details.valuePath);
      if (valueDef) {
        const parts: string[] = [];
        parts.push(`**Value**: \`.Values.${valueDef.path}\``);
        parts.push(`**Type**: ${valueDef.valueType}`);
        if (valueDef.value !== null && valueDef.value !== undefined) {
          const valueStr = JSON.stringify(valueDef.value);
          const displayValue = valueStr.length > 50 ? `${valueStr.substring(0, 50)}...` : valueStr;
          parts.push(`**Default**: \`${displayValue}\``);
        }
        parts.push(`**Chart**: ${chart.name}`);
        if (valueDef.description) {
          parts.push('');
          parts.push(valueDef.description);
        }

        return {
          detected,
          definitionLocation: { uri: valueDef.uri, range: valueDef.range },
          hoverMarkdown: parts.join('\n'),
          diagnosticMessage: null,
          exists: true,
        };
      }

      return {
        detected,
        definitionLocation: null,
        hoverMarkdown: null,
        diagnosticMessage: `Value '.Values.${details.valuePath}' not found in values.yaml (${chart.name})`,
        exists: false,
      };
    },

    findAll(doc: TextDocument): DetectedReference[] {
      return findAllValuesReferences(doc).map(ref => ({
        kind: 'helmValues' as const,
        range: ref.range,
        details: {
          kind: 'helmValues' as const,
          valuePath: ref.valuePath,
          fullExpression: ref.fullExpression,
        },
      }));
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const valuePath = extractValuePathForCompletion(doc, pos);
      if (valuePath === undefined) return undefined;

      const chart = helmChartIndex.findChartForFile(doc.uri);
      if (!chart) return undefined;

      const candidates = valuePath
        ? valuesIndex.findValuesByPrefix(chart.name, valuePath)
        : valuesIndex.getAllValues(chart.name);

      return candidates.map(v => {
        const kind = getCompletionKindForValueType(v.valueType);
        const documentation = [
          v.description,
          v.value !== null && v.value !== undefined
            ? `Default: ${JSON.stringify(v.value)}`
            : undefined,
        ]
          .filter(Boolean)
          .join('\n\n');

        return {
          label: v.path,
          kind,
          detail: `${v.valueType} (${chart.name})`,
          documentation: documentation || undefined,
          insertText: v.path,
        };
      });
    },
  };
}

function getCompletionKindForValueType(valueType: string): CompletionItemKind {
  switch (valueType) {
    case 'string':
      return CompletionItemKind.Text;
    case 'number':
      return CompletionItemKind.Value;
    case 'boolean':
      return CompletionItemKind.Value;
    case 'array':
      return CompletionItemKind.Variable;
    case 'object':
      return CompletionItemKind.Module;
    default:
      return CompletionItemKind.Property;
  }
}
