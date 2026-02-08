/**
 * Helm Template Handler
 *
 * {{ include "name" }} / {{ template "name" }} 参照の検出・解決・補完。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import {
  findAllTemplateReferences,
  findTemplateReferenceAtPosition,
} from '@/features/helmTemplateFeatures';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { ReferenceHandler } from '../handler';
import type { DetectedReference, HelmTemplateDetails, ResolvedReference } from '../types';

export function createHelmTemplateHandler(
  helmChartIndex: HelmChartIndex,
  helmTemplateIndex: HelmTemplateIndex
): ReferenceHandler {
  return {
    kind: 'helmTemplate',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: true,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findTemplateReferenceAtPosition(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'helmTemplate',
        range: ref.range,
        details: {
          kind: 'helmTemplate',
          type: ref.type,
          templateName: ref.templateName,
          fullExpression: ref.fullExpression,
        },
      };
    },

    async resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as HelmTemplateDetails;
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

      const templateDef = helmTemplateIndex.findTemplate(chart.name, details.templateName);
      if (templateDef) {
        const parts: string[] = [];
        parts.push(`**Template**: \`${templateDef.name}\``);
        parts.push(`**Type**: Helm ${details.type === 'include' ? 'include' : 'template'}`);
        parts.push(`**Chart**: ${chart.name}`);
        const fileName = templateDef.uri.split('/').pop() || '';
        parts.push(`**File**: ${fileName}`);
        if (templateDef.description) {
          parts.push('');
          parts.push(templateDef.description);
        }
        if (templateDef.content) {
          const lines = templateDef.content.split('\n').slice(0, 3);
          const preview = lines.join('\n');
          if (preview) {
            parts.push('');
            parts.push('**Preview**:');
            parts.push('```yaml');
            parts.push(preview);
            if (templateDef.content.split('\n').length > 3) parts.push('...');
            parts.push('```');
          }
        }

        return {
          detected,
          definitionLocation: { uri: templateDef.uri, range: templateDef.range },
          hoverMarkdown: parts.join('  \n'),
          diagnosticMessage: null,
          exists: true,
        };
      }

      const functionType = details.type === 'include' ? 'include' : 'template';
      return {
        detected,
        definitionLocation: null,
        hoverMarkdown: null,
        diagnosticMessage: `Template '${details.templateName}' not found (Helm ${functionType}, ${chart.name})`,
        exists: false,
      };
    },

    findAll(doc: TextDocument): DetectedReference[] {
      return findAllTemplateReferences(doc).map(ref => ({
        kind: 'helmTemplate' as const,
        range: ref.range,
        details: {
          kind: 'helmTemplate' as const,
          type: ref.type,
          templateName: ref.templateName,
          fullExpression: ref.fullExpression,
        },
      }));
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = doc.getText();
      const lines = text.split('\n');
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      const isCtx =
        /\{\{-?\s*include\s+"[^"]*$/.test(linePrefix) ||
        /\{\{-?\s*template\s+"[^"]*$/.test(linePrefix);
      if (!isCtx) return undefined;

      const chart = helmChartIndex.findChartForFile(doc.uri);
      if (!chart) return undefined;

      const templates = helmTemplateIndex.getAllTemplates(chart.name);
      return templates.map(t => {
        const documentation = [
          t.description,
          t.content ? `Preview:\n${t.content.split('\n').slice(0, 3).join('\n')}...` : undefined,
        ]
          .filter(Boolean)
          .join('\n\n');

        return {
          label: t.name,
          kind: CompletionItemKind.Function,
          detail: `Helm Template (${chart.name})`,
          documentation: documentation || undefined,
          insertText: t.name,
        };
      });
    },
  };
}
