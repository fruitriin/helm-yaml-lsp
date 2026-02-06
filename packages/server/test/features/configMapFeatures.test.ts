/**
 * ConfigMap Features Tests
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findConfigMapDefinitions } from '@/features/configMapFeatures';

describe('ConfigMap Features', () => {
  describe('findConfigMapDefinitions', () => {
    it('should detect ConfigMap definition', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: argo
data:
  database-url: "postgresql://localhost:5432/mydb"
  api-endpoint: "https://api.example.com"
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions.length).toBe(1);
      expect(definitions[0].name).toBe('app-config');
      expect(definitions[0].kind).toBe('ConfigMap');
      expect(definitions[0].keys.length).toBe(2);
      expect(definitions[0].keys[0].keyName).toBe('database-url');
      expect(definitions[0].keys[1].keyName).toBe('api-endpoint');
    });

    it('should detect Secret definition', () => {
      const content = `
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: argo
type: Opaque
data:
  db-password: cGFzc3dvcmQxMjM=
`;

      const document = TextDocument.create('file:///test/secret.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions.length).toBe(1);
      expect(definitions[0].name).toBe('app-secrets');
      expect(definitions[0].kind).toBe('Secret');
      expect(definitions[0].keys.length).toBe(1);
      expect(definitions[0].keys[0].keyName).toBe('db-password');
    });

    it('should extract keys from data section', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  key1: value1
  key2: value2
  key3: value3
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions[0].keys.length).toBe(3);
      expect(definitions[0].keys.map(k => k.keyName)).toEqual(['key1', 'key2', 'key3']);
    });

    it('should extract keys from stringData section', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
stringData:
  username: admin
  password: secret
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions[0].keys.length).toBe(2);
      expect(definitions[0].keys[0].keyName).toBe('username');
      expect(definitions[0].keys[1].keyName).toBe('password');
    });

    it('should handle multiline values', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  config.yaml: |
    server:
      port: 8080
      host: 0.0.0.0
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions[0].keys.length).toBe(1);
      expect(definitions[0].keys[0].keyName).toBe('config.yaml');
      // Multiline value should be extracted
      expect(definitions[0].keys[0].value).toBeDefined();
      expect(definitions[0].keys[0].value).toContain('server:');
      expect(definitions[0].keys[0].value).toContain('port: 8080');
      expect(definitions[0].keys[0].value).toContain('host: 0.0.0.0');
    });

    it('should handle multiple keys including multiline', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  simple-key: simple-value
  config.yaml: |
    server:
      port: 8080
  another-key: another-value
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions[0].keys.length).toBe(3);
      expect(definitions[0].keys[0].keyName).toBe('simple-key');
      expect(definitions[0].keys[0].value).toBe('simple-value');
      expect(definitions[0].keys[1].keyName).toBe('config.yaml');
      expect(definitions[0].keys[1].value).toContain('server:');
      expect(definitions[0].keys[2].keyName).toBe('another-key');
      expect(definitions[0].keys[2].value).toBe('another-value');
    });

    it('should handle folded multiline values (>)', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  description: >
    This is a long
    description that spans
    multiple lines
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions[0].keys.length).toBe(1);
      expect(definitions[0].keys[0].keyName).toBe('description');
      expect(definitions[0].keys[0].value).toBeDefined();
      expect(definitions[0].keys[0].value).toContain('This is a long');
      expect(definitions[0].keys[0].value).toContain('multiple lines');
    });

    it('should handle multiple definitions separated by ---', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: config1
data:
  key1: value1
---
apiVersion: v1
kind: Secret
metadata:
  name: secret1
data:
  key2: value2
`;

      const document = TextDocument.create('file:///test/multi.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions.length).toBe(2);
      expect(definitions[0].name).toBe('config1');
      expect(definitions[0].kind).toBe('ConfigMap');
      expect(definitions[1].name).toBe('secret1');
      expect(definitions[1].kind).toBe('Secret');
    });

    it('should return empty array for non-ConfigMap/Secret documents', () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: test-workflow
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions.length).toBe(0);
    });

    it('should handle empty data section', () => {
      const content = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: empty-config
data:
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      expect(definitions.length).toBe(1);
      expect(definitions[0].keys.length).toBe(0);
    });

    it('should return correct ranges for name and keys', () => {
      const content = `apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
data:
  mykey: myvalue
`;

      const document = TextDocument.create('file:///test/configmap.yaml', 'yaml', 1, content);
      const definitions = findConfigMapDefinitions(document);

      // Check name range
      expect(definitions[0].nameRange.start.line).toBe(3);
      expect(definitions[0].nameRange.start.character).toBeGreaterThan(0);

      // Check key range
      expect(definitions[0].keys[0].range.start.line).toBe(5);
      expect(definitions[0].keys[0].range.start.character).toBeGreaterThan(0);
    });
  });
});
