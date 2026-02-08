/**
 * Real Sample File Fixtures - Integration Tests
 *
 * Uses real YAML files from samples/argo/ as fixtures.
 *
 * Policy (CRITICAL):
 * - Fixtures are real files: use samples/argo/ YAML files as-is
 * - NEVER modify fixtures to pass tests: fix the parser CODE instead
 * - Only the user may judge a sample file as invalid and provide a replacement
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity, type Location, Position } from 'vscode-languageserver-types';
import { DefinitionProvider } from '@/providers/definitionProvider';
import { DiagnosticProvider } from '@/providers/diagnosticProvider';
import { HoverProvider } from '@/providers/hoverProvider';
import { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import { ConfigMapIndex } from '@/services/configMapIndex';
import { filePathToUri } from '@/utils/uriUtils';

const SAMPLES_DIR = path.resolve(__dirname, '../../../../samples/argo');

// ============================================================
// Helpers
// ============================================================

type ClusterContext = {
  dir: string;
  templateIndex: ArgoTemplateIndex;
  configMapIndex: ConfigMapIndex;
  diagnosticProvider: DiagnosticProvider;
};

async function setupCluster(files: string[]): Promise<ClusterContext> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'lsp-fixture-'));
  for (const file of files) {
    await fs.copyFile(path.join(SAMPLES_DIR, file), path.join(dir, file));
  }
  const templateIndex = new ArgoTemplateIndex();
  templateIndex.setWorkspaceFolders([dir]);
  await templateIndex.initialize();

  const configMapIndex = new ConfigMapIndex();
  await configMapIndex.initialize([dir]);

  const diagnosticProvider = new DiagnosticProvider(
    templateIndex,
    undefined,
    undefined,
    undefined,
    configMapIndex
  );

  return { dir, templateIndex, configMapIndex, diagnosticProvider };
}

async function loadDoc(dir: string, file: string): Promise<TextDocument> {
  const filePath = path.join(dir, file);
  const content = await fs.readFile(filePath, 'utf-8');
  return TextDocument.create(filePathToUri(filePath), 'yaml', 1, content);
}

async function cleanupCluster(ctx: ClusterContext): Promise<void> {
  ctx.templateIndex.clear();
  await fs.rm(ctx.dir, { recursive: true, force: true });
}

function errorDiagnostics(diagnostics: import('vscode-languageserver-types').Diagnostic[]) {
  return diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
}

// ============================================================
// Test Suite
// ============================================================

describe('Sample File Fixtures - Integration Tests', () => {
  // ==========================================================
  // A. Self-contained files (no cross-file dependencies)
  // ==========================================================

  describe('Self-contained: workflow-basic.yaml', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['workflow-basic.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow-basic.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================
  // B. TemplateRef cluster
  // ==========================================================

  describe('Cluster: TemplateRef (workflow-template + cluster-workflow-template + workflow-templateref)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster([
        'workflow-template.yaml',
        'cluster-workflow-template.yaml',
        'workflow-templateref.yaml',
      ]);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('workflow-templateref.yaml should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow-templateref.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================
  // C. ConfigMap cluster
  // ==========================================================

  describe('Cluster: ConfigMap (configmap-data + workflow-configmap)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['configmap-data.yaml', 'workflow-configmap.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('workflow-configmap.yaml should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow-configmap.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });

    it('should detect ConfigMap app-config', () => {
      const cm = ctx.configMapIndex.findConfigMap('app-config', 'ConfigMap');
      expect(cm).toBeDefined();
    });

    it('should detect Secret app-secrets', () => {
      const secret = ctx.configMapIndex.findConfigMap('app-secrets', 'Secret');
      expect(secret).toBeDefined();
    });
  });

  // ==========================================================
  // D. DAG cluster
  // ==========================================================

  describe('Cluster: DAG (workflow-template + workflow-dag)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['workflow-template.yaml', 'workflow-dag.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('workflow-dag.yaml should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow-dag.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================
  // E. CronWorkflow cluster
  // ==========================================================

  describe('Cluster: CronWorkflow (workflow-template + cron-workflow)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['workflow-template.yaml', 'cron-workflow.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('cron-workflow.yaml should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'cron-workflow.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================
  // G. Demo Workflow (multi-doc self-contained with ConfigMap/Secret)
  // ==========================================================

  describe('Multi-doc: demo-workflow.yaml (ConfigMap + Secret + WorkflowTemplate + Workflow)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['demo-workflow.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('should detect ConfigMap app-config with 5 keys', () => {
      const cm = ctx.configMapIndex.findConfigMap('app-config', 'ConfigMap');
      expect(cm).toBeDefined();
      const keys = ctx.configMapIndex.getKeys('app-config', 'ConfigMap');
      expect(keys).toHaveLength(5);
    });

    it('should detect Secret app-secrets with 3 keys', () => {
      const secret = ctx.configMapIndex.findConfigMap('app-secrets', 'Secret');
      expect(secret).toBeDefined();
      const keys = ctx.configMapIndex.getKeys('app-secrets', 'Secret');
      expect(keys).toHaveLength(3);
    });

    it('should detect WorkflowTemplate demo-templates', async () => {
      const wt = await ctx.templateIndex.findWorkflowTemplate('demo-templates', false);
      expect(wt).toBeDefined();
    });

    it('should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'demo-workflow.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================
  // H. Error file: workflow.yaml (references non-existent test-template)
  // ==========================================================

  describe('Error file: workflow.yaml (test-template does not exist)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['workflow.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('should detect at least 1 template error for test-template', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const templateErrors = diagnostics.filter(
        d => d.severity === DiagnosticSeverity.Error && d.message.includes('not found')
      );
      expect(templateErrors.length).toBeGreaterThanOrEqual(1);

      // Specifically: test-template reference should be flagged
      const testTemplateError = diagnostics.find(d => d.message.includes('test-template'));
      expect(testTemplateError).toBeDefined();
    });
  });

  // ==========================================================
  // I. Error file: demo-workflow-invalid.yaml (intentional errors)
  // ==========================================================

  describe('Error file: demo-workflow-invalid.yaml (intentional errors)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['demo-workflow-invalid.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('should detect non-existent-template error', async () => {
      const doc = await loadDoc(ctx.dir, 'demo-workflow-invalid.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const error = diagnostics.find(d => d.message.includes('non-existent-template'));
      expect(error).toBeDefined();
      expect(error?.severity).toBe(DiagnosticSeverity.Error);
    });

    it('should detect missing-template in templateRef', async () => {
      const doc = await loadDoc(ctx.dir, 'demo-workflow-invalid.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const error = diagnostics.find(d => d.message.includes('missing-template'));
      expect(error).toBeDefined();
    });

    it('should detect missing-configmap references', async () => {
      const doc = await loadDoc(ctx.dir, 'demo-workflow-invalid.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = diagnostics.filter(d => d.message.includes('missing-configmap'));
      // Should appear in env configMapKeyRef + volumes
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect missing-secret references', async () => {
      const doc = await loadDoc(ctx.dir, 'demo-workflow-invalid.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = diagnostics.filter(d => d.message.includes('missing-secret'));
      // Should appear in env secretKeyRef + volumes
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect invalid.key in valid-config', async () => {
      const doc = await loadDoc(ctx.dir, 'demo-workflow-invalid.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const error = diagnostics.find(d => d.message.includes('invalid.key'));
      expect(error).toBeDefined();
    });

    it('should detect at least 7 total errors', async () => {
      const doc = await loadDoc(ctx.dir, 'demo-workflow-invalid.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      // non-existent-template, missing-template,
      // missing-configmap (env + volume), missing-secret (env + volume),
      // invalid.key = 7 minimum
      expect(errors.length).toBeGreaterThanOrEqual(7);
    });
  });

  // ==========================================================
  // J. Artifacts (Phase 8) - self-contained multi-doc
  // ==========================================================

  describe('Self-contained: workflow-artifacts.yaml (Phase 8)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['workflow-artifacts.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow-artifacts.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================
  // K. Script Result (Phase 9) - self-contained multi-doc
  // ==========================================================

  describe('Self-contained: workflow-result.yaml (Phase 9)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['workflow-result.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow-result.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================
  // L. Item Variables (Phase 10) - self-contained multi-doc
  // ==========================================================

  describe('Self-contained: workflow-item.yaml (Phase 10)', () => {
    let ctx: ClusterContext;

    beforeAll(async () => {
      ctx = await setupCluster(['workflow-item.yaml']);
    });
    afterAll(async () => {
      await cleanupCluster(ctx);
    });

    it('should report 0 diagnostic errors', async () => {
      const doc = await loadDoc(ctx.dir, 'workflow-item.yaml');
      const diagnostics = await ctx.diagnosticProvider.provideDiagnostics(doc);
      const errors = errorDiagnostics(diagnostics);
      expect(errors).toHaveLength(0);
    });
  });
});

// ============================================================
// Hover / Definition Tests on Real Fixtures
// ============================================================

/**
 * Find the position of `{{searchText}}` on a specific 1-indexed line.
 * Returns a Position pointing inside the match (after `{{`).
 */
