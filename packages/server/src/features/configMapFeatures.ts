/**
 * ConfigMap/Secret Features Module
 *
 * Detects and extracts ConfigMap/Secret definitions:
 * - Detects `kind: ConfigMap` and `kind: Secret`
 * - Extracts metadata.name
 * - Extracts data and stringData keys
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-types';

/**
 * Represents a key in ConfigMap/Secret data
 */
export type KeyDefinition = {
	/** Key name */
	keyName: string;
	/** Range of the key in the document */
	range: Range;
	/** Value (omitted for Secrets for security) */
	value?: string;
};

/**
 * Represents a ConfigMap or Secret definition
 */
export type ConfigMapDefinition = {
	/** Name from metadata.name */
	name: string;
	/** Kind: ConfigMap or Secret */
	kind: 'ConfigMap' | 'Secret';
	/** Document URI */
	uri: string;
	/** Range of metadata.name value */
	nameRange: Range;
	/** Keys from data and stringData */
	keys: KeyDefinition[];
};

/**
 * Finds all ConfigMap and Secret definitions in a document
 *
 * @param document - TextDocument to search
 * @returns Array of ConfigMapDefinition objects
 */
export function findConfigMapDefinitions(
	document: TextDocument,
): ConfigMapDefinition[] {
	const content = document.getText();
	const lines = content.split('\n');
	const definitions: ConfigMapDefinition[] = [];

	let currentKind: 'ConfigMap' | 'Secret' | null = null;
	let currentName: string | null = null;
	let currentNameRange: Range | null = null;
	let inMetadata = false;
	let inData = false;
	let dataStartLine = -1;
	let currentIndent = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();

		// Detect document separator (---)
		if (trimmedLine === '---') {
			// Save current definition if complete
			if (currentKind && currentName && currentNameRange) {
				const keys =
					dataStartLine >= 0 ? extractDataKeys(lines, dataStartLine, i) : [];
				definitions.push({
					name: currentName,
					kind: currentKind,
					uri: document.uri,
					nameRange: currentNameRange,
					keys,
				});
			}
			// Reset state
			currentKind = null;
			currentName = null;
			currentNameRange = null;
			inMetadata = false;
			inData = false;
			dataStartLine = -1;
			continue;
		}

		// Detect kind: ConfigMap or kind: Secret
		if (trimmedLine.startsWith('kind:')) {
			// Save current definition if complete before switching kind
			if (currentKind && currentName && currentNameRange) {
				const keys =
					dataStartLine >= 0 ? extractDataKeys(lines, dataStartLine, i) : [];
				definitions.push({
					name: currentName,
					kind: currentKind,
					uri: document.uri,
					nameRange: currentNameRange,
					keys,
				});
			}

			// Check if this is ConfigMap or Secret
			const kindMatch = trimmedLine.match(/^kind:\s*(ConfigMap|Secret)/);
			if (kindMatch) {
				currentKind = kindMatch[1] as 'ConfigMap' | 'Secret';
			} else {
				// Reset state if kind is not ConfigMap or Secret
				currentKind = null;
				currentName = null;
				currentNameRange = null;
				inMetadata = false;
				inData = false;
				dataStartLine = -1;
			}
			continue;
		}

		// Detect metadata section
		if (trimmedLine === 'metadata:') {
			inMetadata = true;
			inData = false;
			currentIndent = line.search(/\S/);
			continue;
		}

		// Detect data or stringData section
		if (trimmedLine === 'data:' || trimmedLine === 'stringData:') {
			inMetadata = false;
			inData = true;
			dataStartLine = i + 1;
			currentIndent = line.search(/\S/);
			continue;
		}

		// Extract metadata.name
		if (inMetadata && trimmedLine.startsWith('name:')) {
			const nameMatch = trimmedLine.match(/^name:\s*(.+)/);
			if (nameMatch) {
				currentName = nameMatch[1].trim();
				// Calculate range for the name value
				const nameStartCol = line.indexOf(currentName);
				currentNameRange = Range.create(
					Position.create(i, nameStartCol),
					Position.create(i, nameStartCol + currentName.length),
				);
			}
			continue;
		}

		// Check if we exited data section
		if (inData) {
			const lineIndent = line.search(/\S/);
			// If line is not empty and indent is <= data section indent, we exited
			if (
				trimmedLine.length > 0 &&
				lineIndent >= 0 &&
				lineIndent <= currentIndent
			) {
				inData = false;
			}
		}
	}

	// Save last definition if exists
	if (currentKind && currentName && currentNameRange) {
		const keys =
			dataStartLine >= 0 ? extractDataKeys(lines, dataStartLine, lines.length) : [];
		definitions.push({
			name: currentName,
			kind: currentKind,
			uri: document.uri,
			nameRange: currentNameRange,
			keys,
		});
	}

	return definitions;
}

