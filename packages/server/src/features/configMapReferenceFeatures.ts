/**
 * ConfigMap/Secret Reference Features Module
 *
 * Detects ConfigMap/Secret references in Workflow YAML:
 * - configMapKeyRef / secretKeyRef (env.valueFrom)
 * - configMapRef / secretRef (envFrom)
 * - volumeConfigMap / volumeSecret (volumes)
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-types';

/**
 * Type of ConfigMap/Secret reference
 */
export type ConfigMapReferenceType =
  | 'configMapKeyRef'
  | 'secretKeyRef'
  | 'configMapRef'
  | 'secretRef'
  | 'volumeConfigMap'
  | 'volumeSecret';

/**
 * Whether the cursor is on name or key field
 */
export type ReferenceFieldType = 'name' | 'key';

/**
 * Represents a ConfigMap or Secret reference
 */
export type ConfigMapReference = {
  /** Type of reference */
  type: ConfigMapReferenceType;
  /** Whether cursor is on 'name' or 'key' */
  referenceType: ReferenceFieldType;
  /** ConfigMap/Secret name */
  name: string;
  /** Key name (for keyRef types) */
  keyName?: string;
  /** Kind: ConfigMap or Secret */
  kind: 'ConfigMap' | 'Secret';
  /** Range of the reference */
  range: Range;
};

/**
 * Finds ConfigMap/Secret reference at a specific position
 *
 * @param document - TextDocument to search
 * @param position - Cursor position
 * @returns ConfigMapReference or undefined
 */
export function findConfigMapReferenceAtPosition(
  document: TextDocument,
  position: Position
): ConfigMapReference | undefined {
  const content = document.getText();
  const lines = content.split('\n');
  const line = lines[position.line];
  const trimmedLine = line.trim();

  // Check if cursor is on a name or key value
  // Support both "name: value" and "- key: value" (list item)
  const nameMatch = trimmedLine.match(/^-?\s*(name|secretName):\s*(.+)/);
  const keyMatch = trimmedLine.match(/^-?\s*key:\s*(.+)/);

  if (nameMatch) {
    const valueName = stripYamlInlineComment(nameMatch[2]);
    // Check if cursor is within the name value
    const nameStartCol = line.indexOf(valueName);
    if (
      position.character >= nameStartCol &&
      position.character <= nameStartCol + valueName.length
    ) {
      return detectNameReference(lines, position.line, valueName, nameStartCol, nameMatch[1]);
    }
  }

  if (keyMatch) {
    const keyName = stripYamlInlineComment(keyMatch[1]);
    // Check if cursor is within the key value
    const keyStartCol = line.indexOf(keyName);
    if (position.character >= keyStartCol && position.character <= keyStartCol + keyName.length) {
      return detectKeyReference(lines, position.line, keyName, keyStartCol);
    }
  }

  return undefined;
}

/**
 * Strips YAML inline comment from a raw value string.
 * Handles quoted values (single/double) where # inside quotes is not a comment.
 */
function stripYamlInlineComment(rawValue: string): string {
  const trimmed = rawValue.trim();
  // Double-quoted value
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end > 0) return trimmed.substring(1, end);
  }
  // Single-quoted value
  if (trimmed.startsWith("'")) {
    const end = trimmed.indexOf("'", 1);
    if (end > 0) return trimmed.substring(1, end);
  }
  // Unquoted: strip inline comment (# preceded by whitespace)
  const commentIdx = trimmed.search(/\s+#/);
  if (commentIdx >= 0) return trimmed.substring(0, commentIdx);
  return trimmed;
}

/**
 * Find ConfigMap/Secret reference type by tracing YAML ancestry (lower indent lines).
 * This replaces the context-window approach to avoid cross-contamination
 * when different reference types are close together in the YAML.
 *
 * We track the current ancestor indent ceiling: as we walk upward, each ancestor
 * must have strictly lower indent than the previous one. This prevents crossing
 * into sibling branches of the YAML tree.
 */
function findAncestorReferenceType(
  lines: string[],
  lineNum: number
): { type: ConfigMapReferenceType; kind: 'ConfigMap' | 'Secret' } | undefined {
  let currentIndent = lines[lineNum].match(/^(\s*)/)?.[1].length ?? 0;

  for (let i = lineNum - 1; i >= 0 && lineNum - i < 20; i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (trimmed === '---') return undefined;

    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent >= currentIndent) continue;

    // This line is a true ancestor; tighten the ceiling for the next ancestor
    currentIndent = indent;

    if (trimmed.includes('configMapKeyRef:')) return { type: 'configMapKeyRef', kind: 'ConfigMap' };
    if (trimmed.includes('secretKeyRef:')) return { type: 'secretKeyRef', kind: 'Secret' };
    if (trimmed.includes('configMapRef:')) return { type: 'configMapRef', kind: 'ConfigMap' };
    if (trimmed.includes('secretRef:')) return { type: 'secretRef', kind: 'Secret' };
    if (trimmed.includes('configMap:')) return { type: 'volumeConfigMap', kind: 'ConfigMap' };
    if (trimmed.startsWith('secret:') || trimmed.endsWith('secret:')) return { type: 'volumeSecret', kind: 'Secret' };
  }

  return undefined;
}

