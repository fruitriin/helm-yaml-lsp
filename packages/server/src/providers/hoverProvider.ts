/**
 * Argo Workflows LSP - Hover Provider
 *
 * テンプレート参照にホバーすると詳細情報を表示。
 * ReferenceRegistry に処理を委譲する薄い層。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { type Hover, MarkupKind, type Position } from 'vscode-languageserver-types';
import type { ReferenceRegistry } from '@/references/registry';
import { createReferenceRegistry } from '@/references/setup';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
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
    helmChartIndex?: HelmChartIndex,
    valuesIndex?: ValuesIndex,
    helmTemplateIndex?: HelmTemplateIndex,
    configMapIndex?: ConfigMapIndex,
    registry?: ReferenceRegistry
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
}