/**
 * Extracts keys from data or stringData section
 *
 * @param lines - All lines of the document
 * @param startLine - Line index where data section starts
 * @param endLine - Line index where data section ends
 * @returns Array of KeyDefinition objects
 */
function extractDataKeys(
	lines: string[],
	startLine: number,
	endLine: number,
): KeyDefinition[] {
	const keys: KeyDefinition[] = [];
	const dataIndent = lines[startLine - 1]?.search(/\S/) ?? 0;
	// Keys should be at dataIndent + 2 (standard YAML indentation)
	const expectedKeyIndent = dataIndent + 2;

	let inMultiline = false;
	let multilineIndent = 0;
	let multilineLines: string[] = [];
	let currentKeyIndex = -1;

	for (let i = startLine; i < endLine; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();

		// Skip comments (but not empty lines in multiline blocks)
		if (trimmedLine.startsWith('#')) {
			continue;
		}

		const lineIndent = line.search(/\S/);

		// If indent is <= data section indent, we exited data section
		if (lineIndent >= 0 && lineIndent <= dataIndent) {
			// Save multiline content before exiting
			if (inMultiline && currentKeyIndex >= 0 && multilineLines.length > 0) {
				keys[currentKeyIndex].value = multilineLines.join('\n');
			}
			break;
		}

		// If we're in a multiline block, collect lines
		if (inMultiline) {
			// Exit multiline if we're back at key level or less
			if (trimmedLine.length > 0 && lineIndent <= multilineIndent) {
				// Save multiline content
				if (currentKeyIndex >= 0 && multilineLines.length > 0) {
					keys[currentKeyIndex].value = multilineLines.join('\n');
				}
				inMultiline = false;
				multilineLines = [];
				// Don't skip this line, process it as a new key
			} else {
				// Collect multiline content
				if (trimmedLine.length > 0) {
					multilineLines.push(trimmedLine);
				}
				continue;
			}
		}

		// Match key: value or key: | (multiline) - only at the correct indent level
		if (lineIndent === expectedKeyIndent) {
			const keyMatch = trimmedLine.match(/^([a-zA-Z0-9_.-]+):\s*(.*)/);
			if (keyMatch) {
				const keyName = keyMatch[1];
				const valueText = keyMatch[2];

				// Calculate range for the key name
				const keyStartCol = line.indexOf(keyName);
				const range = Range.create(
					Position.create(i, keyStartCol),
					Position.create(i, keyStartCol + keyName.length),
				);

				// Extract value
				let value: string | undefined;
				if (valueText && valueText !== '|' && valueText !== '>') {
					value = valueText.replace(/^["']|["']$/g, '').trim();
				} else if (valueText === '|' || valueText === '>') {
					// Entering multiline block
					inMultiline = true;
					multilineIndent = lineIndent;
					multilineLines = [];
					currentKeyIndex = keys.length;
				}

				keys.push({
					keyName,
					range,
					value,
				});
			}
		}
	}

	// Save any remaining multiline content
	if (inMultiline && currentKeyIndex >= 0 && multilineLines.length > 0) {
		keys[currentKeyIndex].value = multilineLines.join('\n');
	}

	return keys;
}
