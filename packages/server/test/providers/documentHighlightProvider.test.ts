/**
 * Argo Workflows LSP - Document Highlight Provider Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentHighlightKind, Position } from 'vscode-languageserver-types';
import { DocumentHighlightProvider } from '../../src/providers/documentHighlightProvider';

describe('DocumentHighlightProvider', () => {
  const provider = new DocumentHighlightProvider();

  function createDoc(content: string): TextDocument {
    return TextDocument.create('file:///test.yaml', 'yaml', 1, content);
  }

  describe('provideDocumentHighlights', () => {
    it('should highlight matching if/end block', () => {
      const doc = createDoc(`{{- if .Values.enabled }}
hello: world
{{- end }}`);
      // Cursor on "if" tag (line 0, col 5)
      const highlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(2);
      expect(highlights![0].kind).toBe(DocumentHighlightKind.Write);
      expect(highlights![0].range.start.line).toBe(0);
      expect(highlights![1].kind).toBe(DocumentHighlightKind.Write);
      expect(highlights![1].range.start.line).toBe(2);
    });

    it('should highlight if/else/end block', () => {
      const doc = createDoc(`{{- if .Values.enabled }}
value: a
{{- else }}
value: b
{{- end }}`);
      // Cursor on "if" tag
      const highlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(3);
      expect(highlights![0].kind).toBe(DocumentHighlightKind.Write); // if
      expect(highlights![0].range.start.line).toBe(0);
      expect(highlights![1].kind).toBe(DocumentHighlightKind.Read); // else
      expect(highlights![1].range.start.line).toBe(2);
      expect(highlights![2].kind).toBe(DocumentHighlightKind.Write); // end
      expect(highlights![2].range.start.line).toBe(4);
    });

    it('should highlight if/else-if/else/end block', () => {
      const doc = createDoc(`{{- if .Values.a }}
value: a
{{- else if .Values.b }}
value: b
{{- else }}
value: c
{{- end }}`);
      // Cursor on "if"
      const highlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(4);
      expect(highlights![0].range.start.line).toBe(0); // if
      expect(highlights![1].range.start.line).toBe(2); // else if
      expect(highlights![2].range.start.line).toBe(4); // else
      expect(highlights![3].range.start.line).toBe(6); // end
    });

    it('should highlight range/end block', () => {
      const doc = createDoc(`{{- range .Values.items }}
- {{ . }}
{{- end }}`);
      const highlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(2);
      expect(highlights![0].kind).toBe(DocumentHighlightKind.Write);
      expect(highlights![1].kind).toBe(DocumentHighlightKind.Write);
    });

    it('should highlight with/end block', () => {
      const doc = createDoc(`{{- with .Values.config }}
key: {{ .key }}
{{- end }}`);
      const highlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(2);
    });

    it('should highlight define/end block', () => {
      const doc = createDoc(`{{- define "my-template" }}
content here
{{- end }}`);
      const highlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(2);
    });

    it('should handle nested blocks correctly', () => {
      const doc = createDoc(`{{- if .Values.outer }}
{{- if .Values.inner }}
inner: true
{{- end }}
{{- end }}`);
      // Cursor on outer "if" (line 0)
      const outerHighlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(outerHighlights).not.toBeNull();
      expect(outerHighlights!.length).toBe(2);
      expect(outerHighlights![0].range.start.line).toBe(0); // outer if
      expect(outerHighlights![1].range.start.line).toBe(4); // outer end

      // Cursor on inner "if" (line 1)
      const innerHighlights = provider.provideDocumentHighlights(doc, Position.create(1, 5));
      expect(innerHighlights).not.toBeNull();
      expect(innerHighlights!.length).toBe(2);
      expect(innerHighlights![0].range.start.line).toBe(1); // inner if
      expect(innerHighlights![1].range.start.line).toBe(3); // inner end
    });

    it('should return null for non-block position', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: test`);
      const highlights = provider.provideDocumentHighlights(doc, Position.create(1, 5));
      expect(highlights).toBeNull();
    });

    it('should handle trimming markers ({{- ... -}})', () => {
      const doc = createDoc(`{{- if .Values.enabled -}}
content
{{- end -}}`);
      const highlights = provider.provideDocumentHighlights(doc, Position.create(0, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(2);
    });

    it('should highlight from end tag back to opening', () => {
      const doc = createDoc(`{{- if .Values.enabled }}
content
{{- end }}`);
      // Cursor on "end" tag (line 2)
      const highlights = provider.provideDocumentHighlights(doc, Position.create(2, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(2);
      expect(highlights![0].range.start.line).toBe(0); // if
      expect(highlights![1].range.start.line).toBe(2); // end
    });

    it('should highlight from else tag', () => {
      const doc = createDoc(`{{- if .Values.a }}
value: a
{{- else }}
value: b
{{- end }}`);
      // Cursor on "else" tag (line 2)
      const highlights = provider.provideDocumentHighlights(doc, Position.create(2, 5));
      expect(highlights).not.toBeNull();
      expect(highlights!.length).toBe(3);
      expect(highlights![0].range.start.line).toBe(0); // if
      expect(highlights![1].range.start.line).toBe(2); // else
      expect(highlights![2].range.start.line).toBe(4); // end
    });
  });
});
