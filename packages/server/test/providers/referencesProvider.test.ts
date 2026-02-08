/**
 * Argo Workflows LSP - References Provider Test
 *
 * textDocument/references のテスト。
 * 各参照タイプの参照検索をテストする。
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { createReferenceRegistry } from '../../src/references/setup';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';
import { ConfigMapIndex } from '../../src/services/configMapIndex';
import { HelmChartIndex } from '../../src/services/helmChartIndex';
import { HelmTemplateIndex } from '../../src/services/helmTemplateIndex';
import { ValuesIndex } from '../../src/services/valuesIndex';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('ReferencesProvider', () => {
  let testDir: string;
  let argoTemplateIndex: ArgoTemplateIndex;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `lsp-test-references-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    argoTemplateIndex = new ArgoTemplateIndex();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    argoTemplateIndex.clear();
  });

  describe('argoTemplate references', () => {
    it('should find all direct template references from reference position', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            template: build
        - - name: step2
            template: build
        - - name: step3
            template: deploy
    - name: build
      container:
        image: alpine
    - name: deploy
      container:
        image: nginx
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, content);
      const registry = createReferenceRegistry(argoTemplateIndex);

      // カーソルを "template: build" (行10) に置く
      const pos = Position.create(10, 24); // "build" の位置
      const results = registry.findAllReferences(doc, pos, [doc]);

      expect(results.length).toBe(2);
      // 両方とも同一ファイル
      for (const r of results) {
        expect(r.uri).toBe('file:///workflow.yaml');
      }
    });

    it('should find all direct template references from definition position', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            template: build
        - - name: step2
            template: build
    - name: build
      container:
        image: alpine
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, content);
      const registry = createReferenceRegistry(argoTemplateIndex);

      // カーソルを定義 "- name: build" (行13) に置く
      const pos = Position.create(13, 14); // "build" の位置
      const results = registry.findAllReferences(doc, pos, [doc]);

      expect(results.length).toBe(2);
    });

    it('should find cross-file template references', () => {
      const workflow1 = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            template: build
    - name: build
      container:
        image: alpine
`;
      const workflow2 = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test2-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            template: build
    - name: build
      container:
        image: busybox
`;
      const doc1 = TextDocument.create('file:///wf1.yaml', 'yaml', 1, workflow1);
      const doc2 = TextDocument.create('file:///wf2.yaml', 'yaml', 1, workflow2);
      const registry = createReferenceRegistry(argoTemplateIndex);

      // doc1 の "template: build" から検索
      const pos = Position.create(10, 24);
      const results = registry.findAllReferences(doc1, pos, [doc1, doc2]);

      // 両ファイルの "template: build" が見つかる
      expect(results.length).toBe(2);
      const uris = results.map(r => r.uri);
      expect(uris).toContain('file:///wf1.yaml');
      expect(uris).toContain('file:///wf2.yaml');
    });

    it('should return empty for unmatched position', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, content);
      const registry = createReferenceRegistry(argoTemplateIndex);

      // 参照でも定義でもない位置
      const pos = Position.create(0, 5);
      const results = registry.findAllReferences(doc, pos, [doc]);

      expect(results.length).toBe(0);
    });

    it('should return empty when no references exist for template', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      container:
        image: alpine
    - name: unused
      container:
        image: busybox
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, content);
      const registry = createReferenceRegistry(argoTemplateIndex);

      // "- name: unused" の定義位置
      const pos = Position.create(10, 14); // "unused"
      const results = registry.findAllReferences(doc, pos, [doc]);

      expect(results.length).toBe(0);
    });
  });

  describe('argoParameter references', () => {
    it('should find parameter references from reference position', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      inputs:
        parameters:
          - name: message
      container:
        image: alpine
        command: [echo, "{{inputs.parameters.message}}"]
        args: ["{{inputs.parameters.message}}"]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, content);
      const registry = createReferenceRegistry(argoTemplateIndex);

      // "{{inputs.parameters.message}}" にカーソル (行13)
      const pos = Position.create(13, 40); // "message" の位置
      const results = registry.findAllReferences(doc, pos, [doc]);

      expect(results.length).toBe(2);
    });

    it('should find parameter references from definition position', () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      inputs:
        parameters:
          - name: message
      container:
        image: alpine
        command: [echo, "{{inputs.parameters.message}}"]
`;
      const doc = TextDocument.create('file:///workflow.yaml', 'yaml', 1, content);
      const registry = createReferenceRegistry(argoTemplateIndex);

      // "- name: message" の定義位置 (行10)
      const pos = Position.create(10, 20); // "message" の位置
      const results = registry.findAllReferences(doc, pos, [doc]);

      expect(results.length).toBe(1);
    });
  });

  describe('helmValues references', () => {
    it('should find .Values references across helm templates', async () => {
      // Helm チャート構造を作成
      const chartDir = path.join(testDir, 'mychart');
      const templatesDir = path.join(chartDir, 'templates');
      await fs.mkdir(templatesDir, { recursive: true });

      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: mychart\nversion: 0.1.0\n'
      );
      await fs.writeFile(
        path.join(chartDir, 'values.yaml'),
        'image:\n  repository: nginx\n  tag: latest\n'
      );

      const template1Content = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.image.repository }}
spec:
  template:
    spec:
      containers:
        - image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
`;
      const template2Content = `apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.image.repository }}-svc
`;
      await fs.writeFile(path.join(templatesDir, 'deployment.yaml'), template1Content);
      await fs.writeFile(path.join(templatesDir, 'service.yaml'), template2Content);

      const helmChartIndex = new HelmChartIndex();
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const valuesIndex = new ValuesIndex();
      const charts = helmChartIndex.getAllCharts();
      await valuesIndex.initialize(charts);

      const registry = createReferenceRegistry(argoTemplateIndex, helmChartIndex, valuesIndex);

      const doc1Uri = filePathToUri(path.join(templatesDir, 'deployment.yaml'));
      const doc2Uri = filePathToUri(path.join(templatesDir, 'service.yaml'));
      const doc1 = TextDocument.create(doc1Uri, 'helm', 1, template1Content);
      const doc2 = TextDocument.create(doc2Uri, 'helm', 1, template2Content);

      // doc1 の ".Values.image.repository" にカーソル (行3)
      const pos = Position.create(3, 20); // "image.repository" の位置
      const results = registry.findAllReferences(doc1, pos, [doc1, doc2]);

      // deployment.yaml に2回, service.yaml に1回 = 3回
      expect(results.length).toBe(3);
      const uris = results.map(r => r.uri);
      expect(uris.filter(u => u === doc1Uri).length).toBe(2);
      expect(uris.filter(u => u === doc2Uri).length).toBe(1);
    });
  });

  describe('helmTemplate references', () => {
    it('should find include/template references from reference position', async () => {
      const chartDir = path.join(testDir, 'mychart');
      const templatesDir = path.join(chartDir, 'templates');
      await fs.mkdir(templatesDir, { recursive: true });

      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: mychart\nversion: 0.1.0\n'
      );
      await fs.writeFile(path.join(chartDir, 'values.yaml'), 'key: value\n');

      const helpersContent = `{{- define "mychart.name" -}}
mychart
{{- end -}}
`;
      const deployContent = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mychart.name" . }}
  labels:
    app: {{ include "mychart.name" . }}
`;
      const svcContent = `apiVersion: v1
kind: Service
metadata:
  name: {{ include "mychart.name" . }}
`;

      await fs.writeFile(path.join(templatesDir, '_helpers.tpl'), helpersContent);
      await fs.writeFile(path.join(templatesDir, 'deployment.yaml'), deployContent);
      await fs.writeFile(path.join(templatesDir, 'service.yaml'), svcContent);

      const helmChartIndex = new HelmChartIndex();
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const helmTemplateIndex = new HelmTemplateIndex();
      const charts = helmChartIndex.getAllCharts();
      await helmTemplateIndex.initialize(charts);

      const valuesIndex = new ValuesIndex();
      await valuesIndex.initialize(charts);

      const registry = createReferenceRegistry(
        argoTemplateIndex,
        helmChartIndex,
        valuesIndex,
        helmTemplateIndex
      );

      const doc1Uri = filePathToUri(path.join(templatesDir, 'deployment.yaml'));
      const doc2Uri = filePathToUri(path.join(templatesDir, 'service.yaml'));
      const doc1 = TextDocument.create(doc1Uri, 'helm', 1, deployContent);
      const doc2 = TextDocument.create(doc2Uri, 'helm', 1, svcContent);

      // doc1 の include "mychart.name" にカーソル (行3)
      const pos = Position.create(3, 22); // "mychart.name" の位置
      const results = registry.findAllReferences(doc1, pos, [doc1, doc2]);

      // deployment.yaml に2回, service.yaml に1回 = 3回
      expect(results.length).toBe(3);
    });

    it('should find include references from define block', async () => {
      const chartDir = path.join(testDir, 'mychart');
      const templatesDir = path.join(chartDir, 'templates');
      await fs.mkdir(templatesDir, { recursive: true });

      await fs.writeFile(
        path.join(chartDir, 'Chart.yaml'),
        'apiVersion: v2\nname: mychart\nversion: 0.1.0\n'
      );
      await fs.writeFile(path.join(chartDir, 'values.yaml'), 'key: value\n');

      const helpersContent = `{{- define "mychart.labels" -}}
app: mychart
{{- end -}}
`;
      const deployContent = `apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    {{ include "mychart.labels" . }}
`;
      await fs.writeFile(path.join(templatesDir, '_helpers.tpl'), helpersContent);
      await fs.writeFile(path.join(templatesDir, 'deployment.yaml'), deployContent);

      const helmChartIndex = new HelmChartIndex();
      helmChartIndex.setWorkspaceFolders([testDir]);
      await helmChartIndex.initialize();

      const helmTemplateIndex = new HelmTemplateIndex();
      const charts = helmChartIndex.getAllCharts();
      await helmTemplateIndex.initialize(charts);

      const valuesIndex = new ValuesIndex();
      await valuesIndex.initialize(charts);

      const registry = createReferenceRegistry(
        argoTemplateIndex,
        helmChartIndex,
        valuesIndex,
        helmTemplateIndex
      );

      const helpersUri = filePathToUri(path.join(templatesDir, '_helpers.tpl'));
      const deployUri = filePathToUri(path.join(templatesDir, 'deployment.yaml'));
      const helpersDoc = TextDocument.create(helpersUri, 'helm', 1, helpersContent);
      const deployDoc = TextDocument.create(deployUri, 'helm', 1, deployContent);

      // _helpers.tpl の define "mychart.labels" にカーソル (行0)
      const pos = Position.create(0, 15); // "mychart.labels" の位置
      const results = registry.findAllReferences(helpersDoc, pos, [helpersDoc, deployDoc]);

      // deployment.yaml に1回
      expect(results.length).toBe(1);
      expect(results[0]!.uri).toBe(deployUri);
    });
  });

  describe('configMap references', () => {
    it('should find configMap name references across documents', async () => {
      // ConfigMap定義ファイル
      const configMapContent = `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  db-url: postgres://localhost:5432/mydb
`;
      // ConfigMap参照ファイル1
      const deployContent = `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: DB_URL
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: db-url
`;
      // ConfigMap参照ファイル2
      const jobContent = `apiVersion: batch/v1
kind: Job
spec:
  template:
    spec:
      containers:
        - name: worker
          env:
            - name: DB_URL
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: db-url
`;

      const configMapPath = path.join(testDir, 'configmap.yaml');
      const deployPath = path.join(testDir, 'deploy.yaml');
      const jobPath = path.join(testDir, 'job.yaml');
      await fs.writeFile(configMapPath, configMapContent);
      await fs.writeFile(deployPath, deployContent);
      await fs.writeFile(jobPath, jobContent);

      const configMapIndex = new ConfigMapIndex();
      await configMapIndex.initialize([testDir]);

      const registry = createReferenceRegistry(
        argoTemplateIndex,
        undefined,
        undefined,
        undefined,
        configMapIndex
      );

      const doc1 = TextDocument.create(filePathToUri(deployPath), 'yaml', 1, deployContent);
      const doc2 = TextDocument.create(filePathToUri(jobPath), 'yaml', 1, jobContent);

      // doc1 の "name: app-config" にカーソル (行11)
      const pos = Position.create(11, 26); // "app-config" の位置
      const results = registry.findAllReferences(doc1, pos, [doc1, doc2]);

      // deploy + job で name 参照 2回 + key 参照 2回 = 計4回
      // (findAllConfigMapReferences は name と key の両方を返す)
      expect(results.length).toBeGreaterThanOrEqual(2);

      const uris = results.map(r => r.uri);
      expect(uris).toContain(filePathToUri(deployPath));
      expect(uris).toContain(filePathToUri(jobPath));
    });
  });

  describe('non-Argo documents', () => {
    it('should return empty for plain YAML', () => {
      const doc = TextDocument.create(
        'file:///deployment.yaml',
        'yaml',
        1,
        'apiVersion: v1\nkind: Deployment\n'
      );
      const registry = createReferenceRegistry(argoTemplateIndex);

      const pos = Position.create(0, 5);
      const results = registry.findAllReferences(doc, pos, [doc]);

      expect(results.length).toBe(0);
    });
  });
});
