/**
 * Argo Workflows LSP - Completion Provider
 *
 * テンプレート名、パラメータ名、Workflow変数の入力補完を提供。
 * ReferenceRegistry に処理を委譲する薄い層。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionList, Position } from 'vscode-languageserver-types';
import type { ReferenceRegistry } from '@/references/registry';
import { createReferenceRegistry } from '@/references/setup';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { ValuesIndex } from '@/services/valuesIndex';

/**
 * Completion Provider
 *
 * LSP textDocument/completionリクエストを処理し、
 * 入力補完候補を提供
 */
export class CompletionProvider {
  private registry: ReferenceRegistry;

  constructor(
    argoTemplateIndex: ArgoTemplateIndex,
    helmChartIndex?: HelmChartIndex,
    valuesIndex?: ValuesIndex,
    helmTemplateIndex?: HelmTemplateIndex,
    configMapIndex?: ConfigMapIndex,
    registry?: ReferenceRegistry
  ) {
    // Phase 18: ダミー ArgoTemplateIndex を排除 — 実インスタンスを外部から受け取る
    this.registry =
      registry ??
      createReferenceRegistry(
        argoTemplateIndex,
        helmChartIndex,
        valuesIndex,
        helmTemplateIndex,
        configMapIndex
      );
  }

  /**
   * 補完候補を提供
   */
  async provideCompletion(document: TextDocument, position: Position): Promise<CompletionList> {
    const items = this.registry.provideCompletions(document, position);
    return { isIncomplete: false, items };
  }
}
