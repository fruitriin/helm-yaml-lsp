/**
 * Phase 15B: Rendered Argo Index Cache
 *
 * Helm チャートのレンダリング結果全体から ArgoTemplateIndex + ArgoOnlyRegistry を
 * 構築・キャッシュする。cross-document templateRef 解決に使用。
 *
 * DiagnosticProvider (Phase 13) / DefinitionProvider / HoverProvider で共有。
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { ReferenceRegistry } from '@/references/registry';
import { createArgoOnlyRegistry } from '@/references/setup';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmTemplateExecutor } from '@/services/helmTemplateExecutor';
import type { RenderedDocument } from '@/types/rendering';

type CachedChart = {
  argoIndex: ArgoTemplateIndex;
  registry: ReferenceRegistry;
  /** キャッシュ一致判定用: レンダリング出力のハッシュ */
  outputHash: string;
  /** レンダリング済みドキュメント一覧（TextDocument 化済み） */
  documents: RenderedDocumentEntry[];
};

type RenderedDocumentEntry = {
  sourceTemplatePath: string;
  textDocument: TextDocument;
};

/**
 * シンプルなハッシュ関数（キャッシュ一致判定用）
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

export class RenderedArgoIndexCache {
  private cache = new Map<string, CachedChart>();

  constructor(
    private helmTemplateExecutor: HelmTemplateExecutor,
    private configMapIndex?: ConfigMapIndex
  ) {}

  /**
   * チャートのレンダリング結果から構築した ArgoOnlyRegistry を取得
   *
   * HelmTemplateExecutor のキャッシュ（5分TTL）を活用し、
   * レンダリング結果が同じであれば ArgoTemplateIndex を再構築しない。
   */
  async getRegistry(chartDir: string): Promise<ReferenceRegistry | null> {
    const available = await this.helmTemplateExecutor.isHelmAvailable();
    if (!available) {
      return null;
    }

    const renderResult = await this.helmTemplateExecutor.renderChart(chartDir);
    if (!renderResult.success || !renderResult.documents || renderResult.documents.length === 0) {
      return null;
    }

    const outputHash = simpleHash(renderResult.output ?? '');

    // キャッシュヒットチェック
    const cached = this.cache.get(chartDir);
    if (cached && cached.outputHash === outputHash) {
      return cached.registry;
    }

    // 新しい ArgoTemplateIndex を構築
    const argoIndex = new ArgoTemplateIndex();
    const documents: RenderedDocumentEntry[] = [];

    for (const doc of renderResult.documents) {
      const uri = `file:///rendered/${doc.sourceTemplatePath}`;
      argoIndex.indexDocument(uri, doc.content);
      documents.push({
        sourceTemplatePath: doc.sourceTemplatePath,
        textDocument: TextDocument.create(uri, 'yaml', 1, doc.content),
      });
    }

    const registry = createArgoOnlyRegistry(argoIndex, this.configMapIndex);

    this.cache.set(chartDir, {
      argoIndex,
      registry,
      outputHash,
      documents,
    });

    return registry;
  }

  /**
   * 特定テンプレートのレンダリング済み TextDocument を取得
   */
  async getRenderedDocument(chartDir: string, templatePath: string): Promise<TextDocument | null> {
    // getRegistry() でキャッシュが構築される
    const registry = await this.getRegistry(chartDir);
    if (!registry) {
      return null;
    }

    const cached = this.cache.get(chartDir);
    if (!cached) {
      return null;
    }

    const entry = cached.documents.find(d => d.sourceTemplatePath === templatePath);
    return entry?.textDocument ?? null;
  }

  /**
   * レンダリング済みドキュメント一覧を取得
   */
  getRenderedDocuments(chartDir: string): RenderedDocument[] | null {
    const cached = this.cache.get(chartDir);
    if (!cached) {
      return null;
    }
    return cached.documents.map(d => ({
      sourceTemplatePath: d.sourceTemplatePath,
      content: d.textDocument.getText(),
      startLine: 0,
      endLine: d.textDocument.lineCount - 1,
    }));
  }

  invalidate(chartDir?: string): void {
    if (chartDir) {
      this.cache.delete(chartDir);
    } else {
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
