/**
 * Argo Parameter Handler
 *
 * inputs/outputs/workflow/steps/tasks parameters の参照を統一的に処理する。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem } from 'vscode-languageserver-types';
import { CompletionItemKind, Location, Position, Range } from 'vscode-languageserver-types';
import {
  findAllParameterReferences,
  findArtifactDefinitions,
  findParameterDefinitions,
  findParameterReferenceAtPosition,
  findScriptDefinitionInTemplate,
} from '@/features/parameterFeatures';
import { findStepDefinitions, findTaskDefinitions } from '@/features/stepFeatures';
import { findTemplateDefinitions } from '@/features/templateFeatures';
import { buildDescription } from '../formatters';
import type { ReferenceHandler } from '../handler';
import type { ArgoParameterDetails, DetectedReference, ResolvedReference } from '../types';

export function createArgoParameterHandler(): ReferenceHandler {
  return {
    kind: 'argoParameter',
    supports: {
      definition: true,
      hover: true,
      completion: true,
      diagnostic: true,
    },

    detect(doc: TextDocument, pos: Position): DetectedReference | undefined {
      const ref = findParameterReferenceAtPosition(doc, pos);
      if (!ref) return undefined;

      // Only handle parameter types we support
      const supportedTypes = [
        'inputs.parameters',
        'outputs.parameters',
        'workflow.parameters',
        'steps.outputs.parameters',
        'tasks.outputs.parameters',
        'inputs.artifacts',
        'outputs.artifacts',
        'steps.outputs.artifacts',
        'tasks.outputs.artifacts',
        'steps.outputs.result',
        'tasks.outputs.result',
      ];
      if (!supportedTypes.includes(ref.type)) return undefined;

      return {
        kind: 'argoParameter',
        range: ref.range,
        details: {
          kind: 'argoParameter',
          type: ref.type as ArgoParameterDetails['type'],
          parameterName: ref.parameterName,
          stepOrTaskName: ref.stepOrTaskName,
        },
      };
    },

    async resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference> {
      const details = detected.details as ArgoParameterDetails;

      switch (details.type) {
        case 'inputs.parameters':
        case 'outputs.parameters':
          return resolveInputOutputParameter(doc, detected, details);
        case 'workflow.parameters':
          return resolveWorkflowParameter(doc, detected, details);
        case 'steps.outputs.parameters':
          return resolveStepOutputParameter(doc, detected, details);
        case 'tasks.outputs.parameters':
          return resolveTaskOutputParameter(doc, detected, details);
        case 'inputs.artifacts':
        case 'outputs.artifacts':
          return resolveInputOutputArtifact(doc, detected, details);
        case 'steps.outputs.artifacts':
          return resolveStepOutputArtifact(doc, detected, details);
        case 'tasks.outputs.artifacts':
          return resolveTaskOutputArtifact(doc, detected, details);
        case 'steps.outputs.result':
          return resolveStepOutputResult(doc, detected, details);
        case 'tasks.outputs.result':
          return resolveTaskOutputResult(doc, detected, details);
        default:
          return {
            detected,
            definitionLocation: null,
            hoverMarkdown: null,
            diagnosticMessage: null,
            exists: null,
          };
      }
    },

    findAll(doc: TextDocument): DetectedReference[] {
      const refs = findAllParameterReferences(doc);
      return refs
        .filter(
          ref =>
            ref.type === 'inputs.parameters' ||
            ref.type === 'outputs.parameters' ||
            ref.type === 'inputs.artifacts' ||
            ref.type === 'outputs.artifacts'
        )
        .map(ref => ({
          kind: 'argoParameter' as const,
          range: ref.range,
          details: {
            kind: 'argoParameter' as const,
            type: ref.type as ArgoParameterDetails['type'],
            parameterName: ref.parameterName,
            stepOrTaskName: ref.stepOrTaskName,
          },
        }));
    },

    complete(doc: TextDocument, pos: Position): CompletionItem[] | undefined {
      const text = doc.getText();
      const lines = text.split('\n');
      const line = lines[pos.line];
      const linePrefix = line.substring(0, pos.character);

      let context: string | null = null;
      if (/\{\{inputs\.parameters\.\w*/.test(linePrefix)) {
        context = 'inputs.parameters';
      } else if (/\{\{outputs\.parameters\.\w*/.test(linePrefix)) {
        context = 'outputs.parameters';
      } else if (/\{\{workflow\.parameters\.\w*/.test(linePrefix)) {
        context = 'workflow.parameters';
      } else if (/\{\{inputs\.artifacts\.\w*/.test(linePrefix)) {
        context = 'inputs.artifacts';
      } else if (/\{\{outputs\.artifacts\.\w*/.test(linePrefix)) {
        context = 'outputs.artifacts';
      }
      if (!context) return undefined;

      // Artifact completion
      if (context === 'inputs.artifacts' || context === 'outputs.artifacts') {
        const artifacts = findArtifactDefinitions(doc);
        return artifacts.map(a => ({
          label: a.name,
          kind: CompletionItemKind.File,
          detail: context === 'inputs.artifacts' ? 'Input Artifact' : 'Output Artifact',
          documentation: a.path ? `Path: ${a.path}` : undefined,
          insertText: a.name,
        }));
      }

      const parameters = findParameterDefinitions(doc);
      const filtered = parameters.filter(p => {
        if (context === 'inputs.parameters') return p.type === 'input';
        if (context === 'outputs.parameters') return p.type === 'output';
        return true;
      });

      return filtered.map(p => {
        const typeLabel = p.type === 'input' ? 'Input Parameter' : 'Output Parameter';
        const documentation = [
          p.aboveComment,
          p.inlineComment,
          p.value ? `Default: ${p.value}` : undefined,
        ]
          .filter(Boolean)
          .join('\n\n');

        return {
          label: p.name,
          kind: CompletionItemKind.Variable,
          detail: typeLabel,
          documentation: documentation || undefined,
          insertText: p.name,
        };
      });
    },

    findReferences(doc: TextDocument, pos: Position, allDocuments: TextDocument[]): Location[] {
      // 1. カーソルが参照上にある場合
      let targetName: string | undefined;
      let targetType: string | undefined;
      const ref = findParameterReferenceAtPosition(doc, pos);
      if (ref) {
        targetName = ref.parameterName;
        targetType = ref.type;
      }

      // 2. カーソルが定義上にある場合
      if (!targetName) {
        const paramDefs = findParameterDefinitions(doc);
        for (const p of paramDefs) {
          if (
            pos.line === p.range.start.line &&
            pos.character >= p.range.start.character &&
            pos.character <= p.range.end.character
          ) {
            targetName = p.name;
            targetType = p.type === 'input' ? 'inputs.parameters' : 'outputs.parameters';
            break;
          }
        }
      }

      if (!targetName) return [];

      // 3. 全ドキュメントから参照を検索
      const locations: Location[] = [];
      for (const d of allDocuments) {
        const refs = findAllParameterReferences(d);
        for (const r of refs) {
          if (r.parameterName === targetName) {
            // タイプが一致するか、関連するタイプ（inputs↔inputs, outputs↔outputs）
            if (targetType && isRelatedParameterType(targetType, r.type)) {
              locations.push(Location.create(d.uri, r.range));
            }
          }
        }
      }
      return locations;
    },
  };
}

function resolveInputOutputParameter(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  const parameterDefs = findParameterDefinitions(doc);
  const parameter = parameterDefs.find(p => p.name === details.parameterName);

  if (parameter) {
    const typeLabel = details.type === 'inputs.parameters' ? 'Input Parameter' : 'Output Parameter';
    const description = buildDescription(parameter.aboveComment, parameter.inlineComment);

    const hoverParts: string[] = [];
    hoverParts.push(`**Parameter**: \`${parameter.name}\``);
    hoverParts.push(`**Type**: ${typeLabel}`);
    if (parameter.value) hoverParts.push(`**Default**: \`${parameter.value}\``);
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    const valueDescription = buildDescription(
      parameter.valueAboveComment,
      parameter.valueInlineComment
    );
    if (valueDescription) {
      hoverParts.push('');
      hoverParts.push(`**Value Note**: ${valueDescription}`);
    }

    return {
      detected,
      definitionLocation: { uri: doc.uri, range: parameter.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: null,
      exists: true,
    };
  }

  const paramType = details.type === 'inputs.parameters' ? 'input' : 'output';
  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: `Parameter '${details.parameterName}' not found in ${paramType} parameters`,
    exists: false,
  };
}

function resolveWorkflowParameter(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  const text = doc.getText();
  const lines = text.split('\n');

  let inArguments = false;
  let inParameters = false;
  let argumentsIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (/^\s*arguments:/.test(line)) {
      inArguments = true;
      inParameters = false;
      argumentsIndent = currentIndent;
      continue;
    }

    if (inArguments && /^\s*parameters:/.test(line) && currentIndent > argumentsIndent) {
      inParameters = true;
      continue;
    }

    if (inArguments && currentIndent <= argumentsIndent && !trimmed.startsWith('#')) {
      inArguments = false;
      inParameters = false;
    }

    if (inParameters) {
      const nameMatch = line.match(/^\s*-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (nameMatch && nameMatch[1] === details.parameterName) {
        const nameStart = line.indexOf(details.parameterName);

        // Collect value and description
        let value: string | undefined;
        let description: string | undefined;
        const paramIndent = currentIndent;

        for (let j = i + 1; j < lines.length; j++) {
          const pLine = lines[j];
          const pTrimmed = pLine.trim();
          if (pTrimmed === '' || pTrimmed.startsWith('#')) continue;
          const pIndent = pLine.match(/^(\s*)/)?.[1].length ?? 0;
          if (pIndent <= paramIndent && !pTrimmed.startsWith('#')) break;

          const valMatch = pLine.match(/^\s*value:\s*['"]?(.+?)['"]?\s*$/);
          if (valMatch) value = valMatch[1];

          const descMatch = pLine.match(/^\s*description:\s*['"]?(.+?)['"]?\s*$/);
          if (descMatch) description = descMatch[1];
        }

        const hoverParts: string[] = [];
        hoverParts.push(`**Workflow Parameter**: \`${details.parameterName}\``);
        hoverParts.push('');
        hoverParts.push('**Type**: Workflow Argument');
        if (value) hoverParts.push(`**Value**: \`${value}\``);
        if (description) hoverParts.push(`**Description**: ${description}`);

        return {
          detected,
          definitionLocation: {
            uri: doc.uri,
            range: Range.create(
              Position.create(i, nameStart),
              Position.create(i, nameStart + details.parameterName.length)
            ),
          },
          hoverMarkdown: hoverParts.join('  \n'),
          diagnosticMessage: null,
          exists: true,
        };
      }
    }
  }

  // Fallback hover even if definition not found
  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: `**Workflow Parameter**: \`${details.parameterName}\`\n\n**Type**: Workflow Argument`,
    diagnosticMessage: null,
    exists: null,
  };
}

function resolveStepOutputParameter(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  if (!details.stepOrTaskName) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const steps = findStepDefinitions(doc);
  const step = steps.find(s => s.name === details.stepOrTaskName);
  if (!step) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const templates = findTemplateDefinitions(doc);
  const template = templates.find(t => t.name === step.templateName);
  if (!template) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const parameterDefs = findParameterDefinitions(doc);
  const parameter = parameterDefs.find(
    p =>
      p.name === details.parameterName &&
      p.type === 'output' &&
      p.templateName === step.templateName
  );

  if (parameter) {
    const description = buildDescription(parameter.aboveComment, parameter.inlineComment);
    const hoverParts: string[] = [];
    hoverParts.push(`**Parameter**: \`${details.parameterName}\``);
    hoverParts.push(`**Type**: Step Output Parameter`);
    hoverParts.push(`**Step**: \`${details.stepOrTaskName}\``);
    hoverParts.push(`**Template**: \`${step.templateName}\``);
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    return {
      detected,
      definitionLocation: { uri: doc.uri, range: parameter.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: null,
      exists: true,
    };
  }

  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: null,
    exists: null,
  };
}

function resolveTaskOutputParameter(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  if (!details.stepOrTaskName) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const tasks = findTaskDefinitions(doc);
  const task = tasks.find(t => t.name === details.stepOrTaskName);
  if (!task) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const templates = findTemplateDefinitions(doc);
  const template = templates.find(t => t.name === task.templateName);
  if (!template) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const parameterDefs = findParameterDefinitions(doc);
  const parameter = parameterDefs.find(
    p =>
      p.name === details.parameterName &&
      p.type === 'output' &&
      p.templateName === task.templateName
  );

  if (parameter) {
    const description = buildDescription(parameter.aboveComment, parameter.inlineComment);
    const hoverParts: string[] = [];
    hoverParts.push(`**Parameter**: \`${details.parameterName}\``);
    hoverParts.push(`**Type**: Task Output Parameter`);
    hoverParts.push(`**Task**: \`${details.stepOrTaskName}\``);
    hoverParts.push(`**Template**: \`${task.templateName}\``);
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    return {
      detected,
      definitionLocation: { uri: doc.uri, range: parameter.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: null,
      exists: true,
    };
  }

  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: null,
    exists: null,
  };
}

function resolveInputOutputArtifact(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  const artifactDefs = findArtifactDefinitions(doc);
  const artifact = artifactDefs.find(a => a.name === details.parameterName);

  if (artifact) {
    const typeLabel = details.type === 'inputs.artifacts' ? 'Input Artifact' : 'Output Artifact';
    const description = buildDescription(artifact.aboveComment, artifact.inlineComment);

    const hoverParts: string[] = [];
    hoverParts.push(`**${typeLabel}**: \`${artifact.name}\``);
    if (artifact.path) hoverParts.push(`**Path**: \`${artifact.path}\``);
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    return {
      detected,
      definitionLocation: { uri: doc.uri, range: artifact.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: null,
      exists: true,
    };
  }

  const artifactType = details.type === 'inputs.artifacts' ? 'input' : 'output';
  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: `Artifact '${details.parameterName}' not found in ${artifactType} artifacts`,
    exists: false,
  };
}

function resolveStepOutputArtifact(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  if (!details.stepOrTaskName) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const steps = findStepDefinitions(doc);
  const step = steps.find(s => s.name === details.stepOrTaskName);
  if (!step) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const artifactDefs = findArtifactDefinitions(doc);
  const artifact = artifactDefs.find(a => a.name === details.parameterName);

  if (artifact) {
    const description = buildDescription(artifact.aboveComment, artifact.inlineComment);
    const hoverParts: string[] = [];
    hoverParts.push(`**Artifact**: \`${details.parameterName}\``);
    hoverParts.push(`**Type**: Step Output Artifact`);
    hoverParts.push(`**Step**: \`${details.stepOrTaskName}\``);
    hoverParts.push(`**Template**: \`${step.templateName}\``);
    if (artifact.path) hoverParts.push(`**Path**: \`${artifact.path}\``);
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    return {
      detected,
      definitionLocation: { uri: doc.uri, range: artifact.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: null,
      exists: true,
    };
  }

  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: null,
    exists: null,
  };
}

function resolveTaskOutputArtifact(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  if (!details.stepOrTaskName) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const tasks = findTaskDefinitions(doc);
  const task = tasks.find(t => t.name === details.stepOrTaskName);
  if (!task) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const artifactDefs = findArtifactDefinitions(doc);
  const artifact = artifactDefs.find(a => a.name === details.parameterName);

  if (artifact) {
    const description = buildDescription(artifact.aboveComment, artifact.inlineComment);
    const hoverParts: string[] = [];
    hoverParts.push(`**Artifact**: \`${details.parameterName}\``);
    hoverParts.push(`**Type**: Task Output Artifact`);
    hoverParts.push(`**Task**: \`${details.stepOrTaskName}\``);
    hoverParts.push(`**Template**: \`${task.templateName}\``);
    if (artifact.path) hoverParts.push(`**Path**: \`${artifact.path}\``);
    if (description) {
      hoverParts.push('');
      hoverParts.push(description);
    }

    return {
      detected,
      definitionLocation: { uri: doc.uri, range: artifact.range },
      hoverMarkdown: hoverParts.join('  \n'),
      diagnosticMessage: null,
      exists: true,
    };
  }

  return {
    detected,
    definitionLocation: null,
    hoverMarkdown: null,
    diagnosticMessage: null,
    exists: null,
  };
}

function resolveStepOutputResult(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  if (!details.stepOrTaskName) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const steps = findStepDefinitions(doc);
  const step = steps.find(s => s.name === details.stepOrTaskName);
  if (!step) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const templates = findTemplateDefinitions(doc);
  const template = templates.find(t => t.name === step.templateName);
  if (!template) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const text = doc.getText();
  const lines = text.split('\n');
  const templateStartLine = template.range.start.line;
  const templateEndLine = findTemplateEndLine(lines, templateStartLine);

  const scriptDef = findScriptDefinitionInTemplate(lines, {
    start: templateStartLine,
    end: templateEndLine,
  });

  const hoverParts: string[] = [];
  hoverParts.push(`**Script Result**: \`outputs.result\``);
  hoverParts.push(`**Step**: \`${details.stepOrTaskName}\``);
  hoverParts.push(`**Template**: \`${step.templateName}\``);
  if (scriptDef?.language) {
    hoverParts.push(`**Language**: \`${scriptDef.language}\``);
  }
  hoverParts.push('');
  hoverParts.push('*The `result` output captures the last line of stdout*');

  const definitionLocation = scriptDef
    ? {
        uri: doc.uri,
        range: Range.create(
          Position.create(scriptDef.scriptLine, 0),
          Position.create(scriptDef.scriptLine, lines[scriptDef.scriptLine].length)
        ),
      }
    : null;

  return {
    detected,
    definitionLocation,
    hoverMarkdown: hoverParts.join('  \n'),
    diagnosticMessage: null,
    exists: scriptDef ? true : null,
  };
}

function resolveTaskOutputResult(
  doc: TextDocument,
  detected: DetectedReference,
  details: ArgoParameterDetails
): ResolvedReference {
  if (!details.stepOrTaskName) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const tasks = findTaskDefinitions(doc);
  const task = tasks.find(t => t.name === details.stepOrTaskName);
  if (!task) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const templates = findTemplateDefinitions(doc);
  const template = templates.find(t => t.name === task.templateName);
  if (!template) {
    return {
      detected,
      definitionLocation: null,
      hoverMarkdown: null,
      diagnosticMessage: null,
      exists: null,
    };
  }

  const text = doc.getText();
  const lines = text.split('\n');
  const templateStartLine = template.range.start.line;
  const templateEndLine = findTemplateEndLine(lines, templateStartLine);

  const scriptDef = findScriptDefinitionInTemplate(lines, {
    start: templateStartLine,
    end: templateEndLine,
  });

  const hoverParts: string[] = [];
  hoverParts.push(`**Script Result**: \`outputs.result\``);
  hoverParts.push(`**Task**: \`${details.stepOrTaskName}\``);
  hoverParts.push(`**Template**: \`${task.templateName}\``);
  if (scriptDef?.language) {
    hoverParts.push(`**Language**: \`${scriptDef.language}\``);
  }
  hoverParts.push('');
  hoverParts.push('*The `result` output captures the last line of stdout*');

  const definitionLocation = scriptDef
    ? {
        uri: doc.uri,
        range: Range.create(
          Position.create(scriptDef.scriptLine, 0),
          Position.create(scriptDef.scriptLine, lines[scriptDef.scriptLine].length)
        ),
      }
    : null;

  return {
    detected,
    definitionLocation,
    hoverMarkdown: hoverParts.join('  \n'),
    diagnosticMessage: null,
    exists: scriptDef ? true : null,
  };
}

/**
 * パラメータタイプが関連するかを判定
 */
function isRelatedParameterType(targetType: string, refType: string): boolean {
  if (targetType === refType) return true;
  // inputs.parameters → inputs.parameters のみ
  // outputs.parameters → outputs.parameters のみ
  // workflow.parameters → workflow.parameters のみ
  const targetCategory = targetType.replace(/^(inputs|outputs|workflow)\..*/, '$1');
  const refCategory = refType.replace(/^(inputs|outputs|workflow)\..*/, '$1');
  return targetCategory === refCategory;
}

/**
 * テンプレートの終了行を推定する
 */
function findTemplateEndLine(lines: string[], templateStartLine: number): number {
  const startLine = lines[templateStartLine];
  const startIndent = startLine.match(/^(\s*)/)?.[1].length ?? 0;

  for (let i = templateStartLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (currentIndent <= startIndent && trimmed.startsWith('- name:')) {
      return i - 1;
    }
    if (currentIndent < startIndent) {
      return i - 1;
    }
  }

  return lines.length - 1;
}
