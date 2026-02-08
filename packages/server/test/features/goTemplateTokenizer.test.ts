import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { tokenizeGoTemplateExpressions } from '@/features/goTemplateTokenizer';

// Token type indices
const KEYWORD = 0;
const FUNCTION = 1;
const VARIABLE = 2;
const PROPERTY = 3;
const STRING = 4;
const NUMBER = 5;
const COMMENT = 6;
const OPERATOR = 7;

// Token modifier bitmasks
const MOD_READONLY = 2;
const MOD_DEFAULT_LIBRARY = 4;

function makeDoc(content: string): TextDocument {
  return TextDocument.create('file:///test.yaml', 'yaml', 1, content);
}

describe('goTemplateTokenizer', () => {
  describe('tokenizeGoTemplateExpressions', () => {
    it('should return empty array for plain YAML', () => {
      const doc = makeDoc('apiVersion: v1\nkind: Service\n');
      const tokens = tokenizeGoTemplateExpressions(doc);
      expect(tokens).toEqual([]);
    });

    it('should return empty array for empty document', () => {
      const doc = makeDoc('');
      const tokens = tokenizeGoTemplateExpressions(doc);
      expect(tokens).toEqual([]);
    });

    it('should tokenize simple keyword: {{ if .Values.enabled }}', () => {
      const doc = makeDoc('{{ if .Values.enabled }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(4);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR, character: 0, length: 2 });
      // if
      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD, character: 3, length: 2 });
      // .Values.enabled
      expect(tokens[2]).toMatchObject({
        tokenType: PROPERTY,
        character: 6,
        length: 15,
        tokenModifiers: 0,
      });
      // }}
      expect(tokens[3]).toMatchObject({ tokenType: OPERATOR, character: 22, length: 2 });
    });

    it('should tokenize comment: {{/* this is a comment */}}', () => {
      const doc = makeDoc('{{/* this is a comment */}}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(3);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR, character: 0, length: 2 });
      // /* this is a comment */ (content between {{ and }} is "/* this is a comment */", length 23)
      expect(tokens[1]).toMatchObject({ tokenType: COMMENT, character: 2, length: 23 });
      // }}
      expect(tokens[2]).toMatchObject({ tokenType: OPERATOR, character: 25, length: 2 });
    });

    it('should tokenize pipe: {{ .Values.name | quote }}', () => {
      const doc = makeDoc('{{ .Values.name | quote }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(5);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // .Values.name
      expect(tokens[1]).toMatchObject({
        tokenType: PROPERTY,
        character: 3,
        length: 12,
        tokenModifiers: 0,
      });
      // |
      expect(tokens[2]).toMatchObject({ tokenType: OPERATOR, character: 16, length: 1 });
      // quote
      expect(tokens[3]).toMatchObject({
        tokenType: FUNCTION,
        tokenModifiers: MOD_DEFAULT_LIBRARY,
        character: 18,
        length: 5,
      });
      // }}
      expect(tokens[4]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should tokenize string literal: {{ include "mychart.labels" . }}', () => {
      const doc = makeDoc('{{ include "mychart.labels" . }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(5);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // include
      expect(tokens[1]).toMatchObject({
        tokenType: FUNCTION,
        tokenModifiers: MOD_DEFAULT_LIBRARY,
        length: 7,
      });
      // "mychart.labels"
      expect(tokens[2]).toMatchObject({ tokenType: STRING, character: 11, length: 16 });
      // .
      expect(tokens[3]).toMatchObject({ tokenType: PROPERTY, character: 28, length: 1 });
      // }}
      expect(tokens[4]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should tokenize variable: {{ $var := .Values.name }}', () => {
      const doc = makeDoc('{{ $var := .Values.name }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(5);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // $var
      expect(tokens[1]).toMatchObject({ tokenType: VARIABLE, character: 3, length: 4 });
      // :=
      expect(tokens[2]).toMatchObject({ tokenType: OPERATOR, character: 8, length: 2 });
      // .Values.name
      expect(tokens[3]).toMatchObject({ tokenType: PROPERTY, character: 11, length: 12 });
      // }}
      expect(tokens[4]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should tokenize number: {{ gt .Values.count 1 }}', () => {
      const doc = makeDoc('{{ gt .Values.count 1 }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(5);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // gt (known function)
      expect(tokens[1]).toMatchObject({
        tokenType: FUNCTION,
        tokenModifiers: MOD_DEFAULT_LIBRARY,
        length: 2,
      });
      // .Values.count
      expect(tokens[2]).toMatchObject({ tokenType: PROPERTY });
      // 1
      expect(tokens[3]).toMatchObject({ tokenType: NUMBER, character: 20, length: 1 });
      // }}
      expect(tokens[4]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should apply readonly modifier to .Release and .Capabilities', () => {
      const doc = makeDoc('{{ .Release.Name }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(3);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // .Release.Name
      expect(tokens[1]).toMatchObject({
        tokenType: PROPERTY,
        tokenModifiers: MOD_READONLY,
        character: 3,
        length: 13,
      });
      // }}
      expect(tokens[2]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should apply readonly modifier to .Capabilities', () => {
      const doc = makeDoc('{{ .Capabilities.APIVersions }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      const prop = tokens.find(t => t.tokenType === PROPERTY);
      expect(prop).toBeDefined();
      expect(prop?.tokenModifiers).toBe(MOD_READONLY);
    });

    it('should tokenize whitespace trim: {{- if .Values.x -}}', () => {
      const doc = makeDoc('{{- if .Values.x -}}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(4);
      // {{-
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR, character: 0, length: 3 });
      // if
      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD });
      // .Values.x
      expect(tokens[2]).toMatchObject({ tokenType: PROPERTY });
      // -}}
      expect(tokens[3]).toMatchObject({ tokenType: OPERATOR, length: 3 });
    });

    it('should tokenize multiple blocks on one line', () => {
      const doc = makeDoc('{{ .Values.a }} - {{ .Values.b }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      // First block: {{ .Values.a }}
      // Second block: {{ .Values.b }}
      const properties = tokens.filter(t => t.tokenType === PROPERTY);
      expect(properties.length).toBe(2);
      expect(properties[0]).toMatchObject({ character: 3, length: 9 });
      expect(properties[1]).toMatchObject({ character: 21, length: 9 });
    });

    it('should tokenize else if: {{ else if .Values.x }}', () => {
      const doc = makeDoc('{{ else if .Values.x }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(5);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // else
      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD, character: 3, length: 4 });
      // if
      expect(tokens[2]).toMatchObject({ tokenType: KEYWORD, character: 8, length: 2 });
      // .Values.x
      expect(tokens[3]).toMatchObject({ tokenType: PROPERTY });
      // }}
      expect(tokens[4]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should tokenize dot only: {{ . }}', () => {
      const doc = makeDoc('{{ . }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(3);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // .
      expect(tokens[1]).toMatchObject({ tokenType: PROPERTY, character: 3, length: 1 });
      // }}
      expect(tokens[2]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should tokenize complex expression: {{- if and .Values.enabled (gt .Values.replicas 1) -}}', () => {
      const doc = makeDoc('{{- if and .Values.enabled (gt .Values.replicas 1) -}}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      // {{-  if  and  .Values.enabled  gt  .Values.replicas  1  -}}
      const types = tokens.map(t => t.tokenType);
      expect(types).toEqual([
        OPERATOR, // {{-
        KEYWORD, // if
        FUNCTION, // and
        PROPERTY, // .Values.enabled
        FUNCTION, // gt
        PROPERTY, // .Values.replicas
        NUMBER, // 1
        OPERATOR, // -}}
      ]);
    });

    it('should tokenize define with string: {{ define "mychart.labels" }}', () => {
      const doc = makeDoc('{{ define "mychart.labels" }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(4);
      // {{
      expect(tokens[0]).toMatchObject({ tokenType: OPERATOR });
      // define
      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD, length: 6 });
      // "mychart.labels"
      expect(tokens[2]).toMatchObject({ tokenType: STRING, length: 16 });
      // }}
      expect(tokens[3]).toMatchObject({ tokenType: OPERATOR });
    });

    it('should handle escaped quotes in strings', () => {
      const doc = makeDoc('{{ "hello \\"world\\"" }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      const stringToken = tokens.find(t => t.tokenType === STRING);
      expect(stringToken).toBeDefined();
      expect(stringToken?.length).toBe(17); // "hello \"world\""
    });

    it('should handle bare $ as variable', () => {
      const doc = makeDoc('{{ range $key, $val := .Values.items }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      const vars = tokens.filter(t => t.tokenType === VARIABLE);
      expect(vars.length).toBe(2);
      expect(vars[0]).toMatchObject({ length: 4 }); // $key
      expect(vars[1]).toMatchObject({ length: 4 }); // $val
    });

    it('should treat template as keyword when not after pipe', () => {
      const doc = makeDoc('{{ template "mychart.labels" . }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      // template should be keyword here
      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD, length: 8 });
    });

    it('should treat template as function after pipe', () => {
      const doc = makeDoc('{{ .Values.data | template }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      const templateToken = tokens.find(t => t.character === 18 && t.tokenType === FUNCTION);
      expect(templateToken).toBeDefined();
    });

    it('should handle multiline document', () => {
      const doc = makeDoc(
        'apiVersion: v1\nname: {{ .Values.name }}\nlabels:\n  app: {{ .Values.app }}'
      );
      const tokens = tokenizeGoTemplateExpressions(doc);

      // Line 1: {{ .Values.name }}
      const line1Tokens = tokens.filter(t => t.line === 1);
      expect(line1Tokens.length).toBe(3);

      // Line 3: {{ .Values.app }}
      const line3Tokens = tokens.filter(t => t.line === 3);
      expect(line3Tokens.length).toBe(3);
    });

    it('should tokenize .Chart as property without readonly', () => {
      const doc = makeDoc('{{ .Chart.Name }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      const prop = tokens.find(t => t.tokenType === PROPERTY);
      expect(prop).toBeDefined();
      expect(prop?.tokenModifiers).toBe(0); // not readonly
    });

    it('should sort tokens by (line, character)', () => {
      const doc = makeDoc('{{ .Values.a }}\n{{ .Values.b }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      for (let i = 1; i < tokens.length; i++) {
        const prev = tokens[i - 1];
        const curr = tokens[i];
        const prevKey = prev.line * 10000 + prev.character;
        const currKey = curr.line * 10000 + curr.character;
        expect(currKey).toBeGreaterThan(prevKey);
      }
    });

    it('should tokenize end keyword', () => {
      const doc = makeDoc('{{ end }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens.length).toBe(3);
      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD, character: 3, length: 3 });
    });

    it('should tokenize range with variable assignment', () => {
      const doc = makeDoc('{{ range $i, $v := .Values.list }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      const types = tokens.map(t => t.tokenType);
      expect(types).toEqual([
        OPERATOR, // {{
        KEYWORD, // range
        VARIABLE, // $i
        VARIABLE, // $v
        OPERATOR, // :=
        PROPERTY, // .Values.list
        OPERATOR, // }}
      ]);
    });

    it('should handle block keyword', () => {
      const doc = makeDoc('{{ block "title" . }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD, length: 5 }); // block
      expect(tokens[2]).toMatchObject({ tokenType: STRING }); // "title"
      expect(tokens[3]).toMatchObject({ tokenType: PROPERTY, length: 1 }); // .
    });

    it('should handle with keyword', () => {
      const doc = makeDoc('{{ with .Values.ingress }}');
      const tokens = tokenizeGoTemplateExpressions(doc);

      expect(tokens[1]).toMatchObject({ tokenType: KEYWORD, length: 4 }); // with
      expect(tokens[2]).toMatchObject({ tokenType: PROPERTY }); // .Values.ingress
    });
  });
});
