/**
 * Demo Workflow 統合テスト
 *
 * demo-workflow.yaml / demo-workflow-invalid.yaml と同等の
 * multi-document YAML をインラインで定義し、全 LSP 機能を検証する統合テスト。
 *
 * テスト対象:
 * - ConfigMap/Secret 検出 (Phase 5)
 * - Definition Provider (定義ジャンプ)
 * - Hover Provider (ホバー情報)
 * - Completion Provider (入力補完)
 * - Diagnostic Provider (エラー検出)
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity, Position } from 'vscode-languageserver-types';
import { CompletionProvider } from '@/providers/completionProvider';
import { DefinitionProvider } from '@/providers/definitionProvider';
import { DiagnosticProvider } from '@/providers/diagnosticProvider';
import { HoverProvider } from '@/providers/hoverProvider';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { ConfigMapIndex } from '@/services/configMapIndex';
import { filePathToUri } from '@/utils/uriUtils';

// ============================================================
// Inline YAML content (replicating demo-workflow.yaml)
// ============================================================

const VALID_YAML = `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  app.name: "Demo Application"
  app.version: "1.0.0"
  environment: "production"
  log.level: "info"
  config.yaml: |
    server:
      host: 0.0.0.0
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  username: YWRtaW4=
  password: c2VjcmV0MTIz
  api-key: ZGVtby1hcGkta2V5
---
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: demo-templates
spec:
  templates:
  # ------------------------------------------
  # Data processing templates
  # ------------------------------------------
  - name: process-data
    inputs:
      parameters:
      - name: input-data
        description: "Processing target data"
      - name: batch-size
        default: "100"
        description: "Batch size"
    container:
      image: busybox:latest
      command: [sh, -c]
      args:
        - |
          echo "Processing: {{inputs.parameters.input-data}}"
          echo "Batch size: {{inputs.parameters.batch-size}}"
  # ------------------------------------------
  # ConfigMap usage templates
  # ------------------------------------------
  - name: use-configmap
    container:
      image: busybox:latest
      env:
      - name: APP_NAME
        valueFrom:
          configMapKeyRef:
            name: app-config    # ConfigMap reference
            key: app.name       # data key reference
  # ------------------------------------------
  # Secret usage templates
  # ------------------------------------------
  - name: use-secrets
    container:
      image: busybox:latest
      env:
      - name: USERNAME
        valueFrom:
          secretKeyRef:
            name: app-secrets   # Secret reference
            key: username       # secret key reference
#
# Padding: ensure secretKeyRef context does not reach Workflow metadata
#
#
#
#
#
#
#
#
---
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: demo-workflow
spec:
  entrypoint: main-flow
  arguments:
    parameters:
    - name: dataset-name
      value: "customer-data"
  volumes:
  - name: config-volume
    configMap:
      name: app-config          # ConfigMap volume
  #
  # Padding: ensure configMap context does not reach secretName
  #
  #
  #
  #
  #
  #
  #
  - name: secrets-volume
    secret:
      secretName: app-secrets      # Secret volume
  #
  # Padding: ensure volumes context does not reach templateRef
  #
  #
  #
  #
  #
  #
  #
  templates:
  - name: main-flow
    steps:
    - - name: initialize
        template: init-step
    - - name: process
        templateRef:
          name: demo-templates
          template: process-data
        arguments:
          parameters:
          - name: input-data
            value: "{{workflow.parameters.dataset-name}}"
    - - name: test-configmap
        templateRef:
          name: demo-templates
          template: use-configmap
      - name: test-secrets
        templateRef:
          name: demo-templates
          template: use-secrets
  # ------------------------------------------
  # Local template definitions
  # ------------------------------------------
  - name: init-step
    container:
      image: busybox:latest
      command: [sh, -c]
      args:
        - |
          echo "Workflow: {{workflow.name}}"
          echo "Namespace: {{workflow.namespace}}"
          echo "UID: {{workflow.uid}}"
    envFrom:
    - configMapRef:
        name: app-config        # envFrom ConfigMap
  # ------------------------------------------
  # Validation template
  # ------------------------------------------
  - name: validate-step
    inputs:
      parameters:
      - name: record-count
    container:
      image: busybox:latest
      args: ["echo", "{{inputs.parameters.record-count}}"]
`;

// ============================================================
// Inline YAML content (replicating demo-workflow-invalid.yaml)
// ============================================================

const INVALID_YAML = `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: valid-config
data:
  valid.key: "This is valid"
---
apiVersion: v1
kind: Secret
metadata:
  name: valid-secret
type: Opaque
data:
  valid-key: dmFsaWQtdmFsdWU=
---
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: error-test-templates
spec:
  templates:
  - name: valid-template
    container:
      image: busybox:latest
      command: [echo, "exists"]
---
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: error-test-workflow
spec:
  entrypoint: error-flow
  volumes:
  - name: missing-config-vol
    configMap:
      name: missing-configmap
  - name: missing-secret-vol
    secret:
      secretName: missing-secret
  templates:
  - name: error-flow
    steps:
    - - name: step1
        template: non-existent-template
    - - name: step2
        templateRef:
          name: error-test-templates
          template: missing-template
  # ------------------------------------------
  # Error test templates
  # ------------------------------------------
  - name: test-missing-configmap
    container:
      image: busybox:latest
      env:
      - name: TEST_VAR
        valueFrom:
          configMapKeyRef:
            name: missing-configmap
            key: some.key
  - name: test-missing-secret
    container:
      image: busybox:latest
      env:
      - name: SECRET_VAR
        valueFrom:
          secretKeyRef:
            name: missing-secret
            key: some.key
  - name: test-invalid-key
    container:
      image: busybox:latest
      env:
      - name: INVALID_VAR
        valueFrom:
          configMapKeyRef:
            name: valid-config
            key: invalid.key
`;

// ============================================================
// Helper: find line/col of a pattern in YAML content
// ============================================================

/**
 * Find the position of a value on a line matching a pattern.
 * Returns the Position of `value` on the first line containing `linePattern`.
 * If `occurrence` is provided, skips that many matches (0-indexed).
 */
