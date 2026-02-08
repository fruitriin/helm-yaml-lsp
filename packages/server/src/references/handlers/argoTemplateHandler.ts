/**
 * Argo Template Handler
 *
 * template: xxx (直接参照) と templateRef (WT/CWT参照) を統一的に処理する。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import { CompletionItemKind, Location } from 'vscode-languageserver-types';
import {
  findAllTemplateReferences,
  findTemplateDefinitions,
  findTemplateReferenceAtPosition,
} from '@/features/templateFeatures';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { buildDescription } from '../formatters';
import type { ReferenceHandler } from '../handler';
import type { ArgoTemplateDetails, DetectedReference, ResolvedReference } from '../types';

export function createArgoTemplateHandler(templateIndex: ArgoTemplateIndex): ReferenceHandler {
  return {
    kind: 'argoTemplate',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: true,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findTemplateReferenceAtPosition(doc, pos);
      if (!ref) return undefined;

      return {
        kind: 'argoTemplate',
        range: ref.range,
        details: {
          kind: 'argoTemplate',
          type: ref.type,
          templateName: ref.templateName,
          workflowTemplateName: ref.workflowTemplateName,
          clusterScope: ref.clusterScope,
          workflowKind: ref.kind,
        },
      };
    },

    async resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as ArgoTemplateDetails;

      if (details.type === 'direct') {
        return resolveDirectTemplate(doc, detected, details);
      }

      return resolveTemplateRef(detected, details, templateIndex);
    },

    findAll(doc: TextDocument): DetectedReference[] {
      const refs = findAllTemplateReferences(doc);
      return refs.map(ref => ({
        kind: 'argoTemplate' as const,
        range: ref.range,
        details: {
          kind: 'argoTemplate' as const,
          type: ref.type,
          templateName: ref.templateName,
          workflowTemplateName: ref.workflowTemplateName,
          clusterScope: ref.clusterScope,
          workflowKind: ref.kind,
        },
      }));
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = doc.getText();
      const lines = text.split('\n');
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      if (!/template:\s*$/.test(linePrefix) && !/template:\s+\S*$/.test(linePrefix)) {
        return undefined;
      }

      const localTemplates = findTemplateDefinitions(doc);
      return localTemplates.map(t => ({
        label: t.name,
        kind: CompletionItemKind.Function,
        detail: `Local template in current ${t.kind}`,
        documentation: t.aboveComment || t.inlineComment,
      }));
    },

    findReferences(doc: TextDocument, pos: Position, allDocuments: TextDocument[]): Location[] {
      // 1. カーソルが参照上にある場合: templateName を取得
      let targetName: string | undefined;
      const ref = findTemplateReferenceAtPosition(doc, pos);
      if (ref) {
        targetName = ref.templateName;
      }

      // 2. カーソルが定義上にある場合: definitions から名前を取得
      if (!targetName) {
        const defs = findTemplateDefinitions(doc);
        for (const d of defs) {
          if (
            pos.line === d.range.start.line &&
            pos.character >= d.range.start.character &&
            pos.character <= d.range.end.character
          ) {
            targetName = d.name;
            break;
          }
        }
      }

      if (!targetName) return [];

      // 3. 全ドキュメントから参照を検索
      const locations: Location[] = [];
      for (const d of allDocuments) {
        const refs = findAllTemplateReferences(d);
        for (const r of refs) {
          if (r.templateName === targetName) {
            locations.push(Location.create(d.uri, r.range));
          }
        }
      }
      return locations;
    },
  };
}

function resolveDirectTemplate(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoTemplateDetails
): ResolvedReference {
  const localTemplates = findTemplateDefinitions(doc);
  const template = localTemplates.find(t => t.name === details.templateName);

  if (template) {
    const description = buildDescription(template.aboveComment, template.inlineComment);
    const hoverParts: string[] = [];
    hoverParts.push(`**Template**: \`${template.name}\``);
    hoverParts.push(`**Location**: Local template in current ${template.kind}`);
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    return {
      detected,
      definitionLocation: { uri: doc.uri, range: template.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: `Template '${details.templateName}' not found in this ${details.workflowKind || 'Workflow'}`,
      exists: true,
    };
  }

  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: `Template '${details.templateName}' not found in this ${details.workflowKind || 'Workflow'}`,
    exists: false,
  };
}

async function resolveTemplateRef(
  detected: DetectedReference,
  details: ArgoTemplateDetails,
  templateIndex: ArgoTemplateIndex
): Promise<ResolvedReference> {
  if (!details.workflowTemplateName) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const template = await templateIndex.findTemplate(
    details.workflowTemplateName,
    details.templateName,
    details.clusterScope ?? false
  );

  if (template) {
    const description = buildDescription(template.aboveComment, template.inlineComment);
    const hoverParts: string[] = [];
    hoverParts.push(`**Template**: \`${template.name}\``);
    const scope =
      template.kind === 'ClusterWorkflowTemplate' ? 'ClusterWorkflowTemplate' : 'WorkflowTemplate';
    if (template.workflowName) {
      hoverParts.push(`**${scope}**: \`${template.workflowName}\``);
    }
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    return {
      detected,
      definitionLocation: { uri: template.uri, range: template.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: null,
      exists: true,
    };
  }

  const scope = details.clusterScope ? 'ClusterWorkflowTemplate' : 'WorkflowTemplate';
  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: `Template '${details.templateName}' not found in ${scope} '${details.workflowTemplateName}'`,
    exists: false,
  };
}