function findVarPosition(content: string, searchText: string, lineNum1: number): Position {
  const lines = content.split('\n');
  const line = lines[lineNum1 - 1];
  const needle = `{{${searchText}}}`;
  const col = line.indexOf(needle);
  if (col < 0) {
    throw new Error(`"${needle}" not found on line ${lineNum1}: "${line}"`);
  }
  // Position cursor inside the variable (after `{{`)
  return Position.create(lineNum1 - 1, col + 2);
}

describe('Hover/Definition: workflow-variables.yaml', () => {
  let ctx: ClusterContext;
  let hoverProvider: HoverProvider;
  let definitionProvider: DefinitionProvider;
  let doc: TextDocument;
  let content: string;

  beforeAll(async () => {
    ctx = await setupCluster(['workflow-variables.yaml']);
    hoverProvider = new HoverProvider(
      ctx.templateIndex,
      undefined,
      undefined,
      undefined,
      ctx.configMapIndex
    );
    definitionProvider = new DefinitionProvider(
      ctx.templateIndex,
      undefined,
      undefined,
      undefined,
      ctx.configMapIndex
    );
    doc = await loadDoc(ctx.dir, 'workflow-variables.yaml');
    content = doc.getText();
  });
  afterAll(async () => {
    await cleanupCluster(ctx);
  });

  // ----------------------------------------------------------
  // Basic workflow variables (should already work)
  // ----------------------------------------------------------

  describe('Basic workflow variables (existing support)', () => {
    it('hover on workflow.name (L60)', async () => {
      const pos = findVarPosition(content, 'workflow.name', 60);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('hover on workflow.namespace (L61)', async () => {
      const pos = findVarPosition(content, 'workflow.namespace', 61);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('hover on workflow.uid (L62)', async () => {
      const pos = findVarPosition(content, 'workflow.uid', 62);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('hover on workflow.serviceAccountName (L63)', async () => {
      const pos = findVarPosition(content, 'workflow.serviceAccountName', 63);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('hover on workflow.duration (L64)', async () => {
      const pos = findVarPosition(content, 'workflow.duration', 64);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('hover on workflow.priority (L65)', async () => {
      const pos = findVarPosition(content, 'workflow.priority', 65);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('hover on workflow.creationTimestamp (L70)', async () => {
      const pos = findVarPosition(content, 'workflow.creationTimestamp', 70);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('hover on workflow.status (L123)', async () => {
      const pos = findVarPosition(content, 'workflow.status', 123);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });
  });

  // ----------------------------------------------------------
  // Reported issues: missing hover/definition
  // ----------------------------------------------------------

  describe('workflow.mainEntrypoint (L66) - missing variable', () => {
    it('should hover on workflow.mainEntrypoint', async () => {
      const pos = findVarPosition(content, 'workflow.mainEntrypoint', 66);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });
  });

  describe('workflow.creationTimestamp sub-formats (L71-74)', () => {
    it('should hover on workflow.creationTimestamp.RFC3339 (L71)', async () => {
      const pos = findVarPosition(content, 'workflow.creationTimestamp.RFC3339', 71);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should hover on workflow.creationTimestamp.Y (L72)', async () => {
      const pos = findVarPosition(content, 'workflow.creationTimestamp.Y', 72);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should hover on workflow.creationTimestamp.m (L73)', async () => {
      const pos = findVarPosition(content, 'workflow.creationTimestamp.m', 73);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should hover on workflow.creationTimestamp.d (L74)', async () => {
      const pos = findVarPosition(content, 'workflow.creationTimestamp.d', 74);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });
  });

  describe('workflow.parameters.* (L78-80) - hover and definition', () => {
    it('should hover on workflow.parameters.message (L78)', async () => {
      const pos = findVarPosition(content, 'workflow.parameters.message', 78);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should hover on workflow.parameters.count (L79)', async () => {
      const pos = findVarPosition(content, 'workflow.parameters.count', 79);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should hover on workflow.parameters.environment (L80)', async () => {
      const pos = findVarPosition(content, 'workflow.parameters.environment', 80);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should jump from workflow.parameters.message (L78) to definition (L45)', async () => {
      const pos = findVarPosition(content, 'workflow.parameters.message', 78);
      const location = await definitionProvider.provideDefinition(doc, pos);
      expect(location).not.toBeNull();
      if (location && 'range' in location) {
        // Should point to "- name: message" at L45 (0-indexed: 44)
        const targetLine = content.split('\n')[location.range.start.line];
        expect(targetLine).toContain('name: message');
      }
    });
  });

  describe('workflow.labels/annotations (L84-85) - hover', () => {
    it('should hover on workflow.labels.app (L84)', async () => {
      const pos = findVarPosition(content, 'workflow.labels.app', 84);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should hover on workflow.annotations.description (L85)', async () => {
      const pos = findVarPosition(content, 'workflow.annotations.description', 85);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });
  });

  describe('workflow.labels/annotations (L84-85) - definition', () => {
    it('should jump from workflow.labels.app (L84) to metadata.labels.app (L33)', async () => {
      const pos = findVarPosition(content, 'workflow.labels.app', 84);
      const def = await definitionProvider.provideDefinition(doc, pos);
      expect(def).not.toBeNull();
      const loc = def as Location;
      expect(loc.range.start.line).toBe(32); // 0-indexed: L33
    });

    it('should jump from workflow.annotations.description (L85) to metadata.annotations.description (L35)', async () => {
      const pos = findVarPosition(content, 'workflow.annotations.description', 85);
      const def = await definitionProvider.provideDefinition(doc, pos);
      expect(def).not.toBeNull();
      const loc = def as Location;
      expect(loc.range.start.line).toBe(34); // 0-indexed: L35
    });
  });

  describe('CronWorkflow context (L162-163)', () => {
    it('should hover on workflow.creationTimestamp inside CronWorkflow (L163)', async () => {
      const pos = findVarPosition(content, 'workflow.creationTimestamp', 163);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });

    it('should hover on workflow.scheduledTime inside CronWorkflow (L162)', async () => {
      const pos = findVarPosition(content, 'workflow.scheduledTime', 162);
      const hover = await hoverProvider.provideHover(doc, pos);
      expect(hover).not.toBeNull();
    });
  });
});

// ============================================================
// Hover / Definition Tests: workflow-artifacts.yaml (Phase 8)
// ============================================================

describe('Hover/Definition: workflow-artifacts.yaml', () => {
  let ctx: ClusterContext;
  let hoverProvider: HoverProvider;
  let definitionProvider: DefinitionProvider;
  let doc: TextDocument;
  let content: string;

  beforeAll(async () => {
    ctx = await setupCluster(['workflow-artifacts.yaml']);
    hoverProvider = new HoverProvider(
      ctx.templateIndex,
      undefined,
      undefined,
      undefined,
      ctx.configMapIndex
    );
    definitionProvider = new DefinitionProvider(
      ctx.templateIndex,
      undefined,
      undefined,
      undefined,
      ctx.configMapIndex
    );
    doc = await loadDoc(ctx.dir, 'workflow-artifacts.yaml');
    content = doc.getText();
  });
  afterAll(async () => {
    await cleanupCluster(ctx);
  });

  it('hover on inputs.artifacts.input-file', async () => {
    const pos = findVarPosition(content, 'inputs.artifacts.input-file', 90);
    const hover = await hoverProvider.provideHover(doc, pos);
    expect(hover).not.toBeNull();
  });

  it('hover on outputs.artifacts.output-file', async () => {
    const pos = findVarPosition(content, 'outputs.artifacts.output-file', 70);
    const hover = await hoverProvider.provideHover(doc, pos);
    expect(hover).not.toBeNull();
  });

  it('definition on steps.generate.outputs.artifacts.output-file', async () => {
    const pos = findVarPosition(content, 'steps.generate.outputs.artifacts.output-file', 49);
    const location = await definitionProvider.provideDefinition(doc, pos);
    expect(location).not.toBeNull();
    if (location && 'range' in location) {
      const targetLine = content.split('\n')[location.range.start.line];
      expect(targetLine).toContain('name: output-file');
    }
  });
});

// ============================================================
// Hover / Definition Tests: workflow-result.yaml (Phase 9)
// ============================================================

describe('Hover/Definition: workflow-result.yaml', () => {
  let ctx: ClusterContext;
  let hoverProvider: HoverProvider;
  let definitionProvider: DefinitionProvider;
  let doc: TextDocument;
  let content: string;

  beforeAll(async () => {
    ctx = await setupCluster(['workflow-result.yaml']);
    hoverProvider = new HoverProvider(
      ctx.templateIndex,
      undefined,
      undefined,
      undefined,
      ctx.configMapIndex
    );
    definitionProvider = new DefinitionProvider(
      ctx.templateIndex,
      undefined,
      undefined,
      undefined,
      ctx.configMapIndex
    );
    doc = await loadDoc(ctx.dir, 'workflow-result.yaml');
    content = doc.getText();
  });
  afterAll(async () => {
    await cleanupCluster(ctx);
  });

  it('hover on steps.run-script.outputs.result', async () => {
    const pos = findVarPosition(content, 'steps.run-script.outputs.result', 51);
    const hover = await hoverProvider.provideHover(doc, pos);
    expect(hover).not.toBeNull();
  });

  it('definition on tasks.task-script.outputs.result', async () => {
    const pos = findVarPosition(content, 'tasks.task-script.outputs.result', 102);
    const location = await definitionProvider.provideDefinition(doc, pos);
    expect(location).not.toBeNull();
  });
});

// ============================================================
// Hover / Definition Tests: workflow-item.yaml (Phase 10)
// ============================================================

describe('Hover/Definition: workflow-item.yaml', () => {
  let ctx: ClusterContext;
  let hoverProvider: HoverProvider;
  let doc: TextDocument;
  let content: string;

  beforeAll(async () => {
    ctx = await setupCluster(['workflow-item.yaml']);
    hoverProvider = new HoverProvider(
      ctx.templateIndex,
      undefined,
      undefined,
      undefined,
      ctx.configMapIndex
    );
    doc = await loadDoc(ctx.dir, 'workflow-item.yaml');
    content = doc.getText();
  });
  afterAll(async () => {
    await cleanupCluster(ctx);
  });

  it('hover on item (scalar)', async () => {
    const pos = findVarPosition(content, 'item', 46);
    const hover = await hoverProvider.provideHover(doc, pos);
    expect(hover).not.toBeNull();
  });

  it('hover on item.name (object property)', async () => {
    const pos = findVarPosition(content, 'item.name', 64);
    const hover = await hoverProvider.provideHover(doc, pos);
    expect(hover).not.toBeNull();
  });
});
