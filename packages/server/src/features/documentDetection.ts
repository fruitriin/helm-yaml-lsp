/**
 * Argo Workflows LSP - Document Detection
 *
 * ドキュメント種別の判定（エディタ非依存）
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArgoWorkflowKind } from '@/types/argo';
import { uriToFilePath } from '@/utils/uriUtils';

const ARGO_API_GROUP = 'argoproj.io';
const ARGO_WORKFLOW_KINDS: ArgoWorkflowKind[] = [
	'Workflow',
	'CronWorkflow',
	'WorkflowTemplate',
	'ClusterWorkflowTemplate',
];

/** ファイルパスごとのChart.yaml存在チェック結果をキャッシュ */
const chartYamlCache = new Map<string, boolean>();

/**
 * ドキュメントが Argo Workflow YAML かどうかを判定
 *
 * テキストベースの検出を使用（YAMLパーサーは将来的に追加予定）
 *
 * @param document - LSP TextDocument
 * @returns Argo Workflowドキュメントの場合はtrue
 *
 * @example
 * if (isArgoWorkflowDocument(document)) {
 *   // Argo Workflow specific processing
 * }
 */
export function isArgoWorkflowDocument(document: TextDocument): boolean {
	// languageIdチェック
	const languageId = document.languageId;
	if (languageId !== 'yaml' && languageId !== 'yml' && languageId !== 'helm') {
		return false;
	}

	// テキストベースの検出
	const text = document.getText();

	// apiVersionとkindの両方が必要
	const hasArgoApiVersion = /apiVersion:\s*['"]?argoproj\.io\//.test(text);
	const hasArgoKind =
		/kind:\s*['"]?(ClusterWorkflowTemplate|WorkflowTemplate|CronWorkflow|Workflow)['"]?/.test(
			text,
		);

	return hasArgoApiVersion && hasArgoKind;
}

/**
 * ファイルの親ディレクトリ階層に Chart.yaml または Chart.yml が存在するかチェック
 *
 * @param filePath - 対象ファイルのパス
 * @returns Chart.yaml/Chart.yml が見つかった場合は true
 */
function hasChartYaml(filePath: string): boolean {
	// キャッシュチェック
	if (chartYamlCache.has(filePath)) {
		return chartYamlCache.get(filePath)!;
	}

	let currentDir = path.dirname(filePath);
	const rootDir = path.parse(currentDir).root;

	// ルートディレクトリに到達するまで親ディレクトリを遡る
	while (currentDir !== rootDir) {
		const chartYamlPath = path.join(currentDir, 'Chart.yaml');
		const chartYmlPath = path.join(currentDir, 'Chart.yml');

		if (fs.existsSync(chartYamlPath) || fs.existsSync(chartYmlPath)) {
			chartYamlCache.set(filePath, true);
			return true;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break; // 無限ループ防止
		}
		currentDir = parentDir;
	}

	chartYamlCache.set(filePath, false);
	return false;
}

/**
 * Chart.yaml存在チェックのキャッシュをクリア
 *
 * ファイルシステムの変更時やワークスペース変更時に呼び出す
 */
export function clearChartYamlCache(): void {
	chartYamlCache.clear();
}

/**
 * ドキュメントがYAML形式かどうかを判定
 *
 * @param document - LSP TextDocument
 * @returns YAML形式の場合は true
 */
function isYamlDocument(document: TextDocument): boolean {
	const languageId = document.languageId;
	return languageId === 'yaml' || languageId === 'yml' || languageId === 'helm';
}

/**
 * ドキュメントが Helm テンプレートかどうかを判定
 *
 * 判定基準:
 * 1. languageId が 'helm' → Helm モード
 * 2. /templates/ 内のファイルで、Chart.yaml が存在し、YAML形式 → Helm モード
 * 3. それ以外 → Argo モードまたは拡張対象外
 *
 * @param document - LSP TextDocument
 * @returns Helm テンプレートの場合は true
 *
 * @example
 * if (isHelmTemplate(document)) {
 *   // Helm-specific processing
 * }
 */
export function isHelmTemplate(document: TextDocument): boolean {
	const filePath = uriToFilePath(document.uri);
	const languageId = document.languageId;

	// 1. languageId が 'helm' の場合は即座に true
	if (languageId === 'helm') {
		return true;
	}

	// 2. YAML形式でない場合は false（拡張対象外）
	if (!isYamlDocument(document)) {
		return false;
	}

	// 3. /templates/ ディレクトリ内のファイルかチェック
	const isInTemplatesDir =
		filePath.includes('/templates/') || filePath.includes('\\templates\\');

	if (isInTemplatesDir) {
		// /templates/ 内の場合、Chart.yaml の存在をチェック
		return hasChartYaml(filePath);
	}

	// 4. /templates/ 外のYAMLファイルは Helm ではない（Argo モード）
	return false;
}

/**
 * Argo Workflow Kindが有効かどうかをチェック
 *
 * @param kind - チェックするKind
 * @returns 有効なArgo Workflow Kindの場合はtrue
 */
export function isValidArgoWorkflowKind(kind: string): kind is ArgoWorkflowKind {
	return ARGO_WORKFLOW_KINDS.includes(kind as ArgoWorkflowKind);
}

/**
 * テキストから Argo Workflow Kind を抽出
 *
 * @param text - YAMLテキスト
 * @returns 見つかったKind、または undefined
 *
 * @example
 * const kind = extractArgoWorkflowKind(text);
 * if (kind) {
 *   console.log(`Found ${kind}`);
 * }
 */
export function extractArgoWorkflowKind(text: string): ArgoWorkflowKind | undefined {
	const match = text.match(
		/kind:\s*['"]?(ClusterWorkflowTemplate|WorkflowTemplate|CronWorkflow|Workflow)['"]?/,
	);
	if (match && match[1]) {
		const kind = match[1];
		if (isValidArgoWorkflowKind(kind)) {
			return kind;
		}
	}
	return undefined;
}
