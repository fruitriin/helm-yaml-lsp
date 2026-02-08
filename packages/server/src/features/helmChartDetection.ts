/**
 * Argo Workflows LSP - Helm Chart Detection
 *
 * Helm Chart構造の検出（エディタ非依存）
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { HelmOverrides } from '@/types';
import { findFiles } from '@/utils/fileSystem';
import { filePathToUri, uriToFilePath } from '@/utils/uriUtils';

/**
 * Helm Chart構造
 */
export type HelmChart = {
  /** Chart名 */
  name: string;
  /** Chart.yamlのURI */
  chartYamlUri: string;
  /** values.yamlのURI（存在する場合） */
  valuesYamlUri?: string;
  /** templates/ディレクトリのパス */
  templatesDir?: string;
  /** Chartのルートディレクトリ */
  rootDir: string;
  /** Chart.yamlのメタデータ */
  metadata?: ChartMetadata;
  /** Chart.yaml 内の @lsp アノテーション */
  overrides?: HelmOverrides;
};

/**
 * Chart.yamlのメタデータ
 */
export type ChartMetadata = {
  /** Chart名 */
  name: string;
  /** バージョン */
  version: string;
  /** 説明 */
  description?: string;
  /** APIバージョン（v1 or v2） */
  apiVersion: string;
  /** Chartタイプ（application or library） */
  type?: string;
  /** アプリケーションバージョン */
  appVersion?: string;
};

/**
 * 指定ディレクトリがHelm Chartかどうかを判定
 *
 * @param directory - チェックするディレクトリパス
 * @returns Helm Chartの場合true
 *
 * @example
 * const isChart = await isHelmChart('/path/to/chart');
 * if (isChart) {
 *   console.log('This is a Helm Chart!');
 * }
 */
