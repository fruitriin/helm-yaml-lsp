import { SemanticTokensBuilder } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Range, SemanticTokens } from 'vscode-languageserver-types';
import { isHelmTemplate } from '@/features/documentDetection';
import { tokenizeGoTemplateExpressions } from '@/features/goTemplateTokenizer';

export const TOKEN_TYPES = [
  'keyword',
  'function',
  'variable',
  'property',
  'string',
  'number',
  'comment',
  'operator',
] as const;

export const TOKEN_MODIFIERS = ['definition', 'readonly', 'defaultLibrary'] as const;

export class SemanticTokensProvider {
  provideDocumentSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    if (!isHelmTemplate(document)) {
      return builder.build();
    }
    const spans = tokenizeGoTemplateExpressions(document);
    spans.sort((a, b) => a.line - b.line || a.character - b.character);
    for (const span of spans) {
      builder.push(span.line, span.character, span.length, span.tokenType, span.tokenModifiers);
    }
    return builder.build();
  }

  provideDocumentSemanticTokensRange(document: TextDocument, range: Range): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    if (!isHelmTemplate(document)) {
      return builder.build();
    }
    const spans = tokenizeGoTemplateExpressions(document);
    const filtered = spans.filter(s => s.line >= range.start.line && s.line <= range.end.line);
    filtered.sort((a, b) => a.line - b.line || a.character - b.character);
    for (const span of filtered) {
      builder.push(span.line, span.character, span.length, span.tokenType, span.tokenModifiers);
    }
    return builder.build();
  }
}
