/**
 * Helm Function Features Module
 *
 * Detects and parses Helm function references:
 * - {{ .Values.foo | default "bar" }}
 * - {{ .Values.data | toYaml | indent 2 }}
 * - {{ required "msg" .Values.foo }}
 */

import type { Position, Range } from 'vscode-languageserver-types';
import { Range as LSPRange } from 'vscode-languageserver-types';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Represents a Helm function reference
 */
export type HelmFunctionReference = {
  /** Function name */
  functionName: string;
  /** Range of the function name in the document */
  range: Range;
  /** Full expression including {{ }} */
  fullExpression: string;
  /** Arguments passed to the function (if any) */
  arguments?: string[];
};

/**
 * Finds Helm function reference at a specific position
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns HelmFunctionReference if found, undefined otherwise
 */
export function findHelmFunctionReference(
  document: TextDocument,
  position: Position,
): HelmFunctionReference | undefined {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  // Find all function references in the line
  const references = findAllHelmFunctionReferencesInLine(line, position.line);

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
 * Finds all Helm function references in a document
 *
 * @param document - Text document
 * @returns Array of HelmFunctionReference objects
 */
export function findAllHelmFunctionReferences(
  document: TextDocument,
): HelmFunctionReference[] {
  const references: HelmFunctionReference[] = [];
  const lineCount = document.lineCount;

  for (let i = 0; i < lineCount; i++) {
    const line = document.getText({
      start: { line: i, character: 0 },
      end: { line: i + 1, character: 0 },
    });

    const lineReferences = findAllHelmFunctionReferencesInLine(line, i);
    references.push(...lineReferences);
  }

  return references;
}

/**
 * Finds all Helm function references in a single line
 *
 * Detects patterns like:
 * - | functionName args
 * - functionName args (without pipe)
 *
 * @param line - Line text
 * @param lineNumber - Line number (0-based)
 * @returns Array of HelmFunctionReference objects
 */
function findAllHelmFunctionReferencesInLine(
  line: string,
  lineNumber: number,
): HelmFunctionReference[] {
  const references: HelmFunctionReference[] = [];

  // Pattern 1: Pipe followed by function name
  // Example: | default "value"
  // Example: | toYaml
  const pipePattern = /\|\s+([a-zA-Z][a-zA-Z0-9]*)/g;
  let match: RegExpExecArray | null;

  while ((match = pipePattern.exec(line)) !== null) {
    const functionName = match[1];
    const startChar = match.index + match[0].indexOf(functionName);
    const endChar = startChar + functionName.length;

    // Extract full expression including {{ }}
    const fullExpression = extractFullExpression(line, startChar);

    // Extract arguments (simple heuristic: everything after function name until | or }})
    const afterFunction = line.substring(endChar);
    const argsMatch = afterFunction.match(/^\s+([^|}\n]+)/);
    const args = argsMatch ? [argsMatch[1].trim()] : undefined;

    const range = LSPRange.create(
      { line: lineNumber, character: startChar },
      { line: lineNumber, character: endChar },
    );

    references.push({
      functionName,
      range,
      fullExpression,
      arguments: args,
    });
  }

  // Pattern 2: Function call at the start of expression
  // Example: {{ required "msg" .Values.foo }}
  // Example: {{ default "value" .Values.bar }}
  const callPattern = /\{\{-?\s+([a-zA-Z][a-zA-Z0-9]*)\s+/g;

  while ((match = callPattern.exec(line)) !== null) {
    const functionName = match[1];
    
    // Skip common keywords that are not functions
    if (['if', 'else', 'with', 'range', 'end', 'define', 'template', 'include', 'block'].includes(functionName)) {
      continue;
    }

    const startChar = match.index + match[0].indexOf(functionName);
    const endChar = startChar + functionName.length;

    // Check if this is already captured as a pipe function
    const alreadyCaptured = references.some(
      ref => ref.range.start.character === startChar && ref.range.end.character === endChar
    );
    
    if (alreadyCaptured) {
      continue;
    }

    // Extract full expression including {{ }}
    const fullExpression = extractFullExpression(line, startChar);

    // Extract arguments (everything between function name and }})
    const afterFunction = line.substring(endChar);
    const argsMatch = afterFunction.match(/^([^}]+)/);
    const args = argsMatch ? argsMatch[1].trim().split(/\s+/).filter(a => a) : undefined;

    const range = LSPRange.create(
      { line: lineNumber, character: startChar },
      { line: lineNumber, character: endChar },
    );

    references.push({
      functionName,
      range,
      fullExpression,
      arguments: args,
    });
  }

  return references;
}

/**
 * Extracts the full Helm expression containing a function reference
 *
 * Finds the surrounding {{ }} or {{- -}} delimiters
 *
 * @param line - Line text
 * @param startPos - Start position of function reference
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
