/**
 * Release/Capabilities Handler
 *
 * .Release.Name, .Capabilities.KubeVersion 等の参照検出・ホバー・補完。
 * 定義ジャンプや診断の対象外。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';
import {
  extractReleaseCapabilitiesPathForCompletion,
  findReleaseCapabilitiesReference,
} from '@/features/releaseCapabilitiesReferenceFeatures';
import {
  findCapabilitiesVariable,
  findReleaseVariable,
  getAllCapabilitiesVariables,
  getAllReleaseVariables,
} from '@/features/releaseCapabilitiesVariables';
import type { ReferenceHandler } from '../handler';
import type { DetectedReference, ReleaseCapabilitiesDetails, ResolvedReference } from '../types';

export function createReleaseCapabilitiesHandler(): ReferenceHandler {
  return {
    kind: 'releaseCapabilities',
    supports: {
      definition: false,
      hover: true,
      completion: true,
      diagnostic: false,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findReleaseCapabilitiesReference(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'releaseCapabilities',
        range: ref.range,
        details: {
          kind: 'releaseCapabilities',
          type: ref.type,
          variableName: ref.variableName,
        },
      };
    },

    async resolve(_doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as ReleaseCapabilitiesDetails;
      const variable =
        details.type === 'release'
          ? findReleaseVariable(details.variableName)
          : findCapabilitiesVariable(details.variableName);

      if (!variable) {
        return {
          detected,
          definitionLocation: null,
          hoverMarkdown: null,
          diagnosticMessage: null,
          exists: null,
        };
      }

      const parts: string[] = [];
      parts.push(
        `**${variable.category === 'release' ? 'Release' : 'Capabilities'} Variable**: \`${variable.fullPath}\``
      );
      parts.push(`**Category**: ${variable.category}`);
      parts.push('');
      parts.push(variable.description);

      return {
        detected,
        definitionLocation: null,
        hoverMarkdown: parts.join('\n'),
        diagnosticMessage: null,
        exists: null,
      };
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const context = extractReleaseCapabilitiesPathForCompletion(doc, pos);
      if (context === undefined) return undefined;

      const variables =
        context.type === 'release' ? getAllReleaseVariables() : getAllCapabilitiesVariables();

      return variables
        .filter(v => v.name.toLowerCase().startsWith(context.partialName.toLowerCase()))
        .map(v => ({
          label: v.name,
          kind: CompletionItemKind.Property,
          detail: `${v.category === 'release' ? 'Release' : 'Capabilities'} Variable`,
          documentation: v.description,
          insertText: v.name,
        }));
    },
  };
}
