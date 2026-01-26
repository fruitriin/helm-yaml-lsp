/**
 * Argo Workflows LSP - Completion Provider
 *
 * テンプレート名、パラメータ名、Workflow変数の入力補完を提供
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import {
  type CompletionItem,
  CompletionItemKind,
  type CompletionList,
  type Position,
} from 'vscode-languageserver-types';
import { isArgoWorkflowDocument } from '@/features/documentDetection';
import { findParameterDefinitions } from '@/features/parameterFeatures';
import { findTemplateDefinitions } from '@/features/templateFeatures';
import { WORKFLOW_VARIABLES } from '@/features/workflowVariables';

/**
 * Completion Provider
 *
 * LSP textDocument/completionリクエストを処理し、
 * 入力補完候補を提供
 */
export class CompletionProvider {
  /**
   * 補完候補を提供
   *
   * @param document - TextDocument
   * @param position - カーソル位置
   * @returns 補完候補リスト
   *
   * @example
   * const completions = await provider.provideCompletion(document, position);
   * // completions.items に補完候補が含まれる
   */
  async provideCompletion(document: TextDocument, position: Position): Promise<CompletionList> {
    // Argo Workflowドキュメントでない場合はスキップ
    if (!isArgoWorkflowDocument(document)) {
      return { isIncomplete: false, items: [] };
    }

    const text = document.getText();
    const lines = text.split('\n');
    const line = lines[position.line];
    const linePrefix = line.substring(0, position.character);

    // デバッグログ（テスト用）
    // console.log('[CompletionProvider] Line:', line);
    // console.log('[CompletionProvider] LinePrefix:', linePrefix);

    // テンプレート名の補完
    if (this.isTemplateNameContext(linePrefix)) {
      return await this.provideTemplateNameCompletion(document);
    }

    // Workflow変数の補完
    if (this.isWorkflowVariableContext(linePrefix)) {
      return this.provideWorkflowVariableCompletion();
    }

    // パラメータ名の補完
    const parameterContext = this.getParameterContext(linePrefix);
    if (parameterContext) {
      return this.provideParameterCompletion(document, parameterContext);
    }

    return { isIncomplete: false, items: [] };
  }

  /**
   * テンプレート名の補完コンテキストかチェック
   */
  private isTemplateNameContext(linePrefix: string): boolean {
    // "template: " の後、または "template:" の直後
    return /template:\s*$/.test(linePrefix) || /template:\s+\S*$/.test(linePrefix);
  }

  /**
   * Workflow変数の補完コンテキストかチェック
   */
  private isWorkflowVariableContext(linePrefix: string): boolean {
    // "{{workflow." の後（末尾の文字は問わない）
    return /\{\{workflow\.\w*/.test(linePrefix);
  }

  /**
   * パラメータの補完コンテキストを取得
   */
  private getParameterContext(linePrefix: string): string | null {
    // "{{inputs.parameters." の後（末尾の文字は問わない）
    if (/\{\{inputs\.parameters\.\w*/.test(linePrefix)) {
      return 'inputs.parameters';
    }

    // "{{outputs.parameters." の後（末尾の文字は問わない）
    if (/\{\{outputs\.parameters\.\w*/.test(linePrefix)) {
      return 'outputs.parameters';
    }

    // "{{workflow.parameters." の後（末尾の文字は問わない）
    if (/\{\{workflow\.parameters\.\w*/.test(linePrefix)) {
      return 'workflow.parameters';
    }

    return null;
  }

  /**
   * テンプレート名の補完候補を提供
   */
  private async provideTemplateNameCompletion(document: TextDocument): Promise<CompletionList> {
    const items: CompletionItem[] = [];

    // ローカルテンプレート名
    const localTemplates = findTemplateDefinitions(document);
    for (const template of localTemplates) {
      items.push({
        label: template.name,
        kind: CompletionItemKind.Function,
        detail: `Local template in current ${template.kind}`,
        documentation: template.aboveComment || template.inlineComment,
      });
    }

    // WorkflowTemplate/ClusterWorkflowTemplateのテンプレート名
    // Note: これはtemplateRefの補完に使用される
    // 将来的に "templateRef.template:" のコンテキストで使用可能

    return { isIncomplete: false, items };
  }

  /**
   * Workflow変数の補完候補を提供
   */
  private provideWorkflowVariableCompletion(): CompletionList {
    const items: CompletionItem[] = [];

    for (const variableInfo of Object.values(WORKFLOW_VARIABLES)) {
      items.push({
        label: variableInfo.name,
        kind: CompletionItemKind.Property,
        detail: 'Workflow Variable',
        documentation: variableInfo.description,
        insertText: variableInfo.name.replace('workflow.', ''),
      });
    }

    return { isIncomplete: false, items };
  }

  /**
   * パラメータ名の補完候補を提供
   */
  private provideParameterCompletion(document: TextDocument, context: string): CompletionList {
    const items: CompletionItem[] = [];

    // パラメータ定義を取得
    const parameters = findParameterDefinitions(document);

    // コンテキストに応じてフィルタリング
    const filteredParameters = parameters.filter(p => {
      if (context === 'inputs.parameters') {
        return p.type === 'input';
      }
      if (context === 'outputs.parameters') {
        return p.type === 'output';
      }
      // workflow.parameters は inputs と outputs 両方を含む
      return true;
    });

    for (const parameter of filteredParameters) {
      const typeLabel = parameter.type === 'input' ? 'Input Parameter' : 'Output Parameter';
      const documentation = [
        parameter.aboveComment,
        parameter.inlineComment,
        parameter.value ? `Default: ${parameter.value}` : undefined,
      ]
        .filter(Boolean)
        .join('\n\n');

      items.push({
        label: parameter.name,
        kind: CompletionItemKind.Variable,
        detail: typeLabel,
        documentation: documentation || undefined,
        insertText: parameter.name,
      });
    }

    return { isIncomplete: false, items };
  }
}
