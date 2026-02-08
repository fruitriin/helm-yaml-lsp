import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SemanticTokensProvider } from '@/providers/semanticTokensProvider';

function makeDoc(content: string, languageId = 'helm') {
  return TextDocument.create('file:///test/mychart/templates/test.yaml', languageId, 1, content);
}

describe('SemanticTokensProvider', () => {
  const provider = new SemanticTokensProvider();

  it('should return empty data for non-Helm documents', () => {
    // Use a URI and languageId that won't be detected as Helm
    const doc = TextDocument.create('file:///test/plain.yaml', 'yaml', 1, '{{ if true }}');
    const result = provider.provideDocumentSemanticTokens(doc);
    expect(result.data).toEqual([]);
  });

  it('should return semantic tokens for Helm template', () => {
    const doc = makeDoc('{{ if .Values.enabled }}');
    const result = provider.provideDocumentSemanticTokens(doc);
    // SemanticTokensBuilder produces delta-encoded data:
    // [deltaLine, deltaStartChar, length, tokenType, tokenModifiers, ...]
    // First token: deltaLine=0, deltaStartChar=0 (absolute for first)
    expect(result.data.length).toBeGreaterThan(0);
    // data should be array of groups of 5
    expect(result.data.length % 5).toBe(0);
  });

  it('should produce correct delta encoding for single line', () => {
    const doc = makeDoc('{{ end }}');
    const result = provider.provideDocumentSemanticTokens(doc);
    // Tokens: {{ (op, char 0, len 2), end (keyword, char 3, len 3), }} (op, char 7, len 2)
    // Delta encoded:
    // Token 1: deltaLine=0, deltaChar=0, len=2, type=7(op), mod=0
    // Token 2: deltaLine=0, deltaChar=3, len=3, type=0(keyword), mod=0
    // Token 3: deltaLine=0, deltaChar=4, len=2, type=7(op), mod=0
    expect(result.data).toEqual([
      0,
      0,
      2,
      7,
      0, // {{
      0,
      3,
      3,
      0,
      0, // end
      0,
      4,
      2,
      7,
      0, // }}
    ]);
  });

  it('should handle range request', () => {
    const doc = makeDoc('line0\n{{ .Values.name }}\n{{ end }}');
    const result = provider.provideDocumentSemanticTokensRange(doc, {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 100 },
    });
    expect(result.data.length).toBeGreaterThan(0);
    // Should only contain tokens from line 1
  });

  it('should handle empty document', () => {
    const doc = makeDoc('');
    const result = provider.provideDocumentSemanticTokens(doc);
    expect(result.data).toEqual([]);
  });
});
