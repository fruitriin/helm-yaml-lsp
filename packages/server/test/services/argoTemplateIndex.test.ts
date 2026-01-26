/**
 * Argo Workflows LSP - Template Index Service Test
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ArgoTemplateIndex } from '../../src/services/argoTemplateIndex';
import { filePathToUri } from '../../src/utils/uriUtils';

describe('ArgoTemplateIndex', () => {
  let index: ArgoTemplateIndex;
  let testDir: string;

  beforeEach(async () => {
    index = new ArgoTemplateIndex();
    testDir = path.join(tmpdir(), `lsp-test-index-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    index.clear();
  });

  describe('initialize', () => {
    it('should index WorkflowTemplate files', async () => {
      const content = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-workflow
spec:
  templates:
      - name: hello
        container:
          image: alpine
`;
      await fs.writeFile(path.join(testDir, 'workflow.yaml'), content);

      index.setWorkspaceFolders([testDir]);
      await index.initialize();

      const template = await index.findTemplate('my-workflow', 'hello', false);
      expect(template).toBeDefined();
      expect(template?.name).toBe('hello');
      expect(template?.workflowName).toBe('my-workflow');
    });

    it('should index ClusterWorkflowTemplate files', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: ClusterWorkflowTemplate
metadata:
  name: my-cluster-workflow
spec:
  templates:
      - name: world
        container:
          image: alpine
`;
      await fs.writeFile(path.join(testDir, 'cluster-workflow.yaml'), content);

      index.setWorkspaceFolders([testDir]);
      await index.initialize();

      const template = await index.findTemplate('my-cluster-workflow', 'world', true);
      expect(template).toBeDefined();
      expect(template?.name).toBe('world');
      expect(template?.workflowName).toBe('my-cluster-workflow');
    });

    it('should ignore non-Argo files', async () => {
      const content = `
apiVersion: v1
kind: Deployment
metadata:
  name: my-deployment
`;
      await fs.writeFile(path.join(testDir, 'deployment.yaml'), content);

      index.setWorkspaceFolders([testDir]);
      await index.initialize();

      expect(index.size()).toBe(0);
    });

    it('should ignore node_modules', async () => {
      const nodeModules = path.join(testDir, 'node_modules');
      await fs.mkdir(nodeModules);

      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: ignored-workflow
spec:
  templates:
    - name: ignored
      container:
        image: alpine
`;
      await fs.writeFile(path.join(nodeModules, 'workflow.yaml'), content);

      index.setWorkspaceFolders([testDir]);
      await index.initialize();

      expect(index.size()).toBe(0);
    });
  });

  describe('indexFile', () => {
    it('should index a single file', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: single-workflow
spec:
  templates:
    - name: single-template
      container:
        image: alpine
`;
      const filePath = path.join(testDir, 'single.yaml');
      await fs.writeFile(filePath, content);

      await index.indexFile(filePathToUri(filePath));

      const template = await index.findTemplate('single-workflow', 'single-template', false);
      expect(template).toBeDefined();
      expect(template?.name).toBe('single-template');
    });

    it('should handle multiple templates in one file', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: multi-template-workflow
spec:
  templates:
    - name: template1
      container:
        image: alpine
    - name: template2
      container:
        image: ubuntu
    - name: template3
      container:
        image: busybox
`;
      const filePath = path.join(testDir, 'multi.yaml');
      await fs.writeFile(filePath, content);

      await index.indexFile(filePathToUri(filePath));

      const template1 = await index.findTemplate('multi-template-workflow', 'template1', false);
      const template2 = await index.findTemplate('multi-template-workflow', 'template2', false);
      const template3 = await index.findTemplate('multi-template-workflow', 'template3', false);

      expect(template1).toBeDefined();
      expect(template2).toBeDefined();
      expect(template3).toBeDefined();
    });
  });

  describe('updateFile', () => {
    it('should update file index when content changes', async () => {
      const filePath = path.join(testDir, 'update.yaml');
      const uri = filePathToUri(filePath);

      const content1 = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: update-workflow
spec:
  templates:
    - name: old-template
      container:
        image: alpine
`;
      await fs.writeFile(filePath, content1);
      await index.indexFile(uri);

      const oldTemplate = await index.findTemplate('update-workflow', 'old-template', false);
      expect(oldTemplate).toBeDefined();

      const content2 = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: update-workflow
spec:
  templates:
    - name: new-template
      container:
        image: alpine
`;
      await fs.writeFile(filePath, content2);
      await index.updateFile(uri);

      const oldTemplateLookup = await index.findTemplate('update-workflow', 'old-template', false);
      const newTemplate = await index.findTemplate('update-workflow', 'new-template', false);

      expect(oldTemplateLookup).toBeUndefined();
      expect(newTemplate).toBeDefined();
    });
  });

  describe('removeFile', () => {
    it('should remove file from index', async () => {
      const filePath = path.join(testDir, 'remove.yaml');
      const uri = filePathToUri(filePath);

      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: remove-workflow
spec:
  templates:
    - name: remove-template
      container:
        image: alpine
`;
      await fs.writeFile(filePath, content);
      await index.indexFile(uri);

      const templateBefore = await index.findTemplate('remove-workflow', 'remove-template', false);
      expect(templateBefore).toBeDefined();

      index.removeFile(uri);

      const templateAfter = await index.findTemplate('remove-workflow', 'remove-template', false);
      expect(templateAfter).toBeUndefined();
    });
  });

  describe('findTemplate', () => {
    it('should find WorkflowTemplate', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: find-workflow
spec:
  templates:
    - name: find-template
      container:
        image: alpine
`;
      const filePath = path.join(testDir, 'find.yaml');
      await fs.writeFile(filePath, content);

      await index.indexFile(filePathToUri(filePath));

      const template = await index.findTemplate('find-workflow', 'find-template', false);
      expect(template).toBeDefined();
      expect(template?.kind).toBe('WorkflowTemplate');
    });

    it('should find ClusterWorkflowTemplate with clusterScope=true', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: ClusterWorkflowTemplate
metadata:
  name: cluster-find-workflow
spec:
  templates:
    - name: cluster-find-template
      container:
        image: alpine
`;
      const filePath = path.join(testDir, 'cluster-find.yaml');
      await fs.writeFile(filePath, content);

      await index.indexFile(filePathToUri(filePath));

      const template = await index.findTemplate(
        'cluster-find-workflow',
        'cluster-find-template',
        true
      );
      expect(template).toBeDefined();
      expect(template?.kind).toBe('ClusterWorkflowTemplate');
    });

    it('should return undefined for non-existent template', async () => {
      const template = await index.findTemplate('non-existent', 'non-existent', false);
      expect(template).toBeUndefined();
    });
  });

  describe('findWorkflowTemplate', () => {
    it('should find WorkflowTemplate metadata', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: workflow-metadata
spec:
  templates:
    - name: template1
      container:
        image: alpine
    - name: template2
      container:
        image: ubuntu
`;
      const filePath = path.join(testDir, 'metadata.yaml');
      await fs.writeFile(filePath, content);

      await index.indexFile(filePathToUri(filePath));

      const workflow = await index.findWorkflowTemplate('workflow-metadata', false);
      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('workflow-metadata');
      expect(workflow?.kind).toBe('WorkflowTemplate');
      expect(workflow?.templates.size).toBe(2);
    });
  });

  describe('findTemplateByName', () => {
    it('should find template by name only', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: any-workflow
spec:
  templates:
    - name: unique-template-name
      container:
        image: alpine
`;
      const filePath = path.join(testDir, 'byname.yaml');
      await fs.writeFile(filePath, content);

      await index.indexFile(filePathToUri(filePath));

      const template = await index.findTemplateByName('unique-template-name', false);
      expect(template).toBeDefined();
      expect(template?.name).toBe('unique-template-name');
      expect(template?.workflowName).toBe('any-workflow');
    });
  });

  describe('clear', () => {
    it('should clear the index', async () => {
      const content = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: clear-workflow
spec:
  templates:
    - name: clear-template
      container:
        image: alpine
`;
      const filePath = path.join(testDir, 'clear.yaml');
      await fs.writeFile(filePath, content);

      await index.indexFile(filePathToUri(filePath));
      expect(index.size()).toBeGreaterThan(0);

      index.clear();
      expect(index.size()).toBe(0);

      const template = await index.findTemplate('clear-workflow', 'clear-template', false);
      expect(template).toBeUndefined();
    });
  });
});
