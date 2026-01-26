import {
  type CompletionItem,
  CompletionItemKind,
  createConnection,
  type DefinitionParams,
  DidChangeConfigurationNotification,
  FileChangeType,
  type Hover,
  type HoverParams,
  type InitializeParams,
  type InitializeResult,
  type Location,
  ProposedFeatures,
  type TextDocumentPositionParams,
  TextDocumentSyncKind,
  TextDocuments,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// "@/" エイリアスを使用した型定義のインポート
import { defaultSettings, type ServerSettings } from '@/types';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { FileWatcher } from '@/services/fileWatcher';
import { DefinitionProvider } from '@/providers/definitionProvider';
import { HoverProvider } from '@/providers/hoverProvider';
import { uriToFilePath } from '@/utils/uriUtils';
import { clearChartYamlCache } from '@/features/documentDetection';

// LSPサーバーの接続を作成
const connection = createConnection(ProposedFeatures.all);

console.log('🚀 Argo Workflows Language Server starting...');

// テキストドキュメントマネージャー
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// サービスインスタンス
const argoTemplateIndex = new ArgoTemplateIndex();
const fileWatcher = new FileWatcher(connection);
const definitionProvider = new DefinitionProvider(argoTemplateIndex);
const hoverProvider = new HoverProvider(argoTemplateIndex);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

// サーバー初期化
connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // 定義へ移動機能を有効化
      definitionProvider: true,
      // ホバー機能を有効化
      hoverProvider: true,
      // 補完機能を有効化（将来の拡張用）
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '{', ':', ' '],
      },
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(async () => {
  console.log('📋 Server initialization phase...');

  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
    console.log('  ✓ Configuration capability enabled');
  }

  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('📁 Workspace folder change event received.');
    });
    console.log('  ✓ Workspace folder capability enabled');
  }

  // ワークスペースフォルダーを取得
  const workspaceFolders = await connection.workspace.getWorkspaceFolders();
  if (workspaceFolders) {
    const folders = workspaceFolders.map(folder => uriToFilePath(folder.uri));
    argoTemplateIndex.setWorkspaceFolders(folders);

    // 初期インデックス構築
    await argoTemplateIndex.initialize();
  }

  // ファイル監視を開始
  fileWatcher.watch('**/*.{yaml,yml}', 'yaml-files', async (uri, changeType) => {
    if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
      await argoTemplateIndex.updateFile(uri);
    } else if (changeType === FileChangeType.Deleted) {
      argoTemplateIndex.removeFile(uri);
    }

    // Chart.yamlの変更時はキャッシュをクリア
    if (uri.endsWith('Chart.yaml') || uri.endsWith('Chart.yml')) {
      clearChartYamlCache();
    }
  });

  console.log('✅ Argo Workflows Language Server initialized successfully');
  connection.console.log('✅ Argo Workflows Language Server initialized successfully');
});

// 設定変更のハンドリング
let _globalSettings: ServerSettings = defaultSettings;

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    _globalSettings = change.settings.argoWorkflowsLSP || defaultSettings;
  }
});

// 定義へ移動機能
connection.onDefinition(async (params: DefinitionParams): Promise<Location | Location[] | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  connection.console.log(
    `Definition requested at position: ${params.position.line}:${params.position.character}`
  );

  return await definitionProvider.provideDefinition(document, params.position);
});

// ホバー機能
connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  connection.console.log(
    `Hover requested at position: ${params.position.line}:${params.position.character}`
  );

  return await hoverProvider.provideHover(document, params.position);
});

// 補完機能（Hello LSPデモ用）
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  // デモ: 簡単な補完アイテムを返す
  return [
    {
      label: 'template',
      kind: CompletionItemKind.Keyword,
      detail: 'Argo Workflows template',
      documentation: 'Define a workflow template',
    },
    {
      label: 'steps',
      kind: CompletionItemKind.Keyword,
      detail: 'Workflow steps',
      documentation: 'Define workflow steps',
    },
  ];
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// ドキュメント変更時の処理
documents.onDidChangeContent(change => {
  connection.console.log(`Document changed: ${change.document.uri}`);
});

// ドキュメントマネージャーをリッスン
documents.listen(connection);

console.log('👂 Document manager listening...');

// 接続をリッスン
connection.listen();

console.log('✅ Argo Workflows Language Server is now listening for client connections');
connection.console.log('✅ Argo Workflows Language Server started and ready');
