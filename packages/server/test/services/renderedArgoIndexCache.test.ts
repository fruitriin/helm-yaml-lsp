/**
 * RenderedArgoIndexCache テスト
 *
 * Phase 15B: cross-document templateRef 解決用のキャッシュサービス
 * Phase 16: 差分レンダリング（markDirty / markAllDirty）
 */

import { describe, expect, it } from 'bun:test';
import { RenderedArgoIndexCache } from '../../src/services/renderedArgoIndexCache';

// HelmTemplateExecutor のモック
function createMockExecutor(available: boolean, documents: { path: string; content: string }[]) {
  const output = documents.map(d => `---\n# Source: chart/${d.path}\n${d.content}`).join('\n');
  let renderChartCallCount = 0;
  let renderSingleCallCount = 0;

  const executor = {
    isHelmAvailable: async () => available,
    renderChart: async () => {
      renderChartCallCount++;
      return {
        success: documents.length > 0,
        output,
        documents: documents.map(d => ({
          sourceTemplatePath: d.path,
          content: d.content,
          startLine: 0,
        })),
        executionTime: 100,
      };
    },
    renderSingleTemplate: async (_chartDir: string, templatePath: string) => {
      renderSingleCallCount++;
      const doc = documents.find(d => d.path === templatePath);
      if (!doc) {
        return { success: false, executionTime: 0 };
      }
      return {
        success: true,
        output: `---\n# Source: chart/${doc.path}\n${doc.content}`,
        documents: [{ sourceTemplatePath: doc.path, content: doc.content, startLine: 0 }],
        executionTime: 50,
      };
    },
    clearCache: () => {},
    clearTemplateCache: () => {},
    get renderChartCallCount() {
      return renderChartCallCount;
    },
    get renderSingleCallCount() {
      return renderSingleCallCount;
    },
  } as any;

  return executor;
}

