/**
 * Argo Workflows LSP - Definition Provider
 *
 * テンプレート参照から定義へのジャンプ機能を提供。
 * ReferenceRegistry に処理を委譲する薄い層。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, type Position } from 'vscode-languageserver-types';
import type { ReferenceRegistry } from '@/references/registry';
import { createReferenceRegistry } from '@/references/setup';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { ValuesIndex } from '@/services/valuesIndex';

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
   * 定義を提供
   */
  async provideDefinition(
    document: TextDocument,
    position: Position
  ): Promise<Location | Location[] | null> {
    const resolved = await this.registry.detectAndResolve(document, position);
    if (resolved?.definitionLocation) {
      return Location.create(resolved.definitionLocation.uri, resolved.definitionLocation.range);
    }
    return null;
  }
}
