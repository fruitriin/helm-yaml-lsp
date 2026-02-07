/**
 * Argo Workflows LSP - Document Symbol Provider Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolKind } from 'vscode-languageserver-types';
import { DocumentSymbolProvider } from '../../src/providers/documentSymbolProvider';

describe('DocumentSymbolProvider', () => {
  const provider = new DocumentSymbolProvider();

  function createDoc(content: string, uri = 'file:///test.yaml'): TextDocument {
    return TextDocument.create(uri, 'yaml', 1, content);
  }

  describe('provideDocumentSymbols', () => {
    it('should return symbols for simple YAML document', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key1: value1
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('ConfigMap: my-config');
      expect(symbols[0].kind).toBe(SymbolKind.Class);
      expect(symbols[0].children).toBeDefined();
      expect(symbols[0].children!.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle multi-document YAML (--- separator)', () => {
      const doc = createDoc(`---
apiVersion: v1
kind: ConfigMap
metadata:
  name: config-one
---
apiVersion: v1
kind: Service
metadata:
  name: my-service
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(2);
      expect(symbols[0].name).toBe('ConfigMap: config-one');
      expect(symbols[1].name).toBe('Service: my-service');
    });

    it('should handle Helm template tags in values', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-config
data:
  key: {{ .Values.key }}
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toContain('ConfigMap');
      expect(symbols[0].kind).toBe(SymbolKind.Class);
    });

    it('should create nested symbol hierarchy', () => {
      const doc = createDoc(`apiVersion: v1
kind: ConfigMap
metadata:
  name: test
  labels:
    app: myapp
    version: v1
data:
  config: value
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(1);
      const root = symbols[0];
      expect(root.children).toBeDefined();

      // Find metadata section
      const metadata = root.children!.find(c => c.name.startsWith('metadata'));
      expect(metadata).toBeDefined();
      expect(metadata!.kind).toBe(SymbolKind.Field);
      expect(metadata!.children).toBeDefined();
      expect(metadata!.children!.length).toBeGreaterThanOrEqual(2);

      // labels should be nested under metadata
      const labels = metadata!.children!.find(c => c.name.startsWith('labels'));
      expect(labels).toBeDefined();
    });

    it('should detect kind from YAML content', () => {
      const doc = createDoc(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deploy
spec:
  replicas: 3
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('Deployment: my-deploy');
      expect(symbols[0].kind).toBe(SymbolKind.Class);
    });

    it('should handle empty document', () => {
      const doc = createDoc('');
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(0);
    });

    it('should handle YAML with only comments', () => {
      const doc = createDoc(`# This is a comment
# Another comment
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(0);
    });

    it('should assign correct SymbolKind based on context', () => {
      const doc = createDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: test-workflow
spec:
  templates:
    - name: main
      container:
        image: alpine
  arguments:
    parameters:
      - name: message
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(1);
      const root = symbols[0];
      const spec = root.children!.find(c => c.name.startsWith('spec'));
      expect(spec).toBeDefined();
      expect(spec!.kind).toBe(SymbolKind.Field);

      // templates should have Function kind
      const templates = spec!.children!.find(c => c.name.startsWith('templates'));
      expect(templates).toBeDefined();
      expect(templates!.kind).toBe(SymbolKind.Function);
    });

    it('should handle document without kind field', () => {
      const doc = createDoc(`key1: value1
key2: value2
nested:
  subkey: subvalue
`);
      const symbols = provider.provideDocumentSymbols(doc);
      // Without kind, should return flat symbols without a Class wrapper
      expect(symbols.length).toBeGreaterThan(0);
    });

    it('should handle Argo WorkflowTemplate', () => {
      const doc = createDoc(`apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-template
spec:
  templates:
    - name: hello
      container:
        image: alpine
`);
      const symbols = provider.provideDocumentSymbols(doc);
      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('WorkflowTemplate: my-template');
    });
  });
});
