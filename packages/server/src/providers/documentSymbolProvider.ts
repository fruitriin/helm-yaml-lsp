/**
 * Argo Workflows LSP - Document Symbol Provider
 *
 * YAML構造をパースしてドキュメントシンボル（アウトライン）を提供。
 * Helmテンプレートタグ {{...}} をプレースホルダーに置換してYAML構造を解析。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentSymbol, Position, Range, SymbolKind } from 'vscode-languageserver-types';

/** インデントベースで解析されたYAMLノード */
type YamlNode = {
  key: string;
  value: string;
  indent: number;
  line: number;
  endLine: number;
  children: YamlNode[];
};

/**
 * Document Symbol Provider
 *
 * LSP textDocument/documentSymbol リクエストを処理し、
 * YAMLドキュメントの構造をアウトラインとして提供
 */
export class DocumentSymbolProvider {
  provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
    const text = document.getText();
    const lines = text.split('\n');

    if (lines.every(l => l.trim() === '' || l.trim().startsWith('#'))) {
      return [];
    }

    const yamlDocs = this.splitDocuments(lines);

    if (yamlDocs.length === 1) {
      const doc = yamlDocs[0];
      const nodes = this.parseYamlNodes(doc.lines, doc.startLine);
      const kind = this.extractDocumentKind(doc.lines);
      const name = this.extractDocumentName(doc.lines);

      if (kind) {
        const label = name ? `${kind}: ${name}` : kind;
        const range = Range.create(
          Position.create(doc.startLine, 0),
          Position.create(
            doc.startLine + doc.lines.length - 1,
            doc.lines[doc.lines.length - 1].length
          )
        );
        const children = this.nodesToSymbols(nodes, doc.lines, doc.startLine);
        return [DocumentSymbol.create(label, undefined, SymbolKind.Class, range, range, children)];
      }

      return this.nodesToSymbols(nodes, doc.lines, doc.startLine);
    }

