/**
 * Argo Workflows LSP - Definition Provider
 *
 * テンプレート参照から定義へのジャンプ機能を提供。
 * ReferenceRegistry に処理を委譲する薄い層。
 * Phase 7: レンダリング済みYAMLの元テンプレートへのジャンプ。
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
    private symbolMappingIndex?: SymbolMappingIndex
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
    // Phase 7: レンダリング済みYAMLの場合、元テンプレートへジャンプ
    if (this.symbolMappingIndex && isRenderedYaml(document)) {
      return this.handleRenderedYamlDefinition(document, position);
    }

    const resolved = await this.registry.detectAndResolve(document, position);
    if (resolved?.definitionLocation) {
      return Location.create(resolved.definitionLocation.uri, resolved.definitionLocation.range);
    }
    return null;
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
