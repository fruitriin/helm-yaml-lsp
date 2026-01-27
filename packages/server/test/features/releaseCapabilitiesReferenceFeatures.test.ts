/**
 * Release and Capabilities Reference Features Test
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  findReleaseCapabilitiesReference,
  findAllReleaseCapabilitiesReferences,
  extractReleaseCapabilitiesPathForCompletion,
} from '../../src/features/releaseCapabilitiesReferenceFeatures';

describe('releaseCapabilitiesReferenceFeatures', () => {
  describe('findReleaseCapabilitiesReference - Release variables', () => {
    it('should find Release.Name reference', () => {
      const content = '  name: {{ .Release.Name }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 21); // "Name"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.type).toBe('release');
      expect(ref?.variableName).toBe('Name');
      expect(ref?.fullPath).toBe('.Release.Name');
    });

    it('should find Release.Namespace reference', () => {
      const content = 'namespace: {{ .Release.Namespace }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 26); // "Namespace"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.type).toBe('release');
      expect(ref?.variableName).toBe('Namespace');
    });

    it('should find Release.IsUpgrade reference', () => {
      const content = '{{ if .Release.IsUpgrade }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 18); // "IsUpgrade"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.type).toBe('release');
      expect(ref?.variableName).toBe('IsUpgrade');
    });
  });

  describe('findReleaseCapabilitiesReference - Capabilities variables', () => {
    it('should find Capabilities.KubeVersion reference', () => {
      const content = 'version: {{ .Capabilities.KubeVersion }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 30); // "KubeVersion"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.type).toBe('capabilities');
      expect(ref?.variableName).toBe('KubeVersion');
      expect(ref?.fullPath).toBe('.Capabilities.KubeVersion');
    });

    it('should find Capabilities.APIVersions reference', () => {
      const content = '{{ .Capabilities.APIVersions }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 20); // "APIVersions"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.type).toBe('capabilities');
      expect(ref?.variableName).toBe('APIVersions');
    });

    it('should find nested Capabilities.KubeVersion.Version reference', () => {
      const content = '{{ .Capabilities.KubeVersion.Version }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 32); // "KubeVersion.Version"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.type).toBe('capabilities');
      expect(ref?.variableName).toBe('KubeVersion.Version');
    });
  });

  describe('findReleaseCapabilitiesReference - edge cases', () => {
    it('should return undefined when cursor is not on reference', () => {
      const content = '  name: {{ .Values.name }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 15); // ".Values"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeUndefined();
    });

    it('should work with trimmed whitespace syntax', () => {
      const content = '{{- .Release.Name -}}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 14); // "Name"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref).toBeDefined();
      expect(ref?.variableName).toBe('Name');
    });

    it('should extract full expression', () => {
      const content = 'name: {{ .Release.Name }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 19); // "Name"の位置

      const ref = findReleaseCapabilitiesReference(document, position);
      expect(ref?.fullExpression).toContain('.Release.Name');
      expect(ref?.fullExpression).toContain('{{');
      expect(ref?.fullExpression).toContain('}}');
    });
  });

  describe('findAllReleaseCapabilitiesReferences', () => {
    it('should find multiple references in a document', () => {
      const content = `apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
data:
  kubeVersion: {{ .Capabilities.KubeVersion }}
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllReleaseCapabilitiesReferences(document);
      expect(refs.length).toBeGreaterThanOrEqual(3);

      const releaseRefs = refs.filter(r => r.type === 'release');
      const capabilitiesRefs = refs.filter(r => r.type === 'capabilities');

      expect(releaseRefs.length).toBe(2);
      expect(capabilitiesRefs.length).toBe(1);
    });

    it('should return empty array for document without references', () => {
      const content = `apiVersion: v1
kind: ConfigMap
data:
  name: {{ .Values.name }}
`;
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllReleaseCapabilitiesReferences(document);
      expect(refs.length).toBe(0);
    });

    it('should work with multiple references on same line', () => {
      const content = 'label: {{ .Release.Name }}-{{ .Release.Namespace }}';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);

      const refs = findAllReleaseCapabilitiesReferences(document);
      expect(refs.length).toBe(2);
      expect(refs[0].variableName).toBe('Name');
      expect(refs[1].variableName).toBe('Namespace');
    });
  });

  describe('extractReleaseCapabilitiesPathForCompletion', () => {
    it('should extract empty path after .Release.', () => {
      const content = '{{ .Release.';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 12); // ".Release."の直後

      const path = extractReleaseCapabilitiesPathForCompletion(document, position);
      expect(path).toBeDefined();
      expect(path?.type).toBe('release');
      expect(path?.partialName).toBe('');
    });

    it('should extract partial Release variable name', () => {
      const content = '{{ .Release.Nam';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 15); // "Nam"の後

      const path = extractReleaseCapabilitiesPathForCompletion(document, position);
      expect(path).toBeDefined();
      expect(path?.type).toBe('release');
      expect(path?.partialName).toBe('Nam');
    });

    it('should extract empty path after .Capabilities.', () => {
      const content = '{{ .Capabilities.';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 17); // ".Capabilities."の直後

      const path = extractReleaseCapabilitiesPathForCompletion(document, position);
      expect(path).toBeDefined();
      expect(path?.type).toBe('capabilities');
      expect(path?.partialName).toBe('');
    });

    it('should extract partial Capabilities variable name', () => {
      const content = '{{ .Capabilities.Kube';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 21); // "Kube"の後

      const path = extractReleaseCapabilitiesPathForCompletion(document, position);
      expect(path).toBeDefined();
      expect(path?.type).toBe('capabilities');
      expect(path?.partialName).toBe('Kube');
    });

    it('should return undefined when not in Release/Capabilities context', () => {
      const content = '{{ .Values.';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 11);

      const path = extractReleaseCapabilitiesPathForCompletion(document, position);
      expect(path).toBeUndefined();
    });

    it('should work with trimmed whitespace', () => {
      const content = '{{- .Release.N';
      const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
      const position = Position.create(0, 14);

      const path = extractReleaseCapabilitiesPathForCompletion(document, position);
      expect(path).toBeDefined();
      expect(path?.type).toBe('release');
      expect(path?.partialName).toBe('N');
    });
  });
});
