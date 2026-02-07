/**
 * ConfigMap/Secret Handler
 *
 * ConfigMapKeyRef, SecretKeyRef, ConfigMapRef, SecretRef,
 * Volume ConfigMap, Volume Secret の参照を統一的に処理する。
 * name + key の二段階参照。Secret の値は隠蔽。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import {
  findAllConfigMapReferences,
  findConfigMapReferenceAtPosition,
} from '@/features/configMapReferenceFeatures';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { ReferenceHandler } from '../handler';
import type { ConfigMapDetails, DetectedReference, ResolvedReference } from '../types';

export function createConfigMapHandler(configMapIndex: ConfigMapIndex): ReferenceHandler {
  return {
    kind: 'configMap',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: true,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findConfigMapReferenceAtPosition(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'configMap',
        range: ref.range,
        details: {
          kind: 'configMap',
          type: ref.type,
          referenceType: ref.referenceType,
          name: ref.name,
          keyName: ref.keyName,
          resourceKind: ref.kind,
        },
      };
    },

    async resolve(_doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as ConfigMapDetails;

      if (details.referenceType === 'name') {
        return resolveNameReference(detected, details, configMapIndex);
      }
      if (details.referenceType === 'key' && details.keyName) {
        return resolveKeyReference(detected, details, configMapIndex);
      }

      return {
        detected,
        definitionLocation: null,
        hoverMarkdown: null,
        diagnosticMessage: null,
        exists: null,
      };
    },

    findAll(doc: TextDocument): DetectedReference[] {
      const refs = findAllConfigMapReferences(doc);
      return refs.map(ref => ({
        kind: 'configMap' as const,
        range: ref.range,
        details: {
          kind: 'configMap' as const,
          type: ref.type,
          referenceType: ref.referenceType,
          name: ref.name,
          keyName: ref.keyName,
          resourceKind: ref.kind,
        },
      }));
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = doc.getText();
      const lines = text.split('\n');
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      const context = getConfigMapCompletionContext(lines, pos.line, linePrefix);
      if (!context) return undefined;

      if (context.type === 'name') {
        const resources = configMapIndex.getAll(context.kind);
        return resources.map(r => ({
          label: r.name,
          kind: CompletionItemKind.Value,
          detail: `${context.kind}`,
          documentation: `${context.kind} with ${r.keys.length} key(s)`,
          insertText: r.name,
        }));
      }

      if (context.type === 'key' && context.configMapName) {
        const keys = configMapIndex.getKeys(context.configMapName, context.kind);
        return keys.map(k => ({
          label: k,
          kind: CompletionItemKind.Property,
          detail: `Key in ${context.kind} '${context.configMapName}'`,
          insertText: k,
        }));
      }

      return undefined;
    },
  };
}

function resolveNameReference(
  detected: DetectedReference,
  details: ConfigMapDetails,
  configMapIndex: ConfigMapIndex
): ResolvedReference {
  const configMap = configMapIndex.findConfigMap(details.name, details.resourceKind);
  if (configMap) {
    const keyCount = configMap.keys.length;
    const keyList = configMap.keys.map(k => `- ${k.keyName}`).join('\n');
    const markdown = [
      `**${details.resourceKind}**: \`${details.name}\``,
      `**Keys**: ${keyCount} key${keyCount !== 1 ? 's' : ''} defined`,
      '',
      keyList || '*(no keys)*',
    ].join('\n');

    return {
      detected,
      definitionLocation: { uri: configMap.uri, range: configMap.nameRange },
      hoverMarkdown: markdown,
      diagnosticMessage: null,
      exists: true,
    };
  }

  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: `${details.resourceKind} '${details.name}' not found`,
    exists: false,
  };
}

function resolveKeyReference(
  detected: DetectedReference,
  details: ConfigMapDetails,
  configMapIndex: ConfigMapIndex
): ResolvedReference {
  const configMap = configMapIndex.findConfigMap(details.name, details.resourceKind);
  if (!configMap) {
    // ConfigMap itself doesn't exist - skip key diagnostic (name diagnostic already covers it)
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const keyName = details.keyName as string;
  const key = configMapIndex.findKey(details.name, keyName, details.resourceKind);
  if (key) {
    let valueDisplay: string;
    if (details.resourceKind === 'Secret') {
      valueDisplay = '`[hidden]`';
    } else if (key.value) {
      if (key.value.includes('\n')) {
        const lines = key.value.split('\n');
        const preview = lines.slice(0, 3).join('\n');
        const remaining = lines.length - 3;
        valueDisplay = `\`\`\`\n${preview}${remaining > 0 ? `\n... (${remaining} more line${remaining > 1 ? 's' : ''})` : ''}\n\`\`\``;
      } else {
        const maxLength = 100;
        valueDisplay =
          key.value.length > maxLength
            ? `\`${key.value.substring(0, maxLength)}...\``
            : `\`${key.value}\``;
      }
    } else {
      valueDisplay = '*(empty)*';
    }

    const markdown = [
      `**Key**: \`${details.keyName}\``,
      `**${details.resourceKind}**: \`${details.name}\``,
      `**Value**: ${valueDisplay}`,
    ].join('\n');

    return {
      detected,
      definitionLocation: { uri: key.uri, range: key.range },
      hoverMarkdown: markdown,
      diagnosticMessage: null,
      exists: true,
    };
  }

  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: `Key '${details.keyName}' not found in ${details.resourceKind} '${details.name}'`,
    exists: false,
  };
}

function getConfigMapCompletionContext(
  lines: string[],
  lineNum: number,
  linePrefix: string
): { type: 'name' | 'key'; kind: 'ConfigMap' | 'Secret'; configMapName?: string } | null {
  if (
    /^\s*(name|secretName):\s*$/.test(linePrefix) ||
    /^\s*(name|secretName):\s+\w*$/.test(linePrefix)
  ) {
    const contextLines = getContextLines(lines, lineNum, 5);
    const contextStr = contextLines.join('\n');
    if (
      contextStr.includes('configMapKeyRef:') ||
      contextStr.includes('configMapRef:') ||
      contextStr.includes('configMap:')
    ) {
      return { type: 'name', kind: 'ConfigMap' };
    }
    if (
      contextStr.includes('secretKeyRef:') ||
      contextStr.includes('secretRef:') ||
      contextStr.includes('secret:')
    ) {
      return { type: 'name', kind: 'Secret' };
    }
  }

  if (/^\s*key:\s*$/.test(linePrefix) || /^\s*key:\s+\w*$/.test(linePrefix)) {
    const contextLines = getContextLines(lines, lineNum, 5);
    const contextStr = contextLines.join('\n');
    const nameMatch = contextStr.match(/(?:name|secretName):\s*([^\s\n]+)/);
    if (!nameMatch) return null;
    const configMapName = nameMatch[1].trim().replace(/^["']|["']$/g, '');

    if (contextStr.includes('configMapKeyRef:') || contextStr.includes('configMap:')) {
      return { type: 'key', kind: 'ConfigMap', configMapName };
    }
    if (contextStr.includes('secretKeyRef:') || contextStr.includes('secret:')) {
      return { type: 'key', kind: 'Secret', configMapName };
    }
  }

  return null;
}

function getContextLines(lines: string[], lineNum: number, contextSize: number): string[] {
  const start = Math.max(0, lineNum - contextSize);
  const end = Math.min(lines.length, lineNum + contextSize + 1);
  return lines.slice(start, end);
}
