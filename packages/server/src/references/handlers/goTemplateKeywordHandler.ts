/**
 * Go Template Keyword Handler
 *
 * Go テンプレート制御構文キーワード (if, else, range, with, etc.) の参照検出・ホバー・補完。
 * キーワードは定義ジャンプや診断の対象外。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import { findGoTemplateKeywordReference } from '@/features/goTemplateKeywordFeatures';
import { findGoTemplateKeyword, getAllGoTemplateKeywords } from '@/features/goTemplateKeywords';
import type { ReferenceHandler } from '../handler';
import type { DetectedReference, GoTemplateKeywordDetails, ResolvedReference } from '../types';

export function createGoTemplateKeywordHandler(): ReferenceHandler {
  return {
    kind: 'goTemplateKeyword',
    supports: {
      definition: false,
      hover: true,
      completion: true,
      diagnostic: false,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findGoTemplateKeywordReference(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'goTemplateKeyword',
        range: ref.range,
        details: {
          kind: 'goTemplateKeyword',
          keywordName: ref.keywordName,
        },
      };
    },

    async resolve(_doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as GoTemplateKeywordDetails;
      const keyword = findGoTemplateKeyword(details.keywordName);

      if (!keyword) {
        return {
          detected,
          definitionLocation: null,
          hoverMarkdown: null,
          diagnosticMessage: null,
          exists: null,
        };
      }

      const parts: string[] = [];
      parts.push(`**Keyword**: \`${keyword.name}\``);
      parts.push(`**Syntax**: \`${keyword.syntax}\``);
      parts.push('');
      parts.push(keyword.description);
      if (keyword.examples.length > 0) {
        parts.push('');
        parts.push('**Examples**:');
        parts.push('```yaml');
        for (const example of keyword.examples) {
          parts.push(example);
        }
        parts.push('```');
      }

      return {
        detected,
        definitionLocation: null,
        hoverMarkdown: parts.join('  \n'),
        diagnosticMessage: null,
        exists: null,
      };
    },

    complete(_doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = _doc.getText();
      const lines = text.split('\n');
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      // キーワードの後に引数入力中はスキップ
      if (/\{\{-?\s*(if|else|range|with|define|block|end|template)\s+/.test(linePrefix)) {
        return undefined;
      }

      // {{ の直後、または {{ の後に部分入力中
      if (!/\{\{-?\s*$/.test(linePrefix) && !/\{\{-?\s+\S*$/.test(linePrefix)) {
        return undefined;
      }

      return getAllGoTemplateKeywords().map(keyword => ({
        label: keyword.name,
        kind: CompletionItemKind.Keyword,
        detail: 'Go template keyword',
        documentation: keyword.description,
      }));
    },
  };
}
