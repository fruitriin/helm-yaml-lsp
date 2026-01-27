/**
 * Helm Chart Index Service
 *
 * Manages indexing of Helm Charts in the workspace:
 * - Discovers Charts in workspace folders
 * - Tracks Chart.yaml metadata
 * - Maps files to their parent Chart
 * - Updates on Chart.yaml changes
 */

import * as path from 'node:path';
import type { HelmChart } from '@/features/helmChartDetection';
import {
	findHelmCharts,
	readChartMetadata,
} from '@/features/helmChartDetection';
import { uriToFilePath } from '@/utils/uriUtils';

/**
 * Manages indexing of Helm Charts
 */
export class HelmChartIndex {
	/** Map of Chart root directory -> HelmChart */
	private charts: Map<string, HelmChart>;

	constructor() {
		this.charts = new Map();
	}

	/**
	 * Initializes the index by discovering Charts in workspace folders
	 *
	 * @param workspaceFolders - Array of workspace folder URIs
	 */
	async initialize(workspaceFolders: string[]): Promise<void> {
		console.log('[HelmChartIndex] Initializing...');

		const workspacePaths = workspaceFolders.map((uri) => uriToFilePath(uri));
		const discoveredCharts = findHelmCharts(workspacePaths);

		this.charts.clear();
		for (const chart of discoveredCharts) {
			this.charts.set(chart.rootDir, chart);
		}

		console.log(
			`[HelmChartIndex] Initialized with ${this.charts.size} Helm Chart(s)`,
		);
		for (const chart of this.charts.values()) {
			console.log(`  - ${chart.name} (${chart.rootDir})`);
		}
	}

	/**
	 * Finds the Helm Chart that contains a given file
	 *
	 * @param fileUri - URI of file to check
	 * @returns HelmChart if file is inside a Chart, undefined otherwise
	 */
	findChartForFile(fileUri: string): HelmChart | undefined {
		const filePath = uriToFilePath(fileUri);

		// Find the Chart whose rootDir is a parent of the file
		for (const chart of this.charts.values()) {
			// Normalize paths for comparison
			const normalizedFilePath = path.normalize(filePath);
			const normalizedChartDir = path.normalize(chart.rootDir);

			// Check if file is inside Chart directory
			if (
				normalizedFilePath.startsWith(normalizedChartDir + path.sep) ||
				normalizedFilePath === normalizedChartDir
			) {
				return chart;
			}
		}

		return undefined;
	}

	/**
	 * Gets all indexed Charts
	 *
	 * @returns Array of all HelmChart objects
	 */
	getAllCharts(): HelmChart[] {
		return Array.from(this.charts.values());
	}

	/**
	 * Gets a specific Chart by root directory
	 *
	 * @param chartRootDir - Root directory of Chart
	 * @returns HelmChart if found, undefined otherwise
	 */
	getChart(chartRootDir: string): HelmChart | undefined {
		return this.charts.get(chartRootDir);
	}

	/**
	 * Updates a Chart's metadata when Chart.yaml changes
	 *
	 * @param chartRootDir - Root directory of Chart
	 * @returns true if Chart was updated, false if not found or update failed
	 */
	async updateChart(chartRootDir: string): Promise<boolean> {
		const existingChart = this.charts.get(chartRootDir);
		if (!existingChart) {
			console.log(
				`[HelmChartIndex] Cannot update: Chart not found at ${chartRootDir}`,
			);
			return false;
		}

		try {
			const metadata = readChartMetadata(chartRootDir);
			if (!metadata) {
				console.log(
					`[HelmChartIndex] Cannot update: Failed to read Chart.yaml at ${chartRootDir}`,
				);
				return false;
			}

			// Update Chart name (other fields stay the same)
			existingChart.name = metadata.name;

			console.log(`[HelmChartIndex] Updated Chart: ${metadata.name}`);
			return true;
		} catch (error) {
			console.error(
				`[HelmChartIndex] Error updating Chart at ${chartRootDir}:`,
				error,
			);
			return false;
		}
	}

	/**
	 * Adds a new Chart to the index
	 *
	 * @param chart - HelmChart to add
	 */
	addChart(chart: HelmChart): void {
		this.charts.set(chart.rootDir, chart);
		console.log(`[HelmChartIndex] Added Chart: ${chart.name}`);
	}

	/**
	 * Removes a Chart from the index
	 *
	 * @param chartRootDir - Root directory of Chart to remove
	 * @returns true if Chart was removed, false if not found
	 */
	removeChart(chartRootDir: string): boolean {
		const chart = this.charts.get(chartRootDir);
		if (chart) {
			this.charts.delete(chartRootDir);
			console.log(`[HelmChartIndex] Removed Chart: ${chart.name}`);
			return true;
		}
		return false;
	}

	/**
	 * Clears all Charts from the index
	 */
	clear(): void {
		this.charts.clear();
		console.log('[HelmChartIndex] Cleared all Charts');
	}

	/**
	 * Gets the number of indexed Charts
	 *
	 * @returns Number of Charts
	 */
	get size(): number {
		return this.charts.size;
	}
}
