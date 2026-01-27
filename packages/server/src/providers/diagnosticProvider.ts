/**
 * Argo Workflows LSP - Diagnostic Provider
 *
 * 存在しないテンプレート参照やパラメータ参照を検出し、診断情報を提供
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { isArgoWorkflowDocument } from '@/features/documentDetection';
import { findAllParameterReferences, findParameterDefinitions } from '@/features/parameterFeatures';
import { findAllTemplateReferences, findTemplateDefinitions } from '@/features/templateFeatures';
import {
  findAllValuesReferences,
  isHelmTemplate,
} from '@/features/valuesReferenceFeatures';
import { findAllTemplateReferences as findAllHelmTemplateReferences } from '@/features/helmTemplateFeatures';
import { findAllConfigMapReferences } from '@/features/configMapReferenceFeatures';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { ValuesIndex } from '@/services/valuesIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';

/**
 * Diagnostic Provider
 *
 * LSP textDocument/diagnosticsを処理し、
 * 存在しない参照やエラーを検出
 */
export class DiagnosticProvider {
  constructor(
    private templateIndex: ArgoTemplateIndex,
    private helmChartIndex?: HelmChartIndex,
    private valuesIndex?: ValuesIndex,
    private helmTemplateIndex?: HelmTemplateIndex,
    private configMapIndex?: ConfigMapIndex,
  ) {}

  /**
   * 診断情報を提供
   *
   * @param document - TextDocument
   * @returns Diagnostic配列
   *
   * @example
   * const diagnostics = await provider.provideDiagnostics(document);
   * connection.sendDiagnostics({ uri: document.uri, diagnostics });
   */
  async provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    // Helm template機能の検証
    if (isHelmTemplate(document) && this.helmChartIndex) {
      // .Values参照の検証
      if (this.valuesIndex) {
        const valuesDiagnostics = this.validateValuesReferences(document);
        diagnostics.push(...valuesDiagnostics);
      }

      // include/template参照の検証
      if (this.helmTemplateIndex) {
        const helmTemplateDiagnostics = this.validateHelmTemplateReferences(document);
        diagnostics.push(...helmTemplateDiagnostics);
      }
    }

    // ConfigMap/Secret参照の検証
    if (this.configMapIndex) {
      const configMapDiagnostics = this.validateConfigMapReferences(document);
      diagnostics.push(...configMapDiagnostics);
    }

    // Argo Workflowドキュメントでない場合はスキップ
    if (!isArgoWorkflowDocument(document)) {
      return diagnostics;
    }

    // テンプレート参照の検証
    const templateDiagnostics = await this.validateTemplateReferences(document);
    diagnostics.push(...templateDiagnostics);

    // パラメータ参照の検証
    const parameterDiagnostics = this.validateParameterReferences(document);
    diagnostics.push(...parameterDiagnostics);

