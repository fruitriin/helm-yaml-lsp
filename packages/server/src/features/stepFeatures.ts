/**
 * Argo Workflows LSP - Step/Task Features
 *
 * ステップ/タスク定義の検出
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * ステップ定義
 */
export type StepDefinition = {
  /** ステップ名 */
  name: string;
  /** 参照しているテンプレート名 */
  templateName: string;
  /** ステップが定義されている行番号 */
  lineNumber: number;
};

/**
 * ドキュメント内のすべてのステップ定義を抽出
 *
 * @param document - LSP TextDocument
 * @returns ステップ定義の配列
 *
 * @example
 * ```yaml
 * steps:
 *   - - name: prepare-data
 *       template: prepare-data-template
 * ```
 * ↓
 * { name: 'prepare-data', templateName: 'prepare-data-template', lineNumber: 33 }
 */
export function findStepDefinitions(document: TextDocument): StepDefinition[] {
  const steps: StepDefinition[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  let inStepsSection = false;
  let stepsIndent = 0;
  let currentStepName: string | undefined;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // ドキュメント区切り (---) でリセット
    if (line.trim() === '---') {
      inStepsSection = false;
      currentStepName = undefined;
      continue;
    }

    // steps: の検出
    const stepsMatch = line.match(/^(\s*)steps:/);
    if (stepsMatch) {
      inStepsSection = true;
      stepsIndent = stepsMatch[1].length;
      continue;
    }

    // stepsセクション内でインデントが戻ったら終了
    if (inStepsSection) {
      const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (line.trim() && currentIndent <= stepsIndent && !line.trim().startsWith('-')) {
        inStepsSection = false;
        currentStepName = undefined;
      }
    }

    // stepsセクション内で処理
    if (inStepsSection) {
      // ステップ名: - - name: xxx
      const stepNameMatch = line.match(/^\s*-\s*-?\s*name:\s*['"]?([\w-]+)['"]?/);
      if (stepNameMatch) {
        currentStepName = stepNameMatch[1];
        continue;
      }

      // template: xxx
      if (currentStepName) {
        const templateMatch = line.match(/^\s*template:\s*['"]?([\w-]+)['"]?/);
        if (templateMatch) {
          const templateName = templateMatch[1];
          steps.push({
            name: currentStepName,
            templateName,
            lineNumber: lineNum,
          });
          currentStepName = undefined; // リセット
        }
      }
    }
  }

  return steps;
}

/**
 * タスク定義（DAG用）
 */
export type TaskDefinition = {
  /** タスク名 */
  name: string;
  /** 参照しているテンプレート名 */
  templateName: string;
  /** タスクが定義されている行番号 */
  lineNumber: number;
};

/**
 * ドキュメント内のすべてのタスク定義を抽出
 *
 * @param document - LSP TextDocument
 * @returns タスク定義の配列
 *
 * @example
 * ```yaml
 * dag:
 *   tasks:
 *     - name: task-a
 *       template: whalesay-template
 * ```
 * ↓
 * { name: 'task-a', templateName: 'whalesay-template', lineNumber: 45 }
 */
export function findTaskDefinitions(document: TextDocument): TaskDefinition[] {
  const tasks: TaskDefinition[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  let inTasksSection = false;
  let tasksIndent = 0;
  let currentTaskName: string | undefined;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // ドキュメント区切り (---) でリセット
    if (line.trim() === '---') {
      inTasksSection = false;
      currentTaskName = undefined;
      continue;
    }

    // tasks: の検出
    const tasksMatch = line.match(/^(\s*)tasks:/);
    if (tasksMatch) {
      inTasksSection = true;
      tasksIndent = tasksMatch[1].length;
      continue;
    }

    // tasksセクション内でインデントが戻ったら終了
    if (inTasksSection) {
      const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (line.trim() && currentIndent <= tasksIndent && !line.trim().startsWith('-')) {
        inTasksSection = false;
        currentTaskName = undefined;
      }
    }

    // tasksセクション内で処理
    if (inTasksSection) {
      // タスク名: - name: xxx
      const taskNameMatch = line.match(/^\s*-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (taskNameMatch) {
        currentTaskName = taskNameMatch[1];
        continue;
      }

      // template: xxx
      if (currentTaskName) {
        const templateMatch = line.match(/^\s*template:\s*['"]?([\w-]+)['"]?/);
        if (templateMatch) {
          const templateName = templateMatch[1];
          tasks.push({
            name: currentTaskName,
            templateName,
            lineNumber: lineNum,
          });
          currentTaskName = undefined; // リセット
        }
      }
    }
  }

  return tasks;
}
