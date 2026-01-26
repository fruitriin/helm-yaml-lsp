/**
 * Argo Workflows LSP - Hover Provider
 *
 * テンプレート参照にホバーすると詳細情報を表示
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { MarkupKind, type Hover, type Position } from 'vscode-languageserver-types';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { isArgoWorkflowDocument } from '@/features/documentDetection';
import { findTemplateReferenceAtPosition } from '@/features/templateFeatures';

/**
 * Hover Provider
 *
 * LSP textDocument/hoverリクエストを処理し、
 * テンプレート参照の詳細情報をマークダウン形式で表示
 */
export class HoverProvider {
	constructor(private templateIndex: ArgoTemplateIndex) {}

	/**
	 * ホバー情報を提供
	 *
	 * @param document - TextDocument
	 * @param position - カーソル位置
	 * @returns Hover（ホバー情報）、または null
	 *
	 * @example
	 * const hover = await provider.provideHover(document, position);
	 * if (hover) {
	 *   // hover.contents にマークダウン形式の情報が含まれる
	 * }
	 */
	async provideHover(document: TextDocument, position: Position): Promise<Hover | null> {
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
			// ローカルテンプレート参照のホバーは Phase 3.6 で実装
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
				const markdown = this.buildTemplateHover(template);
				return {
					contents: {
						kind: MarkupKind.Markdown,
						value: markdown,
					},
					range: templateRef.range,
				};
			}
		}

		return null;
	}

	/**
	 * テンプレート定義のホバー情報をマークダウン形式で構築
	 *
	 * @param template - テンプレート定義
	 * @returns マークダウン文字列
	 */
	private buildTemplateHover(template: {
		name: string;
		workflowName?: string;
		kind: string;
		aboveComment?: string;
		inlineComment?: string;
	}): string {
		const parts: string[] = [];

		// テンプレート名
		parts.push(`**Template**: \`${template.name}\``);

		// WorkflowTemplate名
		if (template.workflowName) {
			const scope =
				template.kind === 'ClusterWorkflowTemplate' ? 'ClusterWorkflowTemplate' : 'WorkflowTemplate';
			parts.push(`**${scope}**: \`${template.workflowName}\``);
		}

		// 説明（コメントから生成）
		const description = this.buildDescription(template.aboveComment, template.inlineComment);
		if (description) {
			parts.push('');
			parts.push(description);
		}

		return parts.join('\n');
	}

	/**
	 * コメントから説明文を構築
	 *
	 * @param aboveComment - 上のコメント
	 * @param inlineComment - 行末コメント
	 * @returns 説明文、またはundefined
	 */
	private buildDescription(aboveComment?: string, inlineComment?: string): string | undefined {
		const comments: string[] = [];

		if (aboveComment) {
			comments.push(aboveComment);
		}

		if (inlineComment) {
			comments.push(inlineComment);
		}

		return comments.length > 0 ? comments.join('\n\n') : undefined;
	}
}