    return diagnostics;
  }

  /**
   * テンプレート参照の検証
   */
  private async validateTemplateReferences(document: TextDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    // ローカルテンプレート定義を取得
    const localTemplates = findTemplateDefinitions(document);

    // すべてのテンプレート参照を取得
    const references = findAllTemplateReferences(document);

    for (const ref of references) {
      let found = false;

      // 直接参照（template: xxx）の場合
      if (ref.type === 'direct') {
        // ローカルテンプレートから検索
        found = localTemplates.some(t => t.name === ref.templateName);

        if (!found) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ref.range,
            message: `Template '${ref.templateName}' not found in this ${ref.kind || 'Workflow'}`,
            source: 'argo-workflows-lsp',
          });
        }
      }

      // templateRef 参照の場合
      if (ref.type === 'templateRef' && ref.workflowTemplateName) {
        // WorkflowTemplate/ClusterWorkflowTemplateから検索
        const template = await this.templateIndex.findTemplate(
          ref.workflowTemplateName,
          ref.templateName,
          ref.clusterScope ?? false
        );

        if (!template) {
          const scope = ref.clusterScope ? 'ClusterWorkflowTemplate' : 'WorkflowTemplate';
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ref.range,
            message: `Template '${ref.templateName}' not found in ${scope} '${ref.workflowTemplateName}'`,
            source: 'argo-workflows-lsp',
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * パラメータ参照の検証
   */
  private validateParameterReferences(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // パラメータ定義を取得
    const parameterDefs = findParameterDefinitions(document);

    // すべてのパラメータ参照を取得
    const references = findAllParameterReferences(document);

    for (const ref of references) {
      let found = false;

      // inputs.parameters または outputs.parameters の場合
      if (ref.type === 'inputs.parameters' || ref.type === 'outputs.parameters') {
        found = parameterDefs.some(p => p.name === ref.parameterName);

        if (!found) {
          const paramType = ref.type === 'inputs.parameters' ? 'input' : 'output';
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ref.range,
            message: `Parameter '${ref.parameterName}' not found in ${paramType} parameters`,
            source: 'argo-workflows-lsp',
          });
        }
      }

      // steps.xxx.outputs.parameters または tasks.xxx.outputs.parameters の場合
      // TODO: ステップ/タスクのoutputsパラメータへの参照検証
      // これは将来の拡張として実装
    }

    return diagnostics;
  }

  /**
   * .Values参照の検証
   */
  private validateValuesReferences(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!this.helmChartIndex || !this.valuesIndex) {
      return diagnostics;
    }

    // ファイルが属するChartを特定
    const chart = this.helmChartIndex.findChartForFile(document.uri);
    if (!chart) {
      return diagnostics;
    }

    // すべての.Values参照を取得
    const references = findAllValuesReferences(document);

    for (const ref of references) {
      // values.yamlから値定義を検索
      const valueDef = this.valuesIndex.findValue(chart.name, ref.valuePath);

      if (!valueDef) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: ref.range,
          message: `Value '.Values.${ref.valuePath}' not found in values.yaml (${chart.name})`,
          source: 'argo-workflows-lsp',
        });
      }
    }

    return diagnostics;
  }

  /**
   * Helm include/template参照の検証
   */
  private validateHelmTemplateReferences(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!this.helmChartIndex || !this.helmTemplateIndex) {
      return diagnostics;
    }

    // ファイルが属するChartを特定
    const chart = this.helmChartIndex.findChartForFile(document.uri);
    if (!chart) {
      return diagnostics;
    }

    // すべてのinclude/template参照を取得
    const references = findAllHelmTemplateReferences(document);

    for (const ref of references) {
      // テンプレート定義を検索
      const templateDef = this.helmTemplateIndex.findTemplate(
        chart.name,
        ref.templateName,
      );

      if (!templateDef) {
        const functionType = ref.type === 'include' ? 'include' : 'template';
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: ref.range,
          message: `Template '${ref.templateName}' not found (Helm ${functionType}, ${chart.name})`,
          source: 'argo-workflows-lsp',
        });
      }
    }

    return diagnostics;
  }

  /**
   * ConfigMap/Secret参照の検証
   */
  private validateConfigMapReferences(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    if (!this.configMapIndex) {
      return diagnostics;
    }

    // すべてのConfigMap/Secret参照を取得
    const references = findAllConfigMapReferences(document);

    for (const ref of references) {
      // name参照の検証
      if (ref.referenceType === 'name') {
        const configMap = this.configMapIndex.findConfigMap(ref.name, ref.kind);
        if (!configMap) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ref.range,
            message: `${ref.kind} '${ref.name}' not found`,
            source: 'argo-workflows-lsp',
          });
        }
      }

      // key参照の検証
      if (ref.referenceType === 'key' && ref.keyName) {
        const configMap = this.configMapIndex.findConfigMap(ref.name, ref.kind);
        if (!configMap) {
          // ConfigMap/Secret自体が存在しない場合はスキップ（name参照で既にエラーが出ている）
          continue;
        }

        const key = this.configMapIndex.findKey(ref.name, ref.keyName, ref.kind);
        if (!key) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: ref.range,
            message: `Key '${ref.keyName}' not found in ${ref.kind} '${ref.name}'`,
            source: 'argo-workflows-lsp',
          });
        }
      }
    }

    return diagnostics;
  }
}