export async function isHelmChart(directory: string): Promise<boolean> {
  try {
    const chartYamlPath = path.join(directory, 'Chart.yaml');
    const stats = await fs.stat(chartYamlPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Chart.yamlの内容を解析
 *
 * @param content - Chart.yamlの内容
 * @returns パースされたメタデータ、または undefined
 *
 * @example
 * const content = await fs.readFile('Chart.yaml', 'utf-8');
 * const metadata = parseChartYaml(content);
 * console.log(`Chart name: ${metadata?.name}`);
 */
export function parseChartYaml(content: string): ChartMetadata | undefined {
  try {
    // シンプルなYAMLパース（正規表現ベース）
    // YAMLパーサーは使わず、Helmテンプレート構文にも対応
    const lines = content.split('\n');
    const metadata: Partial<ChartMetadata> = {};

    for (const line of lines) {
      // コメント行や空行をスキップ
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Helmテンプレート構文（{{ }}）を含む行はスキップ
      if (trimmed.includes('{{')) {
        continue;
      }

      // key: value 形式のパース
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim().replace(/^["']|["']$/g, ''); // クォート除去

        switch (key) {
          case 'name':
            metadata.name = value;
            break;
          case 'version':
            metadata.version = value;
            break;
          case 'description':
            metadata.description = value;
            break;
          case 'apiVersion':
            metadata.apiVersion = value;
            break;
          case 'type':
            metadata.type = value;
            break;
          case 'appVersion':
            metadata.appVersion = value;
            break;
        }
      }
    }

    // 必須フィールドのチェック
    if (metadata.name && metadata.version && metadata.apiVersion) {
      return metadata as ChartMetadata;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Chart.yaml から @lsp アノテーションをパース
 *
 * `# @lsp key: value` 形式のコメントからオーバーライド設定を抽出する。
 *
 * @param content - Chart.yaml の内容
 * @returns パースされた HelmOverrides、アノテーションがなければ undefined
 *
 * @example
 * // Chart.yaml:
 * // # @lsp releaseName: my-release
 * // # @lsp set: feature.enabled=true
 * const overrides = parseLspAnnotations(content);
 * // → { releaseName: 'my-release', set: ['feature.enabled=true'] }
 */
export function parseLspAnnotations(content: string): HelmOverrides | undefined {
  const lines = content.split('\n');
  const overrides: HelmOverrides = { set: [], values: [] };
  let found = false;

  const pattern = /^#\s*@lsp\s+(releaseName|namespace|set|values):\s*(.+)$/;

  for (const line of lines) {
    const match = line.trim().match(pattern);
    if (!match) continue;

    found = true;
    const [, key, value] = match;
    const trimmedValue = value.trim();

    switch (key) {
      case 'releaseName':
        overrides.releaseName = trimmedValue;
        break;
      case 'namespace':
        overrides.namespace = trimmedValue;
        break;
      case 'set':
        overrides.set!.push(trimmedValue);
        break;
      case 'values':
        overrides.values!.push(trimmedValue);
        break;
    }
  }

  return found ? overrides : undefined;
}

/**
 * ワークスペース内のすべてのHelm Chartを検出
 *
 * @param workspaceFolders - ワークスペースフォルダのパス配列
 * @returns 検出されたHelm Chart配列
 *
 * @example
 * const charts = await findHelmCharts(['/workspace']);
 * for (const chart of charts) {
 *   console.log(`Found chart: ${chart.name} at ${chart.rootDir}`);
 * }
 */
export async function findHelmCharts(workspaceFolders: string[]): Promise<HelmChart[]> {
  const charts: HelmChart[] = [];

  for (const workspaceFolder of workspaceFolders) {
    try {
      // Chart.yamlファイルを検索
      const chartYamlUris = await findFiles('**/Chart.yaml', workspaceFolder);

      for (const chartYamlUri of chartYamlUris) {
        const chartYamlPath = uriToFilePath(chartYamlUri);
        const rootDir = path.dirname(chartYamlPath);

        // Chart.yamlを読み込んで解析
        let metadata: ChartMetadata | undefined;
        let overrides: HelmOverrides | undefined;
        try {
          const content = await fs.readFile(chartYamlPath, 'utf-8');
          metadata = parseChartYaml(content);
          overrides = parseLspAnnotations(content);
        } catch {
          // パースエラーは無視
        }

        if (!metadata) {
          continue; // メタデータが取得できない場合はスキップ
        }

        // values.yamlの存在確認
        const valuesYamlPath = path.join(rootDir, 'values.yaml');
        let valuesYamlUri: string | undefined;
        try {
          const stats = await fs.stat(valuesYamlPath);
          if (stats.isFile()) {
            valuesYamlUri = filePathToUri(valuesYamlPath);
          }
        } catch {
          // values.yamlが存在しない場合は undefined のまま
        }

        // templates/ディレクトリの存在確認
        const templatesDir = path.join(rootDir, 'templates');
        let templatesDirPath: string | undefined;
        try {
          const stats = await fs.stat(templatesDir);
          if (stats.isDirectory()) {
            templatesDirPath = templatesDir;
          }
        } catch {
          // templates/が存在しない場合は undefined のまま
        }

        const chart: HelmChart = {
          name: metadata.name,
          chartYamlUri,
          valuesYamlUri,
          templatesDir: templatesDirPath,
          rootDir,
          metadata,
          overrides,
        };

        charts.push(chart);
      }
    } catch (error) {
      // ワークスペースフォルダの処理エラーはログに記録してスキップ
      console.error(
        `[HelmChartDetection] Error processing workspace folder ${workspaceFolder}:`,
        error
      );
    }
  }

  return charts;
}

/**
 * ファイルURIが指定されたHelm Chartに属するかチェック
 *
 * @param fileUri - チェックするファイルのURI
 * @param chart - Helm Chart
 * @returns Chartに属する場合true
 *
 * @example
 * if (isFileInChart(fileUri, chart)) {
 *   console.log('File belongs to chart:', chart.name);
 * }
 */
export function isFileInChart(fileUri: string, chart: HelmChart): boolean {
  // URIをファイルパスに変換
  const filePath = fileUri.replace(/^file:\/\//, '');
  const chartRoot = chart.rootDir;

  // ファイルがChartのルートディレクトリ配下にあるかチェック
  return filePath.startsWith(chartRoot);
}
