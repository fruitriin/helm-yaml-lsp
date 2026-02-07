/**
 * Phase 7: Symbol Mapping Index Service
 *
 * HelmTemplateExecutor と symbolMapping アルゴリズムを統合し、
 * レンダリング済みYAMLと元テンプレートのマッピングを管理する。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  createSymbolMapping,
  findOriginalExpression,
  findOriginalPosition,
} from '@/features/symbolMapping';
import type { HelmTemplateExecutor } from '@/services/helmTemplateExecutor';
import type { SymbolMapping } from '@/types/rendering';
import type { FileCache } from '@/utils/fileCache';
import { filePathToUri } from '@/utils/uriUtils';

/** debounce待機時間 (ms) */
const DEBOUNCE_MS = 300;

/**
 * Symbol Mapping Index
 *
 * レンダリング済みYAMLからのマッピング検索と、
 * オンデマンドでのマッピング構築を管理する。
 */
export class SymbolMappingIndex {
  /** Chart名→マッピングマップ (キー: `chartDir::templatePath`) */
  private mappings: Map<string, SymbolMapping> = new Map();

  /** debounceタイマー */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private executor: HelmTemplateExecutor,
    private fileCache?: FileCache
  ) {}

  /**
   * レンダリング済みドキュメントに対応するマッピングを検索
   *
   * @param chartDir - Chartのルートディレクトリ
   * @param templatePath - テンプレートの相対パス (例: "templates/workflow-basic.yaml")
   * @returns SymbolMapping、なければ null
   */
  findMapping(chartDir: string, templatePath: string): SymbolMapping | null {
    const key = `${chartDir}::${templatePath}`;
    return this.mappings.get(key) ?? null;
  }

  /**
   * マッピングを取得（なければ作成）
   *
   * @param chartDir - Chartのルートディレクトリ
   * @param templatePath - テンプレートの相対パス
   * @returns SymbolMapping、作成失敗なら null
   */
  async getOrCreateMapping(chartDir: string, templatePath: string): Promise<SymbolMapping | null> {
    const key = `${chartDir}::${templatePath}`;
    const existing = this.mappings.get(key);
    if (existing) {
      return existing;
    }

    // L2: ファイルキャッシュから復元を試みる
    if (this.fileCache) {
      const cached = await this.fileCache.load(chartDir, templatePath);
      if (cached) {
        this.mappings.set(key, cached);
        return cached;
      }
    }

    return this.buildMapping(chartDir, templatePath);
  }

  /**
   * レンダリング済みYAMLの位置から元テンプレートの位置を検索
   *
   * @param chartDir - Chartのルートディレクトリ
   * @param templatePath - テンプレートの相対パス
   * @param renderedLine - レンダリング済みYAMLの行番号
   * @param renderedCharacter - レンダリング済みYAMLの文字位置
   * @returns 元テンプレートの位置情報、見つからなければ null
   */
  async findOriginalLocation(
    chartDir: string,
    templatePath: string,
    renderedLine: number,
    renderedCharacter: number
  ): Promise<{ line: number; character: number; confidence: number } | null> {
    const mapping = await this.getOrCreateMapping(chartDir, templatePath);
    if (!mapping) {
      return null;
    }

    return findOriginalPosition(mapping, renderedLine, renderedCharacter);
  }

  /**
   * レンダリング済みYAMLの位置から元テンプレートのHelm式を検索
   *
   * @param chartDir - Chartのルートディレクトリ
   * @param templatePath - テンプレートの相対パス
   * @param renderedLine - レンダリング済みYAMLの行番号
   * @param renderedCharacter - レンダリング済みYAMLの文字位置
   * @returns Helm式の情報、見つからなければ null
   */
  async findOriginalHelmExpression(
    chartDir: string,
    templatePath: string,
    renderedLine: number,
    renderedCharacter: number
  ): Promise<{
    expression: string;
    originalLine: number;
    originalCharacter: number;
    renderedValue: string;
    confidence: number;
  } | null> {
    const mapping = await this.getOrCreateMapping(chartDir, templatePath);
    if (!mapping) {
      return null;
    }

    const result = findOriginalExpression(mapping, renderedLine, renderedCharacter);
    if (!result) {
      return null;
    }

    return {
      expression: result.expression,
      originalLine: result.range.start.line,
      originalCharacter: result.range.start.character,
      renderedValue: '',
      confidence: result.confidence,
    };
  }

  /**
   * 特定のChartやテンプレートのマッピングを無効化
   *
   * debounce付きで再構築をスケジュール
   *
   * @param chartDir - Chartのルートディレクトリ
   * @param templatePath - テンプレートの相対パス（省略時は全テンプレート）
   */
  invalidate(chartDir: string, templatePath?: string): void {
    if (templatePath) {
      const key = `${chartDir}::${templatePath}`;
      this.mappings.delete(key);
      this.fileCache?.invalidate(chartDir, templatePath);
      this.scheduleRebuild(chartDir, templatePath);
    } else {
      // chartDir配下の全マッピングを削除
      for (const key of this.mappings.keys()) {
        if (key.startsWith(`${chartDir}::`)) {
          this.mappings.delete(key);
        }
      }
      this.fileCache?.invalidate(chartDir);
      // Executorキャッシュもクリア
      this.executor.clearCache(chartDir);
    }
  }

  /**
   * 全マッピングをクリア
   */
  clear(): void {
    this.mappings.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.fileCache?.clear();
  }

  /**
   * マッピングを構築
   */
  private async buildMapping(
    chartDir: string,
    templatePath: string
  ): Promise<SymbolMapping | null> {
    // 元テンプレートファイルを読む
    const originalFilePath = path.join(chartDir, templatePath);
    let originalContent: string;
    try {
      originalContent = fs.readFileSync(originalFilePath, 'utf-8');
    } catch {
      return null;
    }

    // helm template で単一テンプレートをレンダリング
    const result = await this.executor.renderSingleTemplate(chartDir, templatePath);
    if (!result.success || !result.documents || result.documents.length === 0) {
      return null;
    }

    const renderedContent = result.documents[0].content;
    const chartName = this.extractChartName(chartDir);

    // マッピングアルゴリズムを実行
    const originalUri = filePathToUri(path.join(chartDir, templatePath));
    const mapping = createSymbolMapping(
      originalContent,
      renderedContent,
      originalUri,
      chartName,
      chartDir,
      templatePath
    );

    const key = `${chartDir}::${templatePath}`;
    this.mappings.set(key, mapping);

    // L2: ファイルキャッシュに保存
    await this.fileCache?.save(chartDir, templatePath, mapping);

    return mapping;
  }

  /**
   * debounce付きでマッピング再構築をスケジュール
   */
  private scheduleRebuild(chartDir: string, templatePath: string): void {
    const key = `${chartDir}::${templatePath}`;

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(key);
      await this.buildMapping(chartDir, templatePath);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);
  }

  /**
   * ChartディレクトリからChart名を抽出
   */
  private extractChartName(chartDir: string): string {
    const parts = chartDir.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1];
  }
}
