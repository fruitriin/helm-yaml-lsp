/**
 * Argo Workflows LSP - Hover Provider
 *
 * テンプレート参照にホバーすると詳細情報を表示
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { type Hover, MarkupKind, type Position, type Range } from 'vscode-languageserver-types';
import { isArgoWorkflowDocument } from '@/features/documentDetection';
import {
  findParameterDefinitions,
  findParameterReferenceAtPosition,
} from '@/features/parameterFeatures';
import { findStepDefinitions, findTaskDefinitions } from '@/features/stepFeatures';
import {
  findTemplateDefinitions,
  findTemplateReferenceAtPosition,
} from '@/features/templateFeatures';
import {
  findValuesReference,
  isHelmTemplate,
} from '@/features/valuesReferenceFeatures';
import { findTemplateReferenceAtPosition as findHelmTemplateReferenceAtPosition } from '@/features/helmTemplateFeatures';
import { findWorkflowVariableAtPosition } from '@/features/workflowVariables';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { ValuesIndex } from '@/services/valuesIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';

/**
 * Hover Provider
 *
 * LSP textDocument/hoverリクエストを処理し、
 * テンプレート参照の詳細情報をマークダウン形式で表示
 */
export class HoverProvider {
  constructor(
    private templateIndex: ArgoTemplateIndex,
    private helmChartIndex?: HelmChartIndex,
    private valuesIndex?: ValuesIndex,
    private helmTemplateIndex?: HelmTemplateIndex,
  ) {}

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
    // Helm template機能を検出
    if (isHelmTemplate(document) && this.helmChartIndex) {
      // .Values参照を検出
      if (this.valuesIndex) {
        const valuesRef = findValuesReference(document, position);
        if (valuesRef) {
          return this.handleValuesHover(document, valuesRef);
        }
      }

      // include/template参照を検出
      if (this.helmTemplateIndex) {
        const helmTemplateRef = findHelmTemplateReferenceAtPosition(document, position);
        if (helmTemplateRef) {
          return this.handleHelmTemplateHover(document, helmTemplateRef);
        }
      }
    }

    // Argo Workflowドキュメントでない場合はスキップ
    if (!isArgoWorkflowDocument(document)) {
      return null;
    }

    // カーソル位置のテンプレート参照を検出
    const templateRef = findTemplateReferenceAtPosition(document, position);
    if (templateRef) {
      return this.handleTemplateHover(document, templateRef);
    }

    // パラメータ参照を検出
    const parameterRef = findParameterReferenceAtPosition(document, position);
    if (parameterRef) {
      return this.handleParameterHover(document, parameterRef);
    }

    // Workflow変数を検出
    const workflowVar = findWorkflowVariableAtPosition(document, position);
    if (workflowVar) {
      return this.handleWorkflowVariableHover(workflowVar);
    }

