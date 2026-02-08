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
import { DocumentHighlightProvider } from '@/providers/documentHighlightProvider';
import { DocumentSymbolProvider } from '@/providers/documentSymbolProvider';
import { HoverProvider } from '@/providers/hoverProvider';
import { createReferenceRegistry } from '@/references/setup';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { ConfigMapIndex } from '@/services/configMapIndex';
import { FileWatcher } from '@/services/fileWatcher';
import { HelmChartIndex } from '@/services/helmChartIndex';
import { HelmTemplateExecutor } from '@/services/helmTemplateExecutor';
import { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import { SymbolMappingIndex } from '@/services/symbolMappingIndex';
import { ValuesIndex } from '@/services/valuesIndex';
// "@/" エイリアスを使用した型定義のインポート
import { defaultSettings, type ServerSettings } from '@/types';
import { FileCache } from '@/utils/fileCache';
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
const configMapIndex = new ConfigMapIndex();
const helmTemplateExecutor = new HelmTemplateExecutor();
const fileCache = new FileCache();
const symbolMappingIndex = new SymbolMappingIndex(helmTemplateExecutor, fileCache);
const fileWatcher = new FileWatcher(connection);
const _referenceRegistry = createReferenceRegistry(
  argoTemplateIndex,
  helmChartIndex,
  valuesIndex,
  helmTemplateIndex,
  configMapIndex
);
const definitionProvider = new DefinitionProvider(
  argoTemplateIndex,
  helmChartIndex,
  valuesIndex,
  helmTemplateIndex,
  configMapIndex,
  _referenceRegistry,
  symbolMappingIndex
);
const hoverProvider = new HoverProvider(
  argoTemplateIndex,
  helmChartIndex,
  valuesIndex,
  helmTemplateIndex,
  configMapIndex,
  _referenceRegistry,
  symbolMappingIndex
);
const completionProvider = new CompletionProvider(
  helmChartIndex,
  valuesIndex,
  helmTemplateIndex,
  configMapIndex
);
const diagnosticProvider = new DiagnosticProvider(
  argoTemplateIndex,
  helmChartIndex,
  valuesIndex,
  helmTemplateIndex,
  configMapIndex,
  undefined,
  helmTemplateExecutor,
  symbolMappingIndex
);
const documentSymbolProvider = new DocumentSymbolProvider();
const documentHighlightProvider = new DocumentHighlightProvider();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let helmNotificationShown = false;

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
      documentSymbolProvider: true,
      documentHighlightProvider: true,
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
    helmChartIndex.setWorkspaceFolders(folderPaths);
    await helmChartIndex.initialize();

    // Values Index初期化
    const charts = helmChartIndex.getAllCharts();
    await valuesIndex.initialize(charts);

    // Helm Template Index初期化
    await helmTemplateIndex.initialize(charts);

    // ConfigMap Index初期化
    await configMapIndex.initialize(folderPaths);
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

    // values.yamlの変更時はValuesIndexを更新、Phase 7マッピングを無効化
    if (uri.endsWith('values.yaml') || uri.endsWith('values.yml')) {
      if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
        await valuesIndex.updateValuesFile(uri);

        // Phase 7: values変更時はレンダリングキャッシュとマッピングを無効化
        const filePath = uriToFilePath(uri);
        const chartRootDir = filePath.substring(0, filePath.lastIndexOf('/values.yaml'));
        symbolMappingIndex.invalidate(chartRootDir);
        helmTemplateExecutor.clearCache(chartRootDir);
      }
    }

    // Helmテンプレートファイルの変更時はHelmTemplateIndexを更新
    if (
      uri.includes('/templates/') &&
      (uri.endsWith('.yaml') || uri.endsWith('.yml') || uri.endsWith('.tpl'))
    ) {
      if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
        await helmTemplateIndex.updateTemplateFile(uri);

        // Phase 7: テンプレート変更時はレンダリングキャッシュとマッピングを無効化
        const filePath = uriToFilePath(uri);
        const templatesIdx = filePath.indexOf('/templates/');
        if (templatesIdx !== -1) {
          const chartRootDir = filePath.substring(0, templatesIdx);
          const templatePath = filePath.substring(templatesIdx + 1);
          symbolMappingIndex.invalidate(chartRootDir, templatePath);
          helmTemplateExecutor.clearCache(chartRootDir);
        }
      }
    }

    // ConfigMap/Secretファイルの変更時はConfigMapIndexを更新
    if (changeType === FileChangeType.Created || changeType === FileChangeType.Changed) {
      await configMapIndex.updateFile(uri);
    } else if (changeType === FileChangeType.Deleted) {
      configMapIndex.removeFile(uri);
    }
  });

  console.log('✅ Argo Workflows Language Server initialized successfully');
  connection.console.log('✅ Argo Workflows Language Server initialized successfully');
});

// 設定変更のハンドリング
let _globalSettings: ServerSettings = defaultSettings;

connection.onDidChangeConfiguration(async change => {
  if (hasConfigurationCapability) {
    _globalSettings = change.settings?.argoWorkflowsLSP || defaultSettings;
  }

  if (_globalSettings.enableTemplateRendering && !helmNotificationShown) {
    const available = await helmTemplateExecutor.isHelmAvailable();
    if (!available) {
      helmNotificationShown = true;
      connection.window.showWarningMessage(
        'Helm CLI is not available. Template rendering features will be disabled. Install Helm to enable them.'
      );
    }
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

// ドキュメントシンボル機能
connection.onDocumentSymbol(params => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return documentSymbolProvider.provideDocumentSymbols(document);
});

// ドキュメントハイライト機能
connection.onDocumentHighlight(params => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return documentHighlightProvider.provideDocumentHighlights(document, params.position);
});

// ドキュメントを開いたときの処理
documents.onDidOpen(async event => {
  connection.console.log(`Document opened: ${event.document.uri}`);

  // 開かれたファイルをインデックスに追加
  const uri = event.document.uri;

  // ArgoTemplateIndexに追加
  await argoTemplateIndex.updateFile(uri);

  // ConfigMapIndexに追加
  await configMapIndex.updateFile(uri);

  // HelmChartIndexに追加（Helmファイルの場合）
  if (helmChartIndex) {
    const filePath = uriToFilePath(uri);
    if (filePath) {
      const chartDir = filePath.substring(0, filePath.lastIndexOf('/'));
      await helmChartIndex.updateChart(chartDir);
    }
  }

  // 診断を実行（設定で有効な場合のみ）
  if (_globalSettings.enableDiagnostics) {
    const diagnostics = await diagnosticProvider.provideDiagnostics(event.document);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
  } else {
    // 診断が無効な場合は空の配列を送信してクリア
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  }
});

// ドキュメント変更時の処理
documents.onDidChangeContent(async change => {
  connection.console.log(`Document changed: ${change.document.uri}`);

  // 診断を実行（設定で有効な場合のみ）
  if (_globalSettings.enableDiagnostics) {
    const diagnostics = await diagnosticProvider.provideDiagnostics(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
  } else {
    // 診断が無効な場合は空の配列を送信してクリア
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
  }
});

// ドキュメントマネージャーをリッスン
documents.listen(connection);

console.log('👂 Document manager listening...');

// 接続をリッスン
connection.listen();

console.log('✅ Argo Workflows Language Server is now listening for client connections');
connection.console.log('✅ Argo Workflows Language Server started and ready');
