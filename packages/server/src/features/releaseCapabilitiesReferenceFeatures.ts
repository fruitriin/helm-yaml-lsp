/**
 * Release and Capabilities Reference Features Module
 *
 * Detects and parses .Release and .Capabilities variable references:
 * - {{ .Release.Name }}
 * - {{ .Release.Namespace }}
 * - {{ .Capabilities.KubeVersion }}
 */

import type { Position, Range } from 'vscode-languageserver-types';
import { Range as LSPRange } from 'vscode-languageserver-types';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Represents a Release/Capabilities variable reference
 */
export type ReleaseCapabilitiesReference = {
  /** Variable type: 'release' or 'capabilities' */
  type: 'release' | 'capabilities';
  /** Variable name (e.g., "Name", "Namespace", "KubeVersion") */
  variableName: string;
  /** Full path (e.g., ".Release.Name", ".Capabilities.KubeVersion") */
  fullPath: string;
  /** Range of the variable name in the document */
  range: Range;
  /** Full expression including {{ }} */
  fullExpression: string;
};

/**
 * Finds Release/Capabilities variable reference at a specific position
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns ReleaseCapabilitiesReference if found, undefined otherwise
 */
export function findReleaseCapabilitiesReference(
  document: TextDocument,
  position: Position,
): ReleaseCapabilitiesReference | undefined {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  // Find all references in the line
  const references = findAllReleaseCapabilitiesReferencesInLine(line, position.line);

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
 * Finds all Release/Capabilities variable references in a document
 *
 * @param document - Text document
 * @returns Array of ReleaseCapabilitiesReference objects
 */
export function findAllReleaseCapabilitiesReferences(
  document: TextDocument,
): ReleaseCapabilitiesReference[] {
  const references: ReleaseCapabilitiesReference[] = [];
  const lineCount = document.lineCount;

  for (let i = 0; i < lineCount; i++) {
    const line = document.getText({
      start: { line: i, character: 0 },
      end: { line: i + 1, character: 0 },
    });

    const lineReferences = findAllReleaseCapabilitiesReferencesInLine(line, i);
    references.push(...lineReferences);
  }

  return references;
}

/**
 * Finds all Release/Capabilities variable references in a single line
 *
 * @param line - Line text
 * @param lineNumber - Line number (0-based)
 * @returns Array of ReleaseCapabilitiesReference objects
 */
function findAllReleaseCapabilitiesReferencesInLine(
  line: string,
  lineNumber: number,
): ReleaseCapabilitiesReference[] {
  const references: ReleaseCapabilitiesReference[] = [];

  // Pattern 1: .Release.VariableName
  const releasePattern = /\.Release\.([A-Z][a-zA-Z]*)/g;
  let match: RegExpExecArray | null;

  while ((match = releasePattern.exec(line)) !== null) {
    const variableName = match[1];
    const fullPath = `.Release.${variableName}`;

    const startChar = match.index + 9; // ".Release.".length = 9
    const endChar = startChar + variableName.length;

    const fullExpression = extractFullExpression(line, match.index);

    const range = LSPRange.create(
      { line: lineNumber, character: startChar },
      { line: lineNumber, character: endChar },
    );

    references.push({
      type: 'release',
      variableName,
      fullPath,
      range,
      fullExpression,
    });
  }

  // Pattern 2: .Capabilities.VariableName
  const capabilitiesPattern = /\.Capabilities\.([A-Z][a-zA-Z.]*)/g;

  while ((match = capabilitiesPattern.exec(line)) !== null) {
    const variableName = match[1];
    const fullPath = `.Capabilities.${variableName}`;

    const startChar = match.index + 15; // ".Capabilities.".length = 15
    const endChar = startChar + variableName.length;

    const fullExpression = extractFullExpression(line, match.index);

    const range = LSPRange.create(
      { line: lineNumber, character: startChar },
      { line: lineNumber, character: endChar },
    );

    references.push({
      type: 'capabilities',
      variableName,
      fullPath,
      range,
      fullExpression,
    });
  }

  return references;
}

/**
 * Extracts the full Helm expression containing a reference
 *
 * @param line - Line text
 * @param startPos - Start position of reference
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
  for (let i = startPos; i < line.length - 1; i++) {
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
 * Extract Release/Capabilities variable path for completion
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns Object with type and partial path, or undefined if not in context
 */
export function extractReleaseCapabilitiesPathForCompletion(
  document: TextDocument,
  position: Position,
): { type: 'release' | 'capabilities'; partialName: string } | undefined {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: position.character },
  });

  // Pattern: .Release. followed by optional partial variable name
  const releaseMatch = line.match(/\.Release\.([A-Za-z]*)$/);
  if (releaseMatch) {
    return { type: 'release', partialName: releaseMatch[1] };
  }

  // Pattern: .Capabilities. followed by optional partial variable name
  const capabilitiesMatch = line.match(/\.Capabilities\.([A-Za-z.]*)$/);
  if (capabilitiesMatch) {
    return { type: 'capabilities', partialName: capabilitiesMatch[1] };
  }

  return undefined;
}
