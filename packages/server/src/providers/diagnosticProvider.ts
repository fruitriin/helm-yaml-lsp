/**
 * Argo Workflows LSP - Diagnostic Provider
 *
 * 存在しないテンプレート参照やパラメータ参照を検出し、診断情報を提供。
 * ReferenceRegistry に処理を委譲する薄い層。
 *
 * Phase 13: Helm テンプレートの場合、helm template でレンダリングした YAML に対して
 * Argo/ConfigMap 診断を走らせ、結果を元テンプレートの位置にマッピングして返す。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocument as TextDocumentImpl } from 'vscode-languageserver-textdocument';
import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { isHelmTemplate } from '@/features/documentDetection';
import type { ReferenceRegistry } from '@/references/registry';
import { createArgoOnlyRegistry, createReferenceRegistry } from '@/references/setup';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateExecutor } from '@/services/helmTemplateExecutor';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { SymbolMappingIndex } from '@/services/symbolMappingIndex';
import type { ValuesIndex } from '@/services/valuesIndex';
import { uriToFilePath } from '@/utils/uriUtils';

/** 位置マッピングの confidence 閾値 */
const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Diagnostic Provider
 *
 * LSP textDocument/diagnosticsを処理し、
 * 存在しない参照やエラーを検出
 */
export class DiagnosticProvider {
  private registry: ReferenceRegistry;
  private helmTemplateExecutor?: HelmTemplateExecutor;
  private symbolMappingIndex?: SymbolMappingIndex;
  private helmChartIndex?: HelmChartIndex;
  private configMapIndex?: ConfigMapIndex;

  constructor(
    templateIndex: ArgoTemplateIndex,
    helmChartIndex?: HelmChartIndex,
    valuesIndex?: ValuesIndex,
    helmTemplateIndex?: HelmTemplateIndex,
    configMapIndex?: ConfigMapIndex,
    registry?: ReferenceRegistry,
    helmTemplateExecutor?: HelmTemplateExecutor,
    symbolMappingIndex?: SymbolMappingIndex,
    _argoRegistry?: ReferenceRegistry
  ) {
    this.registry =
      registry ??
      createReferenceRegistry(
        templateIndex,
        helmChartIndex,
        valuesIndex,
        helmTemplateIndex,
        configMapIndex
      );
    this.helmChartIndex = helmChartIndex;
    this.helmTemplateExecutor = helmTemplateExecutor;
    this.symbolMappingIndex = symbolMappingIndex;
    this.configMapIndex = configMapIndex;
  }

  /**
   * 診断情報を提供
   */
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    // Step 1: 通常の診断（Helm ガード or Argo ガード）
    const directDiagnostics = await this.provideDirectDiagnostics(document);

    // Step 2-6: Helm テンプレートなら追加診断
    if (isHelmTemplate(document) && this.helmTemplateExecutor) {
      const renderedDiagnostics = await this.provideRenderedDiagnostics(document);
      return [...directDiagnostics, ...renderedDiagnostics];
    }

    return directDiagnostics;
  }

  /**
   * 直接の診断（既存ロジック）
   */
  private async provideDirectDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const failures = await this.registry.validateAll(document);
    return failures
      .filter(r => r.diagnosticMessage != null)
      .map(r => ({
        severity: DiagnosticSeverity.Error,
        range: r.detected.range,
        message: r.diagnosticMessage as string,
        source: 'argo-workflows-lsp',
      }));
  }

  /**
   * レンダリング済み YAML 経由の Argo/ConfigMap 診断（Phase 13）
   *
   * 1. helm CLI 可用性チェック
   * 2. chartDir 解決
   * 3. Chart 全体をレンダリング（templateRef 解決のため）
   * 4. レンダリング済み WorkflowTemplate を一時インデックスに登録
   * 5. レンダリング済み YAML で Argo/ConfigMap 診断
   * 6. 位置マッピング（confidence 閾値フィルタ）
   */
  private async provideRenderedDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    if (!this.helmTemplateExecutor) {
      return [];
    }

    // Step 2: helm CLI 可用性チェック
    const helmAvailable = await this.helmTemplateExecutor.isHelmAvailable();
    if (!helmAvailable) {
      return [];
    }

    // Step 3: chartDir 解決
    const chart = this.helmChartIndex?.findChartForFile(document.uri);
    if (!chart) {
      return [];
    }

    // テンプレートの相対パスを計算
    const filePath = uriToFilePath(document.uri);
    const templatesIdx = filePath.indexOf('/templates/');
    if (templatesIdx === -1) {
      return [];
    }
    const templatePath = filePath.substring(templatesIdx + 1);

    // Step 4: Chart 全体をレンダリング（templateRef の相互参照解決に必要）
    const renderResult = await this.helmTemplateExecutor.renderChart(chart.rootDir);
    if (!renderResult.success || !renderResult.documents || renderResult.documents.length === 0) {
      return [];
    }

    // 現在のテンプレートのレンダリング結果を検索
    const currentRenderedDoc = renderResult.documents.find(
      d => d.sourceTemplatePath === templatePath
    );
    if (!currentRenderedDoc) {
      return [];
    }

    // Step 5: レンダリング済み WorkflowTemplate を一時インデックスに登録
    const tempArgoIndex = new ArgoTemplateIndex();
    for (const doc of renderResult.documents) {
      tempArgoIndex.indexDocument(`file:///rendered/${doc.sourceTemplatePath}`, doc.content);
    }

    // 一時的な argoOnlyRegistry を構築
    const tempArgoRegistry = createArgoOnlyRegistry(tempArgoIndex, this.configMapIndex);

    // Step 6: レンダリング済み YAML で Argo/ConfigMap 診断
    const renderedTextDoc = TextDocumentImpl.create(
      'file:///rendered-temp.yaml',
      'yaml',
      1,
      currentRenderedDoc.content
    );

    const failures = await tempArgoRegistry.validateAll(renderedTextDoc);
    const argoFailures = failures.filter(r => r.diagnosticMessage != null);

    if (argoFailures.length === 0) {
      return [];
    }

    // Step 7: 位置マッピング
    if (!this.symbolMappingIndex) {
      return [];
    }

    const mappedDiagnostics: Diagnostic[] = [];
    for (const failure of argoFailures) {
      const originalPos = await this.symbolMappingIndex.findOriginalLocation(
        chart.rootDir,
        templatePath,
        failure.detected.range.start.line,
        failure.detected.range.start.character
      );

      if (!originalPos || originalPos.confidence < CONFIDENCE_THRESHOLD) {
        continue;
      }

      // 元テンプレートの範囲を計算
      const rangeLength =
        failure.detected.range.end.character - failure.detected.range.start.character;

      mappedDiagnostics.push({
        severity:
          originalPos.confidence >= 0.8 ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
        range: {
          start: { line: originalPos.line, character: originalPos.character },
          end: { line: originalPos.line, character: originalPos.character + rangeLength },
        },
        message: failure.diagnosticMessage as string,
        source: 'argo-workflows-lsp',
      });
    }

    return mappedDiagnostics;
  }
}
