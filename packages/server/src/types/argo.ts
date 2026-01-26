/**
 * Argo Workflows LSP - Type Definitions
 *
 * エディタ非依存な型定義 (LSP標準型のみ使用)
 */

import type { Range } from 'vscode-languageserver-types';

/**
 * Argo Workflow リソースの種類
 */
export type ArgoWorkflowKind =
  | 'Workflow'
  | 'CronWorkflow'
  | 'WorkflowTemplate'
  | 'ClusterWorkflowTemplate';

/**
 * template 定義の情報
 */
export type TemplateDefinition = {
  /** テンプレート名 (spec.templates[].name) */
  name: string;
  /** テンプレート名の位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
  /** リソースの種類 */
  kind: ArgoWorkflowKind;
  /** WorkflowTemplate/ClusterWorkflowTemplate の metadata.name */
  workflowName?: string;
  /** テンプレートの上のコメント (あれば) */
  aboveComment?: string;
  /** テンプレートの行末コメント (あれば) */
  inlineComment?: string;
};

/**
 * template 参照の情報
 */
export type TemplateReference = {
  /** 参照タイプ: 'direct' = template: xxx, 'templateRef' = templateRef: {...} */
  type: 'direct' | 'templateRef';
  /** テンプレート名 */
  templateName: string;
  /** templateRef の場合: WorkflowTemplate/ClusterWorkflowTemplate の名前 */
  workflowTemplateName?: string;
  /** templateRef の場合: クラスタスコープかどうか */
  clusterScope?: boolean;
  /** Workflow種類 */
  kind?: ArgoWorkflowKind;
  /** 参照の位置 */
  range: Range;
};

/**
 * パラメータ参照の情報
 */
export type ParameterReference = {
  /** 参照タイプ */
  type:
    | 'inputs.parameters'
    | 'inputs.artifacts'
    | 'outputs.parameters'
    | 'outputs.artifacts'
    | 'workflow.parameters'
    | 'steps.outputs.parameters'
    | 'steps.outputs.artifacts'
    | 'steps.outputs.result'
    | 'tasks.outputs.parameters'
    | 'tasks.outputs.artifacts'
    | 'tasks.outputs.result';
  /** パラメータ名（アーティファクト名も含む） */
  parameterName: string;
  /** ステップ名またはタスク名 (steps/tasks タイプの場合) */
  stepOrTaskName?: string;
  /** 参照の位置 (パラメータ名部分) */
  range: Range;
};

/**
 * パラメータ定義の情報
 */
