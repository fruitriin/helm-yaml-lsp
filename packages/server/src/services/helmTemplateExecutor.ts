/**
 * Phase 7: Helm Template Executor
 *
 * helm template コマンドを実行し、レンダリング結果をパースする。
 * キャッシュ機構によりパフォーマンスを最適化する。
 */

import { exec } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { parseHelmTemplateOutput } from '@/features/renderedYamlParser';
import type { HelmOverrides } from '@/types';
import type { HelmRenderResult } from '@/types/rendering';

const execAsync = promisify(exec);

/** コマンド実行のタイムアウト (ms) */
const EXEC_TIMEOUT = 10_000;

/** キャッシュの TTL (ms) */
const CACHE_TTL = 5 * 60 * 1000;

type CacheEntry = {
  output: string;
  timestamp: number;
};

/**
 * Helm Template Executor
 *
 * helm template コマンドの実行とキャッシュ管理を行う。
 */
export class HelmTemplateExecutor {
  private cache: Map<string, CacheEntry> = new Map();
  private helmAvailable: boolean | null = null;

  /**
   * helm CLI が利用可能かどうかを確認
   *
   * 結果はキャッシュされ、再呼び出し時はキャッシュを返す。
   */
  async isHelmAvailable(): Promise<boolean> {
    if (this.helmAvailable !== null) {
      return this.helmAvailable;
    }

    try {
      await execAsync('helm version --short', { timeout: EXEC_TIMEOUT });
      this.helmAvailable = true;
    } catch {
      this.helmAvailable = false;
    }

    return this.helmAvailable;
  }

