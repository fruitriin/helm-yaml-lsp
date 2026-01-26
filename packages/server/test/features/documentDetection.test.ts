/**
 * Argo Workflows LSP - Document Detection Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  clearChartYamlCache,
  extractArgoWorkflowKind,
  isArgoWorkflowDocument,
  isHelmTemplate,
  isValidArgoWorkflowKind,
} from '../../src/features/documentDetection';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('Document Detection', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `lsp-test-detection-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    clearChartYamlCache(); // キャッシュをクリア
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    clearChartYamlCache();
  });

  describe('isArgoWorkflowDocument', () => {
    it('should detect Workflow document', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(true);
    });

    it('should detect WorkflowTemplate', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: WorkflowTemplate\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(true);
    });

    it('should detect ClusterWorkflowTemplate', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: ClusterWorkflowTemplate\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(true);
    });

    it('should detect CronWorkflow', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: CronWorkflow\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(true);
    });

    it('should reject non-Argo documents', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: v1\nkind: Deployment\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(false);
    });

    it('should reject documents without apiVersion', () => {
      const doc = TextDocument.create('file:///test.yaml', 'yaml', 1, 'kind: Workflow\n');

      expect(isArgoWorkflowDocument(doc)).toBe(false);
    });

    it('should reject documents without kind', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(false);
    });

    it('should reject non-YAML documents', () => {
      const doc = TextDocument.create('file:///test.json', 'json', 1, '{"kind": "Workflow"}');

      expect(isArgoWorkflowDocument(doc)).toBe(false);
    });

    it('should handle quoted apiVersion', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: "argoproj.io/v1alpha1"\nkind: Workflow\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(true);
    });

    it('should handle quoted kind', () => {
      const doc = TextDocument.create(
        'file:///test.yaml',
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: "Workflow"\n'
      );

      expect(isArgoWorkflowDocument(doc)).toBe(true);
    });
  });

  describe('isHelmTemplate', () => {
    it('should detect helm languageId', () => {
      const doc = TextDocument.create(
        'file:///templates/test.yaml',
        'helm',
        1,
        'kind: {{ .Values.kind }}\n'
      );

      expect(isHelmTemplate(doc)).toBe(true);
    });

    it('should detect templates directory with Chart.yaml', async () => {
      // Chart.yamlを作成
      await fs.writeFile(path.join(testDir, 'Chart.yaml'), 'name: test\n');

      // templates/ディレクトリを作成
      const templatesDir = path.join(testDir, 'templates');
      await fs.mkdir(templatesDir);

      const filePath = path.join(templatesDir, 'workflow.yaml');
      const uri = filePathToUri(filePath);

      const doc = TextDocument.create(
        uri,
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      expect(isHelmTemplate(doc)).toBe(true);
    });

    it('should reject templates directory without Chart.yaml', async () => {
      // Chart.yamlなしでtemplates/ディレクトリを作成
      const templatesDir = path.join(testDir, 'templates');
      await fs.mkdir(templatesDir);

      const filePath = path.join(templatesDir, 'workflow.yaml');
      const uri = filePathToUri(filePath);

      const doc = TextDocument.create(
        uri,
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      expect(isHelmTemplate(doc)).toBe(false);
    });

    it('should reject non-templates directory', async () => {
      // Chart.yamlを作成
      await fs.writeFile(path.join(testDir, 'Chart.yaml'), 'name: test\n');

      const filePath = path.join(testDir, 'workflow.yaml');
      const uri = filePathToUri(filePath);

      const doc = TextDocument.create(
        uri,
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      expect(isHelmTemplate(doc)).toBe(false);
    });

    it('should reject non-YAML files', () => {
      const doc = TextDocument.create('file:///templates/test.txt', 'plaintext', 1, 'plain text');

      expect(isHelmTemplate(doc)).toBe(false);
    });

    it('should handle Chart.yml (alternative spelling)', async () => {
      // Chart.yml を作成
      await fs.writeFile(path.join(testDir, 'Chart.yml'), 'name: test\n');

      const templatesDir = path.join(testDir, 'templates');
      await fs.mkdir(templatesDir);

      const filePath = path.join(templatesDir, 'workflow.yaml');
      const uri = filePathToUri(filePath);

      const doc = TextDocument.create(
        uri,
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      expect(isHelmTemplate(doc)).toBe(true);
    });

    it('should find Chart.yaml in parent directories', async () => {
      // ルートにChart.yamlを作成
      await fs.writeFile(path.join(testDir, 'Chart.yaml'), 'name: test\n');

      // ネストされたディレクトリを作成
      const templatesDir = path.join(testDir, 'templates', 'subdir');
      await fs.mkdir(templatesDir, { recursive: true });

      const filePath = path.join(templatesDir, 'workflow.yaml');
      const uri = filePathToUri(filePath);

      const doc = TextDocument.create(
        uri,
        'yaml',
        1,
        'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n'
      );

      expect(isHelmTemplate(doc)).toBe(true);
    });
  });

  describe('isValidArgoWorkflowKind', () => {
    it('should accept valid kinds', () => {
      expect(isValidArgoWorkflowKind('Workflow')).toBe(true);
      expect(isValidArgoWorkflowKind('CronWorkflow')).toBe(true);
      expect(isValidArgoWorkflowKind('WorkflowTemplate')).toBe(true);
      expect(isValidArgoWorkflowKind('ClusterWorkflowTemplate')).toBe(true);
    });

    it('should reject invalid kinds', () => {
      expect(isValidArgoWorkflowKind('Deployment')).toBe(false);
      expect(isValidArgoWorkflowKind('Pod')).toBe(false);
      expect(isValidArgoWorkflowKind('workflow')).toBe(false); // case sensitive
    });
  });

  describe('extractArgoWorkflowKind', () => {
    it('should extract Workflow kind', () => {
      const text = 'apiVersion: argoproj.io/v1alpha1\nkind: Workflow\n';
      expect(extractArgoWorkflowKind(text)).toBe('Workflow');
    });

    it('should extract WorkflowTemplate kind', () => {
      const text = 'apiVersion: argoproj.io/v1alpha1\nkind: WorkflowTemplate\n';
      expect(extractArgoWorkflowKind(text)).toBe('WorkflowTemplate');
    });

    it('should extract ClusterWorkflowTemplate kind', () => {
      const text = 'apiVersion: argoproj.io/v1alpha1\nkind: ClusterWorkflowTemplate\n';
      expect(extractArgoWorkflowKind(text)).toBe('ClusterWorkflowTemplate');
    });

    it('should extract CronWorkflow kind', () => {
      const text = 'apiVersion: argoproj.io/v1alpha1\nkind: CronWorkflow\n';
      expect(extractArgoWorkflowKind(text)).toBe('CronWorkflow');
    });

    it('should return undefined for invalid kind', () => {
      const text = 'apiVersion: v1\nkind: Deployment\n';
      expect(extractArgoWorkflowKind(text)).toBeUndefined();
    });

    it('should return undefined when no kind found', () => {
      const text = 'apiVersion: argoproj.io/v1alpha1\n';
      expect(extractArgoWorkflowKind(text)).toBeUndefined();
    });

    it('should handle quoted kind', () => {
      const text = 'kind: "Workflow"\n';
      expect(extractArgoWorkflowKind(text)).toBe('Workflow');
    });

    it('should handle single-quoted kind', () => {
      const text = "kind: 'Workflow'\n";
      expect(extractArgoWorkflowKind(text)).toBe('Workflow');
    });
  });

  describe('clearChartYamlCache', () => {
    it('should clear the cache', async () => {
      // Chart.yamlを作成
      await fs.writeFile(path.join(testDir, 'Chart.yaml'), 'name: test\n');

      const templatesDir = path.join(testDir, 'templates');
      await fs.mkdir(templatesDir);

      const filePath = path.join(templatesDir, 'workflow.yaml');
      const uri = filePathToUri(filePath);

      // 1回目の呼び出し（キャッシュされる）
      const doc1 = TextDocument.create(uri, 'yaml', 1, 'kind: Workflow\n');
      expect(isHelmTemplate(doc1)).toBe(true);

      // Chart.yamlを削除
      await fs.unlink(path.join(testDir, 'Chart.yaml'));

      // キャッシュがあるのでまだtrueが返る
      const doc2 = TextDocument.create(uri, 'yaml', 1, 'kind: Workflow\n');
      expect(isHelmTemplate(doc2)).toBe(true);

      // キャッシュをクリア
      clearChartYamlCache();

      // 今度はfalseが返る
      const doc3 = TextDocument.create(uri, 'yaml', 1, 'kind: Workflow\n');
      expect(isHelmTemplate(doc3)).toBe(false);
    });
  });
});
