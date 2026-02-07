/**
 * Unified Reference Resolution - Registry
 *
 * ReferenceRegistry はドキュメントガードを順に適用し、
 * マッチしたハンドラーで参照の検出・解決を行う。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Position } from 'vscode-languageserver-types';
import type { ReferenceHandler } from './handler';
import type { ResolvedReference } from './types';

/**
 * ドキュメントガード
 *
 * ドキュメントの種類に応じてハンドラーグループを切り替える。
 * 登録順 = 検出優先順位（Helm → ConfigMap → Argo）
 */
export type DocumentGuard = {
  name: string;
  check: (doc: TextDocument) => boolean;
  handlers: ReferenceHandler[];
};

/**
 * ReferenceRegistry
 *
 * ガード付きハンドラーの一元管理。
 * Provider はこのクラスのメソッドを呼ぶだけの薄い層になる。
 */
export class ReferenceRegistry {
  private guards: DocumentGuard[] = [];

  addGuard(guard: DocumentGuard): void {
    this.guards.push(guard);
  }

  /**
   * カーソル位置の参照を検出し解決する（hover/definition用）
   */
  async detectAndResolve(doc: TextDocument, pos: Position): Promise<ResolvedReference | null> {
    for (const guard of this.guards) {
      if (!guard.check(doc)) continue;

      for (const handler of guard.handlers) {
        const detected = handler.detect(doc, pos);
        if (detected) {
          return handler.resolve(doc, detected);
        }
      }
    }
    return null;
  }

  /**
   * ドキュメント内の全参照を検証する（diagnostic用）
   *
   * exists === false の参照のみ返す
   */
  async validateAll(doc: TextDocument): Promise<ResolvedReference[]> {
    const failures: ResolvedReference[] = [];

    for (const guard of this.guards) {
      if (!guard.check(doc)) continue;

      for (const handler of guard.handlers) {
        if (!handler.supports.diagnostic || !handler.findAll) continue;

        const allRefs = handler.findAll(doc);
        for (const ref of allRefs) {
          const resolved = await handler.resolve(doc, ref);
          if (resolved.exists === false) {
            failures.push(resolved);
          }
        }
      }
    }

    return failures;
  }

  /**
   * カーソル位置の補完候補を提供する（completion用）
   */
  provideCompletions(doc: TextDocument, pos: Position): CompletionItem[] {
    for (const guard of this.guards) {
      if (!guard.check(doc)) continue;

      for (const handler of guard.handlers) {
        if (!handler.supports.completion || !handler.complete) continue;

        const items = handler.complete(doc, pos);
        if (items && items.length > 0) {
          return items;
        }
      }
    }
    return [];
  }
}