  /**
   * Chart全体をレンダリング
   *
   * @param chartDir - Helmチャートのルートディレクトリ
   * @param overrides - オーバーライド設定（Chart.yaml アノテーション由来）
   */
  async renderChart(chartDir: string, overrides?: HelmOverrides): Promise<HelmRenderResult> {
    const releaseName = overrides?.releaseName || 'lsp-preview';
    const cacheKey = this.buildCacheKey(chartDir, releaseName, overrides);
    const cached = this.getCached(cacheKey);
    if (cached) {
      return this.buildResult(cached, chartDir);
    }

    const startTime = Date.now();

    try {
      const cmd = this.buildCommand(releaseName, chartDir, overrides);
      const { stdout, stderr } = await execAsync(cmd, { timeout: EXEC_TIMEOUT });

      const executionTime = Date.now() - startTime;
      this.cache.set(cacheKey, { output: stdout, timestamp: Date.now() });

      const chartName = this.extractChartName(chartDir, stdout);
      const documents = parseHelmTemplateOutput(stdout, chartName);

      return {
        success: true,
        output: stdout,
        documents,
        executionTime,
        ...(stderr ? { stderr } : {}),
      };
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr;
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        executionTime: Date.now() - startTime,
        ...(stderr ? { stderr } : {}),
      };
    }
  }

  /**
   * 特定テンプレートのみレンダリング
   *
   * @param chartDir - Helmチャートのルートディレクトリ
   * @param templatePath - テンプレートの相対パス (例: "templates/workflow-basic.yaml")
   * @param overrides - オーバーライド設定（Chart.yaml アノテーション由来）
   */
  async renderSingleTemplate(
    chartDir: string,
    templatePath: string,
    overrides?: HelmOverrides
  ): Promise<HelmRenderResult> {
    const releaseName = overrides?.releaseName || 'lsp-preview';
    const cacheKey = this.buildCacheKey(chartDir, releaseName, overrides, templatePath);
    const cached = this.getCached(cacheKey);
    if (cached) {
      return this.buildResult(cached, chartDir);
    }

    const startTime = Date.now();

    try {
      const cmd = this.buildCommand(releaseName, chartDir, overrides, templatePath);
      const { stdout, stderr } = await execAsync(cmd, { timeout: EXEC_TIMEOUT });

      const executionTime = Date.now() - startTime;
      this.cache.set(cacheKey, { output: stdout, timestamp: Date.now() });

      const chartName = this.extractChartName(chartDir, stdout);
      const documents = parseHelmTemplateOutput(stdout, chartName);

      return {
        success: true,
        output: stdout,
        documents,
        executionTime,
        ...(stderr ? { stderr } : {}),
      };
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr;
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        executionTime: Date.now() - startTime,
        ...(stderr ? { stderr } : {}),
      };
    }
  }

  /**
   * キャッシュをクリア
   *
   * @param chartDir - 指定時はそのChartのキャッシュのみクリア。省略時は全キャッシュクリア。
   */
  clearCache(chartDir?: string): void {
    if (chartDir) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${chartDir}::`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * 特定テンプレートのキャッシュのみ無効化
   *
   * 変更テンプレートの個別キャッシュ (`chartDir::releaseName::templatePath`) と
   * チャート全体キャッシュ (`chartDir::releaseName`) を削除する。
   * 他テンプレートの個別キャッシュは保持する。
   *
   * @param chartDir - Helmチャートのルートディレクトリ
   * @param templatePath - テンプレートの相対パス (例: "templates/workflow-basic.yaml")
   */
  clearTemplateCache(chartDir: string, templatePath: string): void {
    const prefix = `${chartDir}::`;
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.substring(prefix.length);
      // overrides サフィックス (::ovr:...) を除去して構造を解析
      const baseRest = rest.replace(/::ovr:.+$/, '');
      if (!baseRest.includes('::')) {
        // チャート全体キャッシュ → 常に削除（全体出力が変わるため）
        keysToDelete.push(key);
      } else if (baseRest.endsWith(`::${templatePath}`)) {
        // 変更テンプレートの個別キャッシュ → 削除
        keysToDelete.push(key);
      }
      // 他テンプレートの個別キャッシュ → 保持
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * キャッシュからエントリを取得（TTL超過はスキップ）
   */
  private getCached(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.output;
  }

  /**
   * キャッシュ済み出力から HelmRenderResult を構築
   */
  private buildResult(output: string, chartDir: string): HelmRenderResult {
    const chartName = this.extractChartName(chartDir, output);
    const documents = parseHelmTemplateOutput(output, chartName);
    return {
      success: true,
      output,
      documents,
      executionTime: 0,
    };
  }

  /**
   * helm template 出力からChart名を抽出
   *
   * `# Source: chart-name/templates/...` の形式から chart-name を取得する。
   * 取得できない場合はディレクトリ名をフォールバックとして使用する。
   */
  private extractChartName(chartDir: string, output: string): string {
    const match = output.match(/^# Source:\s+([^/]+)\//m);
    if (match) {
      return match[1];
    }
    // フォールバック: ディレクトリ名
    const parts = chartDir.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1];
  }

  /**
   * helm template コマンドを構築
   */
  private buildCommand(
    releaseName: string,
    chartDir: string,
    overrides?: HelmOverrides,
    showOnly?: string
  ): string {
    const parts = ['helm', 'template', shellEscape(releaseName), shellEscape(chartDir)];

    if (showOnly) {
      parts.push('--show-only', shellEscape(showOnly));
    }
    if (overrides?.namespace) {
      parts.push('--namespace', shellEscape(overrides.namespace));
    }
    for (const setValue of overrides?.set ?? []) {
      parts.push('--set', shellEscape(setValue));
    }
    for (const valuesFile of overrides?.values ?? []) {
      const absPath = path.isAbsolute(valuesFile) ? valuesFile : path.join(chartDir, valuesFile);
      parts.push('--values', shellEscape(absPath));
    }

    return parts.join(' ');
  }

  /**
   * キャッシュキーを構築（overrides を含む）
   */
  private buildCacheKey(
    chartDir: string,
    releaseName: string,
    overrides?: HelmOverrides,
    templatePath?: string
  ): string {
    let key = `${chartDir}::${releaseName}`;
    if (templatePath) {
      key += `::${templatePath}`;
    }
    if (overrides?.set?.length || overrides?.values?.length || overrides?.namespace) {
      const overrideStr = JSON.stringify({
        set: overrides.set ?? [],
        values: overrides.values ?? [],
        namespace: overrides.namespace ?? '',
      });
      key += `::ovr:${simpleHash(overrideStr)}`;
    }
    return key;
  }
}

/**
 * Parse helm template stderr into structured error information
 */
export function parseHelmTemplateError(stderr: string): Array<{
  file: string;
  line: number;
  column: number;
  message: string;
}> {
  const results: Array<{ file: string; line: number; column: number; message: string }> = [];
  const pattern = /template:\s+\S+\/templates\/(\S+?):(\d+)(?::(\d+))?:\s*(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stderr)) !== null) {
    results.push({
      file: `templates/${match[1]}`,
      line: Number(match[2]),
      column: match[3] ? Number(match[3]) : 0,
      message: match[4].trim(),
    });
  }
  return results;
}

/**
 * シンプルなハッシュ関数（キャッシュキー用）
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

/**
 * シェルコマンド引数をエスケープ
 */
function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
