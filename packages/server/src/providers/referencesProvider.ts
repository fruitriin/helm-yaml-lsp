/**
 * Argo Workflows LSP - References Provider
 *
 * textDocument/references リクエストを処理し、
 * ワークスペース全体から参照箇所を返す。
 */

import type { TextDocuments } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location, Position, ReferenceContext } from 'vscode-languageserver-types';
import type { ReferenceRegistry } from '@/references/registry';

export class ReferencesProvider {
  constructor(
    private registry: ReferenceRegistry,
    private documents: TextDocuments<TextDocument>
  ) {}

  provideReferences(doc: TextDocument, position: Position, _context: ReferenceContext): Location[] {
    const allDocs = this.documents.all();
    return this.registry.findAllReferences(doc, position, allDocs);
  }
}
