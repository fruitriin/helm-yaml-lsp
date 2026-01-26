/**
 * Argo Workflows LSP - Workflow Variables
 *
 * Workflow変数の定義とドキュメント
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-types';

/**
 * Workflow変数の定義
 */
export type WorkflowVariableInfo = {
	/** 変数名 */
	name: string;
	/** 説明 */
	description: string;
	/** 例 */
	example?: string;
};

/**
 * サポートするWorkflow変数のリスト
 */
export const WORKFLOW_VARIABLES: Record<string, WorkflowVariableInfo> = {
	'workflow.name': {
		name: 'workflow.name',
		description: 'Name of the Workflow',
		example: '{{workflow.name}}',
	},
	'workflow.namespace': {
		name: 'workflow.namespace',
		description: 'Namespace where the Workflow is running',
		example: '{{workflow.namespace}}',
	},
	'workflow.uid': {
		name: 'workflow.uid',
		description: 'UID of the Workflow',
		example: '{{workflow.uid}}',
	},
	'workflow.serviceAccountName': {
		name: 'workflow.serviceAccountName',
		description: 'Service account name of the Workflow',
		example: '{{workflow.serviceAccountName}}',
	},
	'workflow.creationTimestamp': {
		name: 'workflow.creationTimestamp',
		description: 'Creation timestamp of the Workflow (RFC 3339 format)',
		example: '{{workflow.creationTimestamp}}',
	},
	'workflow.duration': {
		name: 'workflow.duration',
		description: 'Duration of the Workflow execution in seconds',
		example: '{{workflow.duration}}',
	},
	'workflow.priority': {
		name: 'workflow.priority',
		description: 'Priority of the Workflow',
		example: '{{workflow.priority}}',
	},
	'workflow.status': {
		name: 'workflow.status',
		description: 'Status of the Workflow (Running, Succeeded, Failed, etc.)',
		example: '{{workflow.status}}',
	},
};

/**
 * Workflow変数参照を検出
 *
 * @param document - TextDocument
 * @param position - カーソル位置
 * @returns Workflow変数情報、または undefined
 */
export function findWorkflowVariableAtPosition(
	document: TextDocument,
	position: Position,
): { variable: WorkflowVariableInfo; range: Range } | undefined {
	const text = document.getText();
	const lines = text.split('\n');
	const line = lines[position.line];

	// Workflow変数のパターン: {{workflow.xxx}}
	const pattern = /\{\{workflow\.([\w]+)\}\}/g;
	const matches = [...line.matchAll(pattern)];

	for (const match of matches) {
		const fullMatch = match[0];
		const variableName = `workflow.${match[1]}`;
		const matchStart = match.index ?? 0;
		const matchEnd = matchStart + fullMatch.length;

		// カーソルがマッチ範囲内にあるかチェック
		if (position.character >= matchStart && position.character <= matchEnd) {
			const variableInfo = WORKFLOW_VARIABLES[variableName];
			if (variableInfo) {
				return {
					variable: variableInfo,
					range: Range.create(
						Position.create(position.line, matchStart),
						Position.create(position.line, matchEnd),
					),
				};
			}
		}
	}

	return undefined;
}
