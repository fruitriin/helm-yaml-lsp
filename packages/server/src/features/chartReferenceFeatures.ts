/**
 * Chart Reference Features Module
 *
 * Detects and parses .Chart variable references:
 * - {{ .Chart.Name }}
 * - {{ .Chart.Version }}
 * - {{ if .Chart.AppVersion }}
 */

import type { Position, Range } from 'vscode-languageserver-types';
import { Range as LSPRange } from 'vscode-languageserver-types';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Represents a Chart variable reference
 */
export type ChartReference = {
  /** Variable name (e.g., "Name", "Version") */
  variableName: string;
  /** Full path (e.g., ".Chart.Name") */
  fullPath: string;
  /** Range of the variable name in the document */
  range: Range;
  /** Full expression including {{ }} */
  fullExpression: string;
};

/**
 * Finds Chart variable reference at a specific position
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns ChartReference if found, undefined otherwise
 */
export function findChartReference(
  document: TextDocument,
  position: Position,
): ChartReference | undefined {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  // Find all Chart references in the line
  const references = findAllChartReferencesInLine(line, position.line);

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
 * Finds all Chart variable references in a document
 *
 * @param document - Text document
 * @returns Array of ChartReference objects
 */
export function findAllChartReferences(document: TextDocument): ChartReference[] {
  const references: ChartReference[] = [];
  const lineCount = document.lineCount;

  for (let i = 0; i < lineCount; i++) {
    const line = document.getText({
      start: { line: i, character: 0 },
      end: { line: i + 1, character: 0 },
    });

    const lineReferences = findAllChartReferencesInLine(line, i);
    references.push(...lineReferences);
  }

  return references;
}

/**
 * Finds all Chart variable references in a single line
 *
 * Detects patterns like:
 * - .Chart.Name
 * - .Chart.Version
 * - .Chart.AppVersion
 *
 * @param line - Line text
 * @param lineNumber - Line number (0-based)
 * @returns Array of ChartReference objects
 */
function findAllChartReferencesInLine(line: string, lineNumber: number): ChartReference[] {
  const references: ChartReference[] = [];

  // Pattern: .Chart.VariableName
  // Matches: .Chart.Name, .Chart.Version, etc.
  const pattern = /\.Chart\.([A-Z][a-zA-Z]*)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    const variableName = match[1];
    const fullPath = `.Chart.${variableName}`;

    // Calculate the start position of the variable name (after ".Chart.")
    const startChar = match.index + 7; // ".Chart.".length = 7
    const endChar = startChar + variableName.length;

    // Extract full expression including {{ }}
    const fullExpression = extractFullExpression(line, match.index);

    const range = LSPRange.create(
      { line: lineNumber, character: startChar },
      { line: lineNumber, character: endChar },
    );

    references.push({
      variableName,
      fullPath,
      range,
      fullExpression,
    });
  }

  return references;
}

/**
 * Extracts the full Helm expression containing a Chart reference
 *
 * Finds the surrounding {{ }} or {{- -}} delimiters
 *
 * @param line - Line text
 * @param startPos - Start position of Chart reference
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
 * Extract Chart variable path for completion
 *
 * Given a document and position, extracts the partial Chart path
 * being typed for completion purposes.
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns Partial Chart path (e.g., "" for ".Chart.|", "Ver" for ".Chart.Ver|"), or undefined if not in Chart context
 *
 * @example
 * Line: "{{ .Chart.|"
 * Position: after the dot
 * Returns: ""
 *
 * @example
 * Line: "{{ .Chart.Ver|"
 * Position: after "Ver"
 * Returns: "Ver"
 */
export function extractChartPathForCompletion(
  document: TextDocument,
  position: Position,
): string | undefined {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: position.character },
  });

  // Pattern: .Chart. followed by optional partial variable name
  const match = line.match(/\.Chart\.([A-Za-z]*)$/);
  if (!match) {
    return undefined;
  }

  return match[1]; // Returns the partial variable name (or empty string)
}
