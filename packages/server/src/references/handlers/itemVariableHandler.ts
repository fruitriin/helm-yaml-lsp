/**
 * Item Variable Handler
 *
 * {{item}} / {{item.xxx}} の参照を処理する。
 * withItems / withParam ソース定義へのジャンプ、ホバー情報、プロパティ補完を提供。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import {
  findItemSourceDefinition,
  findItemVariableAtPosition,
} from '@/features/itemVariableFeatures';
import type { ReferenceHandler } from '../handler';
import type { DetectedReference, ItemVariableDetails, ResolvedReference } from '../types';

export function createItemVariableHandler(): ReferenceHandler {
  return {
    kind: 'itemVariable',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: false,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findItemVariableAtPosition(doc, pos);
      if (!ref) return undefined;
      return {
        kind: 'itemVariable',
        range: ref.range,
        details: {
          kind: 'itemVariable',
          type: ref.type,
          propertyName: ref.propertyName,
        },
      };
    },

    async resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as ItemVariableDetails;
      const pos = detected.range.start;
      const source = findItemSourceDefinition(doc, pos);

      if (!source) {
        return {
          detected,
          definitionLocation: null,
          hoverMarkdown: null,
          diagnosticMessage: null,
          exists: null,
        };
      }

      // 定義ジャンプ: withItems/withParam の行
      const definitionLocation = { uri: doc.uri, range: source.range };

      // ホバー構築
      const hoverParts: string[] = [];
      if (source.type === 'withItems') {
        hoverParts.push(
          `**Item Variable**: \`{{item${details.propertyName ? `.${details.propertyName}` : ''}}}\``
        );
        hoverParts.push('');
        hoverParts.push('**Source**: `withItems`');
        if (source.items && source.items.length > 0) {
          const maxShow = 5;
          const shown = source.items.slice(0, maxShow);
          hoverParts.push('');
          hoverParts.push('**Values**:');
          for (const item of shown) {
            hoverParts.push(`- \`${item.value}\``);
          }
          if (source.items.length > maxShow) {
            hoverParts.push(`- ... and ${source.items.length - maxShow} more`);
          }
          // オブジェクト型の場合はプロパティ列挙
          if (source.items[0].valueType === 'object' && source.items[0].properties) {
            hoverParts.push('');
            hoverParts.push(
              `**Available properties**: ${source.items[0].properties.map(p => `\`${p}\``).join(', ')}`
            );
          }
        }
      } else {
        // withParam
        hoverParts.push(
          `**Item Variable**: \`{{item${details.propertyName ? `.${details.propertyName}` : ''}}}\``
        );
        hoverParts.push('');
        hoverParts.push('**Source**: `withParam`');
        if (source.paramExpression) {
          hoverParts.push(`**Expression**: \`${source.paramExpression}\``);
        }
      }

      return {
        detected,
        definitionLocation,
        hoverMarkdown: hoverParts.join('\n'),
        diagnosticMessage: null,
        exists: true,
      };
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = doc.getText();
      const lines = text.split('\n');
      if (pos.line >= lines.length) return undefined;

      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      if (!/\{\{item\.\w*/.test(linePrefix)) return undefined;

      // withItems のソースからオブジェクトプロパティを補完
      const source = findItemSourceDefinition(doc, pos);
      if (!source || source.type !== 'withItems') return undefined;
      if (!source.items || source.items.length === 0) return undefined;

      const firstItem = source.items[0];
      if (firstItem.valueType !== 'object' || !firstItem.properties) return undefined;

      return firstItem.properties.map(prop => ({
        label: prop,
        kind: CompletionItemKind.Property,
        detail: 'Item Property',
        insertText: prop,
      }));
    },
  };
}
