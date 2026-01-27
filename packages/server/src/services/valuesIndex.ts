/**
 * Values Index Service
 *
 * Manages indexing of values.yaml files:
 * - Indexes values from all Helm Charts
 * - Provides value lookup by path
 * - Supports prefix-based search for completion
 * - Updates on values.yaml changes
 */

import * as fs from 'node:fs';
import type { ValueDefinition } from '@/features/valuesYamlParser';
import {
	findValueByPath,
	findValuesByPrefix,
	parseValuesYaml,
} from '@/features/valuesYamlParser';
import type { HelmChart } from '@/features/helmChartDetection';
import { uriToFilePath } from '@/utils/uriUtils';

/**
 * Manages value definitions from values.yaml files
 */
export class ValuesIndex {
	/** Map of Chart name -> ValueDefinition[] */
	private valuesByChart: Map<string, ValueDefinition[]>;

	/** Map of values.yaml URI -> Chart name */
	private uriToChartName: Map<string, string>;

	constructor() {
		this.valuesByChart = new Map();
		this.uriToChartName = new Map();
	}

	/**
	 * Initializes the index by parsing values.yaml from all Charts
	 *
	 * @param charts - Array of HelmChart objects
	 */
	async initialize(charts: HelmChart[]): Promise<void> {
		console.log('[ValuesIndex] Initializing...');

		this.valuesByChart.clear();
		this.uriToChartName.clear();

		for (const chart of charts) {
			await this.indexValuesFile(chart.valuesYamlUri, chart.name);
		}

		console.log(
			`[ValuesIndex] Initialized with ${this.valuesByChart.size} Chart(s)`,
		);
		for (const [chartName, values] of this.valuesByChart.entries()) {
			console.log(`  - ${chartName}: ${values.length} value(s)`);
		}
	}

	/**
	 * Indexes a values.yaml file for a specific Chart
	 *
	 * @param valuesUri - URI of values.yaml
	 * @param chartName - Name of the Chart
	 */
	async indexValuesFile(valuesUri: string, chartName: string): Promise<void> {
		try {
			const filePath = uriToFilePath(valuesUri);

			// Check if file exists
			if (!fs.existsSync(filePath)) {
				console.log(
					`[ValuesIndex] values.yaml not found for Chart ${chartName}: ${filePath}`,
				);
				this.valuesByChart.set(chartName, []);
				return;
			}

			const content = fs.readFileSync(filePath, 'utf-8');
			const definitions = parseValuesYaml(content, valuesUri);

			this.valuesByChart.set(chartName, definitions);
			this.uriToChartName.set(valuesUri, chartName);

			console.log(
				`[ValuesIndex] Indexed ${definitions.length} values from ${chartName}`,
			);
		} catch (error) {
			console.error(
				`[ValuesIndex] Error indexing values.yaml for ${chartName}:`,
				error,
			);
			this.valuesByChart.set(chartName, []);
		}
	}

	/**
	 * Finds a value definition by path in a specific Chart
	 *
	 * @param chartName - Name of the Chart
	 * @param valuePath - Dot-notation path (e.g., "image.repository")
	 * @returns ValueDefinition if found, undefined otherwise
	 */
	findValue(
		chartName: string,
		valuePath: string,
	): ValueDefinition | undefined {
		const definitions = this.valuesByChart.get(chartName);
		if (!definitions) {
			return undefined;
		}

		return findValueByPath(definitions, valuePath);
	}

	/**
	 * Finds all values matching a prefix in a specific Chart
	 *
	 * Useful for completion: given "image", return "image.repository", "image.tag", etc.
	 *
	 * @param chartName - Name of the Chart
	 * @param prefix - Prefix to match
	 * @returns Array of matching ValueDefinition objects
	 */
	findValuesByPrefix(
		chartName: string,
		prefix: string,
	): ValueDefinition[] {
		const definitions = this.valuesByChart.get(chartName);
		if (!definitions) {
			return [];
		}

		return findValuesByPrefix(definitions, prefix);
	}

	/**
	 * Gets all value definitions for a Chart
	 *
	 * @param chartName - Name of the Chart
	 * @returns Array of all ValueDefinition objects, or empty array if Chart not found
	 */
	getAllValues(chartName: string): ValueDefinition[] {
		return this.valuesByChart.get(chartName) || [];
	}

	/**
	 * Updates values.yaml when it changes
	 *
	 * @param valuesUri - URI of values.yaml that changed
	 */
	async updateValuesFile(valuesUri: string): Promise<void> {
		const chartName = this.uriToChartName.get(valuesUri);
		if (!chartName) {
			console.log(
				`[ValuesIndex] Cannot update: values.yaml not associated with any Chart: ${valuesUri}`,
			);
			return;
		}

		console.log(`[ValuesIndex] Updating values.yaml for Chart: ${chartName}`);
		await this.indexValuesFile(valuesUri, chartName);
	}

	/**
	 * Gets all Charts that have been indexed
	 *
	 * @returns Array of Chart names
	 */
	getChartNames(): string[] {
		return Array.from(this.valuesByChart.keys());
	}

	/**
	 * Clears all indexed values
	 */
	clear(): void {
		this.valuesByChart.clear();
		this.uriToChartName.clear();
		console.log('[ValuesIndex] Cleared all values');
	}

	/**
	 * Gets the number of indexed Charts
	 *
	 * @returns Number of Charts
	 */
	get size(): number {
		return this.valuesByChart.size;
	}
}
