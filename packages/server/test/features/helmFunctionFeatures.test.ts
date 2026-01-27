/**
 * Helm Function Features Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  findHelmFunctionReference,
  findAllHelmFunctionReferences,
} from '../../src/features/helmFunctionFeatures';

describe('helmFunctionFeatures', () => {
  describe('findHelmFunctionReference', () => {
    it('should find function in pipeline', () => {
      const content = '{{ .Values.image.tag | default "latest" }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 25); // "default"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.functionName).toBe('default');
    });

    it('should find function at start of expression', () => {
      const content = '{{ required "msg" .Values.foo }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 5); // "required"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.functionName).toBe('required');
    });

    it('should find toYaml in pipeline', () => {
      const content = '{{ .Values.config | toYaml | indent 2 }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 22); // "toYaml"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.functionName).toBe('toYaml');
    });

    it('should find indent in pipeline', () => {
      const content = '{{ .Values.config | toYaml | indent 2 }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 33); // "indent"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.functionName).toBe('indent');
    });

    it('should return undefined when cursor is not on a function', () => {
      const content = '{{ .Values.image.tag | default "latest" }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 10); // ".Values"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeUndefined();
    });

    it('should find quote function', () => {
      const content = 'name: {{ .Values.name | quote }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 26); // "quote"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.functionName).toBe('quote');
    });

    it('should not match Helm keywords', () => {
      const content = '{{ if .Values.enabled }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 4); // "if"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeUndefined();
    });

    it('should not match template/include', () => {
      const content = '{{ include "mychart.labels" . }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 5); // "include"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref).toBeUndefined();
    });
  });

  describe('findAllHelmFunctionReferences', () => {
    it('should find multiple functions in a document', () => {
      const content = `apiVersion: v1
kind: ConfigMap
data:
  tag: {{ .Values.image.tag | default "latest" }}
  name: {{ .Values.name | quote }}
  config: {{ .Values.config | toYaml | indent 2 }}
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllHelmFunctionReferences(document);
      expect(refs.length).toBeGreaterThanOrEqual(4);

      const functionNames = refs.map(r => r.functionName);
      expect(functionNames).toContain('default');
      expect(functionNames).toContain('quote');
      expect(functionNames).toContain('toYaml');
      expect(functionNames).toContain('indent');
    });

    it('should find functions with trimmed whitespace syntax', () => {
      const content = '{{- .Values.tag | default "latest" -}}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllHelmFunctionReferences(document);
      expect(refs.length).toBe(1);
      expect(refs[0].functionName).toBe('default');
    });

    it('should return empty array for document without functions', () => {
      const content = `apiVersion: v1
kind: ConfigMap
data:
  name: {{ .Values.name }}
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllHelmFunctionReferences(document);
      // .Valuesだけでは関数参照ではない
      expect(refs.length).toBe(0);
    });

    it('should handle complex pipelines', () => {
      const content = '{{ .Values.data | toJson | b64enc | quote }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllHelmFunctionReferences(document);
      expect(refs.length).toBe(3);
      expect(refs.map(r => r.functionName)).toEqual(['toJson', 'b64enc', 'quote']);
    });
  });

  describe('function reference properties', () => {
    it('should have correct range', () => {
      const content = '{{ .Values.tag | default "latest" }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 19); // "default"の位置

      const ref = findHelmFunctionReference(document, position);
      expect(ref?.range.start.line).toBe(0);
      expect(ref?.range.start.character).toBe(17);
      expect(ref?.range.end.character).toBe(24);
    });

    it('should extract full expression', () => {
      const content = '{{ .Values.tag | default "latest" }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 19);

      const ref = findHelmFunctionReference(document, position);
      expect(ref?.fullExpression).toContain('default');
      expect(ref?.fullExpression).toContain('.Values.tag');
    });
  });
});
