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
		if (templateRef.type === 'templateRef') {
			const template = await this.templateIndex.findTemplate(
				templateRef.workflowTemplateName!,
				templateRef.templateName,
				templateRef.clusterScope ?? false,
			);

			if (template) {
				return Location.create(template.uri, template.range);
			}
		}

		return null;
	}
}
