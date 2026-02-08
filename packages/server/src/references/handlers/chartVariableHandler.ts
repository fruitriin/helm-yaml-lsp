/**
 * Chart Variable Handler
 *
 * .Chart.Name, .Chart.Version 等の参照検出・ホバー・定義ジャンプ・補完。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import {
  extractChartPathForCompletion,
  findChartReference,
} from '@/features/chartReferenceFeatures';
import { findChartVariable, getAllChartVariables } from '@/features/chartVariables';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { ReferenceHandler } from '../handler';
import type { ChartVariableDetails, DetectedReference, ResolvedReference } from '../types';

export function createChartVariableHandler(helmChartIndex: HelmChartIndex): ReferenceHandler {
  return {
    kind: 'chartVariable',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: false,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findChartReference(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'chartVariable',
        range: ref.range,
        details: {
          kind: 'chartVariable',
          variableName: ref.variableName,
        },
      };
    },

    async resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as ChartVariableDetails;
      const chartVariable = findChartVariable(details.variableName);
      if (!chartVariable) {
        return {
          detected,
          definitionLocation: null,
          hoverMarkdown: null,
          diagnosticMessage: null,
          exists: null,
        };
      }

      const chart = helmChartIndex.findChartForFile(doc.uri);
      if (!chart || !chart.metadata) {
        return {
          detected,
          definitionLocation: null,
          hoverMarkdown: null,
          diagnosticMessage: null,
          exists: null,
        };
      }

      const parts: string[] = [];
      parts.push(`**Chart Variable**: \`${chartVariable.fullPath}\``);
      const value = getChartVariableValue(chart.metadata, details.variableName);
      if (value !== undefined) {
        parts.push(`**Value**: \`${JSON.stringify(value)}\``);
      }
      parts.push(`**Chart**: ${chart.name}`);
      parts.push('');
      parts.push(chartVariable.description);

      // Definition: jump to Chart.yaml
      const definitionLocation = chart.chartYamlUri
        ? {
            uri: chart.chartYamlUri,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          }
        : null;

      return {
        detected,
        definitionLocation,
        hoverMarkdown: parts.join('  \n'),
        diagnosticMessage: null,
        exists: null,
      };
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const chartPath = extractChartPathForCompletion(doc, pos);
      if (chartPath === undefined) return undefined;

      return getAllChartVariables()
        .filter(v => v.name.toLowerCase().startsWith(chartPath.toLowerCase()))
        .map(v => ({
          label: v.name,
          kind: CompletionItemKind.Property,
          detail: 'Chart Variable',
          documentation: v.description,
          insertText: v.name,
        }));
    },
  };
}

function getChartVariableValue(metadata: Record<string, unknown>, variableName: string): unknown {
  switch (variableName) {
    case 'Name':
      return metadata.name;
    case 'Version':
      return metadata.version;
    case 'Description':
      return metadata.description;
    case 'ApiVersion':
      return metadata.apiVersion;
    case 'AppVersion':
      return metadata.appVersion;
    case 'Type':
      return metadata.type;
    default:
      return metadata[variableName.toLowerCase()];
  }
}
