/**
 * Argo Workflows LSP - Definition Provider
 *
 * テンプレート参照から定義へのジャンプ機能を提供
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, type Position } from 'vscode-languageserver-types';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { isArgoWorkflowDocument } from '@/features/documentDetection';
import {
	findTemplateDefinitions,
	findTemplateReferenceAtPosition,
} from '@/features/templateFeatures';
import {
	findParameterDefinitions,
	findParameterReferenceAtPosition,
} from '@/features/parameterFeatures';

/**
 * Definition Provider
 *
 * LSP textDocument/definitionリクエストを処理し、
 * テンプレート参照から定義へのジャンプを提供
 */
export class DefinitionProvider {
	constructor(private templateIndex: ArgoTemplateIndex) {}

	/**
	 * 定義を提供
	 *
	 * @param document - TextDocument
	 * @param position - カーソル位置
	 * @returns Location（定義の位置）、または null
	 *
	 * @example
	 * const location = await provider.provideDefinition(document, position);
	 * if (location) {
	 *   // ジャンプ先: location.uri と location.range
	 * }
	 */
	async provideDefinition(
		document: TextDocument,
		position: Position,
	): Promise<Location | Location[] | null> {
		// Argo Workflowドキュメントでない場合はスキップ
		if (!isArgoWorkflowDocument(document)) {
			return null;
		}

		// カーソル位置のテンプレート参照を検出
		const templateRef = findTemplateReferenceAtPosition(document, position);
		if (templateRef) {
			return this.handleTemplateReference(document, templateRef);
		}

		// パラメータ参照を検出
		const parameterRef = findParameterReferenceAtPosition(document, position);
		if (parameterRef) {
			return this.handleParameterReference(document, parameterRef);
		}

		return null;
	}

	/**
	 * テンプレート参照を処理
	 */
	private async handleTemplateReference(
		document: TextDocument,
		templateRef: ReturnType<typeof findTemplateReferenceAtPosition>,
	): Promise<Location | null> {
		if (!templateRef) {
			return null;
		}

		// 直接参照 (template: xxx)
		if (templateRef.type === 'direct') {
			// 同じファイル内のローカルテンプレートを検索
			const localTemplates = findTemplateDefinitions(document);
			const template = localTemplates.find((t) => t.name === templateRef.templateName);

			if (template) {
				return Location.create(document.uri, template.range);
			}

			return null;
		}

		// templateRef 参照 (templateRef.name)
		if (templateRef.type === 'templateRef' && templateRef.workflowTemplateName) {
			const template = await this.templateIndex.findTemplate(
				templateRef.workflowTemplateName,
				templateRef.templateName,
				templateRef.clusterScope ?? false,
			);

			if (template) {
				return Location.create(template.uri, template.range);
			}
		}

		return null;
	}

	/**
	 * パラメータ参照を処理
	 */
	private handleParameterReference(
		document: TextDocument,
		parameterRef: ReturnType<typeof findParameterReferenceAtPosition>,
	): Location | null {
		if (!parameterRef) {
			return null;
		}

		// パラメータ定義を検索
		const parameterDefs = findParameterDefinitions(document);

		// inputs.parameters または outputs.parameters の場合
		if (
			parameterRef.type === 'inputs.parameters' ||
			parameterRef.type === 'outputs.parameters'
		) {
			const parameter = parameterDefs.find((p) => p.name === parameterRef.parameterName);
			if (parameter) {
				return Location.create(document.uri, parameter.range);
			}
		}

		// steps.outputs.parameters または tasks.outputs.parameters の場合
		// TODO: ステップ/タスクのoutputsパラメータへの参照は、
		// そのステップ/タスクが参照しているテンプレートのoutputs.parametersを探す必要がある
		// これは将来の拡張として実装

		return null;
	}
}
