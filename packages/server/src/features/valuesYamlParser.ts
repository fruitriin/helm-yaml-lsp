/**
 * Values YAML Parser Module
 *
 * Parses values.yaml and extracts value definitions:
 * - Parses YAML structure
 * - Flattens nested values into dot-notation paths
 * - Infers value types
 * - Extracts comments as documentation
 */

import * as yaml from 'js-yaml';
import type { Range } from 'vscode-languageserver-types';
import { Range as LSPRange, Position } from 'vscode-languageserver-types';

/**
 * Value type enumeration
 */
export type ValueType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown';

/**
 * Represents a value definition in values.yaml
 */
export type ValueDefinition = {
  /** Dot-notation path (e.g., "image.repository", "replicaCount") */
  path: string;
  /** The actual value */
  value: unknown;
  /** Inferred type of the value */
  valueType: ValueType;
  /** Range in values.yaml file */
  range: Range;
  /** URI of values.yaml file */
  uri: string;
  /** Documentation extracted from comments */
  description?: string;
  /** Parent path (e.g., "image" for "image.repository") */
  parentPath?: string;
};

/**
 * Parses values.yaml content and extracts value definitions
 *
 * @param content - Content of values.yaml
 * @param uri - URI of values.yaml file
 * @returns Array of ValueDefinition objects
 */
export function parseValuesYaml(content: string, uri: string): ValueDefinition[] {
  try {
    const parsed = yaml.load(content);

    if (typeof parsed !== 'object' || parsed === null) {
      return [];
    }

    const definitions: ValueDefinition[] = [];
    const lines = content.split('\n');

    // Extract comments for each line
    const lineComments = extractLineComments(lines);

    extractValueDefinitions(
      parsed as Record<string, unknown>,
      '',
      uri,
      lines,
      lineComments,
      definitions
    );

    return definitions;
  } catch (error) {
    console.error('[ValuesYamlParser] Failed to parse values.yaml:', error);
    return [];
  }
}

/**
 * Extracts comments from YAML lines
 *
 * @param lines - Lines of YAML content
 * @returns Map of line number to comment text
 */
function extractLineComments(lines: string[]): Map<number, string> {
  const comments = new Map<number, string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for inline comment (e.g., "foo: bar  # comment")
    const inlineMatch = line.match(/^[^#]*#\s*(.+)$/);
    if (inlineMatch) {
      comments.set(i, inlineMatch[1].trim());
      continue;
    }

    // Check for above-line comment (e.g., "# comment\nfoo: bar")
    const commentMatch = line.match(/^\s*#\s*(.+)$/);
    if (commentMatch) {
      // Associate with next non-comment, non-empty line
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (nextLine.trim() && !nextLine.trim().startsWith('#')) {
          const existingComment = comments.get(j);
          const newComment = commentMatch[1].trim();
          comments.set(j, existingComment ? `${newComment}\n${existingComment}` : newComment);
          break;
        }
      }
    }
  }

  return comments;
}

/**
 * Recursively extracts value definitions from parsed YAML object
 *
 * @param obj - Parsed YAML object
 * @param pathPrefix - Current path prefix (empty for root)
 * @param uri - URI of values.yaml
 * @param lines - Lines of YAML content
 * @param lineComments - Map of line comments
 * @param definitions - Accumulator for value definitions
 */
function extractValueDefinitions(
  obj: Record<string, unknown>,
  pathPrefix: string,
  uri: string,
  lines: string[],
  lineComments: Map<number, string>,
  definitions: ValueDefinition[]
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;
    const valueType = inferType(value);

    // Find line number for this key
    const lineNumber = findKeyLine(lines, key, pathPrefix);
    const range = createRange(lineNumber, key);

    // Get comment for this line
    const description = lineComments.get(lineNumber);

    definitions.push({
      path,
      value,
      valueType,
      range,
      uri,
      description,
      parentPath: pathPrefix || undefined,
    });

    // Recursively process nested objects
    if (valueType === 'object' && value !== null) {
      extractValueDefinitions(
        value as Record<string, unknown>,
        path,
        uri,
        lines,
        lineComments,
        definitions
      );
    }
  }
}

/**
 * Infers the type of a value
 *
 * @param value - Value to inspect
 * @returns ValueType
 */
function inferType(value: unknown): ValueType {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  const type = typeof value;

  switch (type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

/**
 * Finds the line number where a key is defined
 *
 * @param lines - Lines of YAML content
 * @param key - Key to find
 * @param pathPrefix - Current path prefix (for nested keys)
 * @returns Line number (0-based), or 0 if not found
 */
function findKeyLine(lines: string[], key: string, pathPrefix: string): number {
  // Calculate expected indentation based on path depth
  const depth = pathPrefix ? pathPrefix.split('.').length : 0;
  const expectedIndent = '  '.repeat(depth);

  // Look for "key:" pattern with correct indentation
  const pattern = new RegExp(`^${expectedIndent}${escapeRegExp(key)}:\\s*`);

  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return i;
    }
  }

  return 0; // Default to first line if not found
}

/**
 * Creates a Range for a key at a given line
 *
 * @param lineNumber - Line number (0-based)
 * @param key - Key name
 * @returns LSP Range
 */
function createRange(lineNumber: number, key: string): Range {
  // Find indentation
  const start = Position.create(lineNumber, 0);
  const end = Position.create(lineNumber, key.length);

  return LSPRange.create(start, end);
}

/**
 * Escapes special regex characters in a string
 *
 * @param str - String to escape
 * @returns Escaped string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds all value definitions matching a prefix
 *
 * Useful for completion: given ".Values.image", return all ".Values.image.*" values
 *
 * @param definitions - All value definitions
 * @param prefix - Prefix to match (e.g., "image")
 * @returns Matching definitions
 */
export function findValuesByPrefix(
  definitions: ValueDefinition[],
  prefix: string
): ValueDefinition[] {
  const normalizedPrefix = prefix.toLowerCase();

  return definitions.filter(def => {
    return (
      def.path.toLowerCase().startsWith(normalizedPrefix) ||
      def.path.toLowerCase() === normalizedPrefix
    );
  });
}

/**
 * Finds a value definition by exact path
 *
 * @param definitions - All value definitions
 * @param path - Exact path to find (e.g., "image.repository")
 * @returns ValueDefinition if found, undefined otherwise
 */
export function findValueByPath(
  definitions: ValueDefinition[],
  path: string
): ValueDefinition | undefined {
  return definitions.find(def => def.path === path);
}
