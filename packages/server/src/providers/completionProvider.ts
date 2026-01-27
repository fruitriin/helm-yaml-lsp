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
import {
  extractValuePathForCompletion,
  isHelmTemplate,
} from '@/features/valuesReferenceFeatures';
import { WORKFLOW_VARIABLES } from '@/features/workflowVariables';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { ValuesIndex } from '@/services/valuesIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';

/**
 * Completion Provider
 *
 * LSP textDocument/completionリクエストを処理し、
 * 入力補完候補を提供
 */
export class CompletionProvider {
  constructor(
    private helmChartIndex?: HelmChartIndex,
    private valuesIndex?: ValuesIndex,
    private helmTemplateIndex?: HelmTemplateIndex,
  ) {}
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
    const text = document.getText();
    const lines = text.split('\n');
    const line = lines[position.line];
    const linePrefix = line.substring(0, position.character);

    // Helm template機能の補完
    if (isHelmTemplate(document) && this.helmChartIndex) {
      // .Values参照の補完
      if (this.valuesIndex) {
        const valuePath = extractValuePathForCompletion(document, position);
        if (valuePath !== undefined) {
          return this.provideValuesCompletion(document, valuePath);
        }
      }

      // include/template関数の補完
      if (this.helmTemplateIndex) {
        if (this.isHelmTemplateContext(linePrefix)) {
          return this.provideHelmTemplateCompletion(document);
        }
      }
    }

    // Argo Workflowドキュメントでない場合はスキップ
    if (!isArgoWorkflowDocument(document)) {
      return { isIncomplete: false, items: [] };
    }

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

  /**
   * .Values参照の補完候補を提供
   */
  private provideValuesCompletion(document: TextDocument, valuePath: string): CompletionList {
    const items: CompletionItem[] = [];

    if (!this.helmChartIndex || !this.valuesIndex) {
      return { isIncomplete: false, items };
    }

    // ファイルが属するChartを特定
    const chart = this.helmChartIndex.findChartForFile(document.uri);
    if (!chart) {
      return { isIncomplete: false, items };
    }

    // valuePath が空の場合、すべての値を返す
    // valuePath が指定されている場合、プレフィックスマッチで候補を絞る
    const candidates = valuePath
      ? this.valuesIndex.findValuesByPrefix(chart.name, valuePath)
      : this.valuesIndex.getAllValues(chart.name);

    for (const valueDef of candidates) {
      // 値のタイプに応じたアイコンを選択
      const kind = this.getCompletionKindForValueType(valueDef.valueType);

      // ドキュメント文字列を構築
      const documentation = [
        valueDef.description,
        valueDef.value !== null && valueDef.value !== undefined
          ? `Default: ${JSON.stringify(valueDef.value)}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n\n');

      // 補完候補を追加
      items.push({
        label: valueDef.path,
        kind,
        detail: `${valueDef.valueType} (${chart.name})`,
        documentation: documentation || undefined,
        insertText: valueDef.path,
      });
    }

    return { isIncomplete: false, items };
  }

  /**
   * 値の型に応じた補完アイテムの種類を取得
   */
  private getCompletionKindForValueType(valueType: string): CompletionItemKind {
    switch (valueType) {
      case 'string':
        return CompletionItemKind.Text;
      case 'number':
        return CompletionItemKind.Value;
      case 'boolean':
        return CompletionItemKind.Value;
      case 'array':
        return CompletionItemKind.Variable;
      case 'object':
        return CompletionItemKind.Module;
      default:
        return CompletionItemKind.Property;
    }
  }

  /**
   * Helm template/include関数の補完コンテキストかチェック
   */
  private isHelmTemplateContext(linePrefix: string): boolean {
    // {{ include " の後、または {{ template " の後
    return (
      /\{\{-?\s*include\s+"[^"]*$/.test(linePrefix) ||
      /\{\{-?\s*template\s+"[^"]*$/.test(linePrefix)
    );
  }

  /**
   * Helm template名の補完候補を提供
   */
  private provideHelmTemplateCompletion(document: TextDocument): CompletionList {
    const items: CompletionItem[] = [];

    if (!this.helmChartIndex || !this.helmTemplateIndex) {
      return { isIncomplete: false, items };
    }

    // ファイルが属するChartを特定
    const chart = this.helmChartIndex.findChartForFile(document.uri);
    if (!chart) {
      return { isIncomplete: false, items };
    }

    // Chartのすべてのテンプレート定義を取得
    const templates = this.helmTemplateIndex.getAllTemplates(chart.name);

    for (const templateDef of templates) {
      // ドキュメント文字列を構築
      const documentation = [
        templateDef.description,
        templateDef.content
          ? `Preview:\n${templateDef.content.split('\n').slice(0, 3).join('\n')}...`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n\n');

      items.push({
        label: templateDef.name,
        kind: CompletionItemKind.Function,
        detail: `Helm Template (${chart.name})`,
        documentation: documentation || undefined,
        insertText: templateDef.name,
      });
    }

    return { isIncomplete: false, items };
  }
}
