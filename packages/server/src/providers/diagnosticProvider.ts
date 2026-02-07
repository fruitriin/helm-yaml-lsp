/**
 * Argo Workflows LSP - Diagnostic Provider
 *
 * 存在しないテンプレート参照やパラメータ参照を検出し、診断情報を提供。
 * ReferenceRegistry に処理を委譲する薄い層。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import type { ReferenceRegistry } from '@/references/registry';
import { createReferenceRegistry } from '@/references/setup';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { ValuesIndex } from '@/services/valuesIndex';

/**
 * Diagnostic Provider
 *
 * LSP textDocument/diagnosticsを処理し、
 * 存在しない参照やエラーを検出
 */
export class DiagnosticProvider {
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
   * 診断情報を提供
   */
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
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
}
