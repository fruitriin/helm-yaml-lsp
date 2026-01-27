/**
 * Argo Workflows LSP - Template Features
 *
 * テンプレート定義と参照の検出（エディタ非依存）
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver-types';
import type { ArgoWorkflowKind, TemplateDefinition, TemplateReference } from '@/types/argo';

/**
 * テンプレート定義の上下のコメントを抽出
 */
function extractTemplateComments(
  lines: string[],
  lineNum: number
): { aboveComment?: string; inlineComment?: string } {
  const result: { aboveComment?: string; inlineComment?: string } = {};

  // 上のコメント
  const aboveComments: string[] = [];
  for (let i = lineNum - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#')) {
      aboveComments.unshift(trimmed.substring(1).trim());
    } else if (trimmed === '') {
    } else {
      break; // コメント以外が出現したら終了
    }
  }
  if (aboveComments.length > 0) {
    result.aboveComment = aboveComments.join('\n');
  }

  // インラインコメント
  const line = lines[lineNum];
  const commentIndex = line.indexOf('#');
  if (commentIndex !== -1) {
    result.inlineComment = line.substring(commentIndex + 1).trim();
  }

  return result;
}

/**
 * ドキュメント内のすべてのテンプレート定義を抽出
 *
 * YAMLパーサーは使用せず、テキストベースで解析
 * （Helmテンプレート対応とエディタ非依存性のため）
 *
 * @param document - LSP TextDocument
 * @returns テンプレート定義の配列
 *
 * @example
 * const definitions = findTemplateDefinitions(document);
 * for (const def of definitions) {
 *   console.log(`Template: ${def.name} in ${def.workflowName}`);
 * }
 */
