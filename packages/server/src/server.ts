import {
  type CompletionItem,
  CompletionItemKind,
  createConnection,
  type DefinitionParams,
  DidChangeConfigurationNotification,
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

// LSPサーバーの接続を作成
const connection = createConnection(ProposedFeatures.all);

console.log('🚀 Argo Workflows Language Server starting...');

// テキストドキュメントマネージャー
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

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

connection.onInitialized(() => {
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

// 定義へ移動機能（Hello LSPデモ用）
connection.onDefinition((params: DefinitionParams): Location | Location[] | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  connection.console.log(
    `Definition requested at position: ${params.position.line}:${params.position.character}`
  );

  // 実際の実装はPhase 2で追加されます
  return null;
});

// ホバー機能（Hello LSPデモ用）
connection.onHover((params: HoverParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  connection.console.log(
    `Hover requested at position: ${params.position.line}:${params.position.character}`
  );

  // デモ: 簡単なホバーメッセージを返す
  return {
    contents: {
      kind: 'markdown',
      value: '**Hello from Argo Workflows LSP!**\n\nThis is a demo hover message.',
    },
  };
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
