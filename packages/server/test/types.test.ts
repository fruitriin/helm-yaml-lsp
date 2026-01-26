/**
 * Argo Workflows LSP - Type Definitions Test
 */

import { describe, expect, it } from 'bun:test';
import { Range } from 'vscode-languageserver-types';
import type {
  ArgoWorkflowKind,
  ConfigMapReference,
  HelmReleaseProperty,
  HelmReleaseReference,
  HelmValuesDefinition,
  HelmValuesReference,
  IndexedWorkflowTemplate,
  ItemVariableReference,
  ParameterDefinition,
  ParameterReference,
  TemplateDefinition,
  TemplateReference,
  WorkflowVariableReference,
} from '../src/types/argo';

describe('Argo Type Definitions', () => {
  describe('TemplateDefinition', () => {
    it('should create TemplateDefinition with LSP types', () => {
      const def: TemplateDefinition = {
        name: 'test-template',
        range: Range.create(0, 0, 1, 0),
        uri: 'file:///test.yaml',
        kind: 'Workflow',
      };

      expect(def.name).toBe('test-template');
      expect(def.uri).toBe('file:///test.yaml');
      expect(def.range.start.line).toBe(0);
      expect(def.kind).toBe('Workflow');
    });

    it('should support WorkflowTemplate kind', () => {
      const def: TemplateDefinition = {
        name: 'hello',
        range: Range.create(5, 2, 5, 15),
        uri: 'file:///workflow-template.yaml',
        kind: 'WorkflowTemplate',
        workflowName: 'my-workflow',
      };

      expect(def.kind).toBe('WorkflowTemplate');
      expect(def.workflowName).toBe('my-workflow');
    });

    it('should support optional comments', () => {
      const def: TemplateDefinition = {
        name: 'commented',
        range: Range.create(10, 0, 10, 10),
        uri: 'file:///test.yaml',
        kind: 'Workflow',
        aboveComment: 'This is a comment above',
        inlineComment: 'This is an inline comment',
      };

      expect(def.aboveComment).toBe('This is a comment above');
      expect(def.inlineComment).toBe('This is an inline comment');
    });
  });

  describe('TemplateReference', () => {
    it('should create direct template reference', () => {
      const ref: TemplateReference = {
        type: 'direct',
        templateName: 'hello',
        range: Range.create(3, 10, 3, 15),
      };

      expect(ref.type).toBe('direct');
      expect(ref.templateName).toBe('hello');
    });

    it('should create templateRef with WorkflowTemplate', () => {
      const ref: TemplateReference = {
        type: 'templateRef',
        templateName: 'hello',
        workflowTemplateName: 'my-workflow',
        clusterScope: false,
        range: Range.create(5, 10, 5, 20),
      };

      expect(ref.type).toBe('templateRef');
      expect(ref.workflowTemplateName).toBe('my-workflow');
      expect(ref.clusterScope).toBe(false);
    });

    it('should support ClusterWorkflowTemplate', () => {
      const ref: TemplateReference = {
        type: 'templateRef',
        templateName: 'global-template',
        workflowTemplateName: 'cluster-workflow',
        clusterScope: true,
        range: Range.create(8, 0, 8, 30),
      };

      expect(ref.clusterScope).toBe(true);
    });
  });

  describe('ParameterReference', () => {
    it('should create inputs.parameters reference', () => {
      const ref: ParameterReference = {
        type: 'inputs.parameters',
        parameterName: 'message',
        range: Range.create(12, 20, 12, 27),
      };

      expect(ref.type).toBe('inputs.parameters');
      expect(ref.parameterName).toBe('message');
    });

    it('should create steps.outputs.parameters reference', () => {
      const ref: ParameterReference = {
        type: 'steps.outputs.parameters',
        parameterName: 'result',
        stepOrTaskName: 'step1',
        range: Range.create(15, 0, 15, 40),
      };

      expect(ref.type).toBe('steps.outputs.parameters');
      expect(ref.stepOrTaskName).toBe('step1');
    });
  });

  describe('ParameterDefinition', () => {
    it('should create parameter definition', () => {
      const def: ParameterDefinition = {
        name: 'message',
        value: 'hello',
        range: Range.create(8, 0, 8, 10),
        uri: 'file:///workflow.yaml',
      };

      expect(def.name).toBe('message');
      expect(def.value).toBe('hello');
      expect(def.uri).toBe('file:///workflow.yaml');
    });
  });

  describe('IndexedWorkflowTemplate', () => {
    it('should create indexed template with Map', () => {
      const templateMap = new Map<string, TemplateDefinition>();
      templateMap.set('hello', {
        name: 'hello',
        range: Range.create(0, 0, 1, 0),
        uri: 'file:///test.yaml',
        kind: 'Workflow',
      });

      const indexed: IndexedWorkflowTemplate = {
        name: 'my-workflow',
        kind: 'WorkflowTemplate',
        uri: 'file:///workflow-template.yaml',
        templates: templateMap,
      };

      expect(indexed.templates.size).toBe(1);
      expect(indexed.templates.get('hello')?.name).toBe('hello');
    });
  });

  describe('HelmValuesReference', () => {
    it('should create Helm values reference', () => {
      const ref: HelmValuesReference = {
        path: 'workflow.image.repository',
        pathParts: ['workflow', 'image', 'repository'],
        range: Range.create(10, 15, 10, 40),
      };

      expect(ref.pathParts).toEqual(['workflow', 'image', 'repository']);
    });
  });

  describe('HelmValuesDefinition', () => {
    it('should create Helm values definition', () => {
      const def: HelmValuesDefinition = {
        key: 'repository',
        fullPath: 'workflow.image.repository',
        value: 'nginx:latest',
        valueType: 'string',
        range: Range.create(5, 0, 5, 30),
        uri: 'file:///values.yaml',
      };

      expect(def.valueType).toBe('string');
      expect(def.fullPath).toBe('workflow.image.repository');
    });

    it('should support different value types', () => {
      const stringDef: HelmValuesDefinition = {
        key: 'name',
        fullPath: 'name',
        value: 'test',
        valueType: 'string',
        range: Range.create(0, 0, 0, 10),
        uri: 'file:///values.yaml',
      };

      const numberDef: HelmValuesDefinition = {
        key: 'port',
        fullPath: 'port',
        value: '8080',
        valueType: 'number',
        range: Range.create(1, 0, 1, 10),
        uri: 'file:///values.yaml',
      };

      const boolDef: HelmValuesDefinition = {
        key: 'enabled',
        fullPath: 'enabled',
        value: 'true',
        valueType: 'boolean',
        range: Range.create(2, 0, 2, 10),
        uri: 'file:///values.yaml',
      };

      expect(stringDef.valueType).toBe('string');
      expect(numberDef.valueType).toBe('number');
      expect(boolDef.valueType).toBe('boolean');
    });
  });

  describe('WorkflowVariableReference', () => {
    it('should create workflow.name reference', () => {
      const ref: WorkflowVariableReference = {
        type: 'workflow.name',
        range: Range.create(12, 0, 12, 15),
      };

      expect(ref.type).toBe('workflow.name');
    });

    it('should create workflow.parameters reference with subKey', () => {
      const ref: WorkflowVariableReference = {
        type: 'workflow.parameters',
        subKey: 'message',
        range: Range.create(15, 0, 15, 30),
      };

      expect(ref.type).toBe('workflow.parameters');
      expect(ref.subKey).toBe('message');
    });
  });

  describe('ConfigMapReference', () => {
    it('should create configMapKeyRef reference', () => {
      const ref: ConfigMapReference = {
        type: 'configMapKeyRef',
        referenceType: 'key',
        resourceName: 'my-config',
        keyName: 'data-key',
        kind: 'ConfigMap',
        range: Range.create(20, 0, 20, 20),
      };

      expect(ref.kind).toBe('ConfigMap');
      expect(ref.referenceType).toBe('key');
      expect(ref.keyName).toBe('data-key');
    });

    it('should create secretRef reference', () => {
      const ref: ConfigMapReference = {
        type: 'secretRef',
        referenceType: 'name',
        resourceName: 'my-secret',
        kind: 'Secret',
        range: Range.create(25, 0, 25, 15),
      };

      expect(ref.kind).toBe('Secret');
      expect(ref.referenceType).toBe('name');
    });
  });

  describe('ItemVariableReference', () => {
    it('should create item reference', () => {
      const ref: ItemVariableReference = {
        type: 'item',
        range: Range.create(30, 10, 30, 14),
      };

      expect(ref.type).toBe('item');
    });

    it('should create item.property reference', () => {
      const ref: ItemVariableReference = {
        type: 'item.property',
        propertyName: 'name',
        range: Range.create(32, 10, 32, 20),
      };

      expect(ref.type).toBe('item.property');
      expect(ref.propertyName).toBe('name');
    });
  });

  describe('ArgoWorkflowKind', () => {
    it('should accept all valid workflow kinds', () => {
      const kinds: ArgoWorkflowKind[] = [
        'Workflow',
        'CronWorkflow',
        'WorkflowTemplate',
        'ClusterWorkflowTemplate',
      ];

      for (const kind of kinds) {
        const def: TemplateDefinition = {
          name: 'test',
          range: Range.create(0, 0, 1, 0),
          uri: 'file:///test.yaml',
          kind,
        };
        expect(def.kind).toBe(kind);
      }
    });
  });

  describe('HelmReleaseProperty', () => {
    it('should accept all valid release properties', () => {
      const properties: HelmReleaseProperty[] = [
        'Name',
        'Namespace',
        'Service',
        'IsUpgrade',
        'IsInstall',
        'Revision',
      ];

      for (const property of properties) {
        const ref: HelmReleaseReference = {
          property,
          range: Range.create(0, 0, 0, 20),
        };
        expect(ref.property).toBe(property);
      }
    });
  });

  describe('Type compatibility', () => {
    it('should use LSP Range type', () => {
      const range = Range.create(1, 2, 3, 4);

      expect(range.start.line).toBe(1);
      expect(range.start.character).toBe(2);
      expect(range.end.line).toBe(3);
      expect(range.end.character).toBe(4);
    });

    it('should use string for URI', () => {
      const uri = 'file:///Users/test/workflow.yaml';

      const def: TemplateDefinition = {
        name: 'test',
        range: Range.create(0, 0, 1, 0),
        uri,
        kind: 'Workflow',
      };

      expect(typeof def.uri).toBe('string');
      expect(def.uri).toContain('file://');
    });
  });
});
