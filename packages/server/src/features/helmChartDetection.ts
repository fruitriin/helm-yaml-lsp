/**
 * Helm Chart Detection Module
 *
 * Detects Helm Chart structure by checking for:
 * - Chart.yaml file
 * - values.yaml file
 * - templates/ directory
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { filePathToUri } from '@/utils/uriUtils';

/**
 * Represents a Helm Chart structure
 */
export type HelmChart = {
	/** Chart name from Chart.yaml */
	name: string;
	/** URI of Chart.yaml file */
	chartYamlUri: string;
	/** URI of values.yaml file */
	valuesYamlUri: string;
	/** Path to templates/ directory */
	templatesDir: string;
	/** Path to Chart root directory */
	rootDir: string;
};

/**
 * Metadata extracted from Chart.yaml
 */
export type ChartMetadata = {
	/** Chart name */
	name: string;
	/** Chart version */
	version: string;
	/** Chart description (optional) */
	description?: string;
	/** API version (e.g., v2) */
	apiVersion: string;
	/** Application version (optional) */
	appVersion?: string;
	/** Chart type: application or library (optional) */
	type?: string;
};

/**
 * Checks if a directory is a valid Helm Chart
 *
 * A valid Helm Chart must have:
 * - Chart.yaml file
 * - At least one of: values.yaml or templates/ directory
 *
 * @param directory - Absolute path to directory to check
 * @returns true if directory is a Helm Chart
 */
export function isHelmChart(directory: string): boolean {
	try {
		// Check if directory exists
		if (!fs.existsSync(directory)) {
			return false;
		}

		const stats = fs.statSync(directory);
		if (!stats.isDirectory()) {
			return false;
		}

		// Must have Chart.yaml
		const chartYamlPath = path.join(directory, 'Chart.yaml');
		if (!fs.existsSync(chartYamlPath)) {
			return false;
		}

		// Must have at least one of: values.yaml or templates/ directory
		const valuesYamlPath = path.join(directory, 'values.yaml');
		const templatesDir = path.join(directory, 'templates');

		const hasValuesYaml = fs.existsSync(valuesYamlPath);
		const hasTemplatesDir =
			fs.existsSync(templatesDir) && fs.statSync(templatesDir).isDirectory();

		return hasValuesYaml || hasTemplatesDir;
	} catch (error) {
		// If any error occurs (permission denied, etc.), assume not a Chart
		return false;
	}
}

/**
 * Parses Chart.yaml content and extracts metadata
 *
 * @param content - Content of Chart.yaml file
 * @returns Chart metadata, or undefined if parsing fails
 */
export function parseChartYaml(content: string): ChartMetadata | undefined {
	try {
		const parsed = yaml.load(content) as Record<string, unknown>;

		// Required fields
		if (
			typeof parsed.name !== 'string' ||
			typeof parsed.version !== 'string' ||
			typeof parsed.apiVersion !== 'string'
		) {
			return undefined;
		}

		const metadata: ChartMetadata = {
			name: parsed.name,
			version: parsed.version,
			apiVersion: parsed.apiVersion,
		};

		// Optional fields
		if (typeof parsed.description === 'string') {
			metadata.description = parsed.description;
		}
		if (typeof parsed.appVersion === 'string') {
			metadata.appVersion = parsed.appVersion;
		}
		if (typeof parsed.type === 'string') {
			metadata.type = parsed.type;
		}

		return metadata;
	} catch (error) {
		return undefined;
	}
}

/**
 * Finds all Helm Charts in workspace folders
 *
 * Recursively searches for directories containing Chart.yaml
 *
 * @param workspaceFolders - Array of workspace folder paths
 * @param maxDepth - Maximum search depth (default: 5)
 * @returns Array of HelmChart objects
 */
export function findHelmCharts(
	workspaceFolders: string[],
	maxDepth = 5,
): HelmChart[] {
	const charts: HelmChart[] = [];

	for (const workspaceFolder of workspaceFolders) {
		findHelmChartsRecursive(workspaceFolder, 0, maxDepth, charts);
	}

	return charts;
}

/**
 * Recursively finds Helm Charts in a directory
 *
 * @param directory - Directory to search
 * @param currentDepth - Current recursion depth
 * @param maxDepth - Maximum recursion depth
 * @param charts - Accumulator for found charts
 */
function findHelmChartsRecursive(
	directory: string,
	currentDepth: number,
	maxDepth: number,
	charts: HelmChart[],
): void {
	// Stop if max depth reached
	if (currentDepth > maxDepth) {
		return;
	}

	// Check if current directory is a Helm Chart
	if (isHelmChart(directory)) {
		const chartYamlPath = path.join(directory, 'Chart.yaml');

		try {
			const content = fs.readFileSync(chartYamlPath, 'utf-8');
			const metadata = parseChartYaml(content);

			if (metadata) {
				const valuesYamlPath = path.join(directory, 'values.yaml');
				const templatesDir = path.join(directory, 'templates');

				charts.push({
					name: metadata.name,
					chartYamlUri: filePathToUri(chartYamlPath),
					valuesYamlUri: filePathToUri(valuesYamlPath),
					templatesDir,
					rootDir: directory,
				});

				// Don't search subdirectories of a Chart
				// (nested Charts are not supported yet)
				return;
			}
		} catch (error) {
			// If Chart.yaml can't be read or parsed, continue searching
		}
	}

	// Search subdirectories
	try {
		const entries = fs.readdirSync(directory, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isDirectory()) {
				// Skip common directories that won't contain Charts
				const skipDirs = [
					'node_modules',
					'.git',
					'dist',
					'build',
					'out',
					'.bun-cache',
				];
				if (skipDirs.includes(entry.name)) {
					continue;
				}

				const subDir = path.join(directory, entry.name);
				findHelmChartsRecursive(subDir, currentDepth + 1, maxDepth, charts);
			}
		}
	} catch (error) {
		// If directory can't be read, skip it
	}
}

/**
 * Reads Chart.yaml from a Helm Chart and returns metadata
 *
 * @param chartRootDir - Root directory of Helm Chart
 * @returns Chart metadata, or undefined if Chart.yaml can't be read
 */
export function readChartMetadata(
	chartRootDir: string,
): ChartMetadata | undefined {
	try {
		const chartYamlPath = path.join(chartRootDir, 'Chart.yaml');
		const content = fs.readFileSync(chartYamlPath, 'utf-8');
		return parseChartYaml(content);
	} catch (error) {
		return undefined;
	}
}
