/**
 * Values Reference Features Module
 *
 * Detects and parses .Values references in Helm templates:
 * - {{ .Values.xxx }}
 * - {{ .Values.foo.bar }}
 * - {{ .Values.xxx | quote }}
 * - {{ if .Values.enabled }}
 */

import type { Position, Range } from 'vscode-languageserver-types';
import { Range as LSPRange } from 'vscode-languageserver-types';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Represents a .Values reference in a Helm template
 */
export type ValuesReference = {
	/** Dot-notation path (e.g., "image.repository") */
	valuePath: string;
	/** Range of the reference in the document */
	range: Range;
	/** Full expression including {{ }} */
	fullExpression: string;
};

/**
 * Finds .Values reference at a specific position
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns ValuesReference if found, undefined otherwise
 */
export function findValuesReference(
	document: TextDocument,
	position: Position,
): ValuesReference | undefined {
	const line = document.getText({
		start: { line: position.line, character: 0 },
		end: { line: position.line + 1, character: 0 },
	});

	// Find all .Values references in the line
	const references = findAllValuesReferencesInLine(line, position.line);

	// Find the reference that contains the cursor position
	for (const ref of references) {
		if (
			position.line === ref.range.start.line &&
			position.character >= ref.range.start.character &&
			position.character <= ref.range.end.character
		) {
			return ref;
		}
	}

	return undefined;
}

/**
 * Finds all .Values references in a document
 *
 * @param document - Text document
 * @returns Array of ValuesReference objects
 */
export function findAllValuesReferences(
	document: TextDocument,
): ValuesReference[] {
	const references: ValuesReference[] = [];
	const lineCount = document.lineCount;

	for (let i = 0; i < lineCount; i++) {
		const line = document.getText({
			start: { line: i, character: 0 },
			end: { line: i + 1, character: 0 },
		});

		const lineReferences = findAllValuesReferencesInLine(line, i);
		references.push(...lineReferences);
	}

	return references;
}

/**
 * Finds all .Values references in a single line
 *
 * @param line - Line text
 * @param lineNumber - Line number (0-based)
 * @returns Array of ValuesReference objects
 */
function findAllValuesReferencesInLine(
	line: string,
	lineNumber: number,
): ValuesReference[] {
	const references: ValuesReference[] = [];

	// Pattern to match .Values.xxx.yyy references
	// Matches: .Values followed by one or more .identifier
	const pattern = /\.Values\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)/g;

	let match: RegExpExecArray | null;
	while ((match = pattern.exec(line)) !== null) {
		const fullMatch = match[0]; // e.g., ".Values.image.repository"
		const valuePath = match[1]; // e.g., "image.repository"
		const startChar = match.index;
		const endChar = startChar + fullMatch.length;

		// Extract full expression including {{ }}
		const fullExpression = extractFullExpression(line, startChar);

		const range = LSPRange.create(
			{ line: lineNumber, character: startChar },
			{ line: lineNumber, character: endChar },
		);

		references.push({
			valuePath,
			range,
			fullExpression,
		});
	}

	return references;
}

/**
 * Extracts the full Helm expression containing a .Values reference
 *
 * Finds the surrounding {{ }} or {{- -}} delimiters
 *
 * @param line - Line text
 * @param startPos - Start position of .Values reference
 * @returns Full expression, or empty string if not found
 */
function extractFullExpression(line: string, startPos: number): string {
	// Find opening {{ or {{-
	let openPos = -1;
	for (let i = startPos; i >= 0; i--) {
		if (line.substring(i, i + 3) === '{{-' || line.substring(i, i + 2) === '{{') {
			openPos = i;
			break;
		}
	}

	if (openPos === -1) {
		return '';
	}

	// Find closing }} or -}}
	let closePos = -1;
	for (let i = startPos; i < line.length; i++) {
		if (line.substring(i, i + 3) === '-}}' || line.substring(i, i + 2) === '}}') {
			closePos = i + (line.substring(i, i + 3) === '-}}' ? 3 : 2);
			break;
		}
	}

	if (closePos === -1) {
		return '';
	}

	return line.substring(openPos, closePos);
}

/**
 * Checks if a document is a Helm template
 *
 * Heuristic: contains Helm-specific patterns like:
 * - {{ .Values, {{ .Release, {{ .Chart
 * - {{ include "...", {{ template "..."
 * - {{ define "..."
 *
 * @param document - Text document
 * @returns true if likely a Helm template
 */
export function isHelmTemplate(document: TextDocument): boolean {
	const text = document.getText();

	return (
		text.includes('{{ .Values') ||
		text.includes('{{- .Values') ||
		text.includes('{{ .Release') ||
		text.includes('{{- .Release') ||
		text.includes('{{ .Chart') ||
		text.includes('{{- .Chart') ||
		text.includes('{{ include ') ||
		text.includes('{{- include ') ||
		text.includes('{{ template ') ||
		text.includes('{{- template ') ||
		text.includes('{{ define ') ||
		text.includes('{{- define ')
	);
}

/**
 * Extracts the value path from a cursor position in a .Values reference
 *
 * Handles partial references like ".Values.image.|" for completion
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns Value path, or undefined if not in a .Values reference
 */
export function extractValuePathForCompletion(
	document: TextDocument,
	position: Position,
): string | undefined {
	const line = document.getText({
		start: { line: position.line, character: 0 },
		end: { line: position.line + 1, character: 0 },
	});

	// Look backwards from cursor to find .Values
	let startPos = position.character;
	while (startPos > 0 && /[a-zA-Z0-9_.-]/.test(line[startPos - 1])) {
		startPos--;
	}

	// Extract text from start to cursor
	const textBeforeCursor = line.substring(startPos, position.character);

	// Check if it starts with .Values
	if (textBeforeCursor.startsWith('.Values.')) {
		// Remove ".Values." prefix
		return textBeforeCursor.substring(8); // ".Values.".length === 8
	}

	if (textBeforeCursor === '.Values.') {
		// Cursor is right after ".Values.", return empty string for all values
		return '';
	}

	return undefined;
}
