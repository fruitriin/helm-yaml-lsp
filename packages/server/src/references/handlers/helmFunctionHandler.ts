/**
 * Helm Function Handler
 *
 * Helm 組み込み関数 (70+) の参照検出・ホバー・補完。
 * 関数は定義ジャンプや診断の対象外。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import { findHelmFunctionReference } from '@/features/helmFunctionFeatures';
import { findFunction, getAllFunctions } from '@/features/helmFunctions';
import type { ReferenceHandler } from '../handler';
import type { DetectedReference, HelmFunctionDetails, ResolvedReference } from '../types';

export function createHelmFunctionHandler(): ReferenceHandler {
  return {
    kind: 'helmFunction',
    supports: {
      definition: false,
      hover: true,
      completion: true,
      diagnostic: false,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findHelmFunctionReference(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'helmFunction',
        range: ref.range,
        details: {
          kind: 'helmFunction',
          functionName: ref.functionName,
        },
      };
    },

    async resolve(_doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as HelmFunctionDetails;
      const helmFunction = findFunction(details.functionName);

      if (!helmFunction) {
        return {
          detected,
          definitionLocation: null,
          hoverMarkdown: null,
          diagnosticMessage: null,
          exists: null,
        };
      }

      const parts: string[] = [];
      parts.push(`**Function**: \`${helmFunction.name}\``);
      parts.push(`**Signature**: \`${helmFunction.signature}\``);
      parts.push(`**Category**: ${helmFunction.category}`);
      parts.push('');
      parts.push(helmFunction.description);
      if (helmFunction.examples && helmFunction.examples.length > 0) {
        parts.push('');
        parts.push('**Examples**:');
        parts.push('```yaml');
        for (const example of helmFunction.examples) {
          parts.push(example);
        }
        parts.push('```');
      }

      return {
        detected,
        definitionLocation: null,
        hoverMarkdown: parts.join('\n'),
        diagnosticMessage: null,
        exists: null,
      };
    },

    complete(_doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = _doc.getText();
      const lines = text.split('\n');
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      if (!/\{\{[^}]*\|\s*$/.test(linePrefix)) return undefined;

      return getAllFunctions().map(fn => ({
        label: fn.name,
        kind: CompletionItemKind.Function,
        detail: `${fn.category} function`,
        documentation: `${fn.description}\n\nSignature: ${fn.signature}`,
        insertText: fn.name,
      }));
    },
  };
}
