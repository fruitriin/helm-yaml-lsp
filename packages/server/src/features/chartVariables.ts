/**
 * Chart Variables Module
 *
 * Defines and provides information about Helm .Chart variables
 */

/**
 * Chart variable information
 */
export type ChartVariableInfo = {
  /** Variable name (e.g., "Name", "Version") */
  name: string;
  /** Full variable path (e.g., ".Chart.Name") */
  fullPath: string;
  /** Description of the variable */
  description: string;
};

/**
 * All supported Chart variables
 */
export const CHART_VARIABLES: Record<string, ChartVariableInfo> = {
  Name: {
    name: 'Name',
    fullPath: '.Chart.Name',
    description: 'The name of the chart',
  },
  Version: {
    name: 'Version',
    fullPath: '.Chart.Version',
    description: 'The version of the chart',
  },
  Description: {
    name: 'Description',
    fullPath: '.Chart.Description',
    description: 'The description from Chart.yaml',
  },
  ApiVersion: {
    name: 'ApiVersion',
    fullPath: '.Chart.ApiVersion',
    description: 'The API version of the chart',
  },
  AppVersion: {
    name: 'AppVersion',
    fullPath: '.Chart.AppVersion',
    description: 'The version of the application contained in the chart',
  },
  Type: {
    name: 'Type',
    fullPath: '.Chart.Type',
    description: 'The chart type (application or library)',
  },
  KubeVersion: {
    name: 'KubeVersion',
    fullPath: '.Chart.KubeVersion',
    description: 'The required Kubernetes version',
  },
  Keywords: {
    name: 'Keywords',
    fullPath: '.Chart.Keywords',
    description: 'Keywords associated with the chart',
  },
  Home: {
    name: 'Home',
    fullPath: '.Chart.Home',
    description: 'The URL of the project home page',
  },
  Sources: {
    name: 'Sources',
    fullPath: '.Chart.Sources',
    description: 'A list of URLs to source code for the project',
  },
  Icon: {
    name: 'Icon',
    fullPath: '.Chart.Icon',
    description: 'A URL to an SVG or PNG image to be used as an icon',
  },
  Deprecated: {
    name: 'Deprecated',
    fullPath: '.Chart.Deprecated',
    description: 'Whether the chart is deprecated',
  },
  Annotations: {
    name: 'Annotations',
    fullPath: '.Chart.Annotations',
    description: 'Annotations for the chart',
  },
};

/**
 * Find a chart variable by name
 *
 * @param name - Variable name (e.g., "Name", "Version")
 * @returns ChartVariableInfo if found, undefined otherwise
 */
export function findChartVariable(name: string): ChartVariableInfo | undefined {
  return CHART_VARIABLES[name];
}

/**
 * Get all chart variable names
 *
 * @returns Array of all chart variable names
 */
export function getAllChartVariableNames(): string[] {
  return Object.keys(CHART_VARIABLES);
}

/**
 * Get all chart variables
 *
 * @returns Array of all chart variable info objects
 */
export function getAllChartVariables(): ChartVariableInfo[] {
  return Object.values(CHART_VARIABLES);
}