    return null;
  }

  /**
   * テンプレート参照のホバーを処理
   */
  private async handleTemplateHover(
    document: TextDocument,
    templateRef: ReturnType<typeof findTemplateReferenceAtPosition>
  ): Promise<Hover | null> {
    if (!templateRef) {
      return null;
    }

    // 直接参照 (template: xxx)
    if (templateRef.type === 'direct') {
      // 同じファイル内のローカルテンプレートを検索
      const localTemplates = findTemplateDefinitions(document);
      const template = localTemplates.find(t => t.name === templateRef.templateName);

      if (template) {
        const markdown = this.buildLocalTemplateHover(template);
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdown,
          },
          range: templateRef.range,
        };
      }

      return null;
    }

    // templateRef 参照 (templateRef.name)
    if (templateRef.type === 'templateRef' && templateRef.workflowTemplateName) {
      const template = await this.templateIndex.findTemplate(
        templateRef.workflowTemplateName,
        templateRef.templateName,
        templateRef.clusterScope ?? false
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
        template.kind === 'ClusterWorkflowTemplate'
          ? 'ClusterWorkflowTemplate'
          : 'WorkflowTemplate';
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
   * ローカルテンプレート定義のホバー情報をマークダウン形式で構築
   *
   * @param template - テンプレート定義
   * @returns マークダウン文字列
   */
  private buildLocalTemplateHover(template: {
    name: string;
    kind: string;
    aboveComment?: string;
    inlineComment?: string;
  }): string {
    const parts: string[] = [];

    // テンプレート名
    parts.push(`**Template**: \`${template.name}\``);

    // ローカルテンプレート（同一ファイル内）
    parts.push(`**Location**: Local template in current ${template.kind}`);

    // 説明（コメントから生成）
    const description = this.buildDescription(template.aboveComment, template.inlineComment);
    if (description) {
      parts.push('');
      parts.push(description);
    }

    return parts.join('\n');
  }

  /**
   * パラメータ参照のホバーを処理
   */
  private handleParameterHover(
    document: TextDocument,
    parameterRef: ReturnType<typeof findParameterReferenceAtPosition>
  ): Hover | null {
    if (!parameterRef) {
      return null;
    }

    // パラメータ定義を検索
    const parameterDefs = findParameterDefinitions(document);

    // inputs.parameters または outputs.parameters の場合
    if (parameterRef.type === 'inputs.parameters' || parameterRef.type === 'outputs.parameters') {
      const parameter = parameterDefs.find(p => p.name === parameterRef.parameterName);
      if (parameter) {
        const markdown = this.buildParameterHover(parameter, parameterRef.type);
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdown,
          },
          range: parameterRef.range,
        };
      }
    }

    // steps.outputs.parameters の場合
    if (parameterRef.type === 'steps.outputs.parameters' && parameterRef.stepOrTaskName) {
      return this.handleStepOutputParameterHover(
        document,
        parameterRef.stepOrTaskName,
        parameterRef.parameterName,
        parameterRef.range
      );
    }

    // tasks.outputs.parameters の場合
    if (parameterRef.type === 'tasks.outputs.parameters' && parameterRef.stepOrTaskName) {
      return this.handleTaskOutputParameterHover(
        document,
        parameterRef.stepOrTaskName,
        parameterRef.parameterName,
        parameterRef.range
      );
    }

    return null;
  }

  /**
   * ステップのoutputsパラメータのホバー情報を処理
   */
  private handleStepOutputParameterHover(
    document: TextDocument,
    stepName: string,
    parameterName: string,
    range: Range
  ): Hover | null {
    // ステップ定義を検索
    const steps = findStepDefinitions(document);
    const step = steps.find(s => s.name === stepName);

    if (!step) {
      return null;
    }

    // ステップが参照しているテンプレートを検索
    const templates = findTemplateDefinitions(document);
    const template = templates.find(t => t.name === step.templateName);

    if (!template) {
      return null;
    }

    // そのテンプレートのoutputs.parametersを検索
    const parameterDefs = findParameterDefinitions(document);
    const parameter = parameterDefs.find(
      p => p.name === parameterName && p.type === 'output' && p.templateName === step.templateName
    );

    if (parameter) {
      const parts: string[] = [];
      parts.push(`**Parameter**: \`${parameterName}\``);
      parts.push(`**Type**: Step Output Parameter`);
      parts.push(`**Step**: \`${stepName}\``);
      parts.push(`**Template**: \`${step.templateName}\``);

      // 説明（コメントから生成）
      const description = this.buildDescription(parameter.aboveComment, parameter.inlineComment);
      if (description) {
        parts.push('');
        parts.push(description);
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: parts.join('\n'),
        },
        range,
      };
    }

    return null;
  }

  /**
   * タスクのoutputsパラメータのホバー情報を処理
   */
  private handleTaskOutputParameterHover(
    document: TextDocument,
    taskName: string,
    parameterName: string,
    range: Range
  ): Hover | null {
    // タスク定義を検索
    const tasks = findTaskDefinitions(document);
    const task = tasks.find(t => t.name === taskName);

    if (!task) {
      return null;
    }

    // タスクが参照しているテンプレートを検索
    const templates = findTemplateDefinitions(document);
    const template = templates.find(t => t.name === task.templateName);

    if (!template) {
      return null;
    }

    // そのテンプレートのoutputs.parametersを検索
    const parameterDefs = findParameterDefinitions(document);
    const parameter = parameterDefs.find(
      p => p.name === parameterName && p.type === 'output' && p.templateName === task.templateName
    );

    if (parameter) {
      const parts: string[] = [];
      parts.push(`**Parameter**: \`${parameterName}\``);
      parts.push(`**Type**: Task Output Parameter`);
      parts.push(`**Task**: \`${taskName}\``);
      parts.push(`**Template**: \`${task.templateName}\``);

      // 説明（コメントから生成）
      const description = this.buildDescription(parameter.aboveComment, parameter.inlineComment);
      if (description) {
        parts.push('');
        parts.push(description);
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: parts.join('\n'),
        },
        range,
      };
    }

    return null;
  }

  /**
   * パラメータ定義のホバー情報をマークダウン形式で構築
   *
   * @param parameter - パラメータ定義
   * @param type - パラメータタイプ
   * @returns マークダウン文字列
   */
  private buildParameterHover(
    parameter: {
      name: string;
      value?: string;
      valueAboveComment?: string;
      valueInlineComment?: string;
      aboveComment?: string;
      inlineComment?: string;
    },
    type: string
  ): string {
    const parts: string[] = [];

    // パラメータ名
    parts.push(`**Parameter**: \`${parameter.name}\``);

    // タイプ
    const typeLabel = type === 'inputs.parameters' ? 'Input Parameter' : 'Output Parameter';
    parts.push(`**Type**: ${typeLabel}`);

    // デフォルト値
    if (parameter.value) {
      parts.push(`**Default**: \`${parameter.value}\``);
    }

    // 説明（コメントから生成）
    const description = this.buildDescription(parameter.aboveComment, parameter.inlineComment);
    if (description) {
      parts.push('');
      parts.push(description);
    }

    // 値のコメント
    const valueDescription = this.buildDescription(
      parameter.valueAboveComment,
      parameter.valueInlineComment
    );
    if (valueDescription) {
      parts.push('');
      parts.push(`**Value Note**: ${valueDescription}`);
    }

    return parts.join('\n');
  }

  /**
   * .Values参照のホバーを処理
   */
  private handleValuesHover(
    document: TextDocument,
    valuesRef: ReturnType<typeof findValuesReference>,
  ): Hover | null {
    if (!valuesRef || !this.helmChartIndex || !this.valuesIndex) {
      return null;
    }

    // ファイルが属するChartを特定
    const chart = this.helmChartIndex.findChartForFile(document.uri);
    if (!chart) {
      return null;
    }

    // values.yamlから値定義を検索
    const valueDef = this.valuesIndex.findValue(chart.name, valuesRef.valuePath);
    if (!valueDef) {
      return null;
    }

    const parts: string[] = [];

    // 値パス
    parts.push(`**Value**: \`.Values.${valueDef.path}\``);

    // 型
    parts.push(`**Type**: ${valueDef.valueType}`);

    // デフォルト値
    if (valueDef.value !== null && valueDef.value !== undefined) {
      const valueStr = JSON.stringify(valueDef.value);
      const displayValue = valueStr.length > 50 ? `${valueStr.substring(0, 50)}...` : valueStr;
      parts.push(`**Default**: \`${displayValue}\``);
    }

    // Chart名
    parts.push(`**Chart**: ${chart.name}`);

    // 説明（コメントから抽出）
    if (valueDef.description) {
      parts.push('');
      parts.push(valueDef.description);
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: parts.join('\n'),
      },
      range: valuesRef.range,
    };
  }

  /**
   * Helm include/template参照のホバーを処理
   */
  private handleHelmTemplateHover(
    document: TextDocument,
    helmTemplateRef: ReturnType<typeof findHelmTemplateReferenceAtPosition>,
  ): Hover | null {
    if (!helmTemplateRef || !this.helmChartIndex || !this.helmTemplateIndex) {
      return null;
    }

    // ファイルが属するChartを特定
    const chart = this.helmChartIndex.findChartForFile(document.uri);
    if (!chart) {
      return null;
    }

    // テンプレート定義を検索
    const templateDef = this.helmTemplateIndex.findTemplate(
      chart.name,
      helmTemplateRef.templateName,
    );

    if (!templateDef) {
      return null;
    }

    const parts: string[] = [];

    // テンプレート名
    parts.push(`**Template**: \`${templateDef.name}\``);

    // タイプ
    parts.push(`**Type**: Helm ${helmTemplateRef.type === 'include' ? 'include' : 'template'}`);

    // Chart名
    parts.push(`**Chart**: ${chart.name}`);

    // ファイル名
    const fileName = templateDef.uri.split('/').pop() || '';
    parts.push(`**File**: ${fileName}`);

    // 説明（コメントから抽出）
    if (templateDef.description) {
      parts.push('');
      parts.push(templateDef.description);
    }

    // テンプレート内容のプレビュー（最初の3行）
    if (templateDef.content) {
      const lines = templateDef.content.split('\n').slice(0, 3);
      const preview = lines.join('\n');
      if (preview) {
        parts.push('');
        parts.push('**Preview**:');
        parts.push('```yaml');
        parts.push(preview);
        if (templateDef.content.split('\n').length > 3) {
          parts.push('...');
        }
        parts.push('```');
      }
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: parts.join('\n'),
      },
      range: helmTemplateRef.range,
    };
  }

  /**
   * Workflow変数のホバーを処理
   */
  private handleWorkflowVariableHover(workflowVar: {
    variable: { name: string; description: string; example?: string };
    range: Range;
  }): Hover {
    const parts: string[] = [];

    // 変数名
    parts.push(`**Workflow Variable**: \`${workflowVar.variable.name}\``);

    // 説明
    parts.push('');
    parts.push(workflowVar.variable.description);

    // 例
    if (workflowVar.variable.example) {
      parts.push('');
      parts.push(`**Example**: \`${workflowVar.variable.example}\``);
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: parts.join('\n'),
      },
      range: workflowVar.range,
    };
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
