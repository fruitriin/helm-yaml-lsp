/**
 * Unified Reference Resolution - Type Definitions
 *
 * 参照解決の統一型定義。全ハンドラー共通の型を定義する。
 */

import type { CompletionItem, Range } from 'vscode-languageserver-types';

/**
 * 参照の種類
 */
export type ReferenceKind =
  | 'argoTemplate'
  | 'argoParameter'
  | 'workflowVariable'
  | 'configMap'
  | 'helmValues'
  | 'helmTemplate'
  | 'helmFunction'
  | 'chartVariable'
  | 'releaseCapabilities'
  | 'itemVariable'
  | 'goTemplateKeyword';

/**
 * Argo Template 参照の詳細
 */
export type ArgoTemplateDetails = {
  kind: 'argoTemplate';
  type: 'direct' | 'templateRef';
  templateName: string;
  workflowTemplateName?: string;
  clusterScope?: boolean;
  workflowKind?: string;
};

/**
 * Argo Parameter 参照の詳細
 */
export type ArgoParameterDetails = {
  kind: 'argoParameter';
  type:
    | 'inputs.parameters'
    | 'outputs.parameters'
    | 'workflow.parameters'
    | 'steps.outputs.parameters'
    | 'tasks.outputs.parameters'
    | 'inputs.artifacts'
    | 'outputs.artifacts'
    | 'steps.outputs.artifacts'
    | 'tasks.outputs.artifacts'
    | 'steps.outputs.result'
    | 'tasks.outputs.result';
  parameterName: string;
  stepOrTaskName?: string;
};

/**
 * Workflow Variable 参照の詳細
 */
export type WorkflowVariableDetails = {
  kind: 'workflowVariable';
  variableName: string;
  description: string;
  example?: string;
  subProperty?: string;
  subPropertyType?:
    | 'labels'
    | 'annotations'
    | 'parameters'
    | 'outputs.parameters'
    | 'outputs.artifacts';
};

/**
 * ConfigMap/Secret 参照の詳細
 */
export type ConfigMapDetails = {
  kind: 'configMap';
  type:
    | 'configMapKeyRef'
    | 'secretKeyRef'
    | 'configMapRef'
    | 'secretRef'
    | 'volumeConfigMap'
    | 'volumeSecret';
  referenceType: 'name' | 'key';
  name: string;
  keyName?: string;
  resourceKind: 'ConfigMap' | 'Secret';
};

/**
 * Helm Values 参照の詳細
 */
export type HelmValuesDetails = {
  kind: 'helmValues';
  valuePath: string;
  fullExpression: string;
};

/**
 * Helm Template (include/template) 参照の詳細
 */
export type HelmTemplateDetails = {
  kind: 'helmTemplate';
  type: 'include' | 'template';
  templateName: string;
  fullExpression: string;
};

/**
 * Helm Function 参照の詳細
 */
export type HelmFunctionDetails = {
  kind: 'helmFunction';
  functionName: string;
};

/**
 * Chart Variable 参照の詳細
 */
export type ChartVariableDetails = {
  kind: 'chartVariable';
  variableName: string;
};

/**
 * Release/Capabilities 参照の詳細
 */
export type ReleaseCapabilitiesDetails = {
  kind: 'releaseCapabilities';
  type: 'release' | 'capabilities';
  variableName: string;
};

/**
 * Item Variable 参照の詳細
 */
export type ItemVariableDetails = {
  kind: 'itemVariable';
  type: 'item' | 'item.property';
  propertyName?: string;
};

/**
 * Go Template Keyword 参照の詳細
 */
export type GoTemplateKeywordDetails = {
  kind: 'goTemplateKeyword';
  keywordName: string;
};

/**
 * 参照詳細の判別共用体
 */
export type ReferenceDetails =
  | ArgoTemplateDetails
  | ArgoParameterDetails
  | WorkflowVariableDetails
  | ConfigMapDetails
  | HelmValuesDetails
  | HelmTemplateDetails
  | HelmFunctionDetails
  | ChartVariableDetails
  | ReleaseCapabilitiesDetails
  | ItemVariableDetails
  | GoTemplateKeywordDetails;

/**
 * 検出された参照
 */
export type DetectedReference = {
  kind: ReferenceKind;
  range: Range;
  details: ReferenceDetails;
};

/**
 * 解決された参照
 */
export type ResolvedReference = {
  detected: DetectedReference;
  definitionLocation: { uri: string; range: Range } | null;
  hoverMarkdown: string | null;
  diagnosticMessage: string | null;
  exists: boolean | null;
};

/**
 * 補完結果
 */
export type CompletionResult = {
  items: CompletionItem[];
};
