/**
 * Phase 7: Helm Template Executor
 *
 * helm template コマンドを実行し、レンダリング結果をパースする。
 * キャッシュ機構によりパフォーマンスを最適化する。
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { parseHelmTemplateOutput } from '@/features/renderedYamlParser';
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
   * @param releaseName - リリース名（デフォルト: "lsp-preview"）
   */
  async renderChart(chartDir: string, releaseName = 'lsp-preview'): Promise<HelmRenderResult> {
    const cacheKey = `${chartDir}::${releaseName}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return this.buildResult(cached, chartDir);
    }

    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(
        `helm template ${shellEscape(releaseName)} ${shellEscape(chartDir)}`,
        { timeout: EXEC_TIMEOUT }
      );

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
   * @param releaseName - リリース名（デフォルト: "lsp-preview"）
   */
  async renderSingleTemplate(
    chartDir: string,
    templatePath: string,
    releaseName = 'lsp-preview'
  ): Promise<HelmRenderResult> {
    const cacheKey = `${chartDir}::${releaseName}::${templatePath}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return this.buildResult(cached, chartDir);
    }

    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(
        `helm template ${shellEscape(releaseName)} ${shellEscape(chartDir)} --show-only ${shellEscape(templatePath)}`,
        { timeout: EXEC_TIMEOUT }
      );

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
 * シェルコマンド引数をエスケープ
 */
function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