const WFT_CONTENT = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: shared-wft
spec:
  templates:
    - name: greet
      container:
        image: alpine`;

const MINIMAL_WFT = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: x
spec:
  templates:
    - name: a
      container:
        image: alpine`;

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
    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: WFT_CONTENT }])
    );

    const registry = await cache.getRegistry('/charts/test');
    expect(registry).not.toBeNull();
  });

  it('should cache registry on repeated calls', async () => {
    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: WFT_CONTENT }])
    );

    const registry1 = await cache.getRegistry('/charts/test');
    const registry2 = await cache.getRegistry('/charts/test');
    expect(registry1).toBe(registry2);
  });

  it('should return rendered document by template path', async () => {
    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: WFT_CONTENT }])
    );

    const doc = await cache.getRenderedDocument('/charts/test', 'templates/wft.yaml');
    expect(doc).not.toBeNull();
    expect(doc?.getText()).toContain('shared-wft');
  });

  it('should return null for non-existent template path', async () => {
    const cache = new RenderedArgoIndexCache(
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: MINIMAL_WFT }])
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
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: MINIMAL_WFT }])
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
      createMockExecutor(true, [{ path: 'templates/wft.yaml', content: MINIMAL_WFT }])
    );

    await cache.getRegistry('/charts/test');
    cache.clear();

    // getRenderedDocuments returns null after clear
    const docs = cache.getRenderedDocuments('/charts/test');
    expect(docs).toBeNull();
  });

  // Phase 16: 差分レンダリングテスト
  describe('Phase 16: differential rendering', () => {
    it('markDirty should trigger single template re-render on next getRegistry', async () => {
      const executor = createMockExecutor(true, [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
        { path: 'templates/b.yaml', content: WFT_CONTENT },
      ]);
      const cache = new RenderedArgoIndexCache(executor);

      // 初回: フルレンダリング
      await cache.getRegistry('/charts/test');
      expect(executor.renderChartCallCount).toBe(1);
      expect(executor.renderSingleCallCount).toBe(0);

      // markDirty: テンプレート a のみ
      cache.markDirty('/charts/test', 'templates/a.yaml');

      // 次回 getRegistry: renderSingleTemplate が呼ばれる（renderChart は呼ばれない）
      const registry = await cache.getRegistry('/charts/test');
      expect(registry).not.toBeNull();
      expect(executor.renderChartCallCount).toBe(1); // 増えない
      expect(executor.renderSingleCallCount).toBe(1); // 1回呼ばれる
    });

    it('markAllDirty should re-render all templates', async () => {
      const executor = createMockExecutor(true, [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
        { path: 'templates/b.yaml', content: WFT_CONTENT },
      ]);
      const cache = new RenderedArgoIndexCache(executor);

      await cache.getRegistry('/charts/test');
      cache.markAllDirty('/charts/test');

      await cache.getRegistry('/charts/test');
      expect(executor.renderChartCallCount).toBe(1); // 増えない
      expect(executor.renderSingleCallCount).toBe(2); // 2テンプレート分
    });

    it('no dirty templates should be a cache hit with no re-rendering', async () => {
      const executor = createMockExecutor(true, [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
      ]);
      const cache = new RenderedArgoIndexCache(executor);

      const registry1 = await cache.getRegistry('/charts/test');
      const registry2 = await cache.getRegistry('/charts/test');

      expect(registry1).toBe(registry2); // 同一オブジェクト
      expect(executor.renderChartCallCount).toBe(1);
      expect(executor.renderSingleCallCount).toBe(0);
    });

    it('markDirty on non-cached chart should be a no-op', () => {
      const executor = createMockExecutor(true, []);
      const cache = new RenderedArgoIndexCache(executor);

      // キャッシュがない状態で markDirty しても例外にならない
      cache.markDirty('/charts/test', 'templates/a.yaml');
      cache.markAllDirty('/charts/test');
    });

    it('getRenderedDocument should refresh only the requested dirty template', async () => {
      const executor = createMockExecutor(true, [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
        { path: 'templates/b.yaml', content: WFT_CONTENT },
      ]);
      const cache = new RenderedArgoIndexCache(executor);

      // 初回フルレンダリング
      await cache.getRegistry('/charts/test');

      // 両方 dirty にマーク
      cache.markDirty('/charts/test', 'templates/a.yaml');
      cache.markDirty('/charts/test', 'templates/b.yaml');

      // getRenderedDocument で b のみ取得 → b のみ再レンダリング
      const doc = await cache.getRenderedDocument('/charts/test', 'templates/b.yaml');
      expect(doc).not.toBeNull();
      expect(doc?.getText()).toContain('shared-wft');
      expect(executor.renderSingleCallCount).toBe(1); // b のみ

      // a はまだ dirty のまま
      // getRegistry で残りの dirty を処理
      await cache.getRegistry('/charts/test');
      expect(executor.renderSingleCallCount).toBe(2); // a も処理された
    });

    it('should preserve unchanged templates when refreshing dirty ones', async () => {
      const executor = createMockExecutor(true, [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
        { path: 'templates/b.yaml', content: WFT_CONTENT },
      ]);
      const cache = new RenderedArgoIndexCache(executor);

      await cache.getRegistry('/charts/test');

      // b の内容を取得して保存
      const docB1 = await cache.getRenderedDocument('/charts/test', 'templates/b.yaml');
      expect(docB1).not.toBeNull();

      // a のみ dirty にマーク
      cache.markDirty('/charts/test', 'templates/a.yaml');

      await cache.getRegistry('/charts/test');

      // b はそのまま保持
      const docB2 = await cache.getRenderedDocument('/charts/test', 'templates/b.yaml');
      expect(docB2).not.toBeNull();
      expect(docB2?.getText()).toBe(docB1?.getText());
    });

    it('setOverrides should invalidate cache when overrides change', async () => {
      const executor = createMockExecutor(true, [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
      ]);
      const cache = new RenderedArgoIndexCache(executor);

      const registry1 = await cache.getRegistry('/charts/test');
      expect(registry1).not.toBeNull();
      expect(executor.renderChartCallCount).toBe(1);

      // setOverrides with new values → should invalidate
      cache.setOverrides('/charts/test', { set: ['feature.enabled=true'] });

      const registry2 = await cache.getRegistry('/charts/test');
      expect(registry2).not.toBeNull();
      expect(registry1).not.toBe(registry2);
      expect(executor.renderChartCallCount).toBe(2);
    });

    it('setOverrides should not invalidate when same overrides', async () => {
      const executor = createMockExecutor(true, [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
      ]);
      const cache = new RenderedArgoIndexCache(executor);

      cache.setOverrides('/charts/test', { set: ['x=1'] });
      const registry1 = await cache.getRegistry('/charts/test');
      expect(registry1).not.toBeNull();
      expect(executor.renderChartCallCount).toBe(1);

      // Same overrides → no invalidation
      cache.setOverrides('/charts/test', { set: ['x=1'] });

      const registry2 = await cache.getRegistry('/charts/test');
      expect(registry1).toBe(registry2);
      expect(executor.renderChartCallCount).toBe(1);
    });

    it('should handle render failure for dirty template gracefully', async () => {
      const docs = [
        { path: 'templates/a.yaml', content: MINIMAL_WFT },
        { path: 'templates/b.yaml', content: WFT_CONTENT },
      ];
      const executor = createMockExecutor(true, docs);
      const cache = new RenderedArgoIndexCache(executor);

      await cache.getRegistry('/charts/test');

      // b を documents から削除してレンダリング失敗をシミュレート
      docs.splice(1, 1);

      cache.markDirty('/charts/test', 'templates/b.yaml');
      const registry = await cache.getRegistry('/charts/test');
      expect(registry).not.toBeNull();

      // b のドキュメントは削除される
      const docB = await cache.getRenderedDocument('/charts/test', 'templates/b.yaml');
      expect(docB).toBeNull();

      // a はそのまま
      const docA = await cache.getRenderedDocument('/charts/test', 'templates/a.yaml');
      expect(docA).not.toBeNull();
    });
  });
});
