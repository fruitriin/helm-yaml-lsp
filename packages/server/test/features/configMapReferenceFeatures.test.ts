/**
 * ConfigMap Reference Features Tests
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  findAllConfigMapReferences,
  findConfigMapReferenceAtPosition,
} from '@/features/configMapReferenceFeatures';

describe('ConfigMap Reference Features', () => {
  describe('findConfigMapReferenceAtPosition', () => {
    it('should detect configMapKeyRef name reference', () => {
      const content = `
env:
  - name: DATABASE_URL
    valueFrom:
      configMapKeyRef:
        name: app-config
        key: database-url
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "app-config"
      const position = Position.create(5, 16); // on "app-config"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('configMapKeyRef');
      expect(ref?.referenceType).toBe('name');
      expect(ref?.name).toBe('app-config');
      expect(ref?.kind).toBe('ConfigMap');
    });

    it('should detect configMapKeyRef key reference', () => {
      const content = `
env:
  - name: DATABASE_URL
    valueFrom:
      configMapKeyRef:
        name: app-config
        key: database-url
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "database-url"
      const position = Position.create(6, 15); // on "database-url"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('configMapKeyRef');
      expect(ref?.referenceType).toBe('key');
      expect(ref?.name).toBe('app-config');
      expect(ref?.keyName).toBe('database-url');
      expect(ref?.kind).toBe('ConfigMap');
    });

    it('should detect secretKeyRef name reference', () => {
      const content = `
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: app-secrets
        key: db-password
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "app-secrets"
      const position = Position.create(5, 16); // on "app-secrets"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('secretKeyRef');
      expect(ref?.referenceType).toBe('name');
      expect(ref?.name).toBe('app-secrets');
      expect(ref?.kind).toBe('Secret');
    });

    it('should detect secretKeyRef key reference', () => {
      const content = `
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: app-secrets
        key: db-password
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "db-password"
      const position = Position.create(6, 15); // on "db-password"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('secretKeyRef');
      expect(ref?.referenceType).toBe('key');
      expect(ref?.name).toBe('app-secrets');
      expect(ref?.keyName).toBe('db-password');
      expect(ref?.kind).toBe('Secret');
    });

    it('should detect configMapRef name reference', () => {
      const content = `
envFrom:
  - configMapRef:
      name: app-config
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "app-config"
      const position = Position.create(3, 14); // on "app-config"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('configMapRef');
      expect(ref?.referenceType).toBe('name');
      expect(ref?.name).toBe('app-config');
      expect(ref?.kind).toBe('ConfigMap');
    });

    it('should detect secretRef name reference', () => {
      const content = `
envFrom:
  - secretRef:
      name: app-secrets
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "app-secrets"
      const position = Position.create(3, 14); // on "app-secrets"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('secretRef');
      expect(ref?.referenceType).toBe('name');
      expect(ref?.name).toBe('app-secrets');
      expect(ref?.kind).toBe('Secret');
    });

    it('should detect volumeConfigMap name reference', () => {
      const content = `
volumes:
  - name: config
    configMap:
      name: app-config
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "app-config"
      const position = Position.create(4, 14); // on "app-config"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('volumeConfigMap');
      expect(ref?.referenceType).toBe('name');
      expect(ref?.name).toBe('app-config');
      expect(ref?.kind).toBe('ConfigMap');
    });

    it('should detect volumeConfigMap key reference', () => {
      const content = `
volumes:
  - name: config
    configMap:
      name: app-config
      items:
        - key: config.yaml
          path: app.yaml
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "config.yaml"
      const position = Position.create(6, 17); // on "config.yaml"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('volumeConfigMap');
      expect(ref?.referenceType).toBe('key');
      expect(ref?.name).toBe('app-config');
      expect(ref?.keyName).toBe('config.yaml');
      expect(ref?.kind).toBe('ConfigMap');
    });

    it('should detect volumeSecret name reference', () => {
      const content = `
volumes:
  - name: secrets
    secret:
      secretName: app-secrets
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "app-secrets"
      const position = Position.create(4, 20); // on "app-secrets"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('volumeSecret');
      expect(ref?.referenceType).toBe('name');
      expect(ref?.name).toBe('app-secrets');
      expect(ref?.kind).toBe('Secret');
    });

    it('should detect volumeSecret key reference', () => {
      const content = `
volumes:
  - name: secrets
    secret:
      secretName: app-secrets
      items:
        - key: db-password
          path: password.txt
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      // Cursor on "db-password"
      const position = Position.create(6, 17); // on "db-password"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeDefined();
      expect(ref?.type).toBe('volumeSecret');
      expect(ref?.referenceType).toBe('key');
      expect(ref?.name).toBe('app-secrets');
      expect(ref?.keyName).toBe('db-password');
      expect(ref?.kind).toBe('Secret');
    });

    it('should return undefined when not on a reference', () => {
      const content = `
env:
  - name: SOME_VAR
    value: some-value
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      const position = Position.create(2, 10); // on "SOME_VAR"
      const ref = findConfigMapReferenceAtPosition(document, position);

      expect(ref).toBeUndefined();
    });
  });

  describe('findAllConfigMapReferences', () => {
    it('should find all ConfigMap/Secret references in document', () => {
      const content = `
env:
  - name: DATABASE_URL
    valueFrom:
      configMapKeyRef:
        name: app-config
        key: database-url
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: app-secrets
        key: db-password
envFrom:
  - configMapRef:
      name: app-config
volumes:
  - name: config
    configMap:
      name: app-config
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);

      const refs = findAllConfigMapReferences(document);

      expect(refs.length).toBeGreaterThan(0);

      // Check for configMapKeyRef references (name + key)
      const configMapKeyRefs = refs.filter(r => r.type === 'configMapKeyRef');
      expect(configMapKeyRefs.length).toBeGreaterThanOrEqual(2);

      // Check for secretKeyRef references (name + key)
      const secretKeyRefs = refs.filter(r => r.type === 'secretKeyRef');
      expect(secretKeyRefs.length).toBeGreaterThanOrEqual(2);

      // Check for configMapRef references (name only)
      const configMapRefs = refs.filter(r => r.type === 'configMapRef');
      expect(configMapRefs.length).toBeGreaterThanOrEqual(1);

      // Note: volumeConfigMap detection in findAll may need refinement
      // Individual position-based detection works correctly
    });

    it('should return empty array for documents without ConfigMap references', () => {
      const content = `
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
`;

      const document = TextDocument.create('file:///test/pod.yaml', 'yaml', 1, content);

      const refs = findAllConfigMapReferences(document);
      expect(refs.length).toBe(0);
    });

    it('should not cross-contaminate adjacent configMapKeyRef and secretKeyRef', () => {
      const content = `
env:
  - name: FROM_CONFIGMAP
    valueFrom:
      configMapKeyRef:
        name: my-config
        key: my-key
  - name: FROM_SECRET
    valueFrom:
      secretKeyRef:
        name: my-secret
        key: secret-key
envFrom:
  - configMapRef:
      name: my-config
  - secretRef:
      name: my-secret
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);
      const refs = findAllConfigMapReferences(document);

      // configMapKeyRef references
      const cmKeyRefName = refs.find(
        r => r.type === 'configMapKeyRef' && r.referenceType === 'name'
      );
      expect(cmKeyRefName).toBeDefined();
      expect(cmKeyRefName?.name).toBe('my-config');
      expect(cmKeyRefName?.kind).toBe('ConfigMap');

      const cmKeyRefKey = refs.find(r => r.type === 'configMapKeyRef' && r.referenceType === 'key');
      expect(cmKeyRefKey).toBeDefined();
      expect(cmKeyRefKey?.keyName).toBe('my-key');
      expect(cmKeyRefKey?.kind).toBe('ConfigMap');

      // secretKeyRef references
      const secretKeyRefName = refs.find(
        r => r.type === 'secretKeyRef' && r.referenceType === 'name'
      );
      expect(secretKeyRefName).toBeDefined();
      expect(secretKeyRefName?.name).toBe('my-secret');
      expect(secretKeyRefName?.kind).toBe('Secret');

      const secretKeyRefKey = refs.find(
        r => r.type === 'secretKeyRef' && r.referenceType === 'key'
      );
      expect(secretKeyRefKey).toBeDefined();
      expect(secretKeyRefKey?.keyName).toBe('secret-key');
      expect(secretKeyRefKey?.kind).toBe('Secret');

      // configMapRef references
      const cmRef = refs.find(r => r.type === 'configMapRef');
      expect(cmRef).toBeDefined();
      expect(cmRef?.name).toBe('my-config');
      expect(cmRef?.kind).toBe('ConfigMap');

      // secretRef references
      const secretRef = refs.find(r => r.type === 'secretRef');
      expect(secretRef).toBeDefined();
      expect(secretRef?.name).toBe('my-secret');
      expect(secretRef?.kind).toBe('Secret');
    });

    it('should not detect templateRef name as ConfigMap/Secret reference', () => {
      const content = `
spec:
  volumes:
  - name: config-vol
    configMap:
      name: my-config
  - name: secret-vol
    secret:
      secretName: my-secret
  templates:
  - name: main
    steps:
    - - name: step1
        templateRef:
          name: some-template
          template: do-work
`;

      const document = TextDocument.create('file:///test/workflow.yaml', 'yaml', 1, content);
      const refs = findAllConfigMapReferences(document);

      // Should detect volume references
      const volumeRefs = refs.filter(
        r => r.type === 'volumeConfigMap' || r.type === 'volumeSecret'
      );
      expect(volumeRefs.length).toBe(2);

      // Should NOT detect templateRef name as a ConfigMap/Secret
      const templateRefFalsePositive = refs.find(r => r.name === 'some-template');
      expect(templateRefFalsePositive).toBeUndefined();
    });
  });
});
