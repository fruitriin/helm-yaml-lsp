/**
 * Argo Workflows LSP - Definition Provider
 *
 * テンプレート参照から定義へのジャンプ機能を提供。
 * ReferenceRegistry に処理を委譲する薄い層。
 * Phase 7: レンダリング済みYAMLの元テンプレートへのジャンプ。
 * Phase 15: レンダリング済みYAMLの Argo 意味解決。
 * Phase 15B: RenderedArgoIndexCache で cross-document templateRef 解決。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, type Position } from 'vscode-languageserver-types';
import {
  extractChartNameFromSource,
  extractSourceTemplatePath,
  isRenderedYaml,
} from '@/features/renderedYamlDetection';
import type { ReferenceRegistry } from '@/references/registry';
import { createReferenceRegistry } from '@/references/setup';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { RenderedArgoIndexCache } from '@/services/renderedArgoIndexCache';
import type { SymbolMappingIndex } from '@/services/symbolMappingIndex';
import type { ValuesIndex } from '@/services/valuesIndex';
import { filePathToUri } from '@/utils/uriUtils';

/**
 * Definition Provider
 *
 * LSP textDocument/definitionリクエストを処理し、
 * テンプレート参照から定義へのジャンプを提供
 */
export class DefinitionProvider {
  private registry: ReferenceRegistry;

  constructor(
    templateIndex: ArgoTemplateIndex,
    private helmChartIndex?: HelmChartIndex,
    valuesIndex?: ValuesIndex,
    helmTemplateIndex?: HelmTemplateIndex,
    configMapIndex?: ConfigMapIndex,
    registry?: ReferenceRegistry,
    private symbolMappingIndex?: SymbolMappingIndex,
    private renderedArgoIndexCache?: RenderedArgoIndexCache
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
  }

  /**
   * 定義を提供
   */
  async provideDefinition(
    document: TextDocument,
    position: Position
  ): Promise<Location | Location[] | null> {
    // Phase 15/15B: レンダリング済みYAMLの場合、Argo 意味解決を試行
    if (isRenderedYaml(document)) {
      // Step 1: 既存 registry でローカル参照解決（Phase 15）
      const resolved = await this.registry.detectAndResolve(document, position);
      if (resolved?.definitionLocation) {
        return Location.create(resolved.definitionLocation.uri, resolved.definitionLocation.range);
      }
      // Step 2: RenderedArgoIndexCache で cross-document 解決（Phase 15B）
      const crossDocResult = await this.handleRenderedYamlCrossDocDefinition(document, position);
      if (crossDocResult) {
        return crossDocResult;
      }
      // Step 3: symbolMapping による元テンプレートへのジャンプ
      if (this.symbolMappingIndex) {
        return this.handleRenderedYamlDefinition(document, position);
      }
      return null;
    }

    const resolved = await this.registry.detectAndResolve(document, position);
    if (resolved?.definitionLocation) {
      return Location.create(resolved.definitionLocation.uri, resolved.definitionLocation.range);
    }
    return null;
  }

  /**
   * Phase 15B: RenderedArgoIndexCache 経由の cross-document 定義解決
   *
   * レンダリング済みチャート全体の ArgoTemplateIndex を使い、
   * 別テンプレートの WorkflowTemplate への templateRef を解決する。
   * 仮想 URI (file:///rendered/...) → 実ファイルパスへのマッピング付き。
   */
  private async handleRenderedYamlCrossDocDefinition(
    document: TextDocument,
    position: Position
  ): Promise<Location | null> {
    if (!this.renderedArgoIndexCache || !this.helmChartIndex) {
      return null;
    }

    const chartName = extractChartNameFromSource(document);
    if (!chartName) {
      return null;
    }

    const charts = this.helmChartIndex.getAllCharts();
    const chart = charts.find(c => c.name === chartName);
    if (!chart) {
      return null;
    }

    const registry = await this.renderedArgoIndexCache.getRegistry(chart.rootDir);
    if (!registry) {
      return null;
    }

    const resolved = await registry.detectAndResolve(document, position);
    if (!resolved?.definitionLocation) {
      return null;
    }

    const defUri = resolved.definitionLocation.uri;

    // 仮想 URI (file:///rendered/templates/xxx.yaml) → 実ファイルパスにマッピング
    if (defUri.startsWith('file:///rendered/')) {
      const renderedPath = defUri.replace('file:///rendered/', '');
      const realUri = filePathToUri(`${chart.rootDir}/${renderedPath}`);
      return Location.create(realUri, resolved.definitionLocation.range);
    }

    return Location.create(defUri, resolved.definitionLocation.range);
  }

  /**
   * レンダリング済みYAMLの定義ジャンプを処理
   *
   * 元テンプレートの対応行にジャンプ
   */
  private async handleRenderedYamlDefinition(
    document: TextDocument,
    position: Position
  ): Promise<Location | null> {
    if (!this.symbolMappingIndex || !this.helmChartIndex) {
      return null;
    }

    const templatePath = extractSourceTemplatePath(document);
    const chartName = extractChartNameFromSource(document);
    if (!templatePath || !chartName) {
      return null;
    }

    // Chart名からchartDirを特定
    const charts = this.helmChartIndex.getAllCharts();
    const chart = charts.find(c => c.name === chartName);
    if (!chart) {
      return null;
    }

    const chartDir = chart.rootDir;

    const result = await this.symbolMappingIndex.findOriginalLocation(
      chartDir,
      templatePath,
      position.line,
      position.character
    );

    if (!result) {
      return null;
    }

    const originalUri = filePathToUri(`${chartDir}/${templatePath}`);
    return Location.create(originalUri, {
      start: { line: result.line, character: result.character },
      end: { line: result.line, character: result.character },
    });
  }
}
