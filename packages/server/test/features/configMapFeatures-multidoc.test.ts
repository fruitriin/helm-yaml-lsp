/**
 * ConfigMap Features - Multi-document YAML Test
 *
 * Tests that findConfigMapDefinitions correctly handles
 * multiple YAML documents (separated by ---) in a single file
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findConfigMapDefinitions } from '@/features/configMapFeatures';

describe('ConfigMap Features - Multi-document YAML', () => {
	it('should find ConfigMap and Secret in multi-document YAML file', () => {
		const content = `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  app.name: "Demo Application"
  app.version: "1.0.0"

---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: default
type: Opaque
data:
  username: YWRtaW4=
  password: c2VjcmV0MTIz

---
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: demo-templates
  namespace: default
spec:
  templates:
  - name: hello
    container:
      image: busybox

---
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: demo-workflow
  namespace: default
spec:
  entrypoint: main
`;

		const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
		const definitions = findConfigMapDefinitions(document);

		// Should find exactly 2 definitions: ConfigMap and Secret
		expect(definitions.length).toBe(2);

		// Check ConfigMap
		const configMap = definitions.find((d) => d.kind === 'ConfigMap');
		expect(configMap).toBeDefined();
		expect(configMap?.name).toBe('app-config');
		expect(configMap?.keys.length).toBe(2);
		expect(configMap?.keys.map((k) => k.keyName)).toEqual(['app.name', 'app.version']);

		// Check Secret
		const secret = definitions.find((d) => d.kind === 'Secret');
		expect(secret).toBeDefined();
		expect(secret?.name).toBe('app-secrets');
		expect(secret?.keys.length).toBe(2);
		expect(secret?.keys.map((k) => k.keyName)).toEqual(['username', 'password']);
	});

	it('should not confuse Workflow name with ConfigMap name', () => {
		const content = `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key1: value1

---
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-workflow
spec:
  entrypoint: main
`;

		const document = TextDocument.create('file:///test.yaml', 'yaml', 1, content);
		const definitions = findConfigMapDefinitions(document);

		// Should find only 1 ConfigMap, not the Workflow
		expect(definitions.length).toBe(1);
		expect(definitions[0].kind).toBe('ConfigMap');
		expect(definitions[0].name).toBe('my-config');
	});
});
