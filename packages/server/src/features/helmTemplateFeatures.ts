/**
 * Helm Template Features Module
 *
 * Detects and parses Helm template definitions and references:
 * - {{ define "name" }} ... {{ end }}
 * - {{ include "name" . }}
 * - {{ template "name" . }}
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Position, Range } from 'vscode-languageserver-types';
import { Range as LSPRange } from 'vscode-languageserver-types';

/**
 * Represents a Helm template definition ({{ define "name" }})
 */
export type HelmTemplateDefinition = {
  /** Template name */
  name: string;
  /** Range of the define block */
  range: Range;
  /** URI of the file */
  uri: string;
  /** Template content (between {{ define }} and {{ end }}) */
  content: string;
  /** Description extracted from comments */
  description?: string;
};

/**
 * Represents a Helm template reference ({{ include "name" . }} or {{ template "name" . }})
 */
export type HelmTemplateReference = {
  /** Type of reference */
  type: 'include' | 'template';
  /** Template name being referenced */
  templateName: string;
  /** Range of the template name in the document */
  range: Range;
  /** Full expression including {{ }} */
  fullExpression: string;
};

/**
 * Finds all {{ define "name" }} blocks in a document
 *
 * @param document - Text document
 * @returns Array of HelmTemplateDefinition objects
 */
export function findDefineBlocks(document: TextDocument): HelmTemplateDefinition[] {
  const definitions: HelmTemplateDefinition[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  // Pattern to match {{ define "name" }} or {{- define "name" -}}
  const definePattern = /\{\{-?\s*define\s+"([^"]+)"\s*-?\}\}/g;
  const endPattern = /\{\{-?\s*end\s*-?\}\}/g;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    definePattern.lastIndex = 0;

    const match = definePattern.exec(line);
    if (match) {
      const templateName = match[1];
      const startLine = lineNum;
      const startChar = match.index;

      // Find the matching {{ end }}
      let endLine = startLine;
      let endChar = line.length;
      let depth = 1;
      let content = '';

      for (let i = lineNum; i < lines.length; i++) {
        const currentLine = lines[i];
        endPattern.lastIndex = 0;

        // Count nested define/end blocks
        if (i > lineNum) {
          const nestedDefine = currentLine.match(/\{\{-?\s*define\s+"[^"]+"\s*-?\}\}/g);
          if (nestedDefine) {
            depth += nestedDefine.length;
          }
        }

        const endMatches = currentLine.matchAll(endPattern);
        for (const endMatch of endMatches) {
          depth--;
          if (depth === 0) {
            endLine = i;
            endChar = endMatch.index + endMatch[0].length;
            break;
          }
        }

        if (depth === 0) {
          break;
        }

        // Accumulate content
        if (i > lineNum) {
          content += `${currentLine}\n`;
        }
      }

      // Extract description from comments above the define block
      const description = extractDescriptionAboveDefine(lines, startLine);

      definitions.push({
        name: templateName,
        range: LSPRange.create(
          { line: startLine, character: startChar },
          { line: endLine, character: endChar }
        ),
        uri: document.uri,
        content: content.trim(),
        description,
      });
    }
  }

  return definitions;
}

/**
 * Extracts description from comments above a {{ define }} block
 *
 * @param lines - Lines of the document
 * @param defineLineNum - Line number of the {{ define }} statement
 * @returns Description, or undefined if no comments found
 */
function extractDescriptionAboveDefine(lines: string[], defineLineNum: number): string | undefined {
  const comments: string[] = [];

  // Look backwards for {{/* ... */}} comments
  for (let i = defineLineNum - 1; i >= 0; i--) {
    const line = lines[i].trim();

    // Check for {{/* comment */}}
    const commentMatch = line.match(/\{\{\/\*\s*(.+?)\s*\*\/\}\}/);
    if (commentMatch) {
      comments.unshift(commentMatch[1]);
      continue;
    }

    // Check for multi-line {{/* ... format
    if (line.endsWith('*/}}')) {
      const content = line.replace(/\*\/\}\}$/, '').trim();
      comments.unshift(content);
      continue;
    }

    // Check for continuation of multi-line comment
    if (i < defineLineNum - 1 && !line.startsWith('{{/*')) {
      comments.unshift(line);
      continue;
    }

    // Check for {{/* start
    if (line.startsWith('{{/*')) {
      const content = line.replace(/^\{\{\/\*\s*/, '').trim();
      comments.unshift(content);
      break;
    }

    // Stop if we hit a non-comment line
    if (line && !line.startsWith('{{/*') && !line.endsWith('*/}}')) {
      break;
    }
  }

  return comments.length > 0 ? comments.join('\n') : undefined;
}

/**
 * Finds all {{ include "name" }} and {{ template "name" }} references in a document
 *
 * @param document - Text document
 * @returns Array of HelmTemplateReference objects
 */
export function findAllTemplateReferences(document: TextDocument): HelmTemplateReference[] {
  const references: HelmTemplateReference[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Pattern to match {{ include "name" ... }} or {{ template "name" ... }}
    const includePattern = /\{\{-?\s*(include|template)\s+"([^"]+)"\s*/g;

    let match: RegExpExecArray | null;
    while ((match = includePattern.exec(line)) !== null) {
      const type = match[1] as 'include' | 'template';
      const templateName = match[2];
      const startChar = match.index;

      // Find the template name position (starts at the quote)
      const nameStart = match.index + match[0].indexOf('"');
      const nameEnd = nameStart + templateName.length + 2; // +2 for quotes

      // Extract full expression
      const fullExpression = extractFullExpression(line, startChar);

      references.push({
        type,
        templateName,
        range: LSPRange.create(
          { line: lineNum, character: nameStart },
          { line: lineNum, character: nameEnd }
        ),
        fullExpression,
      });
    }
  }

  return references;
}

/**
 * Finds a template reference at a specific position
 *
 * @param document - Text document
 * @param position - Cursor position
 * @returns HelmTemplateReference if found, undefined otherwise
 */
export function findTemplateReferenceAtPosition(
  document: TextDocument,
  position: Position
): HelmTemplateReference | undefined {
  const references = findAllTemplateReferences(document);

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
 * Extracts the full Helm expression containing a reference
 *
 * Finds the surrounding {{ }} or {{- -}} delimiters
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
 * Checks if a document contains Helm template definitions
 *
 * @param document - Text document
 * @returns true if document contains {{ define }} blocks
 */
export function hasHelmTemplateDefinitions(document: TextDocument): boolean {
  const text = document.getText();
  return /\{\{-?\s*define\s+"[^"]+"\s*-?\}\}/.test(text);
}
