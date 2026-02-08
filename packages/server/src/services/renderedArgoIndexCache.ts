/**
 * Phase 15B + Phase 16: Rendered Argo Index Cache
 *
 * Helm チャートのレンダリング結果全体から ArgoTemplateIndex + ArgoOnlyRegistry を
 * 構築・キャッシュする。cross-document templateRef 解決に使用。
 *
 * Phase 16: テンプレート単位の差分レンダリングに対応。変更テンプレートのみ
 * renderSingleTemplate() で再レンダリングし、ArgoTemplateIndex を部分更新する。
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

type PerTemplateCacheEntry = {
  contentHash: string;
  textDocument: TextDocument;
};

type CachedChart = {
  argoIndex: ArgoTemplateIndex;
  registry: ReferenceRegistry;
  /** テンプレートごとのレンダリング結果キャッシュ */
  templates: Map<string, PerTemplateCacheEntry>;
  /** dirty テンプレートの集合（差分更新対象） */
  dirtyTemplates: Set<string>;
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
   * Phase 16: dirty テンプレートがある場合は差分更新を行う。
   * dirty がなければキャッシュヒット。キャッシュ自体がなければフルレンダリング。
   */
  async getRegistry(chartDir: string): Promise<ReferenceRegistry | null> {
    const available = await this.helmTemplateExecutor.isHelmAvailable();
    if (!available) {
      return null;
    }

    const cached = this.cache.get(chartDir);

    // キャッシュがない場合: フルレンダリング
    if (!cached) {
      return this.fullRender(chartDir);
    }

    // dirty がなければキャッシュヒット
    if (cached.dirtyTemplates.size === 0) {
      return cached.registry;
    }

    // 差分更新パス
    await this.refreshDirtyTemplates(cached, chartDir);
    return cached.registry;
  }

  /**
   * 特定テンプレートのレンダリング済み TextDocument を取得
   */
  async getRenderedDocument(chartDir: string, templatePath: string): Promise<TextDocument | null> {
    const cached = this.cache.get(chartDir);
    if (!cached) {
      // フルレンダリングにフォールバック
      await this.getRegistry(chartDir);
      const built = this.cache.get(chartDir);
      if (!built) return null;
      const entry = built.templates.get(templatePath);
      return entry?.textDocument ?? null;
    }

    // このテンプレートが dirty なら個別更新
    if (cached.dirtyTemplates.has(templatePath)) {
      await this.refreshSingleTemplate(cached, chartDir, templatePath);
    }

    const entry = cached.templates.get(templatePath);
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
    const result: RenderedDocument[] = [];
    for (const [templatePath, entry] of cached.templates) {
      result.push({
        sourceTemplatePath: templatePath,
        content: entry.textDocument.getText(),
        startLine: 0,
        endLine: entry.textDocument.lineCount - 1,
      });
    }
    return result;
  }

  /**
   * 特定テンプレートを dirty としてマーク（キャッシュは即座に消さない）
   */
  markDirty(chartDir: string, templatePath: string): void {
    const cached = this.cache.get(chartDir);
    if (cached) {
      cached.dirtyTemplates.add(templatePath);
    }
  }

  /**
   * 全テンプレートを dirty にマーク（values.yaml / _helpers.tpl 変更時）
   */
  markAllDirty(chartDir: string): void {
    const cached = this.cache.get(chartDir);
    if (cached) {
      for (const templatePath of cached.templates.keys()) {
        cached.dirtyTemplates.add(templatePath);
      }
    }
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

  /**
   * チャート全体をレンダリングしてキャッシュを構築（初回 or フルリビルド）
   */
  private async fullRender(chartDir: string): Promise<ReferenceRegistry | null> {
    const renderResult = await this.helmTemplateExecutor.renderChart(chartDir);
    if (!renderResult.success || !renderResult.documents || renderResult.documents.length === 0) {
      return null;
    }

    const argoIndex = new ArgoTemplateIndex();
    const templates = new Map<string, PerTemplateCacheEntry>();

    for (const doc of renderResult.documents) {
      const uri = `file:///rendered/${doc.sourceTemplatePath}`;
      argoIndex.indexDocument(uri, doc.content);
      templates.set(doc.sourceTemplatePath, {
        contentHash: simpleHash(doc.content),
        textDocument: TextDocument.create(uri, 'yaml', 1, doc.content),
      });
    }

    const registry = createArgoOnlyRegistry(argoIndex, this.configMapIndex);

    this.cache.set(chartDir, {
      argoIndex,
      registry,
      templates,
      dirtyTemplates: new Set(),
    });

    return registry;
  }

  /**
   * dirty テンプレートを差分レンダリングで更新
   */
  private async refreshDirtyTemplates(cached: CachedChart, chartDir: string): Promise<void> {
    const dirtyList = [...cached.dirtyTemplates];
    cached.dirtyTemplates.clear();

    let changed = false;

    for (const templatePath of dirtyList) {
      const didChange = await this.refreshSingleTemplate(cached, chartDir, templatePath);
      if (didChange) {
        changed = true;
      }
    }

    if (changed) {
      // argoIndex が更新されたので registry を再構築
      cached.registry = createArgoOnlyRegistry(cached.argoIndex, this.configMapIndex);
    }
  }

  /**
   * 単一テンプレートを再レンダリングして ArgoTemplateIndex を部分更新
   *
   * @returns true if content changed
   */
  private async refreshSingleTemplate(
    cached: CachedChart,
    chartDir: string,
    templatePath: string
  ): Promise<boolean> {
    // dirty set からこのテンプレートを除去
    cached.dirtyTemplates.delete(templatePath);

    const result = await this.helmTemplateExecutor.renderSingleTemplate(chartDir, templatePath);
    if (!result.success || !result.documents || result.documents.length === 0) {
      // レンダリング失敗 → 旧エントリを削除
      const oldEntry = cached.templates.get(templatePath);
      if (oldEntry) {
        const renderedUri = `file:///rendered/${templatePath}`;
        cached.argoIndex.removeFile(renderedUri);
        cached.templates.delete(templatePath);
        return true;
      }
      return false;
    }

    const newContent = result.documents[0].content;
    const newHash = simpleHash(newContent);
    const oldEntry = cached.templates.get(templatePath);

    // ハッシュが同じなら変更なし
    if (oldEntry && oldEntry.contentHash === newHash) {
      return false;
    }

    const renderedUri = `file:///rendered/${templatePath}`;

    // 旧エントリを ArgoTemplateIndex から削除
    if (oldEntry) {
      cached.argoIndex.removeFile(renderedUri);
    }

    // 新しい内容でインデックス
    cached.argoIndex.indexDocument(renderedUri, newContent);
    cached.templates.set(templatePath, {
      contentHash: newHash,
      textDocument: TextDocument.create(renderedUri, 'yaml', 1, newContent),
    });

    return true;
  }
}
