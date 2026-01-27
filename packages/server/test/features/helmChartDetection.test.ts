import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	findHelmCharts,
	isHelmChart,
	parseChartYaml,
	readChartMetadata,
} from '@/features/helmChartDetection';

describe('Helm Chart Detection', () => {
	let tempDir: string;

	beforeEach(() => {
		// Create a temporary directory for testing
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-test-'));
	});

	describe('parseChartYaml', () => {
		it('should parse valid Chart.yaml with required fields', () => {
			const content = `
apiVersion: v2
name: my-chart
version: 1.0.0
`;
			const result = parseChartYaml(content);

			expect(result).toBeDefined();
			expect(result?.name).toBe('my-chart');
			expect(result?.version).toBe('1.0.0');
			expect(result?.apiVersion).toBe('v2');
		});

		it('should parse Chart.yaml with optional fields', () => {
			const content = `
apiVersion: v2
name: my-chart
version: 1.0.0
description: A sample Helm chart
appVersion: "3.5.0"
type: application
`;
			const result = parseChartYaml(content);

			expect(result).toBeDefined();
			expect(result?.description).toBe('A sample Helm chart');
			expect(result?.appVersion).toBe('3.5.0');
			expect(result?.type).toBe('application');
		});

		it('should return undefined for invalid YAML', () => {
			const content = 'invalid: yaml: content:';
			const result = parseChartYaml(content);

			expect(result).toBeUndefined();
		});

		it('should return undefined when required fields are missing', () => {
			const content = `
apiVersion: v2
version: 1.0.0
`;
			const result = parseChartYaml(content);

			expect(result).toBeUndefined();
		});

		it('should return undefined when fields have wrong types', () => {
			const content = `
apiVersion: v2
name: 123
version: 1.0.0
`;
			const result = parseChartYaml(content);

			expect(result).toBeUndefined();
		});
	});

	describe('isHelmChart', () => {
		it('should return true for valid Helm Chart with values.yaml', () => {
			// Create Chart structure
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

			expect(isHelmChart(tempDir)).toBe(true);
		});

		it('should return true for valid Helm Chart with templates/', () => {
			// Create Chart structure
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test\nversion: 1.0.0',
			);
			fs.mkdirSync(path.join(tempDir, 'templates'));

			expect(isHelmChart(tempDir)).toBe(true);
		});

		it('should return true for valid Helm Chart with both', () => {
			// Create Chart structure
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');
			fs.mkdirSync(path.join(tempDir, 'templates'));

			expect(isHelmChart(tempDir)).toBe(true);
		});

		it('should return false when Chart.yaml is missing', () => {
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');
			fs.mkdirSync(path.join(tempDir, 'templates'));

			expect(isHelmChart(tempDir)).toBe(false);
		});

		it('should return false when both values.yaml and templates/ are missing', () => {
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test\nversion: 1.0.0',
			);

			expect(isHelmChart(tempDir)).toBe(false);
		});

		it('should return false for non-existent directory', () => {
			expect(isHelmChart('/nonexistent/path')).toBe(false);
		});

		it('should return false for a file path', () => {
			const filePath = path.join(tempDir, 'somefile.txt');
			fs.writeFileSync(filePath, 'content');

			expect(isHelmChart(filePath)).toBe(false);
		});
	});

	describe('findHelmCharts', () => {
		it('should find a single Helm Chart', () => {
			// Create Chart structure
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				'apiVersion: v2\nname: test-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(tempDir, 'values.yaml'), 'foo: bar');

			const charts = findHelmCharts([tempDir]);

			expect(charts).toHaveLength(1);
			expect(charts[0].name).toBe('test-chart');
			expect(charts[0].rootDir).toBe(tempDir);
		});

		it('should find multiple Helm Charts', () => {
			// Create first Chart
			const chart1Dir = path.join(tempDir, 'chart1');
			fs.mkdirSync(chart1Dir);
			fs.writeFileSync(
				path.join(chart1Dir, 'Chart.yaml'),
				'apiVersion: v2\nname: chart1\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(chart1Dir, 'values.yaml'), 'foo: bar');

			// Create second Chart
			const chart2Dir = path.join(tempDir, 'chart2');
			fs.mkdirSync(chart2Dir);
			fs.writeFileSync(
				path.join(chart2Dir, 'Chart.yaml'),
				'apiVersion: v2\nname: chart2\nversion: 1.0.0',
			);
			fs.mkdirSync(path.join(chart2Dir, 'templates'));

			const charts = findHelmCharts([tempDir]);

			expect(charts).toHaveLength(2);
			expect(charts.map((c) => c.name).sort()).toEqual(['chart1', 'chart2']);
		});

		it('should not find Charts beyond max depth', () => {
			// Create deeply nested Chart
			const deepDir = path.join(tempDir, 'a', 'b', 'c', 'd', 'e', 'f');
			fs.mkdirSync(deepDir, { recursive: true });
			fs.writeFileSync(
				path.join(deepDir, 'Chart.yaml'),
				'apiVersion: v2\nname: deep-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(deepDir, 'values.yaml'), 'foo: bar');

			// Default maxDepth is 5
			const charts = findHelmCharts([tempDir]);

			expect(charts).toHaveLength(0);
		});

		it('should skip node_modules and .git directories', () => {
			// Create Chart in node_modules (should be skipped)
			const nodeModulesDir = path.join(tempDir, 'node_modules', 'some-chart');
			fs.mkdirSync(nodeModulesDir, { recursive: true });
			fs.writeFileSync(
				path.join(nodeModulesDir, 'Chart.yaml'),
				'apiVersion: v2\nname: node-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(nodeModulesDir, 'values.yaml'), 'foo: bar');

			// Create Chart in .git (should be skipped)
			const gitDir = path.join(tempDir, '.git', 'some-chart');
			fs.mkdirSync(gitDir, { recursive: true });
			fs.writeFileSync(
				path.join(gitDir, 'Chart.yaml'),
				'apiVersion: v2\nname: git-chart\nversion: 1.0.0',
			);
			fs.writeFileSync(path.join(gitDir, 'values.yaml'), 'foo: bar');

			const charts = findHelmCharts([tempDir]);

			expect(charts).toHaveLength(0);
		});

		it('should return empty array when no Charts found', () => {
			const charts = findHelmCharts([tempDir]);

			expect(charts).toHaveLength(0);
		});
	});

	describe('readChartMetadata', () => {
		it('should read metadata from Chart.yaml', () => {
			fs.writeFileSync(
				path.join(tempDir, 'Chart.yaml'),
				`
apiVersion: v2
name: my-chart
version: 1.0.0
description: Test chart
`,
			);

			const metadata = readChartMetadata(tempDir);

			expect(metadata).toBeDefined();
			expect(metadata?.name).toBe('my-chart');
			expect(metadata?.version).toBe('1.0.0');
			expect(metadata?.description).toBe('Test chart');
		});

		it('should return undefined when Chart.yaml does not exist', () => {
			const metadata = readChartMetadata(tempDir);

			expect(metadata).toBeUndefined();
		});

		it('should return undefined when Chart.yaml is invalid', () => {
			fs.writeFileSync(path.join(tempDir, 'Chart.yaml'), 'invalid: yaml:');

			const metadata = readChartMetadata(tempDir);

			expect(metadata).toBeUndefined();
		});
	});
});
