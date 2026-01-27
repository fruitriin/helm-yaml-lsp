import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
	findAllTemplateReferences,
	findDefineBlocks,
	findTemplateReferenceAtPosition,
	hasHelmTemplateDefinitions,
} from '@/features/helmTemplateFeatures';
import { Position } from 'vscode-languageserver-types';

describe('Helm Template Features', () => {
	describe('findDefineBlocks', () => {
		it('should find simple define block', () => {
			const content = `
{{- define "mychart.name" -}}
{{ .Chart.Name }}
{{- end -}}
`;
			const doc = TextDocument.create('file:///test.tpl', 'yaml', 1, content);

			const definitions = findDefineBlocks(doc);

			expect(definitions).toHaveLength(1);
			expect(definitions[0].name).toBe('mychart.name');
			expect(definitions[0].content).toContain('.Chart.Name');
		});

		it('should find multiple define blocks', () => {
			const content = `
{{ define "mychart.name" }}
{{ .Chart.Name }}
{{ end }}

{{ define "mychart.fullname" }}
{{ .Chart.Name }}-{{ .Release.Name }}
{{ end }}
`;
			const doc = TextDocument.create('file:///test.tpl', 'yaml', 1, content);

			const definitions = findDefineBlocks(doc);

			expect(definitions).toHaveLength(2);
			expect(definitions[0].name).toBe('mychart.name');
			expect(definitions[1].name).toBe('mychart.fullname');
		});

		it('should extract description from comments', () => {
			const content = `
{{/*
Generate full name
*/}}
{{ define "mychart.fullname" }}
{{ .Chart.Name }}
{{ end }}
`;
			const doc = TextDocument.create('file:///test.tpl', 'yaml', 1, content);

			const definitions = findDefineBlocks(doc);

			expect(definitions).toHaveLength(1);
			expect(definitions[0].description).toContain('Generate full name');
		});

		it('should handle nested define blocks', () => {
			const content = `
{{ define "outer" }}
  {{ define "inner" }}
  content
  {{ end }}
{{ end }}
`;
			const doc = TextDocument.create('file:///test.tpl', 'yaml', 1, content);

			const definitions = findDefineBlocks(doc);

			expect(definitions.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('findAllTemplateReferences', () => {
		it('should find include references', () => {
			const content = 'name: {{ include "mychart.name" . }}';
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			const references = findAllTemplateReferences(doc);

			expect(references).toHaveLength(1);
			expect(references[0].type).toBe('include');
			expect(references[0].templateName).toBe('mychart.name');
		});

		it('should find template references', () => {
			const content = 'name: {{ template "mychart.name" . }}';
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			const references = findAllTemplateReferences(doc);

			expect(references).toHaveLength(1);
			expect(references[0].type).toBe('template');
			expect(references[0].templateName).toBe('mychart.name');
		});

		it('should find multiple references', () => {
			const content = `
labels:
  {{- include "mychart.labels" . | nindent 4 }}
name: {{ template "mychart.name" . }}
`;
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			const references = findAllTemplateReferences(doc);

			expect(references).toHaveLength(2);
			expect(references[0].templateName).toBe('mychart.labels');
			expect(references[1].templateName).toBe('mychart.name');
		});

		it('should handle references with pipes', () => {
			const content = '{{ include "mychart.labels" . | indent 4 }}';
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			const references = findAllTemplateReferences(doc);

			expect(references).toHaveLength(1);
			expect(references[0].templateName).toBe('mychart.labels');
		});
	});

	describe('findTemplateReferenceAtPosition', () => {
		it('should find reference at cursor position', () => {
			const content = '{{ include "mychart.name" . }}';
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const position = Position.create(0, 15); // 引用符の中

			const ref = findTemplateReferenceAtPosition(doc, position);

			expect(ref).toBeDefined();
			expect(ref?.templateName).toBe('mychart.name');
		});

		it('should return undefined when not on reference', () => {
			const content = 'name: test';
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
			const position = Position.create(0, 0);

			const ref = findTemplateReferenceAtPosition(doc, position);

			expect(ref).toBeUndefined();
		});
	});

	describe('hasHelmTemplateDefinitions', () => {
		it('should detect documents with define blocks', () => {
			const content = '{{ define "mychart.name" }}test{{ end }}';
			const doc = TextDocument.create('file:///test.tpl', 'yaml', 1, content);

			expect(hasHelmTemplateDefinitions(doc)).toBe(true);
		});

		it('should detect documents without define blocks', () => {
			const content = 'name: {{ .Values.name }}';
			const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

			expect(hasHelmTemplateDefinitions(doc)).toBe(false);
		});
	});
});
