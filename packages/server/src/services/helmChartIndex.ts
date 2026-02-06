/**
 * Argo Workflows LSP - Helm Chart Index Service
 *
 * ワークスペース内のHelm Chartをインデックス化
 */

import type { HelmChart } from '@/features/helmChartDetection';
import { findHelmCharts, isFileInChart } from '@/features/helmChartDetection';

/**
 * Helm Chartインデックスサービス
 *
 * ワークスペース内のHelm Chartをインデックス化し、
 * ファイルからChartへの参照解決を提供
 */
export class HelmChartIndex {
  private charts: HelmChart[] = [];
  private workspaceFolders: string[] = [];
  private initialized = false;

  /**
   * ワークスペースフォルダーの設定
   *
   * @param folders - ワークスペースフォルダーのパス配列
   */
  setWorkspaceFolders(folders: string[]): void {
    this.workspaceFolders = folders;
  }

  /**
   * インデックスを初期化
   *
   * ワークスペース内のすべてのHelm Chartをスキャンし、インデックスを構築
   *
   * @example
   * await helmChartIndex.initialize();
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.error('[HelmChartIndex] Initializing...');

    this.charts = await findHelmCharts(this.workspaceFolders);

    this.initialized = true;
    console.error(`[HelmChartIndex] Initialized with ${this.charts.length} Helm Chart(s)`);

    for (const chart of this.charts) {
      console.error(`[HelmChartIndex]   - ${chart.name} at ${chart.rootDir}`);
    }
  }

  /**
   * 指定されたファイルが属するHelm Chartを検索
   *
   * @param fileUri - ファイルURI
   * @returns 見つかったHelm Chart、または undefined
   *
   * @example
   * const chart = helmChartIndex.findChartForFile('file:///workspace/chart/templates/workflow.yaml');
   * if (chart) {
   *   console.log(`File belongs to chart: ${chart.name}`);
   * }
   */
  findChartForFile(fileUri: string): HelmChart | undefined {
    for (const chart of this.charts) {
      if (isFileInChart(fileUri, chart)) {
        return chart;
      }
    }
    return undefined;
  }

  /**
   * すべてのHelm Chartを取得
   *
   * @returns すべてのHelm Chart配列
   *
   * @example
   * const allCharts = helmChartIndex.getAllCharts();
   * console.log(`Found ${allCharts.length} charts`);
   */
  getAllCharts(): HelmChart[] {
    return [...this.charts];
  }

  /**
   * 指定されたChartルートディレクトリのChartを更新
   *
   * @param chartRootDir - ChartのルートディレクトリPATH
   *
   * @example
   * await helmChartIndex.updateChart('/workspace/my-chart');
   */
  async updateChart(chartRootDir: string): Promise<void> {
    // 既存のChartを削除
    this.charts = this.charts.filter(chart => chart.rootDir !== chartRootDir);

    // 新しくスキャン
    const updatedCharts = await findHelmCharts([chartRootDir]);

    if (updatedCharts.length > 0) {
      this.charts.push(...updatedCharts);
      console.error(`[HelmChartIndex] Updated chart at ${chartRootDir}`);
    } else {
      console.error(`[HelmChartIndex] Removed chart at ${chartRootDir}`);
    }
  }

  /**
   * インデックスをクリア
   *
   * @example
   * helmChartIndex.clear();
   */
  clear(): void {
    this.charts = [];
    this.initialized = false;
    console.error('[HelmChartIndex] Cleared index');
  }

  /**
   * 初期化済みかどうか
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
