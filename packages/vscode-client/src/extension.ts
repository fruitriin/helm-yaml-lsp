import * as path from 'node:path';
import { type ExtensionContext, workspace } from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // サーバーモジュールのパス
  const serverModule = context.asAbsolutePath(path.join('..', 'server', 'dist', 'server.js'));

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
        execArgv: ['--nolazy', '--inspect=6009'],
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

  // クライアントを起動
  client.start();

  console.log('Argo Workflows Language Server client activated');
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