export function findTemplateDefinitions(document: TextDocument): TemplateDefinition[] {
  const definitions: TemplateDefinition[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  // 現在のドキュメントの状態を追跡
  let currentKind: ArgoWorkflowKind | undefined;
  let currentWorkflowName: string | undefined;
  let inTemplatesSection = false;
  let templatesIndent = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // ドキュメント区切り (---) でリセット
    if (line.trim() === '---') {
      currentKind = undefined;
      currentWorkflowName = undefined;
      inTemplatesSection = false;
      continue;
    }

    // kind: の検出（長いものから先にマッチさせる）
    const kindMatch = line.match(
      /^kind:\s*['"]?(ClusterWorkflowTemplate|WorkflowTemplate|CronWorkflow|Workflow)['"]?/
    );
    if (kindMatch) {
      currentKind = kindMatch[1] as ArgoWorkflowKind;
      continue;
    }

    // 非Argo Workflowのkind（ConfigMap, Secret等）を検出してリセット
    const nonArgoKindMatch = line.match(/^kind:\s*['"]?(\w+)['"]?/);
    if (nonArgoKindMatch && !currentKind) {
      // Argo Workflows以外のkindを検出した場合、状態をリセット
      currentWorkflowName = undefined;
      inTemplatesSection = false;
      continue;
    }

    // metadata.name: の検出（リテラル名のみ、Helm構文 {{ }} を含まない）
    // currentKindが設定されている場合のみ処理
    const metadataNameMatch = line.match(/^\s*name:\s*['"]?([\w-]+)['"]?\s*$/);
    if (metadataNameMatch && !inTemplatesSection && currentKind) {
      const potentialName = metadataNameMatch[1];
      // Helm構文を含まない場合のみworkflowNameとして使用
      if (!line.includes('{{')) {
        currentWorkflowName = potentialName;
      }
      continue;
    }

    // templates: の検出（Argo Workflowの場合のみ）
    const templatesMatch = line.match(/^(\s*)templates:/);
    if (templatesMatch && currentKind) {
      inTemplatesSection = true;
      templatesIndent = templatesMatch[1].length;
      continue;
    }

    // templatesセクション内でインデントが戻ったら終了
    if (inTemplatesSection) {
      const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (line.trim() && currentIndent <= templatesIndent && !line.trim().startsWith('-')) {
        inTemplatesSection = false;
      }
    }

    // templatesセクション内でテンプレート定義を検索
    // テンプレート定義は "- name:" で始まり、templates:の直下の配列要素である
    // (ステップ名、パラメータ名、templateRef名などは除外)
    if (inTemplatesSection) {
      // テンプレート定義は templates: の直下のリスト要素のみ
      // 期待されるインデント: templatesIndent (同じレベル) から templatesIndent + 6
      // 標準: "  templates:" の場合、"  - name:" または "    - name:"
      // 非標準: "      - name:" (後方互換性のため許容)
      const minTemplateIndent = templatesIndent;
      const maxTemplateIndent = templatesIndent + 6;

      // "- name:" パターンをチェック（リスト要素の最初のキーがname）
      const templateNameMatch = line.match(/^(\s*)-\s*name:\s*['"]?([\w-]+)['"]?/);
      if (templateNameMatch) {
        const matchIndent = templateNameMatch[1].length;
        // インデントがテンプレート定義レベルと一致するか確認
        // templatesIndentより大きく、妥当な範囲内であること
        if (matchIndent >= minTemplateIndent && matchIndent <= maxTemplateIndent) {
          const templateName = templateNameMatch[2];
          const nameStart = line.indexOf(templateName);

          // コメントを抽出
          const comments = extractTemplateComments(lines, lineNum);

          definitions.push({
            name: templateName,
            range: Range.create(
              Position.create(lineNum, nameStart),
              Position.create(lineNum, nameStart + templateName.length)
            ),
            uri: document.uri,
            kind: currentKind ?? 'Workflow',
            workflowName: currentWorkflowName,
            aboveComment: comments.aboveComment,
            inlineComment: comments.inlineComment,
          });
        }
      }
    }
  }

  return definitions;
}

/**
 * 指定位置にあるテンプレート参照を取得（テキストベース）
 *
 * @param document - LSP TextDocument
 * @param position - カーソル位置
 * @returns テンプレート参照、または undefined
 *
 * @example
 * const ref = findTemplateReferenceAtPosition(document, position);
 * if (ref && ref.type === 'templateRef') {
 *   console.log(`Template: ${ref.templateName} in ${ref.workflowTemplateName}`);
 * }
 */
export function findTemplateReferenceAtPosition(
  document: TextDocument,
  position: Position
): TemplateReference | undefined {
  const text = document.getText();
  const lines = text.split('\n');
  const line = lines[position.line];
  const offset = document.offsetAt(position);

  // パターン1: template: xxx (direct reference)
  const directMatch = line.match(/^\s*template:\s*['"]?([\w-]+)['"]?/);
  if (directMatch) {
    const templateName = directMatch[1];
    const templateKeywordStart = line.indexOf('template:');
    const nameStart = line.indexOf(templateName, templateKeywordStart);
    const nameEnd = nameStart + templateName.length;

    // カーソルがテンプレート名の上にあるかチェック
    if (position.character >= nameStart && position.character <= nameEnd) {
      return {
        type: 'direct',
        templateName,
        range: Range.create(
          Position.create(position.line, nameStart),
          Position.create(position.line, nameEnd)
        ),
      };
    }
  }

  // パターン2: templateRef 内のフィールド
  // templateRefブロックの検出（カーソル位置から逆方向に探索）
  const textBeforeCursor = text.substring(0, offset);
  const templateRefMatch = /templateRef:\s*$/m.exec(textBeforeCursor);

  if (templateRefMatch) {
    // templateRefブロック内を探索
    const templateRefStart = templateRefMatch.index;
    const templateRefLine = (textBeforeCursor.substring(0, templateRefStart).match(/\n/g) || [])
      .length;
    const templateRefIndent = lines[templateRefLine].match(/^(\s*)/)?.[1].length ?? 0;

    // templateRefブロック内のフィールドを抽出
    let workflowTemplateName: string | undefined;
    let templateName: string | undefined;
    let clusterScope = false;

    for (let i = templateRefLine + 1; i < lines.length; i++) {
      const currentLine = lines[i];
      const currentIndent = currentLine.match(/^(\s*)/)?.[1].length ?? 0;

      // インデントが戻ったらブロック終了
      if (
        currentLine.trim() &&
        currentIndent <= templateRefIndent &&
        !currentLine.trim().startsWith('#')
      ) {
        break;
      }

      // name: フィールド
      const nameMatch = currentLine.match(/^\s*name:\s*['"]?([\w-]+)['"]?/);
      if (nameMatch) {
        workflowTemplateName = nameMatch[1];
      }

      // template: フィールド
      const templateMatch = currentLine.match(/^\s*template:\s*['"]?([\w-]+)['"]?/);
      if (templateMatch) {
        templateName = templateMatch[1];
      }

      // clusterScope: フィールド
      const clusterScopeMatch = currentLine.match(/^\s*clusterScope:\s*(true|false)/);
      if (clusterScopeMatch) {
        clusterScope = clusterScopeMatch[1] === 'true';
      }
    }

    if (workflowTemplateName && templateName) {
      return {
        type: 'templateRef',
        templateName,
        workflowTemplateName,
        clusterScope,
        range: Range.create(
          Position.create(position.line, 0),
          Position.create(position.line, line.length)
        ),
      };
    }
  }

  return undefined;
}

/**
 * ドキュメント内のすべてのテンプレート参照を取得
 *
 * @param document - LSP TextDocument
 * @returns テンプレート参照の配列
 *
 * @example
 * const references = findAllTemplateReferences(document);
 * for (const ref of references) {
 *   console.log(`Template reference: ${ref.templateName}`);
 * }
 */
export function findAllTemplateReferences(document: TextDocument): TemplateReference[] {
  const references: TemplateReference[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  // 複数のYAMLドキュメントを処理するため、現在のkindを追跡
  let kind: ArgoWorkflowKind | undefined;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // YAMLドキュメント区切り（---）でkindをリセット
    if (line.trim() === '---') {
      kind = undefined;
      continue;
    }

    // kind: の検出（各YAMLドキュメントごとに更新）
    const kindMatch = line.match(
      /^kind:\s*['"]?(Workflow|CronWorkflow|WorkflowTemplate|ClusterWorkflowTemplate)['"]?/
    );
    if (kindMatch) {
      kind = kindMatch[1] as ArgoWorkflowKind;
      continue;
    }

    // template: フィールドを検出
    const templateMatch = line.match(/^\s*template:\s*['"]?([\w-]+)['"]?/);
    if (!templateMatch) {
      continue;
    }

    const templateName = templateMatch[1];
    const nameStart = line.indexOf(templateName);
    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    // templateRef ブロック内かどうかを確認
    let inTemplateRef = false;
    let workflowTemplateName: string | undefined;
    let clusterScope = false;

    // 上の行を探索して templateRef: ブロックを検出
    for (let i = lineNum - 1; i >= 0 && lineNum - i < 20; i--) {
      const prevLine = lines[i];
      const prevTrimmed = prevLine.trim();

      // 空行やコメント行はスキップ
      if (prevTrimmed === '' || prevTrimmed.startsWith('#')) {
        continue;
      }

      const prevIndent = prevLine.match(/^(\s*)/)?.[1].length ?? 0;

      // templateRef: を検出
      if (prevTrimmed.startsWith('templateRef:')) {
        inTemplateRef = true;

        // templateRef ブロック内のフィールドを抽出
        for (let j = i + 1; j <= lineNum; j++) {
          const blockLine = lines[j];

          // name: フィールド
          const nameMatch = blockLine.match(/^\s*name:\s*['"]?([\w-]+)['"]?/);
          if (nameMatch) {
            workflowTemplateName = nameMatch[1];
          }

          // clusterScope: フィールド
          const clusterScopeMatch = blockLine.match(/^\s*clusterScope:\s*(true|false)/);
          if (clusterScopeMatch) {
            clusterScope = clusterScopeMatch[1] === 'true';
          }
        }
        break;
      }

      // インデントが現在行より少ない場合、templateRefブロック外なので終了
      if (prevIndent < currentIndent) {
        break;
      }
    }

    if (inTemplateRef && workflowTemplateName) {
      // templateRef 参照
      references.push({
        type: 'templateRef',
        templateName,
        workflowTemplateName,
        clusterScope,
        range: Range.create(
          Position.create(lineNum, nameStart),
          Position.create(lineNum, nameStart + templateName.length)
        ),
      });
    } else if (!inTemplateRef) {
      // 直接参照
      references.push({
        type: 'direct',
        templateName,
        kind,
        range: Range.create(
          Position.create(lineNum, nameStart),
          Position.create(lineNum, nameStart + templateName.length)
        ),
      });
    }
  }

  return references;
}
