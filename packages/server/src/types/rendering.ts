/**
 * Phase 7: Helm Template Rendering Awareness 型定義
 *
 * helm template の出力と元テンプレートのマッピングに使用する型
 */

import type { Range } from 'vscode-languageserver-types';

/**
 * helm template 出力から抽出された個別ドキュメント
 */
export type RenderedDocument = {
  /** 元テンプレートファイルの相対パス (例: "templates/workflow-basic.yaml") */
  sourceTemplatePath: string;
  /** レンダリング済みYAML内容 */
  content: string;
  /** helm template 出力全体内での開始行番号 (0-based) */
  startLine: number;
  /** helm template 出力全体内での終了行番号 (0-based) */
  endLine: number;
};

/**
 * 行レベルのマッピングエントリ
 */
export type LineMapping = {
  /** レンダリング済みYAMLの行番号 (0-based) */
  renderedLine: number;
  /** 元テンプレートの行番号 (0-based) */
  originalLine: number;
  /** 信頼度スコア (0.0 ~ 1.0) */
  confidence: number;
  /** マッピング方法 */
  method: 'exact' | 'anchor' | 'value' | 'fuzzy';
};

/**
 * トークンレベルのマッピングエントリ
 */
export type TokenMapping = {
  /** レンダリング済みYAMLの位置 */
  renderedRange: Range;
  /** 元テンプレートの位置 */
  originalRange: Range;
  /** 元テンプレートのHelm構文 (例: "{{ .Values.workflow.name }}") */
  originalExpression?: string;
  /** 展開された値 */
  renderedValue?: string;
  /** 信頼度スコア */
  confidence: number;
};

/**
 * テンプレートファイル単位のシンボルマッピング
 */
export type SymbolMapping = {
  /** Chart名 */
  chartName: string;
  /** Chart ルートディレクトリ */
  chartDir: string;
  /** 元テンプレートファイルURI */
  originalUri: string;
  /** 元テンプレートファイルの相対パス */
  originalRelativePath: string;
  /** 行マッピング */
  lineMappings: LineMapping[];
  /** トークンマッピング (Helm変数展開部分) */
  tokenMappings: TokenMapping[];
  /** 作成タイムスタンプ */
  createdAt: number;
};

/**
 * helm template 実行結果
 */
export type HelmRenderResult = {
  /** 成功したかどうか */
  success: boolean;
  /** レンダリング済みYAML全体 */
  output?: string;
  /** パースされたドキュメント一覧 */
  documents?: RenderedDocument[];
  /** エラーメッセージ */
  error?: string;
  /** helm template の stderr 出力 */
  stderr?: string;
  /** 実行時間 (ms) */
  executionTime: number;
};

/**
 * アンカーポイント (マッピングアルゴリズムで使用)
 */
export type Anchor = {
  /** 行番号 (0-based) */
  line: number;
  /** アンカーキー (YAMLキー名、コメント全体、配列要素など) */
  key: string;
  /** 値 (完全一致で使用) */
  value?: string;
  /** インデントレベル (スペース数) */
  indent: number;
  /** 完全一致可能かどうか */
  isExactMatch: boolean;
};