    const symbols: DocumentSymbol[] = [];
    for (const doc of yamlDocs) {
      const nodes = this.parseYamlNodes(doc.lines, doc.startLine);
      const kind = this.extractDocumentKind(doc.lines);
      const name = this.extractDocumentName(doc.lines);
      const label = kind ? (name ? `${kind}: ${name}` : kind) : `Document @${doc.startLine + 1}`;
      const lastLine = doc.startLine + doc.lines.length - 1;
      const range = Range.create(
        Position.create(doc.startLine, 0),
        Position.create(lastLine, doc.lines[doc.lines.length - 1].length)
      );
      const children = this.nodesToSymbols(nodes, doc.lines, doc.startLine);
      symbols.push(
        DocumentSymbol.create(label, undefined, SymbolKind.Class, range, range, children)
      );
    }
    return symbols;
  }

  /** --- で区切られた複数ドキュメントを分割 */
  private splitDocuments(lines: string[]): { lines: string[]; startLine: number }[] {
    const docs: { lines: string[]; startLine: number }[] = [];
    let currentLines: string[] = [];
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        if (
          currentLines.length > 0 &&
          currentLines.some(l => l.trim() !== '' && !l.trim().startsWith('#'))
        ) {
          docs.push({ lines: currentLines, startLine });
        }
        currentLines = [];
        startLine = i + 1;
      } else {
        currentLines.push(lines[i]);
      }
    }

    if (
      currentLines.length > 0 &&
      currentLines.some(l => l.trim() !== '' && !l.trim().startsWith('#'))
    ) {
      docs.push({ lines: currentLines, startLine });
    }

    return docs;
  }

  /** インデントベースでYAMLノードツリーを構築 */
  private parseYamlNodes(lines: string[], baseLineOffset: number): YamlNode[] {
    const sanitizedLines = lines.map(l => this.sanitizeHelmTemplates(l));
    const entries: { key: string; value: string; indent: number; line: number }[] = [];

    for (let i = 0; i < sanitizedLines.length; i++) {
      const line = sanitizedLines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) continue;

      const indent = line.search(/\S/);
      // Match "key:" or "- key:" patterns
      const kvMatch = line.match(/^(\s*)(-\s+)?(\S[^:]*):\s*(.*)?$/);
      if (kvMatch) {
        const key = kvMatch[2] ? `- ${kvMatch[3].trim()}` : kvMatch[3].trim();
        const value = (kvMatch[4] || '').trim();
        entries.push({ key, value, indent, line: baseLineOffset + i });
      }
    }

    return this.buildTree(entries, lines, baseLineOffset);
  }

  /** フラットなエントリからツリー構造を構築 */
  private buildTree(
    entries: { key: string; value: string; indent: number; line: number }[],
    lines: string[],
    baseLineOffset: number
  ): YamlNode[] {
    if (entries.length === 0) return [];

    const roots: YamlNode[] = [];
    const stack: YamlNode[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const nextLine =
        i + 1 < entries.length ? entries[i + 1].line : baseLineOffset + lines.length - 1;
      const node: YamlNode = {
        key: entry.key,
        value: entry.value,
        indent: entry.indent,
        line: entry.line,
        endLine: nextLine,
        children: [],
      };

      // Pop stack until we find the parent
      while (stack.length > 0 && stack[stack.length - 1].indent >= entry.indent) {
        stack.pop();
      }

      if (stack.length === 0) {
        roots.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
    }

    // Fix endLine for all nodes (each node ends where the next sibling at same/lower indent starts)
    this.fixEndLines(roots, baseLineOffset + lines.length - 1);

    return roots;
  }

  /** ノードの終了行を再計算 */
  private fixEndLines(nodes: YamlNode[], documentEndLine: number): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (i + 1 < nodes.length) {
        node.endLine = nodes[i + 1].line - 1;
      } else {
        node.endLine = documentEndLine;
      }
      if (node.children.length > 0) {
        this.fixEndLines(node.children, node.endLine);
      }
    }
  }

  /** YamlNodeツリーをDocumentSymbol[]に変換 */
  private nodesToSymbols(
    nodes: YamlNode[],
    _lines: string[],
    _baseLineOffset: number
  ): DocumentSymbol[] {
    return nodes.map(node => {
      const symbolKind = this.determineSymbolKind(node);
      const displayName = node.value ? `${node.key}: ${node.value}` : node.key;
      const range = Range.create(Position.create(node.line, 0), Position.create(node.endLine, 0));
      const selectionRange = Range.create(
        Position.create(node.line, node.indent),
        Position.create(node.line, node.indent + node.key.length)
      );
      const children =
        node.children.length > 0
          ? this.nodesToSymbols(node.children, _lines, _baseLineOffset)
          : undefined;

      return DocumentSymbol.create(
        displayName,
        undefined,
        symbolKind,
        range,
        selectionRange,
        children
      );
    });
  }

  /** ノードのコンテキストに基づいてSymbolKindを決定 */
  private determineSymbolKind(node: YamlNode): SymbolKind {
    const key = node.key.replace(/^-\s+/, '');

    // Top-level section keys
    const sectionKeys = [
      'metadata',
      'spec',
      'data',
      'stringData',
      'status',
      'rules',
      'subjects',
      'roleRef',
    ];
    if (sectionKeys.includes(key)) {
      return SymbolKind.Field;
    }

    // Special named items
    if (key === 'name' && node.value) {
      return SymbolKind.Property;
    }

    // containers[].name pattern
    if (key === 'containers' || key === 'initContainers') {
      return SymbolKind.Method;
    }

    // templates section in Argo
    if (key === 'templates') {
      return SymbolKind.Function;
    }

    // parameters
    if (key === 'parameters' || key === 'arguments') {
      return SymbolKind.Variable;
    }

    return SymbolKind.Property;
  }

  /** Helmテンプレートタグをプレースホルダーに置換 */
  private sanitizeHelmTemplates(line: string): string {
    // Replace {{ ... }} with underscores of same length
    return line.replace(/\{\{[^}]*\}\}/g, match => '_'.repeat(match.length));
  }

  /** ドキュメントからkindを抽出 */
  private extractDocumentKind(lines: string[]): string | null {
    for (const line of lines) {
      const match = line.match(/^kind:\s*(.+)$/);
      if (match) {
        return this.sanitizeHelmTemplates(match[1].trim()).replace(/_+/g, '') || match[1].trim();
      }
    }
    return null;
  }

  /** ドキュメントからmetadata.nameを抽出 */
  private extractDocumentName(lines: string[]): string | null {
    let inMetadata = false;
    for (const line of lines) {
      if (line.match(/^metadata:\s*$/)) {
        inMetadata = true;
        continue;
      }
      if (inMetadata) {
        if (line.match(/^\S/)) {
          inMetadata = false;
          continue;
        }
        const nameMatch = line.match(/^\s+name:\s*(.+)$/);
        if (nameMatch) {
          let name = nameMatch[1].trim();
          // Strip quotes
          if (
            (name.startsWith('"') && name.endsWith('"')) ||
            (name.startsWith("'") && name.endsWith("'"))
          ) {
            name = name.slice(1, -1);
          }
          return name;
        }
      }
    }
    return null;
  }
}