function findPosition(
  content: string,
  linePattern: string,
  value: string,
  occurrence = 0
): Position {
  const lines = content.split('\n');
  let found = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(linePattern)) {
      if (found === occurrence) {
        const col = lines[i].indexOf(value);
        if (col < 0) throw new Error(`Value "${value}" not found on line: ${lines[i]}`);
        return Position.create(i, col);
      }
      found++;
    }
  }
  throw new Error(`Pattern "${linePattern}" (occurrence ${occurrence}) not found in content`);
}

// ============================================================
// Test suite
// ============================================================

describe('Demo Workflow Integration Tests (Multi-Document YAML)', () => {
  // Valid document state
  let validDoc: TextDocument;
  let validTemplateIndex: ArgoTemplateIndex;
  let validConfigMapIndex: ConfigMapIndex;
  let definitionProvider: DefinitionProvider;
  let hoverProvider: HoverProvider;
  let completionProvider: CompletionProvider;
  let validDiagnosticProvider: DiagnosticProvider;

  // Invalid document state
  let invalidDoc: TextDocument;
  let invalidTemplateIndex: ArgoTemplateIndex;
  let invalidConfigMapIndex: ConfigMapIndex;
  let invalidDiagnosticProvider: DiagnosticProvider;

  // Temp directories
  let validDir: string;
  let invalidDir: string;

  beforeAll(async () => {
    // Create temp directories
    validDir = path.join(tmpdir(), `lsp-demo-valid-${Date.now()}`);
    invalidDir = path.join(tmpdir(), `lsp-demo-invalid-${Date.now()}`);
    await fs.mkdir(validDir, { recursive: true });
    await fs.mkdir(invalidDir, { recursive: true });

    // Write YAML files
    const validFilePath = path.join(validDir, 'demo-workflow.yaml');
    const invalidFilePath = path.join(invalidDir, 'demo-workflow-invalid.yaml');
    await fs.writeFile(validFilePath, VALID_YAML);
    await fs.writeFile(invalidFilePath, INVALID_YAML);

    const validUri = filePathToUri(validFilePath);
    const invalidUri = filePathToUri(invalidFilePath);

    // --- Valid setup ---
    validTemplateIndex = new ArgoTemplateIndex();
    validTemplateIndex.setWorkspaceFolders([validDir]);
    await validTemplateIndex.initialize();

    validConfigMapIndex = new ConfigMapIndex();
    await validConfigMapIndex.initialize([validDir]);

    definitionProvider = new DefinitionProvider(
      validTemplateIndex,
      undefined,
      undefined,
      undefined,
      validConfigMapIndex
    );
    hoverProvider = new HoverProvider(
      validTemplateIndex,
      undefined,
      undefined,
      undefined,
      validConfigMapIndex
    );
    completionProvider = new CompletionProvider(
      undefined,
      undefined,
      undefined,
      validConfigMapIndex
    );
    validDiagnosticProvider = new DiagnosticProvider(
      validTemplateIndex,
      undefined,
      undefined,
      undefined,
      validConfigMapIndex
    );

    validDoc = TextDocument.create(validUri, 'yaml', 1, VALID_YAML);

    // --- Invalid setup ---
    invalidTemplateIndex = new ArgoTemplateIndex();
    invalidTemplateIndex.setWorkspaceFolders([invalidDir]);
    await invalidTemplateIndex.initialize();

    invalidConfigMapIndex = new ConfigMapIndex();
    await invalidConfigMapIndex.initialize([invalidDir]);

    invalidDiagnosticProvider = new DiagnosticProvider(
      invalidTemplateIndex,
      undefined,
      undefined,
      undefined,
      invalidConfigMapIndex
    );

    invalidDoc = TextDocument.create(invalidUri, 'yaml', 1, INVALID_YAML);
  });

  afterAll(async () => {
    await fs.rm(validDir, { recursive: true, force: true });
    await fs.rm(invalidDir, { recursive: true, force: true });
    validTemplateIndex.clear();
    invalidTemplateIndex.clear();
  });

  // ============================================================
  // A. ConfigMap/Secret Detection
  // ============================================================

  describe('ConfigMap/Secret Detection', () => {
    it('should detect ConfigMap app-config with 5 keys', () => {
      const cm = validConfigMapIndex.findConfigMap('app-config', 'ConfigMap');
      expect(cm).toBeDefined();
      expect(cm?.name).toBe('app-config');

      const keys = validConfigMapIndex.getKeys('app-config', 'ConfigMap');
      expect(keys).toContain('app.name');
      expect(keys).toContain('app.version');
      expect(keys).toContain('environment');
      expect(keys).toContain('log.level');
      expect(keys).toContain('config.yaml');
      expect(keys).toHaveLength(5);
    });

    it('should detect Secret app-secrets with 3 keys', () => {
      const secret = validConfigMapIndex.findConfigMap('app-secrets', 'Secret');
      expect(secret).toBeDefined();
      expect(secret?.name).toBe('app-secrets');

      const keys = validConfigMapIndex.getKeys('app-secrets', 'Secret');
      expect(keys).toContain('username');
      expect(keys).toContain('password');
      expect(keys).toContain('api-key');
      expect(keys).toHaveLength(3);
    });
  });

  // ============================================================
  // B. Definition Provider
  // ============================================================

  describe('Definition Provider', () => {
    it('configMapKeyRef name -> ConfigMap definition', async () => {
      // "name: app-config" inside configMapKeyRef (use-configmap template)
      const pos = findPosition(VALID_YAML, 'configMapKeyRef:', 'configMapKeyRef');
      // The name is on the next line
      const namePos = findPosition(VALID_YAML, '            name: app-config', 'app-config');
      const location = await definitionProvider.provideDefinition(validDoc, namePos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        // Should point to metadata.name: app-config in ConfigMap section
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('app-config');
      }
    });

    it('configMapKeyRef key -> data key definition', async () => {
      // "key: app.name" inside configMapKeyRef
      const pos = findPosition(VALID_YAML, '            key: app.name', 'app.name');
      const location = await definitionProvider.provideDefinition(validDoc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('app.name');
      }
    });

    it('secretKeyRef name -> Secret definition', async () => {
      // "name: app-secrets" inside secretKeyRef
      const pos = findPosition(VALID_YAML, '            name: app-secrets', 'app-secrets');
      const location = await definitionProvider.provideDefinition(validDoc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('app-secrets');
      }
    });

    it('template: init-step -> local template definition', async () => {
      // "template: init-step" in steps
      const pos = findPosition(VALID_YAML, '        template: init-step', 'init-step');
      const location = await definitionProvider.provideDefinition(validDoc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        // Should point to "- name: init-step" template definition
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('name: init-step');
      }
    });

    it('templateRef template: process-data -> WorkflowTemplate template', async () => {
      // "template: process-data" in templateRef
      const pos = findPosition(VALID_YAML, '          template: process-data', 'process-data');
      const location = await definitionProvider.provideDefinition(validDoc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('process-data');
      }
    });

    it('volumes configMap name -> ConfigMap definition', async () => {
      // "name: app-config" in volumes.configMap
      const pos = findPosition(VALID_YAML, '      name: app-config', 'app-config');
      const location = await definitionProvider.provideDefinition(validDoc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('app-config');
      }
    });

    it('volumes secretName -> Secret definition', async () => {
      // "secretName: app-secrets" in volumes.secret
      const pos = findPosition(VALID_YAML, '      secretName: app-secrets', 'app-secrets');
      const location = await definitionProvider.provideDefinition(validDoc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('app-secrets');
      }
    });

    it('envFrom configMapRef name -> ConfigMap definition', async () => {
      // "name: app-config" in envFrom.configMapRef
      const pos = findPosition(VALID_YAML, '        name: app-config', 'app-config');
      const location = await definitionProvider.provideDefinition(validDoc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        const targetLine = VALID_YAML.split('\n')[location.range.start.line];
        expect(targetLine).toContain('app-config');
      }
    });
  });

  // ============================================================
  // C. Hover Provider
  // ============================================================

  describe('Hover Provider', () => {
    it('hover on configMapKeyRef name shows ConfigMap info', async () => {
      const pos = findPosition(VALID_YAML, '            name: app-config', 'app-config');
      const hover = await hoverProvider.provideHover(validDoc, pos);
      expect(hover).not.toBeNull();
      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('app-config');
        expect(hover.contents.value).toContain('ConfigMap');
      }
    });

    it('hover on secretKeyRef name shows Secret info', async () => {
      const pos = findPosition(VALID_YAML, '            name: app-secrets', 'app-secrets');
      const hover = await hoverProvider.provideHover(validDoc, pos);
      expect(hover).not.toBeNull();
      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('app-secrets');
        expect(hover.contents.value).toContain('Secret');
      }
    });

    it('hover on template: init-step shows template info', async () => {
      const pos = findPosition(VALID_YAML, '        template: init-step', 'init-step');
      const hover = await hoverProvider.provideHover(validDoc, pos);
      expect(hover).not.toBeNull();
      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('init-step');
      }
    });

    it('hover on configMapKeyRef key shows key info', async () => {
      const pos = findPosition(VALID_YAML, '            key: app.name', 'app.name');
      const hover = await hoverProvider.provideHover(validDoc, pos);
      expect(hover).not.toBeNull();
      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('app.name');
      }
    });

    it('hover on volumes configMap name shows ConfigMap info', async () => {
      const pos = findPosition(VALID_YAML, '      name: app-config', 'app-config');
      const hover = await hoverProvider.provideHover(validDoc, pos);
      expect(hover).not.toBeNull();
      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        expect(hover.contents.value).toContain('app-config');
      }
    });
  });

  // ============================================================
  // D. Completion Provider
  // ============================================================

  describe('Completion Provider', () => {
    it('template: context -> local template names', async () => {
      const testContent = `${validDoc.getText()}\n      template: `;
      const testDoc = TextDocument.create(validDoc.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const position = Position.create(lines.length - 1, 16);

      const completions = await completionProvider.provideCompletion(testDoc, position);
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('main-flow');
      expect(labels).toContain('init-step');
      expect(labels).toContain('validate-step');
    });

    it('configMapKeyRef name: context -> ConfigMap names', async () => {
      const testContent = `${validDoc.getText()}
      env:
      - name: TEST
        valueFrom:
          configMapKeyRef:
            name: `;
      const testDoc = TextDocument.create(validDoc.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const position = Position.create(lines.length - 1, 18);

      const completions = await completionProvider.provideCompletion(testDoc, position);
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('app-config');
    });

    it('secretKeyRef name: context -> Secret names', async () => {
      const testContent = `${validDoc.getText()}
      env:
      - name: TEST
        valueFrom:
          secretKeyRef:
            name: `;
      const testDoc = TextDocument.create(validDoc.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const position = Position.create(lines.length - 1, 18);

      const completions = await completionProvider.provideCompletion(testDoc, position);
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('app-secrets');
    });

    it('configMapKeyRef key: context -> data keys', async () => {
      const testContent = `${validDoc.getText()}
          configMapKeyRef:
            name: app-config
            key: `;
      const testDoc = TextDocument.create(validDoc.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const position = Position.create(lines.length - 1, 17);

      const completions = await completionProvider.provideCompletion(testDoc, position);
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('app.name');
      expect(labels).toContain('app.version');
      expect(labels).toContain('environment');
    });

    it('workflow. context -> workflow variable completions', async () => {
      const testContent = `${validDoc.getText()}\n        args: ["{{workflow."]`;
      const testDoc = TextDocument.create(validDoc.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      // Find "workflow." position in the last line
      const lastLine = lines[lines.length - 1];
      const wfIdx = lastLine.indexOf('workflow.') + 'workflow.'.length;
      const position = Position.create(lines.length - 1, wfIdx);

      const completions = await completionProvider.provideCompletion(testDoc, position);
      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('workflow.name');
      expect(labels).toContain('workflow.namespace');
      expect(labels).toContain('workflow.uid');
    });
  });

  // ============================================================
  // E. Diagnostics - Valid Document (no errors expected)
  // ============================================================

  describe('Diagnostics - Valid Document', () => {
    it('should report no ConfigMap/Secret errors', async () => {
      const diagnostics = await validDiagnosticProvider.provideDiagnostics(validDoc);
      const configMapErrors = diagnostics.filter(
        d =>
          d.message.includes('not found') &&
          (d.message.includes('ConfigMap') ||
            d.message.includes('Secret') ||
            d.message.includes('Key'))
      );
      expect(configMapErrors).toHaveLength(0);
    });

    it('should report no template errors', async () => {
      const diagnostics = await validDiagnosticProvider.provideDiagnostics(validDoc);
      const templateErrors = diagnostics.filter(
        d => d.message.includes('Template') && d.message.includes('not found')
      );
      expect(templateErrors).toHaveLength(0);
    });
  });

  // ============================================================
  // F. Diagnostics - Invalid Document (errors expected)
  // ============================================================

  describe('Diagnostics - Invalid Document', () => {
    it('should detect non-existent local template: non-existent-template', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const error = diagnostics.find(
        d => d.message.includes('non-existent-template') && d.message.includes('not found')
      );
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
    });

    it('should detect non-existent templateRef template: missing-template', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const error = diagnostics.find(
        d => d.message.includes('missing-template') && d.message.includes('not found')
      );
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
    });

    it('should detect non-existent ConfigMap: missing-configmap', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const errors = diagnostics.filter(
        d => d.message.includes('missing-configmap') && d.message.includes('not found')
      );
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect non-existent Secret: missing-secret', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const errors = diagnostics.filter(
        d => d.message.includes('missing-secret') && d.message.includes('not found')
      );
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect non-existent key: invalid.key in valid-config', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const error = diagnostics.find(
        d => d.message.includes('invalid.key') && d.message.includes('not found')
      );
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
    });

    it('should detect missing-configmap in volumes', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const errors = diagnostics.filter(d => d.message.includes('missing-configmap'));
      // Should be detected in both configMapKeyRef and volumes
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect missing-secret in volumes', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const errors = diagnostics.filter(d => d.message.includes('missing-secret'));
      // Should be detected in both secretKeyRef and volumes
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect at least 7 total errors', async () => {
      const diagnostics = await invalidDiagnosticProvider.provideDiagnostics(invalidDoc);
      const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
      // non-existent-template, missing-template,
      // missing-configmap (env + volume), missing-secret (env + volume),
      // invalid.key
      expect(errors.length).toBeGreaterThanOrEqual(7);
    });
  });

  // ============================================================
  // G. Integration Scenario
  // ============================================================

  describe('Integration Scenario', () => {
    it('all 4 providers work correctly on multi-document YAML', async () => {
      // 1. Diagnostics: no ConfigMap/Secret/Template errors
      const diagnostics = await validDiagnosticProvider.provideDiagnostics(validDoc);
      const realErrors = diagnostics.filter(
        d =>
          d.severity === DiagnosticSeverity.Error &&
          (d.message.includes('not found') || d.message.includes('not defined'))
      );
      expect(realErrors).toHaveLength(0);

      // 2. Definition: template reference -> local template
      const defPos = findPosition(VALID_YAML, '        template: init-step', 'init-step');
      const defResult = await definitionProvider.provideDefinition(validDoc, defPos);
      expect(defResult).not.toBeNull();

      // 3. Hover: ConfigMap reference
      const hoverPos = findPosition(VALID_YAML, '            name: app-config', 'app-config');
      const hoverResult = await hoverProvider.provideHover(validDoc, hoverPos);
      expect(hoverResult).not.toBeNull();

      // 4. Completion: template names
      const testContent = `${validDoc.getText()}\n      template: `;
      const testDoc = TextDocument.create(validDoc.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const completions = await completionProvider.provideCompletion(
        testDoc,
        Position.create(lines.length - 1, 16)
      );
      expect(completions.items.length).toBeGreaterThan(0);
    });
  });
});
