/**
 * RenderedArgoIndexCache テスト
 *
 * Phase 15B: cross-document templateRef 解決用のキャッシュサービス
 */

import { describe, expect, it } from 'bun:test';
import { RenderedArgoIndexCache } from '../../src/services/renderedArgoIndexCache';

// HelmTemplateExecutor のモック
function createMockExecutor(available: boolean, documents: { path: string; content: string }[]) {
  const output = documents.map(d => `---\n# Source: chart/${d.path}\n${d.content}`).join('\n');
  return {
    isHelmAvailable: async () => available,
    renderChart: async () => ({
      success: documents.length > 0,
      output,
      documents: documents.map(d => ({
        sourceTemplatePath: d.path,
        content: d.content,
        startLine: 0,
      })),
      executionTime: 100,
    }),
    renderSingleTemplate: async () => ({ success: false, executionTime: 0 }),
    clearCache: () => {},
  } as any;
}

describe('RenderedArgoIndexCache', () => {
  it('should return null when helm is not available', async () => {
    const cache = new RenderedArgoIndexCache(createMockExecutor(false, []));
    const registry = await cache.getRegistry('/charts/test');
    expect(registry).toBeNull();
  });

  it('should return null when render fails', async () => {
    const cache = new RenderedArgoIndexCache(createMockExecutor(true, []));
    const registry = await cache.getRegistry('/charts/test');
    expect(registry).toBeNull();
  });

  it('should build registry from rendered documents', async () => {
    const wftContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: shared-wft
spec:
  templates:
    - name: greet
      container:
        image: alpine`;

    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: wftContent }])
    );

    const registry = await cache.getRegistry('/charts/test');
    expect(registry).not.toBeNull();
  });

  it('should cache registry on repeated calls', async () => {
    const wftContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: shared-wft
spec:
  templates:
    - name: greet
      container:
        image: alpine`;

    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: wftContent }])
    );

    const registry1 = await cache.getRegistry('/charts/test');
    const registry2 = await cache.getRegistry('/charts/test');
    expect(registry1).toBe(registry2);
  });

  it('should return rendered document by template path', async () => {
    const wftContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: shared-wft
spec:
  templates:
    - name: greet
      container:
        image: alpine`;

    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: wftContent }])
    );

    const doc = await cache.getRenderedDocument('/charts/test', 'templates/wft.yaml');
    expect(doc).not.toBeNull();
    expect(doc?.getText()).toContain('shared-wft');
  });

  it('should return null for non-existent template path', async () => {
    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [
        {
          path: 'templates/wft.yaml',
          content:
            'apiVersion: argoproj.io/v1alpha1\nkind: WorkflowTemplate\nmetadata:\n  name: x\nspec:\n  templates:\n    - name: a\n      container:\n        image: alpine',
        },
      ])
    );

    const doc = await cache.getRenderedDocument('/charts/test', 'templates/nonexistent.yaml');
    expect(doc).toBeNull();
  });

  it('should resolve cross-document templateRef via registry', async () => {
    const wftContent = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-wft
spec:
  templates:
    # A greeting template
    - name: greet  # Says hello
      container:
        image: alpine`;

    const workflowContent = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: test-
spec:
  entrypoint: main
  templates:
    - name: main
      steps:
        - - name: step1
            templateRef:
              name: my-wft
              template: greet`;

    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [
        { path: 'templates/wft.yaml', content: wftContent },
        { path: 'templates/workflow.yaml', content: workflowContent },
      ])
    );

    const registry = await cache.getRegistry('/charts/test');
    expect(registry).not.toBeNull();

    // rendered workflow document を取得して cross-document 解決
    const workflowDoc = await cache.getRenderedDocument('/charts/test', 'templates/workflow.yaml');
    expect(workflowDoc).not.toBeNull();

    // "name: my-wft" の位置で detectAndResolve（templateRef ブロック内）
    const resolved = await registry!.detectAndResolve(workflowDoc!, { line: 11, character: 20 });
    expect(resolved).not.toBeNull();
    expect(resolved?.definitionLocation).not.toBeNull();
    expect(resolved?.definitionLocation?.uri).toContain('rendered/templates/wft.yaml');
    expect(resolved?.hoverMarkdown).toContain('**Template**: `greet`');
    expect(resolved?.hoverMarkdown).toContain('**WorkflowTemplate**: `my-wft`');
  });

  it('should invalidate cache for a specific chart', async () => {
    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [
        {
          path: 'templates/wft.yaml',
          content:
            'apiVersion: argoproj.io/v1alpha1\nkind: WorkflowTemplate\nmetadata:\n  name: x\nspec:\n  templates:\n    - name: a\n      container:\n        image: alpine',
        },
      ])
    );

    const registry1 = await cache.getRegistry('/charts/test');
    expect(registry1).not.toBeNull();

    cache.invalidate('/charts/test');

    // After invalidation, should rebuild
    const registry2 = await cache.getRegistry('/charts/test');
    expect(registry2).not.toBeNull();
    expect(registry1).not.toBe(registry2);
  });

  it('should clear all caches', async () => {
    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [
        {
          path: 'templates/wft.yaml',
          content:
            'apiVersion: argoproj.io/v1alpha1\nkind: WorkflowTemplate\nmetadata:\n  name: x\nspec:\n  templates:\n    - name: a\n      container:\n        image: alpine',
        },
      ])
    );

    await cache.getRegistry('/charts/test');
    cache.clear();

    // getRenderedDocuments returns null after clear
    const docs = cache.getRenderedDocuments('/charts/test');
    expect(docs).toBeNull();
  });
});
