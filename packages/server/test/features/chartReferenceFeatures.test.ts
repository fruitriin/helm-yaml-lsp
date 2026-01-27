/**
 * Chart Reference Features Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  findChartReference,
  findAllChartReferences,
  extractChartPathForCompletion,
} from '../../src/features/chartReferenceFeatures';

describe('chartReferenceFeatures', () => {
  describe('findChartReference', () => {
    it('should find Chart.Name reference', () => {
      const content = '  name: {{ .Chart.Name }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 19); // ".Chart.Name"のName部分

      const ref = findChartReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.variableName).toBe('Name');
      expect(ref?.fullPath).toBe('.Chart.Name');
    });

    it('should find Chart.Version reference', () => {
      const content = 'version: {{ .Chart.Version }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 21); // "Version"の位置

      const ref = findChartReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.variableName).toBe('Version');
      expect(ref?.fullPath).toBe('.Chart.Version');
    });

    it('should find Chart.AppVersion reference', () => {
      const content = 'appVersion: {{ .Chart.AppVersion }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 25); // "AppVersion"の位置

      const ref = findChartReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.variableName).toBe('AppVersion');
      expect(ref?.fullPath).toBe('.Chart.AppVersion');
    });

    it('should return undefined when cursor is not on Chart reference', () => {
      const content = '  name: {{ .Values.name }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 15); // ".Values"の位置

      const ref = findChartReference(document, position);
      expect(ref).toBeUndefined();
    });

    it('should work with trimmed whitespace syntax', () => {
      const content = '{{- .Chart.Name -}}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 12); // "Name"の位置

      const ref = findChartReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.variableName).toBe('Name');
    });

    it('should extract full expression', () => {
      const content = 'name: {{ .Chart.Name }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 17); // "Name"の位置

      const ref = findChartReference(document, position);
      expect(ref?.fullExpression).toContain('.Chart.Name');
      expect(ref?.fullExpression).toContain('{{');
      expect(ref?.fullExpression).toContain('}}');
    });
  });

  describe('findAllChartReferences', () => {
    it('should find multiple Chart references in a document', () => {
      const content = `apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Chart.Name }}
  version: {{ .Chart.Version }}
  description: {{ .Chart.Description }}
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllChartReferences(document);
      expect(refs.length).toBeGreaterThanOrEqual(3);

      const variableNames = refs.map(r => r.variableName);
      expect(variableNames).toContain('Name');
      expect(variableNames).toContain('Version');
      expect(variableNames).toContain('Description');
    });

    it('should return empty array for document without Chart references', () => {
      const content = `apiVersion: v1
kind: ConfigMap
data:
  name: {{ .Values.name }}
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllChartReferences(document);
      expect(refs.length).toBe(0);
    });

    it('should work with multiple references on same line', () => {
      const content = 'label: {{ .Chart.Name }}-{{ .Chart.Version }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllChartReferences(document);
      expect(refs.length).toBe(2);
      expect(refs[0].variableName).toBe('Name');
      expect(refs[1].variableName).toBe('Version');
    });
  });

  describe('chart reference properties', () => {
    it('should have correct range', () => {
      const content = '{{ .Chart.Name }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 11); // "Name"の位置

      const ref = findChartReference(document, position);
      expect(ref?.range.start.line).toBe(0);
      expect(ref?.range.start.character).toBe(10); // ".Chart.".length = 7 + "{{ ".length = 3
      expect(ref?.range.end.character).toBe(14); // start + "Name".length
    });

    it('should extract variable name correctly', () => {
      const content = '{{ .Chart.ApiVersion }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 15);

      const ref = findChartReference(document, position);
      expect(ref?.variableName).toBe('ApiVersion');
      expect(ref?.fullPath).toBe('.Chart.ApiVersion');
    });
  });

  describe('extractChartPathForCompletion', () => {
    it('should extract empty path after .Chart.', () => {
      const content = '{{ .Chart.';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 10); // ".Chart."の直後

      const path = extractChartPathForCompletion(document, position);
      expect(path).toBe('');
    });

    it('should extract partial variable name', () => {
      const content = '{{ .Chart.Ver';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 13); // "Ver"の後

      const path = extractChartPathForCompletion(document, position);
      expect(path).toBe('Ver');
    });

    it('should extract partial name with lowercase', () => {
      const content = '{{ .Chart.app';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 13);

      const path = extractChartPathForCompletion(document, position);
      expect(path).toBe('app');
    });

    it('should return undefined when not in Chart context', () => {
      const content = '{{ .Values.';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 11);

      const path = extractChartPathForCompletion(document, position);
      expect(path).toBeUndefined();
    });

    it('should work with trimmed whitespace', () => {
      const content = '{{- .Chart.N';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 12);

      const path = extractChartPathForCompletion(document, position);
      expect(path).toBe('N');
    });
  });
});
