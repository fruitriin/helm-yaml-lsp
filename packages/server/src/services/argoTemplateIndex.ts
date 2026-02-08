/**
 * Argo Workflows LSP - Template Index Service
 *
 * ワークスペース内のWorkflowTemplate/ClusterWorkflowTemplateをインデックス化
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { isArgoWorkflowDocument } from '@/features/documentDetection';
import { findTemplateDefinitions } from '@/features/templateFeatures';
import type { ArgoWorkflowKind, IndexedWorkflowTemplate, TemplateDefinition } from '@/types/argo';
import { findFiles, readFile } from '@/utils/fileSystem';
import { normalizeUri } from '@/utils/uriUtils';

/**
 * Argoテンプレートインデックスサービス
 *
 * ワークスペース内のWorkflowTemplate/ClusterWorkflowTemplateをインデックス化し、
 * templateRefからの参照解決を提供
 */
export class ArgoTemplateIndex {
  private index = new Map<string, IndexedWorkflowTemplate>();
  /** 逆引きインデックス: normalizedUri → index キーの集合（O(1) removeFile 用） */
  private uriToKeys = new Map<string, Set<string>>();
  private workspaceFolders: string[] = [];
  private initialized = false;

  /**
   * ワークスペースフォルダーの設定
   *
   * @param folders - ワークスペースフォルダーのパス配列
   */
  setWorkspaceFolders(folders: string[]): void {
    this.workspaceFolders = folders;
  }

  /**
   * インデックスを初期化
   *
   * ワークスペース内のすべてのYAMLファイルをスキャンし、インデックスを構築
   *
   * @example
   * await argoTemplateIndex.initialize();
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.error('[ArgoTemplateIndex] Initializing...');

    for (const folder of this.workspaceFolders) {
      const uris = await findFiles('**/*.{yaml,yml}', folder, ['**/node_modules/**', '**/.git/**']);

      for (const uri of uris) {
        await this.indexFile(uri);
      }
    }

    this.initialized = true;
    console.error(`[ArgoTemplateIndex] Initialized with ${this.index.size} WorkflowTemplates`);
  }

  /**
   * ファイルをインデックスに追加
   *
   * @param uri - ファイルURI
   */
  async indexFile(uri: string): Promise<void> {
    try {
      const content = await readFile(uri);
      this.indexDocument(uri, content);
    } catch (err) {
      console.error(`[ArgoTemplateIndex] Failed to index file: ${uri}`, err);
    }
  }

  /**
   * ドキュメント内容を直接インデックスに追加（ファイルI/O不要）
   *
   * レンダリング済み YAML など、メモリ上のコンテンツをインデックスする場合に使用。
   * TextDocument を渡すと TextDocument の再作成を省略できる。
   */
  indexDocument(uri: string, content: string): void;
  indexDocument(document: TextDocument): void;
  indexDocument(uriOrDoc: string | TextDocument, content?: string): void {
    if (typeof uriOrDoc === 'string') {
      const doc = TextDocument.create(uriOrDoc, 'yaml', 1, content!);
      this.indexTextDocument(doc);
    } else {
      this.indexTextDocument(uriOrDoc);
    }
  }

  /**
   * TextDocument をインデックスに追加（内部共通メソッド）
   */
  private indexTextDocument(document: TextDocument): void {
    if (!isArgoWorkflowDocument(document)) {
      return;
    }

    const definitions = findTemplateDefinitions(document);
    const uri = document.uri;
    const normalizedUri = normalizeUri(uri);

    // WorkflowTemplate/ClusterWorkflowTemplate のみインデックス
    for (const def of definitions) {
      if (def.kind !== 'WorkflowTemplate' && def.kind !== 'ClusterWorkflowTemplate') {
        continue;
      }

      if (!def.workflowName) {
        continue;
      }

      const key = this.makeKey(def.workflowName, def.kind);

      let indexed = this.index.get(key);
      if (!indexed) {
        indexed = {
          name: def.workflowName,
          kind: def.kind,
          uri: def.uri,
          templates: new Map(),
        };
        this.index.set(key, indexed);
      }

      indexed.templates.set(def.name, def);

      // 逆引きインデックスを更新
      let keys = this.uriToKeys.get(normalizedUri);
      if (!keys) {
        keys = new Set();
        this.uriToKeys.set(normalizedUri, keys);
      }
      keys.add(key);
    }
  }

