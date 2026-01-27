/**
 * ConfigMap/Secret Index Service
 *
 * Manages indexing of ConfigMap and Secret resources:
 * - Indexes ConfigMaps and Secrets from workspace
 * - Provides name-based lookup
 * - Provides key-based lookup
 * - Updates on file changes
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
	ConfigMapDefinition,
	KeyDefinition,
} from '@/features/configMapFeatures';
import { findConfigMapDefinitions } from '@/features/configMapFeatures';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { uriToFilePath, filePathToUri } from '@/utils/uriUtils';
import { findFiles } from '@/utils/fileSystem';

/**
 * Extended key definition with parent ConfigMap info
 */
type IndexedKeyDefinition = KeyDefinition & {
	/** Parent ConfigMap/Secret name */
	configMapName: string;
	/** Parent ConfigMap/Secret URI */
	uri: string;
};

/**
 * Manages ConfigMap and Secret definitions
 */
export class ConfigMapIndex {
	/** Map of name -> ConfigMapDefinition (ConfigMaps only) */
	private configMaps: Map<string, ConfigMapDefinition>;

	/** Map of name -> ConfigMapDefinition (Secrets only) */
	private secrets: Map<string, ConfigMapDefinition>;

	/** Map of URI -> ConfigMapDefinition[] */
	private definitionsByUri: Map<string, ConfigMapDefinition[]>;

	constructor() {
		this.configMaps = new Map();
		this.secrets = new Map();
		this.definitionsByUri = new Map();
	}

	/**
	 * Initializes the index by scanning workspace folders
	 *
	 * @param workspaceFolders - Array of workspace folder paths
	 */
	async initialize(workspaceFolders: string[]): Promise<void> {
		console.log('[ConfigMapIndex] Initializing...');

		this.configMaps.clear();
		this.secrets.clear();
		this.definitionsByUri.clear();

		for (const folder of workspaceFolders) {
			await this.scanWorkspaceFolder(folder);
		}

		console.log(
			`[ConfigMapIndex] Initialized with ${this.configMaps.size} ConfigMap(s) and ${this.secrets.size} Secret(s)`,
		);
	}

	/**
	 * Scans a workspace folder for ConfigMap/Secret YAML files
	 *
	 * @param folderPath - Path to workspace folder
	 */
	private async scanWorkspaceFolder(folderPath: string): Promise<void> {
		try {
			const yamlFileUris = await findFiles('**/*.{yaml,yml}', folderPath);

			for (const uri of yamlFileUris) {
				// Skip files in node_modules or .git (already filtered by findFiles)
				const filePath = uriToFilePath(uri);
				await this.indexFile(filePath);
			}
		} catch (error) {
			console.error(
				`[ConfigMapIndex] Error scanning workspace folder ${folderPath}:`,
				error,
			);
		}
	}

	/**
	 * Indexes a single YAML file
	 *
	 * @param filePath - Absolute path to YAML file
	 */
	private async indexFile(filePath: string): Promise<void> {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const uri = filePathToUri(filePath);
			const document = TextDocument.create(uri, 'yaml', 1, content);

			const definitions = findConfigMapDefinitions(document);

			if (definitions.length > 0) {
				this.definitionsByUri.set(uri, definitions);

				for (const def of definitions) {
					if (def.kind === 'ConfigMap') {
						this.configMaps.set(def.name, def);
					} else {
						this.secrets.set(def.name, def);
					}
				}

				console.log(
					`[ConfigMapIndex] Indexed ${definitions.length} definition(s) from ${path.basename(filePath)}`,
				);
			}
		} catch (error) {
			// Silently skip files that can't be read or parsed
		}
	}

	/**
	 * Finds a ConfigMap or Secret by name
	 *
	 * @param name - Name of ConfigMap/Secret
	 * @param kind - Kind: 'ConfigMap' or 'Secret'
	 * @returns ConfigMapDefinition or undefined
	 */
	findConfigMap(
		name: string,
		kind: 'ConfigMap' | 'Secret',
	): ConfigMapDefinition | undefined {
		if (kind === 'ConfigMap') {
			return this.configMaps.get(name);
		}
		return this.secrets.get(name);
	}

	/**
	 * Finds a specific key in a ConfigMap/Secret
	 *
	 * @param configMapName - Name of ConfigMap/Secret
	 * @param keyName - Key name to find
	 * @param kind - Kind: 'ConfigMap' or 'Secret'
	 * @returns IndexedKeyDefinition or undefined
	 */
	findKey(
		configMapName: string,
		keyName: string,
		kind: 'ConfigMap' | 'Secret',
	): IndexedKeyDefinition | undefined {
		const configMap = this.findConfigMap(configMapName, kind);
		if (!configMap) {
			return undefined;
		}

		const key = configMap.keys.find((k) => k.keyName === keyName);
		if (!key) {
			return undefined;
		}

		return {
			...key,
			configMapName: configMap.name,
			uri: configMap.uri,
		};
	}

	/**
	 * Gets all keys from a ConfigMap/Secret
	 *
	 * @param configMapName - Name of ConfigMap/Secret
	 * @param kind - Kind: 'ConfigMap' or 'Secret'
	 * @returns Array of key names
	 */
	getKeys(configMapName: string, kind: 'ConfigMap' | 'Secret'): string[] {
		const configMap = this.findConfigMap(configMapName, kind);
		if (!configMap) {
			return [];
		}
		return configMap.keys.map((k) => k.keyName);
	}

	/**
	 * Gets all ConfigMaps
	 *
	 * @returns Array of ConfigMapDefinition objects
	 */
	getAllConfigMaps(): ConfigMapDefinition[] {
		return Array.from(this.configMaps.values());
	}

	/**
	 * Gets all Secrets
	 *
	 * @returns Array of ConfigMapDefinition objects
	 */
	getAllSecrets(): ConfigMapDefinition[] {
		return Array.from(this.secrets.values());
	}

	/**
	 * Gets all ConfigMaps and Secrets
	 *
	 * @param kind - Optional kind filter
	 * @returns Array of ConfigMapDefinition objects
	 */
	getAll(kind?: 'ConfigMap' | 'Secret'): ConfigMapDefinition[] {
		if (kind === 'ConfigMap') {
			return this.getAllConfigMaps();
		}
		if (kind === 'Secret') {
			return this.getAllSecrets();
		}
		return [...this.getAllConfigMaps(), ...this.getAllSecrets()];
	}

	/**
	 * Updates definitions from a specific file
	 *
	 * @param uri - URI of file to update
	 */
	async updateFile(uri: string): Promise<void> {
		// Remove old definitions from this file
		this.removeFile(uri);

		// Re-index the file
		try {
			const filePath = uriToFilePath(uri);
			await this.indexFile(filePath);
		} catch (error) {
			console.error(`[ConfigMapIndex] Error updating file ${uri}:`, error);
		}
	}

	/**
	 * Removes definitions from a specific file
	 *
	 * @param uri - URI of file to remove
	 */
	removeFile(uri: string): void {
		const definitions = this.definitionsByUri.get(uri);
		if (!definitions) {
			return;
		}

		// Remove from name-based maps
		for (const def of definitions) {
			if (def.kind === 'ConfigMap') {
				this.configMaps.delete(def.name);
			} else {
				this.secrets.delete(def.name);
			}
		}

		// Remove from URI map
		this.definitionsByUri.delete(uri);

		console.log(
			`[ConfigMapIndex] Removed ${definitions.length} definition(s) from ${uri}`,
		);
	}
}