/**
 * Find the associated name/secretName value for a key reference.
 * First looks for siblings at the same indent level (configMapKeyRef/secretKeyRef).
 * Then looks for name/secretName under the ancestor reference type (volumes).
 */
function findAssociatedName(lines: string[], lineNum: number): string | undefined {
  const lineIndent = lines[lineNum].match(/^(\s*)/)?.[1].length ?? 0;

  // Strategy 1: Search for sibling at same indent (for configMapKeyRef/secretKeyRef)
  // Search backward
  for (let i = lineNum - 1; i >= Math.max(0, lineNum - 5); i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent < lineIndent) break;
    if (indent !== lineIndent) continue;
    const nameMatch = trimmed.match(/^(?:name|secretName):\s*(.+)/);
    if (nameMatch) return stripYamlInlineComment(nameMatch[1]);
  }

  // Search forward
  for (let i = lineNum + 1; i < Math.min(lines.length, lineNum + 5); i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent < lineIndent) break;
    if (indent !== lineIndent) continue;
    const nameMatch = trimmed.match(/^(?:name|secretName):\s*(.+)/);
    if (nameMatch) return stripYamlInlineComment(nameMatch[1]);
  }

  // Strategy 2: For volume references, search for name/secretName under the
  // ancestor reference type (configMap:/secret:). The name is a child of the
  // same parent as items:, not a sibling of key:.
  for (let i = lineNum - 1; i >= Math.max(0, lineNum - 15); i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (trimmed === '---') break;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent >= lineIndent) continue;
    // Found an ancestor - check if it's a reference type with name/secretName as children
    if (trimmed.includes('configMap:') || trimmed.startsWith('secret:') || trimmed.endsWith('secret:')) {
      // Look for name/secretName as children of this ancestor
      const childIndent = indent + 2; // Expected child indent (standard YAML 2-space)
      for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
        const childLine = lines[j];
        const childTrimmed = childLine.trim();
        if (childTrimmed === '' || childTrimmed.startsWith('#')) continue;
        const ci = childLine.match(/^(\s*)/)?.[1].length ?? 0;
        if (ci <= indent) break;
        if (ci >= childIndent && ci <= childIndent + 2) {
          const nameMatch = childTrimmed.match(/^(?:name|secretName):\s*(.+)/);
          if (nameMatch) return stripYamlInlineComment(nameMatch[1]);
        }
      }
      break;
    }
  }

  return undefined;
}

/**
 * Detects name reference type using structural YAML ancestry
 */
function detectNameReference(
  lines: string[],
  lineNum: number,
  name: string,
  col: number,
  fieldName?: string
): ConfigMapReference | undefined {
  // secretName field is always volumeSecret
  if (fieldName === 'secretName') {
    return {
      type: 'volumeSecret',
      referenceType: 'name',
      name,
      kind: 'Secret',
      range: Range.create(Position.create(lineNum, col), Position.create(lineNum, col + name.length)),
    };
  }

  const ref = findAncestorReferenceType(lines, lineNum);
  if (!ref) return undefined;

  return {
    type: ref.type,
    referenceType: 'name',
    name,
    kind: ref.kind,
    range: Range.create(Position.create(lineNum, col), Position.create(lineNum, col + name.length)),
  };
}

/**
 * Detects key reference type using structural YAML ancestry
 */
function detectKeyReference(
  lines: string[],
  lineNum: number,
  keyName: string,
  col: number
): ConfigMapReference | undefined {
  const ref = findAncestorReferenceType(lines, lineNum);
  if (!ref) return undefined;

  const name = findAssociatedName(lines, lineNum);
  if (!name) return undefined;

  return {
    type: ref.type,
    referenceType: 'key',
    name,
    keyName,
    kind: ref.kind,
    range: Range.create(Position.create(lineNum, col), Position.create(lineNum, col + keyName.length)),
  };
}

/**
 * Finds all ConfigMap/Secret references in a document
 *
 * @param document - TextDocument to search
 * @returns Array of ConfigMapReference objects
 */
export function findAllConfigMapReferences(document: TextDocument): ConfigMapReference[] {
  const references: ConfigMapReference[] = [];
  const content = document.getText();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Match name: or secretName: or key:
    const match = trimmedLine.match(/^(name|secretName|key):\s*(.+)/);
    if (match) {
      const fieldName = match[1];
      const value = stripYamlInlineComment(match[2]);
      const valueStartCol = line.indexOf(value);

      if (fieldName === 'key') {
        const ref = detectKeyReference(lines, i, value, valueStartCol);
        if (ref) {
          references.push(ref);
        }
      } else {
        const ref = detectNameReference(lines, i, value, valueStartCol, fieldName);
        if (ref) {
          references.push(ref);
        }
      }
    }
  }

  return references;
}
