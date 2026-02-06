/**
 * Argo Workflows LSP - Definition Provider
 *
 * テンプレート参照から定義へのジャンプ機能を提供
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, type Position } from 'vscode-languageserver-types';
import { findChartReference } from '@/features/chartReferenceFeatures';
import { findConfigMapReferenceAtPosition } from '@/features/configMapReferenceFeatures';
import { isArgoWorkflowDocument } from '@/features/documentDetection';
import { findTemplateReferenceAtPosition as findHelmTemplateReferenceAtPosition } from '@/features/helmTemplateFeatures';
import {
  findParameterDefinitions,
  findParameterReferenceAtPosition,
} from '@/features/parameterFeatures';
import { findStepDefinitions, findTaskDefinitions } from '@/features/stepFeatures';
import {
  findTemplateDefinitions,
  findTemplateReferenceAtPosition,
} from '@/features/templateFeatures';
import { findValuesReference, isHelmTemplate } from '@/features/valuesReferenceFeatures';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { ValuesIndex } from '@/services/valuesIndex';

/**
 * Definition Provider
 *
 * LSP textDocument/definitionリクエストを処理し、
 * テンプレート参照から定義へのジャンプを提供
 */
export class DefinitionProvider {
  constructor(
    private templateIndex: ArgoTemplateIndex,
    private helmChartIndex?: HelmChartIndex,
    private valuesIndex?: ValuesIndex,
    private helmTemplateIndex?: HelmTemplateIndex,
    private configMapIndex?: ConfigMapIndex
  ) {}

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
    position: Position
  ): Promise<Location | Location[] | null> {
    // Helm template機能を検出
    if (isHelmTemplate(document) && this.helmChartIndex) {
      // .Values参照を検出
      if (this.valuesIndex) {
        const valuesRef = findValuesReference(document, position);
        if (valuesRef) {
          return this.handleValuesReference(document, valuesRef);
        }
      }

      // include/template参照を検出
      if (this.helmTemplateIndex) {
        const helmTemplateRef = findHelmTemplateReferenceAtPosition(document, position);
        if (helmTemplateRef) {
          return this.handleHelmTemplateReference(document, helmTemplateRef);
        }
      }

      // .Chart参照を検出
      const chartRef = findChartReference(document, position);
      if (chartRef) {
        return this.handleChartReference(document, chartRef);
      }
    }

    // ConfigMap/Secret参照を検出
    if (this.configMapIndex) {
      const configMapRef = findConfigMapReferenceAtPosition(document, position);
      if (configMapRef) {
        return this.handleConfigMapReference(configMapRef);
      }
    }

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
   * .Values参照を処理
   */
  private handleValuesReference(
    document: TextDocument,
    valuesRef: ReturnType<typeof findValuesReference>
  ): Location | null {
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
    if (valueDef) {
      return Location.create(valueDef.uri, valueDef.range);
    }

    return null;
  }

  /**
   * Helm include/template参照を処理
   */
  private handleHelmTemplateReference(
    document: TextDocument,
    helmTemplateRef: ReturnType<typeof findHelmTemplateReferenceAtPosition>
  ): Location | null {
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
      helmTemplateRef.templateName
    );

    if (templateDef) {
      return Location.create(templateDef.uri, templateDef.range);
    }

    return null;
  }

  /**
   * Chart変数参照を処理
   *
   * .Chart.Name等からChart.yamlへジャンプ
   */
  private handleChartReference(
    document: TextDocument,
    chartRef: ReturnType<typeof findChartReference>
  ): Location | null {
    if (!chartRef || !this.helmChartIndex) {
      return null;
    }

    // ファイルが属するChartを特定
    const chart = this.helmChartIndex.findChartForFile(document.uri);
    if (!chart || !chart.chartYamlUri) {
      return null;
    }

    // Chart.yamlへジャンプ（ファイル全体を指す）
    return Location.create(chart.chartYamlUri, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
  }

  /**
   * テンプレート参照を処理
   */
  private async handleTemplateReference(
    document: TextDocument,
    templateRef: ReturnType<typeof findTemplateReferenceAtPosition>
  ): Promise<Location | null> {
    if (!templateRef) {
      return null;
    }

    // 直接参照 (template: xxx)
    if (templateRef.type === 'direct') {
      // 同じファイル内のローカルテンプレートを検索
      const localTemplates = findTemplateDefinitions(document);
      const template = localTemplates.find(t => t.name === templateRef.templateName);

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
        templateRef.clusterScope ?? false
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
    parameterRef: ReturnType<typeof findParameterReferenceAtPosition>
  ): Location | null {
    if (!parameterRef) {
      return null;
    }

    // パラメータ定義を検索
    const parameterDefs = findParameterDefinitions(document);

    // inputs.parameters または outputs.parameters の場合
    if (parameterRef.type === 'inputs.parameters' || parameterRef.type === 'outputs.parameters') {
      const parameter = parameterDefs.find(p => p.name === parameterRef.parameterName);
      if (parameter) {
        return Location.create(document.uri, parameter.range);
      }
    }

    // steps.outputs.parameters の場合
    if (parameterRef.type === 'steps.outputs.parameters' && parameterRef.stepOrTaskName) {
      return this.handleStepOutputParameter(
        document,
        parameterRef.stepOrTaskName,
        parameterRef.parameterName
      );
    }

    // tasks.outputs.parameters の場合
    if (parameterRef.type === 'tasks.outputs.parameters' && parameterRef.stepOrTaskName) {
      return this.handleTaskOutputParameter(
        document,
        parameterRef.stepOrTaskName,
        parameterRef.parameterName
      );
    }

    return null;
  }

  /**
   * ステップのoutputsパラメータ参照を処理
   *
   * 例: {{steps.prepare-data.outputs.parameters.prepared-data}}
   * 1. ステップ名 'prepare-data' を探す
   * 2. そのステップが参照しているテンプレート名を取得
   * 3. そのテンプレートの outputs.parameters.prepared-data を探す
   */
  private handleStepOutputParameter(
    document: TextDocument,
    stepName: string,
    parameterName: string
  ): Location | null {
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
      return Location.create(document.uri, parameter.range);
    }

    return null;
  }

  /**
   * タスクのoutputsパラメータ参照を処理
   *
   * 例: {{tasks.task-a.outputs.parameters.result}}
   */
  private handleTaskOutputParameter(
    document: TextDocument,
    taskName: string,
    parameterName: string
  ): Location | null {
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
      return Location.create(document.uri, parameter.range);
    }

    return null;
  }

  /**
   * ConfigMap/Secret参照を処理
   */
  private handleConfigMapReference(
    ref: ReturnType<typeof findConfigMapReferenceAtPosition>
  ): Location | null {
    if (!ref || !this.configMapIndex) {
      return null;
    }

    // name参照の場合：ConfigMap/Secret定義へジャンプ
    if (ref.referenceType === 'name') {
      const configMap = this.configMapIndex.findConfigMap(ref.name, ref.kind);
      if (configMap) {
        return Location.create(configMap.uri, configMap.nameRange);
      }
    }

    // key参照の場合：dataキーへジャンプ
    if (ref.referenceType === 'key' && ref.keyName) {
      const key = this.configMapIndex.findKey(ref.name, ref.keyName, ref.kind);
      if (key) {
        return Location.create(key.uri, key.range);
      }
    }

    return null;
  }
}
