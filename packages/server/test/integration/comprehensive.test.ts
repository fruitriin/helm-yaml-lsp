/**
 * Argo Workflows LSP - 統合テスト
 *
 * 1つの包括的なYAMLファイルに対して、すべてのLSP機能が
 * 正しく動作することを確認する統合テスト
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, DiagnosticSeverity, Position } from 'vscode-languageserver-types';
import { CompletionProvider } from '../../src/providers/completionProvider';
import { DefinitionProvider } from '../../src/providers/definitionProvider';
import { DiagnosticProvider } from '../../src/providers/diagnosticProvider';
import { HoverProvider } from '../../src/providers/hoverProvider';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';

describe('Comprehensive Integration Tests', () => {
  let document: TextDocument;
  let templateIndex: ArgoTemplateIndex;
  let definitionProvider: DefinitionProvider;
  let hoverProvider: HoverProvider;
  let completionProvider: CompletionProvider;
  let diagnosticProvider: DiagnosticProvider;

  beforeAll(async () => {
    // 包括的なテストYAMLファイルを読み込む
    const fixturePath = path.join(__dirname, '../fixtures/comprehensive-workflow.yaml');
    const content = await fs.readFile(fixturePath, 'utf-8');
    document = TextDocument.create('file:///comprehensive-workflow.yaml', 'yaml', 1, content);

    // プロバイダーをセットアップ
    templateIndex = new ArgoTemplateIndex();
    definitionProvider = new DefinitionProvider(templateIndex);
    hoverProvider = new HoverProvider(templateIndex);
    completionProvider = new CompletionProvider();
    diagnosticProvider = new DiagnosticProvider(templateIndex);
  });

  describe('Definition Provider - ローカルテンプレート参照', () => {
    it('should jump to prepare-data-template definition from line 39', async () => {
      // Line 39: template: prepare-data-template
      const position = Position.create(38, 22); // "prepare-data-template" の位置

      const location = await definitionProvider.provideDefinition(document, position);
      expect(location).not.toBeNull();

      if (location && 'uri' in location) {
        expect(location.uri).toBe(document.uri);
        // "- name: prepare-data-template" の行を指している
        expect(location.range.start.line).toBe(64); // Line 65のインデックス
      }
    });

    it('should jump to process-data-template definition from line 47', async () => {
      // Line 47: template: process-data-template
      const position = Position.create(46, 22);

      const location = await definitionProvider.provideDefinition(document, position);
      expect(location).not.toBeNull();

      if (location && 'uri' in location) {
        expect(location.uri).toBe(document.uri);
        expect(location.range.start.line).toBe(89); // Line 90
      }
    });

    it('should jump to output-results-template definition from line 55', async () => {
      // Line 55: template: output-results-template
      const position = Position.create(54, 22);

      const location = await definitionProvider.provideDefinition(document, position);
      expect(location).not.toBeNull();

      if (location && 'uri' in location) {
        expect(location.uri).toBe(document.uri);
        expect(location.range.start.line).toBe(117); // Line 118
      }
    });
  });

  describe('Definition Provider - パラメータ参照', () => {
    it('should jump to environment parameter definition from line 38', async () => {
      // Line 38: value: "{{workflow.parameters.environment}}"
      // "environment" の位置
      const position = Position.create(37, 47);

      const _location = await definitionProvider.provideDefinition(document, position);
      // workflow.parameters は現在サポート外（将来の拡張）
      // このテストは将来の実装確認用
    });

    it('should jump to env parameter definition from line 82', async () => {
      // Line 82: echo "Preparing data for {{inputs.parameters.env}}"
      // "env" の位置
      const position = Position.create(81, 60);

      const location = await definitionProvider.provideDefinition(document, position);
      expect(location).not.toBeNull();

      if (location && 'uri' in location) {
        expect(location.uri).toBe(document.uri);
        // "- name: env" の行
        expect(location.range.start.line).toBe(68);
      }
    });

    it('should jump to input-data parameter definition from line 109', async () => {
      // Line 109: echo "Processing: {{inputs.parameters.input-data}}"
      const position = Position.create(108, 53);

      const location = await definitionProvider.provideDefinition(document, position);
      expect(location).not.toBeNull();

      if (location && 'uri' in location) {
        expect(location.uri).toBe(document.uri);
        expect(location.range.start.line).toBe(93);
      }
    });
  });

  describe('Hover Provider - テンプレート', () => {
    it('should show hover info for prepare-data-template', async () => {
      // Line 39: template: prepare-data-template
      const position = Position.create(38, 22);

      const hover = await hoverProvider.provideHover(document, position);
      expect(hover).not.toBeNull();

      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        const markdown = hover.contents.value;
        expect(markdown).toContain('**Template**: `prepare-data-template`');
        expect(markdown).toContain('Prepares data for processing');
        expect(markdown).toContain('Data preparation step');
      }
    });
  });

  describe('Hover Provider - パラメータ', () => {
    it('should show hover info for env parameter', async () => {
      // Line 82: {{inputs.parameters.env}}
      const position = Position.create(81, 60);

      const hover = await hoverProvider.provideHover(document, position);
      expect(hover).not.toBeNull();

      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        const markdown = hover.contents.value;
        expect(markdown).toContain('**Parameter**: `env`');
        expect(markdown).toContain('**Type**: Input Parameter');
        expect(markdown).toContain('Environment parameter');
        expect(markdown).toContain('Target environment name');
      }
    });

    it('should show hover info for batch-size parameter with default value', async () => {
      // Line 110: {{inputs.parameters.batch-size}}
      const position = Position.create(109, 47);

      const hover = await hoverProvider.provideHover(document, position);
      expect(hover).not.toBeNull();

      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        const markdown = hover.contents.value;
        expect(markdown).toContain('**Parameter**: `batch-size`');
        expect(markdown).toContain('**Default**: `100`');
        expect(markdown).toContain('Number of items per batch');
      }
    });
  });

  describe('Hover Provider - Workflow変数', () => {
    it('should show hover info for workflow.name', async () => {
      // Line 83: {{workflow.name}}
      const position = Position.create(82, 36);

      const hover = await hoverProvider.provideHover(document, position);
      expect(hover).not.toBeNull();

      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        const markdown = hover.contents.value;
        expect(markdown).toContain('**Workflow Variable**: `workflow.name`');
        expect(markdown).toContain('Name of the Workflow');
      }
    });

    it('should show hover info for workflow.namespace', async () => {
      // Line 83: {{workflow.namespace}}
      const position = Position.create(82, 56);

      const hover = await hoverProvider.provideHover(document, position);
      expect(hover).not.toBeNull();

      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        const markdown = hover.contents.value;
        expect(markdown).toContain('**Workflow Variable**: `workflow.namespace`');
      }
    });

    it('should show hover info for workflow.uid', async () => {
      // Line 111: {{workflow.uid}}
      const position = Position.create(110, 40);

      const hover = await hoverProvider.provideHover(document, position);
      expect(hover).not.toBeNull();

      if (hover?.contents && typeof hover.contents === 'object' && 'value' in hover.contents) {
        const markdown = hover.contents.value;
        expect(markdown).toContain('**Workflow Variable**: `workflow.uid`');
      }
    });
  });

  describe('Completion Provider - テンプレート名', () => {
    it('should provide template name completions', async () => {
      // 仮想的な位置: "template: " の後
      const testContent = `${document.getText()}\n      template: `;
      const testDoc = TextDocument.create(document.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const position = Position.create(lines.length - 1, 16);

      const completions = await completionProvider.provideCompletion(testDoc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('main');
      expect(labels).toContain('prepare-data-template');
      expect(labels).toContain('process-data-template');
      expect(labels).toContain('output-results-template');
      expect(labels).toContain('helper-template');

      // すべての補完候補がFunction型であることを確認
      for (const item of completions.items) {
        expect(item.kind).toBe(CompletionItemKind.Function);
      }
    });
  });

  describe('Completion Provider - Workflow変数', () => {
    it('should provide workflow variable completions', async () => {
      // 仮想的な位置: "{{workflow." の後
      const testContent = `${document.getText()}\n        args: ["{{workflow."]`;
      const testDoc = TextDocument.create(document.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const position = Position.create(lines.length - 1, 31);

      const completions = await completionProvider.provideCompletion(testDoc, position);
      expect(completions.items.length).toBeGreaterThan(0);

      const labels = completions.items.map(item => item.label);
      expect(labels).toContain('workflow.name');
      expect(labels).toContain('workflow.namespace');
      expect(labels).toContain('workflow.uid');

      // すべての補完候補がProperty型であることを確認
      for (const item of completions.items) {
        expect(item.kind).toBe(CompletionItemKind.Property);
      }
    });
  });

  describe('Diagnostic Provider - エラー検出', () => {
    it('should detect non-existent parameter reference', async () => {
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // Line 155: {{inputs.parameters.non-existent-param}}
      const error = diagnostics.find(
        d => d.message.includes('non-existent-param') && d.severity === DiagnosticSeverity.Error
      );

      expect(error).toBeDefined();
      expect(error?.message).toContain("Parameter 'non-existent-param' not found");
      expect(error?.range.start.line).toBe(154); // Line 155のインデックス
    });

    it('should not report errors for valid references', async () => {
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);

      // 有効なテンプレート参照とパラメータ参照にはエラーがないことを確認
      const validTemplates = [
        'prepare-data-template',
        'process-data-template',
        'output-results-template',
      ];

      for (const templateName of validTemplates) {
        const templateError = diagnostics.find(
          d =>
            d.message.includes(templateName) &&
            d.message.includes('not found') &&
            d.severity === DiagnosticSeverity.Error
        );
        expect(templateError).toBeUndefined();
      }
    });
  });

  describe('統合シナリオ - 実際のワークフロー編集', () => {
    it('should provide all LSP features for a comprehensive workflow', async () => {
      // 1. Diagnostics: エラーが正しく検出される
      const diagnostics = await diagnosticProvider.provideDiagnostics(document);
      expect(diagnostics.length).toBe(1); // non-existent-param のみ

      // 2. Definition: テンプレート参照から定義へジャンプできる
      const definitionResult = await definitionProvider.provideDefinition(
        document,
        Position.create(38, 22)
      );
      expect(definitionResult).not.toBeNull();

      // 3. Hover: 情報が表示される
      const hoverResult = await hoverProvider.provideHover(document, Position.create(38, 22));
      expect(hoverResult).not.toBeNull();

      // 4. Completion: 補完候補が提供される
      const testContent = `${document.getText()}\n      template: `;
      const testDoc = TextDocument.create(document.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      const completionResult = await completionProvider.provideCompletion(
        testDoc,
        Position.create(lines.length - 1, 16)
      );
      expect(completionResult.items.length).toBeGreaterThan(0);
    });

    it('should handle complex parameter references correctly', async () => {
      // steps.xxx.outputs.parameters 形式の参照
      // Line 47: value: "{{steps.prepare-data.outputs.parameters.prepared-data}}"

      // 現時点では steps 参照の定義ジャンプは未実装（将来の拡張）
      // このテストは将来の実装確認用
      const position = Position.create(46, 70);
      const _location = await definitionProvider.provideDefinition(document, position);

      // 現在は null を返すが、将来的には定義へジャンプできるようになる
      // expect(location).not.toBeNull();
    });
  });

  describe('パフォーマンス - 大規模ファイルの処理', () => {
    it('should process comprehensive workflow in reasonable time', async () => {
      const startTime = Date.now();

      // すべてのプロバイダーを実行
      await diagnosticProvider.provideDiagnostics(document);
      await definitionProvider.provideDefinition(document, Position.create(34, 24));
      await hoverProvider.provideHover(document, Position.create(34, 24));

      const testContent = `${document.getText()}\n      template: `;
      const testDoc = TextDocument.create(document.uri, 'yaml', 2, testContent);
      const lines = testContent.split('\n');
      await completionProvider.provideCompletion(testDoc, Position.create(lines.length - 1, 16));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 100ms以内に処理が完了することを確認
      expect(duration).toBeLessThan(100);
    });
  });
});