export type ParameterDefinition = {
  /** パラメータ名 */
  name: string;
  /** パラメータタイプ ('input' or 'output') */
  type: 'input' | 'output';
  /** デフォルト値 (あれば) */
  value?: string;
  /** デフォルト値の上のコメント (あれば) */
  valueAboveComment?: string;
  /** デフォルト値の行末コメント (あれば) */
  valueInlineComment?: string;
  /** パラメータの上のコメント (あれば) */
  aboveComment?: string;
  /** パラメータの行末コメント (あれば) */
  inlineComment?: string;
  /** 定義の位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * アーティファクト定義の情報
 */
export type ArtifactDefinition = {
  /** アーティファクト名 */
  name: string;
  /** パス (outputs.artifacts の場合) */
  path?: string;
  /** パスの上のコメント */
  pathAboveComment?: string;
  /** パスの行末コメント */
  pathInlineComment?: string;
  /** アーティファクトの上のコメント */
  aboveComment?: string;
  /** アーティファクトの行末コメント */
  inlineComment?: string;
  /** 定義の位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * スクリプト結果定義の情報
 */
export type ScriptResultDefinition = {
  /** テンプレート名 */
  templateName: string;
  /** スクリプト言語 (python, sh, など) */
  scriptLanguage?: string;
  /** テンプレートの上のコメント */
  aboveComment?: string;
  /** テンプレートの行末コメント */
  inlineComment?: string;
  /** script: セクションの位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * インデックス済み WorkflowTemplate の情報
 */
export type IndexedWorkflowTemplate = {
  /** metadata.name */
  name: string;
  /** リソースの種類 */
  kind: ArgoWorkflowKind;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
  /** テンプレート名 → 定義 のマップ */
  templates: Map<string, TemplateDefinition>;
};

/**
 * Helm Values 参照の情報
 */
export type HelmValuesReference = {
  /** 参照パス (例: "workflow.image.repository") */
  path: string;
  /** パス配列 (例: ["workflow", "image", "repository"]) */
  pathParts: string[];
  /** 参照の位置 (パス部分) */
  range: Range;
};

/**
 * Helm Values 定義の情報
 */
export type HelmValuesDefinition = {
  /** キー名 */
  key: string;
  /** 完全パス */
  fullPath: string;
  /** 値 (YAML 表現) */
  value: string;
  /** 値の型 (string, number, boolean, object, array) */
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  /** 上のコメント */
  aboveComment?: string;
  /** 行末コメント */
  inlineComment?: string;
  /** 定義の位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * Helm include/template 参照の情報
 */
export type HelmIncludeReference = {
  /** 関数名 ('include' または 'template') */
  functionName: 'include' | 'template';
  /** テンプレート名 (例: "argo-workflow-sample.fullname") */
  templateName: string;
  /** 参照の位置 (テンプレート名部分) */
  range: Range;
};

/**
 * Helm define 定義の情報
 */
export type HelmDefineDefinition = {
  /** テンプレート名 */
  name: string;
  /** テンプレート本体 */
  body: string;
  /** 上のコメント (Helm コメント形式) */
  comment?: string;
  /** 定義の位置 (define 行) */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * Helm Release 参照の情報
 */
export type HelmReleaseReference = {
  /** プロパティ名 (例: "Name", "Namespace") */
  property: HelmReleaseProperty;
  /** 参照の位置 (.Release.Property 全体) */
  range: Range;
};

/**
 * Helm Release のプロパティ
 */
export type HelmReleaseProperty =
  | 'Name'
  | 'Namespace'
  | 'Service'
  | 'IsUpgrade'
  | 'IsInstall'
  | 'Revision';

/**
 * item 変数参照の情報
 */
export type ItemVariableReference = {
  /** 参照タイプ */
  type: 'item' | 'item.property';
  /** プロパティ名 (item.xxx の場合) */
  propertyName?: string;
  /** 参照の位置 (item または item.xxx 部分) */
  range: Range;
};

/**
 * item のソース定義の情報 (withItems または withParam)
 */
export type ItemSourceDefinition = {
  /** ソースタイプ */
  type: 'withItems' | 'withParam';
  /** 値の配列 (withItems の場合) */
  items?: ItemValue[];
  /** パラメータ参照式 (withParam の場合) */
  paramExpression?: string;
  /** 上のコメント */
  aboveComment?: string;
  /** 行末コメント */
  inlineComment?: string;
  /** 定義の位置 (withItems: または withParam: の行) */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * withItems の要素の値
 */
export type ItemValue = {
  /** 値の文字列表現 */
  value: string;
  /** 値の型 */
  valueType: 'string' | 'number' | 'boolean' | 'object';
  /** オブジェクトの場合のプロパティ名リスト */
  properties?: string[];
};

/**
 * Workflow 変数参照の情報
 */
export type WorkflowVariableReference = {
  /** 参照タイプ */
  type:
    | 'workflow.name'
    | 'workflow.namespace'
    | 'workflow.uid'
    | 'workflow.serviceAccountName'
    | 'workflow.creationTimestamp'
    | 'workflow.duration'
    | 'workflow.priority'
    | 'workflow.status'
    | 'workflow.mainEntrypoint'
    | 'workflow.scheduledTime'
    | 'workflow.parameters' // サブキーあり
    | 'workflow.outputs.parameters' // サブキーあり
    | 'workflow.outputs.artifacts' // サブキーあり
    | 'workflow.annotations' // サブキーあり
    | 'workflow.labels'; // サブキーあり
  /** サブキー名 (parameters, annotations, labels の場合) */
  subKey?: string;
  /** strftime フォーマット (creationTimestamp の場合) */
  format?: string;
  /** 参照の位置 */
  range: Range;
};

/**
 * Workflow パラメータ定義の情報 (spec.arguments.parameters)
 */
export type WorkflowParameterDefinition = {
  /** パラメータ名 */
  name: string;
  /** デフォルト値 */
  value?: string;
  /** 上のコメント */
  aboveComment?: string;
  /** 行末コメント */
  inlineComment?: string;
  /** value の上のコメント */
  valueAboveComment?: string;
  /** value の行末コメント */
  valueInlineComment?: string;
  /** 定義の位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * Workflow ラベル定義の情報 (metadata.labels)
 */
export type WorkflowLabelDefinition = {
  /** ラベルキー */
  key: string;
  /** ラベル値 */
  value?: string;
  /** 上のコメント */
  aboveComment?: string;
  /** 行末コメント */
  inlineComment?: string;
  /** 定義の位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * Workflow アノテーション定義の情報 (metadata.annotations)
 */
export type WorkflowAnnotationDefinition = {
  /** アノテーションキー */
  key: string;
  /** アノテーション値 */
  value?: string;
  /** 上のコメント */
  aboveComment?: string;
  /** 行末コメント */
  inlineComment?: string;
  /** 定義の位置 */
  range: Range;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
};

/**
 * ConfigMap/Secret 参照の情報
 */
export type ConfigMapReference = {
  /** 参照タイプ */
  type:
    | 'configMapKeyRef'
    | 'secretKeyRef'
    | 'configMapRef'
    | 'secretRef'
    | 'volumeConfigMap'
    | 'volumeSecret';
  /** 参照しているのは名前かキーか */
  referenceType: 'name' | 'key';
  /** リソース名 (keyの場合は同じブロックから抽出) */
  resourceName?: string;
  /** キー名 (keyの場合のみ) */
  keyName?: string;
  /** リソース種類 */
  kind: 'ConfigMap' | 'Secret';
  /** 参照の位置 */
  range: Range;
};

/**
 * ConfigMap/Secret 定義の情報
 */
export type ConfigMapDefinition = {
  /** リソース名 (metadata.name) */
  name: string;
  /** リソース種類 */
  kind: 'ConfigMap' | 'Secret';
  /** ファイルURI (file:// URI文字列) */
  uri: string;
  /** metadata.name の位置 */
  nameRange: Range;
  /** data内のキー一覧 */
  keys: string[];
};

/**
 * ConfigMap/Secret のキー定義の情報
 */
export type KeyDefinition = {
  /** キー名 */
  keyName: string;
  /** 値 (Secretの場合はマスクする) */
  value: string;
  /** ファイルURI (file:// URI文字列) */
  uri: string;
  /** キー定義の位置 */
  range: Range;
  /** 上のコメント */
  aboveComment?: string;
  /** 行末コメント */
  inlineComment?: string;
};
