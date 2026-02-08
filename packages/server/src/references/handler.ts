/**
 * Unified Reference Resolution - Handler Type
 *
 * 参照型ごとに1つのハンドラーを定義。
 * detect/resolve/findAll/complete を1箇所にまとめる。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Location, Position } from 'vscode-languageserver-types';
import type { DetectedReference, ReferenceKind, ResolvedReference } from './types';

/**
 * ReferenceHandler
 *
 * 各参照型のハンドラーが実装するインターフェース。
 * - detect: カーソル位置の参照を検出（hover/definition用）
 * - resolve: 検出された参照を解決（定義位置、hover内容、診断メッセージ）
 * - findAll: ドキュメント内の全参照を検出（diagnostic用バルク検出）
 * - complete: カーソル位置の補完候補を提供
 */
export type ReferenceHandler = {
  readonly kind: ReferenceKind;
  readonly supports: {
    definition: boolean;
    hover: boolean;
    completion: boolean;
    diagnostic: boolean;
  };
  detect(doc: TextDocument, pos: Position): DetectedReference | undefined;
  resolve(doc: TextDocument, detected: DetectedReference): Promise<ResolvedReference>;
  findAll?(doc: TextDocument): DetectedReference[];
  complete?(doc: TextDocument, pos: Position): CompletionItem[] | undefined;

  // ワークスペース全体から参照を検索（textDocument/references 用）
  findReferences?(doc: TextDocument, pos: Position, allDocuments: TextDocument[]): Location[];
};