  /**
   * ファイルのインデックスを更新
   *
   * @param uri - ファイルURI
   */
  async updateFile(uri: string): Promise<void> {
    this.removeFile(uri);
    await this.indexFile(uri);
  }

  /**
   * ファイルをインデックスから削除
   *
   * 逆引きインデックスにより O(1) で該当キーを特定する。
   *
   * @param uri - ファイルURI
   */
  removeFile(uri: string): void {
    const normalized = normalizeUri(uri);
    const keys = this.uriToKeys.get(normalized);
    if (!keys || keys.size === 0) {
      return;
    }

    for (const key of keys) {
      this.index.delete(key);
    }

    console.error(`[ArgoTemplateIndex] Removed ${keys.size} templates from ${uri}`);
    this.uriToKeys.delete(normalized);
  }

  /**
   * テンプレートを検索
   *
   * @param workflowTemplateName - WorkflowTemplate/ClusterWorkflowTemplate の metadata.name
   * @param templateName - テンプレート名 (spec.templates[].name)
   * @param clusterScope - ClusterWorkflowTemplate を検索するかどうか
   * @returns テンプレート定義、または undefined
   *
   * @example
   * const template = await argoTemplateIndex.findTemplate('my-workflow', 'hello', false);
   * if (template) {
   *   console.log(`Found template at ${template.uri}`);
   * }
   */
  async findTemplate(
    workflowTemplateName: string,
    templateName: string,
    clusterScope: boolean
  ): Promise<TemplateDefinition | undefined> {
    // 初期化されていない場合は初期化
    if (!this.initialized) {
      await this.initialize();
    }

    const kind: ArgoWorkflowKind = clusterScope ? 'ClusterWorkflowTemplate' : 'WorkflowTemplate';
    const key = this.makeKey(workflowTemplateName, kind);

    const indexed = this.index.get(key);
    if (!indexed) {
      return undefined;
    }

    return indexed.templates.get(templateName);
  }

  /**
   * WorkflowTemplate を検索
   *
   * テンプレート名を指定せず、WorkflowTemplate 自体を検索
   *
   * @param workflowTemplateName - WorkflowTemplate/ClusterWorkflowTemplate の metadata.name
   * @param clusterScope - ClusterWorkflowTemplate を検索するかどうか
   * @returns IndexedWorkflowTemplate、または undefined
   */
  async findWorkflowTemplate(
    workflowTemplateName: string,
    clusterScope: boolean
  ): Promise<IndexedWorkflowTemplate | undefined> {
    if (!this.initialized) {
      await this.initialize();
    }

    const kind: ArgoWorkflowKind = clusterScope ? 'ClusterWorkflowTemplate' : 'WorkflowTemplate';
    const key = this.makeKey(workflowTemplateName, kind);

    return this.index.get(key);
  }

  /**
   * テンプレート名だけで検索
   *
   * WorkflowTemplate 名が不明な場合に使用
   * （Helm 構文で WorkflowTemplate 名が確定しない場合など）
   *
   * @param templateName - テンプレート名
   * @param clusterScope - ClusterWorkflowTemplate を検索するかどうか
   * @returns テンプレート定義、または undefined
   */
  async findTemplateByName(
    templateName: string,
    clusterScope: boolean
  ): Promise<TemplateDefinition | undefined> {
    if (!this.initialized) {
      await this.initialize();
    }

    const kind = clusterScope ? 'ClusterWorkflowTemplate' : 'WorkflowTemplate';
    for (const [key, indexed] of this.index.entries()) {
      if (key.startsWith(`${kind}:`)) {
        const template = indexed.templates.get(templateName);
        if (template) {
          return template;
        }
      }
    }

    return undefined;
  }

  /**
   * インデックスキーを生成
   *
   * @param name - WorkflowTemplate名
   * @param kind - kind (WorkflowTemplate or ClusterWorkflowTemplate)
   * @returns インデックスキー
   */
  private makeKey(name: string, kind: ArgoWorkflowKind): string {
    return `${kind}:${name}`;
  }

  /**
   * インデックスをクリア
   */
  clear(): void {
    this.index.clear();
    this.uriToKeys.clear();
    this.initialized = false;
    console.error('[ArgoTemplateIndex] Cleared index');
  }

  /**
   * インデックスサイズを取得（テスト用）
   *
   * @returns インデックス内のWorkflowTemplate数
   */
  size(): number {
    return this.index.size;
  }
}
