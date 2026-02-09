import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ExtensionContext, languages, type TextDocument, window, workspace } from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

/** Chart.yaml 存在チェックのキャッシュ（ディレクトリ → boolean） */
const chartYamlDirCache = new Map<string, boolean>();

/**
 * ファイルの親ディレクトリ階層に Chart.yaml/Chart.yml が存在するかチェック
 */
function hasChartYaml(filePath: string): boolean {
  let currentDir = path.dirname(filePath);
  const rootDir = path.parse(currentDir).root;

  while (currentDir !== rootDir) {
    const cached = chartYamlDirCache.get(currentDir);
    if (cached !== undefined) {
      return cached;
    }

    const chartYamlPath = path.join(currentDir, 'Chart.yaml');
    const chartYmlPath = path.join(currentDir, 'Chart.yml');

    if (fs.existsSync(chartYamlPath) || fs.existsSync(chartYmlPath)) {
      chartYamlDirCache.set(currentDir, true);
      return true;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return false;
}

/**
 * ファイルが Helm テンプレートかどうかを判定
 *
 * /templates/ ディレクトリ内にあり、親に Chart.yaml が存在する場合は Helm テンプレート
 */
function isHelmTemplateFile(filePath: string): boolean {
  const isInTemplatesDir = filePath.includes(`${path.sep}templates${path.sep}`);
  if (!isInTemplatesDir) {
    return false;
  }
  return hasChartYaml(filePath);
}

/**
 * YAML ドキュメントが Helm テンプレートなら languageId を 'helm' に切り替え
 */
async function setHelmLanguageIfNeeded(doc: TextDocument): Promise<void> {
  if (doc.languageId !== 'yaml' && doc.languageId !== 'yml') {
    return;
  }
  if (doc.uri.scheme !== 'file') {
    return;
  }
  const filePath = doc.uri.fsPath;
  if (isHelmTemplateFile(filePath)) {
    await languages.setTextDocumentLanguage(doc, 'helm');
  }
}

export async function activate(context: ExtensionContext) {
  console.log('Argo Workflows LSP Extension is now activating...');

  // サーバーモジュールのパス (VSIXパッケージ内では dist/server/server.js に配置)
  const serverModule = context.asAbsolutePath(path.join('dist', 'server', 'server.js'));

  // デバッグポート（環境変数から取得、デフォルトは6009）
  const debugPort = process.env.LSP_DEBUG_PORT || '6009';

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
      fileEvents: workspace.createFileSystemWatcher('**/*.{yaml,yml,tpl}'),
    },
  };

  // Language Clientを作成して起動
  client = new LanguageClient(
    'argoWorkflowsLSP',
    'Argo Workflows Language Server',
    serverOptions,
    clientOptions
  );

  // 既存の開いているドキュメントの languageId を切り替え
  for (const doc of workspace.textDocuments) {
    await setHelmLanguageIfNeeded(doc);
  }

  // 新しく開くドキュメントの languageId を切り替え
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(doc => {
      setHelmLanguageIfNeeded(doc);
    })
  );

  // Chart.yaml が作成/削除されたらキャッシュをクリア
  const chartWatcher = workspace.createFileSystemWatcher('**/Chart.{yaml,yml}');
  chartWatcher.onDidCreate(() => chartYamlDirCache.clear());
  chartWatcher.onDidDelete(() => chartYamlDirCache.clear());
  context.subscriptions.push(chartWatcher);

  console.log('Starting Language Server client...');

  // クライアントを起動して準備完了を待つ
  await client.start();
  console.log('Argo Workflows LSP Extension activated');
  window.showInformationMessage('Argo Workflows LSP activated successfully');
}

export function deactivate(): Thenable<void> | undefined {
  console.log('Argo Workflows LSP Extension is deactivating...');
  if (!client) {
    return undefined;
  }
  return client.stop().then(() => {
    console.log('Argo Workflows LSP Extension deactivated');
  });
}
