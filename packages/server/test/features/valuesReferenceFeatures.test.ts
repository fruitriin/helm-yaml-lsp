import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  extractValuePathForCompletion,
  findAllValuesReferences,
  findValuesReference,
  isHelmTemplate,
} from '@/features/valuesReferenceFeatures';

describe('Values Reference Features', () => {
  describe('isHelmTemplate', () => {
    it('should detect Helm template with .Values', () => {
      const content = 'image: {{ .Values.image.repository }}';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      expect(isHelmTemplate(doc)).toBe(true);
    });

    it('should detect Helm template with .Release', () => {
      const content = 'name: {{ .Release.Name }}';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      expect(isHelmTemplate(doc)).toBe(true);
    });

    it('should detect Helm template with {{-', () => {
      const content = 'image: {{- .Values.image.repository }}';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      expect(isHelmTemplate(doc)).toBe(true);
    });

    it('should not detect plain YAML', () => {
      const content = 'image: nginx:latest';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      expect(isHelmTemplate(doc)).toBe(false);
    });
  });

  describe('findValuesReference', () => {
    it('should find simple .Values reference', () => {
      const content = 'image: {{ .Values.image.repository }}';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 18); // ".Values" の位置

      const ref = findValuesReference(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.valuePath).toBe('image.repository');
    });

    it('should find .Values reference with pipe', () => {
      const content = 'tag: {{ .Values.image.tag | default "latest" }}';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 16); // ".Values" の位置

      const ref = findValuesReference(doc, position);

      expect(ref).toBeDefined();
      expect(ref?.valuePath).toBe('image.tag');
    });

    it('should return undefined when not on .Values reference', () => {
      const content = 'image: nginx';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 0);

      const ref = findValuesReference(doc, position);

      expect(ref).toBeUndefined();
    });
  });

  describe('findAllValuesReferences', () => {
    it('should find all .Values references in document', () => {
      const content = `
image: {{ .Values.image.repository }}
tag: {{ .Values.image.tag }}
replicas: {{ .Values.replicaCount }}
`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllValuesReferences(doc);

      expect(refs).toHaveLength(3);
      expect(refs[0].valuePath).toBe('image.repository');
      expect(refs[1].valuePath).toBe('image.tag');
      expect(refs[2].valuePath).toBe('replicaCount');
    });

    it('should handle nested .Values references', () => {
      const content = `{{ if .Values.enabled }}
  image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
{{ end }}`;
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllValuesReferences(doc);

      expect(refs.length).toBeGreaterThanOrEqual(3);
      const paths = refs.map(r => r.valuePath);
      expect(paths).toContain('enabled');
      expect(paths).toContain('image.repository');
      expect(paths).toContain('image.tag');
    });
  });

  describe('extractValuePathForCompletion', () => {
    it('should extract value path for completion', () => {
      const content = '{{ .Values.image.rep';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 20); // "rep" の後

      const path = extractValuePathForCompletion(doc, position);

      expect(path).toBe('image.rep');
    });

    it('should return empty string when cursor is right after .Values.', () => {
      const content = '{{ .Values.';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 11); // "." の後

      const path = extractValuePathForCompletion(doc, position);

      expect(path).toBe('');
    });

    it('should return undefined when not in .Values context', () => {
      const content = 'image: nginx';
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 7);

      const path = extractValuePathForCompletion(doc, position);

      expect(path).toBeUndefined();
    });
  });
});
