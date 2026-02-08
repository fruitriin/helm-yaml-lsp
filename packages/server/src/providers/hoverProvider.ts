/**
 * Argo Workflows LSP - Hover Provider
 *
 * テンプレート参照にホバーすると詳細情報を表示。
 * ReferenceRegistry に処理を委譲する薄い層。
 * Phase 7: レンダリング済みYAMLのHelm式情報表示。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { type Hover, MarkupKind, type Position } from 'vscode-languageserver-types';
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

/**
 * Hover Provider
 *
 * LSP textDocument/hoverリクエストを処理し、
 * テンプレート参照の詳細情報をマークダウン形式で表示
 */
export class HoverProvider {
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
   * ホバー情報を提供
   */
  async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
    // Phase 7: レンダリング済みYAMLの場合、元テンプレート情報をホバー表示
    if (this.symbolMappingIndex && isRenderedYaml(document)) {
      const renderedHover = await this.handleRenderedYamlHover(document, position);
      if (renderedHover) {
        return renderedHover;
      }
    }

    const resolved = await this.registry.detectAndResolve(document, position);
    if (resolved?.hoverMarkdown) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: resolved.hoverMarkdown,
        },
        range: resolved.detected.range,
      };
    }
    return null;
  }

  /**
   * レンダリング済みYAMLのホバー情報を処理
   *
   * Helm式の展開元情報を表示
   */
  private async handleRenderedYamlHover(
    document: TextDocument,
    position: Position
  ): Promise<Hover | null> {
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

    // Helm式を検索
    const exprResult = await this.symbolMappingIndex.findOriginalHelmExpression(
      chartDir,
      templatePath,
      position.line,
      position.character
    );

    if (exprResult) {
      const parts: string[] = [];
      parts.push(`**Helm Expression**: \`${exprResult.expression}\``);
      parts.push(`**Rendered Value**: \`${exprResult.renderedValue}\``);
      parts.push(`**Source**: \`${templatePath}:${exprResult.originalLine + 1}\``);

      if (exprResult.confidence < 0.7) {
        parts.push('---');
        parts.push('*Mapping confidence is low — jump target may be inaccurate*');
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: parts.join('  \n'),
        },
      };
    }

    // Helm式がなくても、元テンプレートの位置情報を表示
    const posResult = await this.symbolMappingIndex.findOriginalLocation(
      chartDir,
      templatePath,
      position.line,
      position.character
    );

    if (posResult && posResult.confidence >= 0.5) {
      const parts: string[] = [];
      parts.push(`**Source Template**: \`${templatePath}\``);
      parts.push(`**Original Line**: ${posResult.line + 1}`);
      parts.push(`**Confidence**: ${Math.round(posResult.confidence * 100)}%`);

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: parts.join('  \n'),
        },
      };
    }

    return null;
  }
}
