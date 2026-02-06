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
    const valueName = nameMatch[2].trim().replace(/^["']|["']$/g, '');
    // Check if cursor is within the name value
    const nameStartCol = line.indexOf(valueName);
    if (
      position.character >= nameStartCol &&
      position.character <= nameStartCol + valueName.length
    ) {
      // Determine the type of reference by looking at surrounding context
      const context = getContextLines(lines, position.line, 5);
      return detectNameReference(context, valueName, position.line, nameStartCol);
    }
  }

  if (keyMatch) {
    const keyName = keyMatch[1].trim().replace(/^["']|["']$/g, '');
    // Check if cursor is within the key value
    const keyStartCol = line.indexOf(keyName);
    if (position.character >= keyStartCol && position.character <= keyStartCol + keyName.length) {
      // Determine the type of reference by looking at surrounding context
      const context = getContextLines(lines, position.line, 5);
      return detectKeyReference(context, keyName, position.line, keyStartCol);
    }
  }

  return undefined;
}

/**
 * Gets context lines around a specific line
 */
function getContextLines(lines: string[], lineNum: number, contextSize: number): string[] {
  const start = Math.max(0, lineNum - contextSize);
  const end = Math.min(lines.length, lineNum + contextSize + 1);
  return lines.slice(start, end);
}

/**
 * Detects name reference type from context
 */
function detectNameReference(
  context: string[],
  name: string,
  line: number,
  col: number
): ConfigMapReference | undefined {
  const contextStr = context.join('\n');

  // Check for configMapKeyRef
  if (contextStr.includes('configMapKeyRef:')) {
    return {
      type: 'configMapKeyRef',
      referenceType: 'name',
      name,
      kind: 'ConfigMap',
      range: Range.create(Position.create(line, col), Position.create(line, col + name.length)),
    };
  }

  // Check for secretKeyRef
  if (contextStr.includes('secretKeyRef:')) {
    return {
      type: 'secretKeyRef',
      referenceType: 'name',
      name,
      kind: 'Secret',
      range: Range.create(Position.create(line, col), Position.create(line, col + name.length)),
    };
  }

  // Check for configMapRef
  if (contextStr.includes('configMapRef:')) {
    return {
      type: 'configMapRef',
      referenceType: 'name',
      name,
      kind: 'ConfigMap',
      range: Range.create(Position.create(line, col), Position.create(line, col + name.length)),
    };
  }

  // Check for secretRef
  if (contextStr.includes('secretRef:')) {
    return {
      type: 'secretRef',
      referenceType: 'name',
      name,
      kind: 'Secret',
      range: Range.create(Position.create(line, col), Position.create(line, col + name.length)),
    };
  }

  // Check for volumeConfigMap (volumes.configMap.name)
  if (contextStr.includes('configMap:') && contextStr.includes('volumes:')) {
    return {
      type: 'volumeConfigMap',
      referenceType: 'name',
      name,
      kind: 'ConfigMap',
      range: Range.create(Position.create(line, col), Position.create(line, col + name.length)),
    };
  }

  // Check for volumeSecret (volumes.secret.secretName)
  if (
    (contextStr.includes('secret:') && contextStr.includes('volumes:')) ||
    contextStr.includes('secretName:')
  ) {
    return {
      type: 'volumeSecret',
      referenceType: 'name',
      name,
      kind: 'Secret',
      range: Range.create(Position.create(line, col), Position.create(line, col + name.length)),
    };
  }

  return undefined;
}

/**
 * Detects key reference type from context
 */
function detectKeyReference(
  context: string[],
  keyName: string,
  line: number,
  col: number
): ConfigMapReference | undefined {
  const contextStr = context.join('\n');

  // Check for configMapKeyRef
  if (contextStr.includes('configMapKeyRef:')) {
    // Extract name from configMapKeyRef section
    const keyRefMatch = contextStr.match(/configMapKeyRef:[\s\S]*?name:\s*([^\s\n]+)/);
    if (keyRefMatch) {
      const name = keyRefMatch[1].trim().replace(/^["']|["']$/g, '');
      return {
        type: 'configMapKeyRef',
        referenceType: 'key',
        name,
        keyName,
        kind: 'ConfigMap',
        range: Range.create(
          Position.create(line, col),
          Position.create(line, col + keyName.length)
        ),
      };
    }
  }

  // Check for secretKeyRef
  if (contextStr.includes('secretKeyRef:')) {
    // Extract name from secretKeyRef section
    const keyRefMatch = contextStr.match(/secretKeyRef:[\s\S]*?name:\s*([^\s\n]+)/);
    if (keyRefMatch) {
      const name = keyRefMatch[1].trim().replace(/^["']|["']$/g, '');
      return {
        type: 'secretKeyRef',
        referenceType: 'key',
        name,
        keyName,
        kind: 'Secret',
        range: Range.create(
          Position.create(line, col),
          Position.create(line, col + keyName.length)
        ),
      };
    }
  }

  // Check for volumeConfigMap items.key
  if (contextStr.includes('configMap:') && contextStr.includes('items:')) {
    // Extract name from configMap section
    const configMapMatch = contextStr.match(/configMap:[\s\S]*?name:\s*([^\s\n]+)/);
    if (configMapMatch) {
      const name = configMapMatch[1].trim().replace(/^["']|["']$/g, '');
      return {
        type: 'volumeConfigMap',
        referenceType: 'key',
        name,
        keyName,
        kind: 'ConfigMap',
        range: Range.create(
          Position.create(line, col),
          Position.create(line, col + keyName.length)
        ),
      };
    }
  }

  // Check for volumeSecret items.key
  if (
    (contextStr.includes('secret:') || contextStr.includes('secretName:')) &&
    contextStr.includes('items:')
  ) {
    // Extract secretName from secret section
    const secretMatch = contextStr.match(/secret:[\s\S]*?secretName:\s*([^\s\n]+)/);
    if (secretMatch) {
      const name = secretMatch[1].trim().replace(/^["']|["']$/g, '');
      return {
        type: 'volumeSecret',
        referenceType: 'key',
        name,
        keyName,
        kind: 'Secret',
        range: Range.create(
          Position.create(line, col),
          Position.create(line, col + keyName.length)
        ),
      };
    }
  }

  return undefined;
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
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      const valueStartCol = line.indexOf(value);

      if (fieldName === 'key') {
        // This is a key reference
        const context = getContextLines(lines, i, 6);
        const ref = detectKeyReference(context, value, i, valueStartCol);
        if (ref) {
          references.push(ref);
        }
      } else {
        // This is a name reference (need larger context for volumes)
        const context = getContextLines(lines, i, 8);
        const ref = detectNameReference(context, value, i, valueStartCol);
        if (ref) {
          references.push(ref);
        }
      }
    }
  }

  return references;
}
