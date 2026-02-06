/**
 * Helm Template Index Service
 *
 * Manages indexing of Helm template definitions:
 * - Indexes {{ define "name" }} blocks from template files
 * - Provides template lookup by name
 * - Updates on template file changes
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { HelmChart } from '@/features/helmChartDetection';
import type { HelmTemplateDefinition } from '@/features/helmTemplateFeatures';
import { findDefineBlocks } from '@/features/helmTemplateFeatures';
import { filePathToUri, uriToFilePath } from '@/utils/uriUtils';

/**
 * Manages Helm template definitions
 */
export class HelmTemplateIndex {
  /** Map of Chart name -> template name -> HelmTemplateDefinition */
  private templatesByChart: Map<string, Map<string, HelmTemplateDefinition>>;

  /** Map of file URI -> Chart name */
  private uriToChartName: Map<string, string>;

  constructor() {
    this.templatesByChart = new Map();
    this.uriToChartName = new Map();
  }

  /**
   * Initializes the index by parsing template files from all Charts
   *
   * @param charts - Array of HelmChart objects
   */
  async initialize(charts: HelmChart[]): Promise<void> {
    console.log('[HelmTemplateIndex] Initializing...');

    this.templatesByChart.clear();
    this.uriToChartName.clear();

    for (const chart of charts) {
      await this.indexChartTemplates(chart);
    }

    let totalTemplates = 0;
    for (const templates of this.templatesByChart.values()) {
      totalTemplates += templates.size;
    }

    console.log(
      `[HelmTemplateIndex] Initialized with ${totalTemplates} template(s) from ${this.templatesByChart.size} Chart(s)`
    );
  }

  /**
   * Indexes all template files for a specific Chart
   *
   * @param chart - HelmChart to index
   */
  async indexChartTemplates(chart: HelmChart): Promise<void> {
    const templatesMap = new Map<string, HelmTemplateDefinition>();

    try {
      // Check if templates directory exists
      if (!chart.templatesDir || !fs.existsSync(chart.templatesDir)) {
        console.log(`[HelmTemplateIndex] templates/ directory not found for Chart ${chart.name}`);
        this.templatesByChart.set(chart.name, templatesMap);
        return;
      }

      // Find all .yaml, .yml, and .tpl files in templates/
      const files = this.findTemplateFiles(chart.templatesDir);

      for (const filePath of files) {
        const uri = filePathToUri(filePath);
        await this.indexTemplateFile(uri, chart.name, templatesMap);
      }

      this.templatesByChart.set(chart.name, templatesMap);

      console.log(
        `[HelmTemplateIndex] Indexed ${templatesMap.size} template(s) from ${chart.name}`
      );
    } catch (error) {
      console.error(`[HelmTemplateIndex] Error indexing templates for ${chart.name}:`, error);
      this.templatesByChart.set(chart.name, templatesMap);
    }
  }

  /**
   * Finds all template files in a directory (recursively)
   *
   * @param directory - Directory to search
   * @returns Array of file paths
   */
  private findTemplateFiles(directory: string): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          files.push(...this.findTemplateFiles(fullPath));
        } else if (entry.isFile()) {
          // Include .yaml, .yml, and .tpl files
          if (
            entry.name.endsWith('.yaml') ||
            entry.name.endsWith('.yml') ||
            entry.name.endsWith('.tpl')
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`[HelmTemplateIndex] Error reading directory ${directory}:`, error);
    }

    return files;
  }

  /**
   * Indexes a single template file
   *
   * @param uri - URI of template file
   * @param chartName - Name of the Chart
   * @param templatesMap - Map to store templates
   */
  async indexTemplateFile(
    uri: string,
    chartName: string,
    templatesMap?: Map<string, HelmTemplateDefinition>
  ): Promise<void> {
    try {
      const filePath = uriToFilePath(uri);

      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const document = TextDocument.create(uri, 'yaml', 1, content);

      // Find all {{ define }} blocks in the file
      const definitions = findDefineBlocks(document);

      // Store in the provided map or the chart's map
      const targetMap = templatesMap || this.templatesByChart.get(chartName);
      if (targetMap) {
        for (const def of definitions) {
          targetMap.set(def.name, def);
        }
      }

      // Track file to chart mapping
      this.uriToChartName.set(uri, chartName);
    } catch (error) {
      console.error(`[HelmTemplateIndex] Error indexing template file ${uri}:`, error);
    }
  }

  /**
   * Finds a template definition by name in a specific Chart
   *
   * @param chartName - Name of the Chart
   * @param templateName - Name of the template
   * @returns HelmTemplateDefinition if found, undefined otherwise
   */
  findTemplate(chartName: string, templateName: string): HelmTemplateDefinition | undefined {
    const templates = this.templatesByChart.get(chartName);
    return templates?.get(templateName);
  }

  /**
   * Gets all template definitions for a Chart
   *
   * @param chartName - Name of the Chart
   * @returns Array of HelmTemplateDefinition objects
   */
  getAllTemplates(chartName: string): HelmTemplateDefinition[] {
    const templates = this.templatesByChart.get(chartName);
    return templates ? Array.from(templates.values()) : [];
  }

  /**
   * Updates a template file when it changes
   *
   * @param uri - URI of the template file that changed
   */
  async updateTemplateFile(uri: string): Promise<void> {
    const chartName = this.uriToChartName.get(uri);
    if (!chartName) {
      console.log(`[HelmTemplateIndex] Cannot update: file not associated with any Chart: ${uri}`);
      return;
    }

    console.log(`[HelmTemplateIndex] Updating template file for Chart: ${chartName}`);

    // Re-index the file
    const templatesMap = this.templatesByChart.get(chartName);
    if (templatesMap) {
      // Remove old definitions from this file
      // (we'll re-add them below)
      for (const [name, def] of templatesMap.entries()) {
        if (def.uri === uri) {
          templatesMap.delete(name);
        }
      }

      // Re-index the file
      await this.indexTemplateFile(uri, chartName, templatesMap);
    }
  }

  /**
   * Clears all indexed templates
   */
  clear(): void {
    this.templatesByChart.clear();
    this.uriToChartName.clear();
    console.log('[HelmTemplateIndex] Cleared all templates');
  }

  /**
   * Gets the number of indexed Charts
   *
   * @returns Number of Charts
   */
  get size(): number {
    return this.templatesByChart.size;
  }
}
