/**
 * LSPサーバーの型定義
 * Phase 2で vscode-kubernetes-tools-argo/src/argo/argo-types.ts から移植予定
 */

/**
 * Argo Workflows テンプレート定義
 */
export interface TemplateDefinition {
  name: string;
  uri: string; // file:// URI
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * パラメータ定義
 */
export interface ParameterDefinition {
  name: string;
  value?: string;
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * ConfigMap/Secret定義
 */
export interface ConfigMapDefinition {
  kind: 'ConfigMap' | 'Secret';
  namespace?: string;
  name: string;
  data: Record<string, string>;
  uri: string;
}

/**
 * サーバー設定
 */
export interface ServerSettings {
  maxNumberOfProblems: number;
  enableHover: boolean;
  enableDefinition: boolean;
  enableCompletion: boolean;
}

/**
 * デフォルト設定
 */
export const defaultSettings: ServerSettings = {
  maxNumberOfProblems: 1000,
  enableHover: true,
  enableDefinition: true,
  enableCompletion: true,
};
