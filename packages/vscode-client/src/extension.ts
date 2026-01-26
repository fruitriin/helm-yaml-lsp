import * as path from 'node:path';
import { type ExtensionContext, window, workspace } from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
  console.log('🚀 Argo Workflows LSP Extension is now activating...');

  // サーバーモジュールのパス
  const serverModule = context.asAbsolutePath(path.join('..', 'server', 'dist', 'server.js'));
  console.log(`📂 Server module path: ${serverModule}`);

  // デバッグポート（環境変数から取得、デフォルトは6009）
  const debugPort = process.env.LSP_DEBUG_PORT || '6009';
  console.log(`🔍 Debug port: ${debugPort}`);

  // サーバーオプション
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', `--inspect=${debugPort}`],
      },
    },
  };

  // クライアントオプション
  const clientOptions: LanguageClientOptions = {
    // YAMLとHelmファイルを対象にする
    documentSelector: [
      { scheme: 'file', language: 'yaml' },
      { scheme: 'file', language: 'helm' },
    ],
    synchronize: {
      // ワークスペース内のYAMLファイルの変更を監視
      fileEvents: workspace.createFileSystemWatcher('**/*.{yaml,yml}'),
    },
  };

  // Language Clientを作成して起動
  client = new LanguageClient(
    'argoWorkflowsLSP',
    'Argo Workflows Language Server',
    serverOptions,
    clientOptions
  );

  console.log('🔌 Starting Language Server client...');

  // クライアントを起動して準備完了を待つ
  await client.start();
  console.log('✅ Argo Workflows LSP Extension activated');
  console.log('✅ Argo Workflows Language Server is ready!');
  window.showInformationMessage('Argo Workflows LSP activated successfully');
}

export function deactivate(): Thenable<void> | undefined {
  console.log('🛑 Argo Workflows LSP Extension is deactivating...');
  if (!client) {
    console.log('⚠️  No active client to stop');
    return undefined;
  }
  return client.stop().then(() => {
    console.log('✅ Argo Workflows LSP Extension deactivated');
  });
}
