import {
  type CompletionItem,
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
import { clearChartYamlCache } from '@/features/documentDetection';
import { CompletionProvider } from '@/providers/completionProvider';
import { DefinitionProvider } from '@/providers/definitionProvider';
import { DiagnosticProvider } from '@/providers/diagnosticProvider';
import { HoverProvider } from '@/providers/hoverProvider';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { HelmChartIndex } from '@/services/helmChartIndex';
import { ValuesIndex } from '@/services/valuesIndex';
import { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import { FileWatcher } from '@/services/fileWatcher';
// "@/" エイリアスを使用した型定義のインポート
import { defaultSettings, type ServerSettings } from '@/types';
import { uriToFilePath } from '@/utils/uriUtils';

// LSPサーバーの接続を作成
const connection = createConnection(ProposedFeatures.all);

console.log('🚀 Argo Workflows Language Server starting...');

// テキストドキュメントマネージャー
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// サービスインスタンス
const argoTemplateIndex = new ArgoTemplateIndex();
const helmChartIndex = new HelmChartIndex();
const valuesIndex = new ValuesIndex();
const helmTemplateIndex = new HelmTemplateIndex();
const fileWatcher = new FileWatcher(connection);
const definitionProvider = new DefinitionProvider(argoTemplateIndex, helmChartIndex, valuesIndex, helmTemplateIndex);
const hoverProvider = new HoverProvider(argoTemplateIndex, helmChartIndex, valuesIndex, helmTemplateIndex);
const completionProvider = new CompletionProvider(helmChartIndex, valuesIndex, helmTemplateIndex);
const diagnosticProvider = new DiagnosticProvider(argoTemplateIndex, helmChartIndex, valuesIndex, helmTemplateIndex);

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
    const folders = workspaceFolders.map(folder => folder.uri);
    const folderPaths = folders.map(uri => uriToFilePath(uri));

    // Argo Template Index初期化
    argoTemplateIndex.setWorkspaceFolders(folderPaths);
    await argoTemplateIndex.initialize();

    // Helm Chart Index初期化
    await helmChartIndex.initialize(folders);

    // Values Index初期化
    const charts = helmChartIndex.getAllCharts();
    await valuesIndex.initialize(charts);

    // Helm Template Index初期化
    await helmTemplateIndex.initialize(charts);
  }

  // ファイル監視を開始
  fileWatcher.watch('**/*.{yaml,yml}', 'yaml-files', async (uri, changeType) => {
    if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
      await argoTemplateIndex.updateFile(uri);
    } else if (changeType === FileChangeType.Deleted) {
      argoTemplateIndex.removeFile(uri);
    }

    // Chart.yamlの変更時はキャッシュをクリアし、HelmChartIndexを更新
    if (uri.endsWith('Chart.yaml') || uri.endsWith('Chart.yml')) {
      clearChartYamlCache();

      // Chart.yamlが変更された場合、その親ディレクトリのChartを更新
      const filePath = uriToFilePath(uri);
      const chartRootDir = filePath.substring(0, filePath.lastIndexOf('/Chart.yaml'));
      if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
        await helmChartIndex.updateChart(chartRootDir);
      }
    }

    // values.yamlの変更時はValuesIndexを更新
    if (uri.endsWith('values.yaml') || uri.endsWith('values.yml')) {
      if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
        await valuesIndex.updateValuesFile(uri);
      }
    }

    // Helmテンプレートファイルの変更時はHelmTemplateIndexを更新
    if (uri.includes('/templates/') && (uri.endsWith('.yaml') || uri.endsWith('.yml') || uri.endsWith('.tpl'))) {
      if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
        await helmTemplateIndex.updateTemplateFile(uri);
      }
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

// 補完機能
connection.onCompletion(async (params: TextDocumentPositionParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { isIncomplete: false, items: [] };
  }

  connection.console.log(
    `Completion requested at position: ${params.position.line}:${params.position.character}`
  );

  return await completionProvider.provideCompletion(document, params.position);
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// ドキュメント変更時の処理
documents.onDidChangeContent(async change => {
  connection.console.log(`Document changed: ${change.document.uri}`);

  // 診断を実行
  const diagnostics = await diagnosticProvider.provideDiagnostics(change.document);
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

// ドキュメントマネージャーをリッスン
documents.listen(connection);

console.log('👂 Document manager listening...');

// 接続をリッスン
connection.listen();

console.log('✅ Argo Workflows Language Server is now listening for client connections');
connection.console.log('✅ Argo Workflows Language Server started and ready');
