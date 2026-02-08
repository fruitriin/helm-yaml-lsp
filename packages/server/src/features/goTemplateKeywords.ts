/**
 * Go Template Keywords Catalog
 *
 * Go text/template の制御構文キーワードカタログ:
 * - キーワード名、構文、説明、使用例
 * - Hover / Completion で使用
 */

/**
 * Go テンプレートキーワード定義
 */
export type GoTemplateKeyword = {
  /** キーワード名 */
  name: string;
  /** 構文 */
  syntax: string;
  /** 説明 */
  description: string;
  /** 使用例 */
  examples: string[];
};

/**
 * Go テンプレートキーワードカタログ
 */
export const GO_TEMPLATE_KEYWORDS: readonly GoTemplateKeyword[] = [
  {
    name: 'if',
    syntax: '{{ if PIPELINE }}T1{{ else }}T0{{ end }}',
    description:
      'Conditional execution. If the value of the pipeline is empty (false, 0, nil, empty string, empty collection), T0 is executed; otherwise, T1 is executed.',
    examples: [
      '{{ if .Values.enabled }}...{{ end }}',
      '{{ if eq .Values.env "production" }}...{{ end }}',
    ],
  },
  {
    name: 'else',
    syntax: '{{ if PIPELINE }}T1{{ else }}T0{{ end }}',
    description:
      'Provides an alternative branch in an if or with block. Executed when the condition is empty.',
    examples: ['{{ if .Values.enabled }}enabled{{ else }}disabled{{ end }}'],
  },
  {
    name: 'else if',
    syntax: '{{ if P1 }}T1{{ else if P2 }}T2{{ else }}T0{{ end }}',
    description: 'Chains multiple conditions. Equivalent to nesting an if inside an else block.',
    examples: [
      '{{ if eq .Values.env "prod" }}production{{ else if eq .Values.env "staging" }}staging{{ else }}development{{ end }}',
    ],
  },
  {
    name: 'range',
    syntax: '{{ range PIPELINE }}T1{{ else }}T0{{ end }}',
    description:
      'Iterates over a collection (list, map, or channel). Inside the block, `.` is set to the current element. If the collection is empty and else is provided, T0 is executed.',
    examples: [
      '{{ range .Values.servers }}  - {{ . }}{{ end }}',
      '{{ range $key, $val := .Values.labels }}{{ $key }}: {{ $val }}{{ end }}',
    ],
  },
  {
    name: 'with',
    syntax: '{{ with PIPELINE }}T1{{ else }}T0{{ end }}',
    description:
      'Sets the dot (`.`) to the value of the pipeline. If the value is empty, the block is skipped (or else is executed).',
    examples: [
      '{{ with .Values.ingress }}host: {{ .host }}{{ end }}',
      '{{ with .Values.optional }}{{ . }}{{ else }}default{{ end }}',
    ],
  },
  {
    name: 'define',
    syntax: '{{ define "name" }}T1{{ end }}',
    description:
      'Defines a named template that can be invoked with `template` or `include`. Commonly used in `_helpers.tpl` files.',
    examples: ['{{- define "mychart.labels" -}}\napp: {{ .Chart.Name }}\n{{- end }}'],
  },
  {
    name: 'template',
    syntax: '{{ template "name" PIPELINE }}',
    description:
      'Invokes a named template defined with `define`. The pipeline value becomes `.` inside the template. Unlike `include`, the output cannot be piped.',
    examples: ['{{ template "mychart.labels" . }}'],
  },
  {
    name: 'block',
    syntax: '{{ block "name" PIPELINE }}T1{{ end }}',
    description:
      'Defines and immediately executes a named template. Equivalent to `define` followed by `template`. Useful for providing default content that can be overridden.',
    examples: ['{{ block "title" . }}Default Title{{ end }}'],
  },
  {
    name: 'end',
    syntax: '{{ end }}',
    description:
      'Closes an `if`, `range`, `with`, `define`, or `block` action. Every control structure must be terminated with `end`.',
    examples: ['{{ if .Values.enabled }}...{{ end }}'],
  },
];

/**
 * キーワード名からキーワード定義を検索
 */
export function findGoTemplateKeyword(name: string): GoTemplateKeyword | undefined {
  return GO_TEMPLATE_KEYWORDS.find(k => k.name === name);
}

/**
 * 全キーワードを取得
 */
export function getAllGoTemplateKeywords(): readonly GoTemplateKeyword[] {
  return GO_TEMPLATE_KEYWORDS;
}
