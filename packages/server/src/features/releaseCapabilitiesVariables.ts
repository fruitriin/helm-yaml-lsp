/**
 * Release and Capabilities Variables Module
 *
 * Defines and provides information about Helm .Release and .Capabilities variables
 */

/**
 * Release/Capabilities variable information
 */
export type HelmBuiltinVariableInfo = {
  /** Variable name (e.g., "Name", "Namespace") */
  name: string;
  /** Full variable path (e.g., ".Release.Name") */
  fullPath: string;
  /** Description of the variable */
  description: string;
  /** Category: release or capabilities */
  category: 'release' | 'capabilities';
};

/**
 * All supported Release variables
 */
export const RELEASE_VARIABLES: Record<string, HelmBuiltinVariableInfo> = {
  Name: {
    name: 'Name',
    fullPath: '.Release.Name',
    description: 'The name of the release',
    category: 'release',
  },
  Namespace: {
    name: 'Namespace',
    fullPath: '.Release.Namespace',
    description: 'The namespace to be released into',
    category: 'release',
  },
  Service: {
    name: 'Service',
    fullPath: '.Release.Service',
    description: 'The service that is rendering the template (always "Helm")',
    category: 'release',
  },
  IsUpgrade: {
    name: 'IsUpgrade',
    fullPath: '.Release.IsUpgrade',
    description: 'True if the current operation is an upgrade or rollback',
    category: 'release',
  },
  IsInstall: {
    name: 'IsInstall',
    fullPath: '.Release.IsInstall',
    description: 'True if the current operation is an install',
    category: 'release',
  },
  Revision: {
    name: 'Revision',
    fullPath: '.Release.Revision',
    description: 'The revision number for this release',
    category: 'release',
  },
};

/**
 * All supported Capabilities variables
 */
export const CAPABILITIES_VARIABLES: Record<string, HelmBuiltinVariableInfo> = {
  KubeVersion: {
    name: 'KubeVersion',
    fullPath: '.Capabilities.KubeVersion',
    description: 'The Kubernetes version',
    category: 'capabilities',
  },
  'KubeVersion.Version': {
    name: 'KubeVersion.Version',
    fullPath: '.Capabilities.KubeVersion.Version',
    description: 'The Kubernetes version in semver format',
    category: 'capabilities',
  },
  'KubeVersion.Major': {
    name: 'KubeVersion.Major',
    fullPath: '.Capabilities.KubeVersion.Major',
    description: 'The Kubernetes major version',
    category: 'capabilities',
  },
  'KubeVersion.Minor': {
    name: 'KubeVersion.Minor',
    fullPath: '.Capabilities.KubeVersion.Minor',
    description: 'The Kubernetes minor version',
    category: 'capabilities',
  },
  APIVersions: {
    name: 'APIVersions',
    fullPath: '.Capabilities.APIVersions',
    description: 'A set of versions available on the cluster',
    category: 'capabilities',
  },
  HelmVersion: {
    name: 'HelmVersion',
    fullPath: '.Capabilities.HelmVersion',
    description: 'The Helm version',
    category: 'capabilities',
  },
};

/**
 * Find a Release variable by name
 *
 * @param name - Variable name (e.g., "Name", "Namespace")
 * @returns HelmBuiltinVariableInfo if found, undefined otherwise
 */
export function findReleaseVariable(name: string): HelmBuiltinVariableInfo | undefined {
  return RELEASE_VARIABLES[name];
}

/**
 * Find a Capabilities variable by name
 *
 * @param name - Variable name (e.g., "KubeVersion", "APIVersions")
 * @returns HelmBuiltinVariableInfo if found, undefined otherwise
 */
export function findCapabilitiesVariable(name: string): HelmBuiltinVariableInfo | undefined {
  return CAPABILITIES_VARIABLES[name];
}

/**
 * Get all Release variable names
 *
 * @returns Array of all Release variable names
 */
export function getAllReleaseVariableNames(): string[] {
  return Object.keys(RELEASE_VARIABLES);
}

/**
 * Get all Capabilities variable names
 *
 * @returns Array of all Capabilities variable names
 */
export function getAllCapabilitiesVariableNames(): string[] {
  return Object.keys(CAPABILITIES_VARIABLES);
}

/**
 * Get all Release variables
 *
 * @returns Array of all Release variable info objects
 */
export function getAllReleaseVariables(): HelmBuiltinVariableInfo[] {
  return Object.values(RELEASE_VARIABLES);
}

/**
 * Get all Capabilities variables
 *
 * @returns Array of all Capabilities variable info objects
 */
export function getAllCapabilitiesVariables(): HelmBuiltinVariableInfo[] {
  return Object.values(CAPABILITIES_VARIABLES);
}
