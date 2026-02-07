/**
 * Argo Workflows LSP - Document Highlight Provider
 *
 * Helmブロック構造（if/range/with/define/block...else...end）の
 * 対応タグをハイライト表示。
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import {
  DocumentHighlight,
  DocumentHighlightKind,
  type Position,
  Range,
} from 'vscode-languageserver-types';

/** 検出されたブロックタグ情報 */
type TagInfo = {
  keyword: string;
  startOffset: number;
  endOffset: number;
  line: number;
  startCol: number;
  endCol: number;
};

const OPENING_KEYWORDS = ['if', 'range', 'with', 'define', 'block'];
const TAG_REGEX = /\{\{-?\s*(if|else\s+if|else|range|with|define|block|end)\b[^}]*-?\}\}/g;

/**
 * Document Highlight Provider
 *
 * LSP textDocument/documentHighlight リクエストを処理し、
 * カーソル位置のHelmブロックタグと対応するタグをハイライト
 */
export class DocumentHighlightProvider {
  provideDocumentHighlights(
    document: TextDocument,
    position: Position
  ): DocumentHighlight[] | null {
    const text = document.getText();
    const tags = this.findAllTags(text, document);

    if (tags.length === 0) return null;

    // Find which tag the cursor is on
    const cursorTag = tags.find(
      tag =>
        tag.line === position.line &&
        position.character >= tag.startCol &&
        position.character <= tag.endCol
    );

    if (!cursorTag) return null;

    const keyword = cursorTag.keyword;
    let blockTags: TagInfo[];

    if (OPENING_KEYWORDS.includes(keyword)) {
      blockTags = this.findBlockTags(tags, cursorTag);
    } else if (keyword === 'else' || keyword === 'elseif') {
      const opener = this.findMatchingOpener(tags, cursorTag);
      if (!opener) return null;
      blockTags = this.findBlockTags(tags, opener);
    } else if (keyword === 'end') {
      const opener = this.findMatchingOpener(tags, cursorTag);
      if (!opener) return null;
      blockTags = this.findBlockTags(tags, opener);
    } else {
      return null;
    }

    if (blockTags.length <= 1) return null;

    return blockTags.map(tag => {
      const range = Range.create(tag.line, tag.startCol, tag.line, tag.endCol);
      const isMiddle = tag.keyword === 'else' || tag.keyword === 'elseif';
      const kind = isMiddle ? DocumentHighlightKind.Read : DocumentHighlightKind.Write;
      return DocumentHighlight.create(range, kind);
    });
  }

  /** ドキュメント内の全ブロックタグを検出 */
  private findAllTags(text: string, document: TextDocument): TagInfo[] {
    const tags: TagInfo[] = [];
    const regex = new RegExp(TAG_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      let keyword = match[1].trim();
      if (keyword.startsWith('else ')) {
        keyword = 'elseif';
      }

      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);

      tags.push({
        keyword,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        line: startPos.line,
        startCol: startPos.character,
        endCol: endPos.character,
      });
    }

    return tags;
  }

  /** 開始タグから対応する全タグ（else/elseif/end含む）を収集 */
  private findBlockTags(tags: TagInfo[], opener: TagInfo): TagInfo[] {
    const openerIndex = tags.indexOf(opener);
    const blockTags: TagInfo[] = [opener];
    let depth = 1;

    for (let i = openerIndex + 1; i < tags.length; i++) {
      const tag = tags[i];
      if (OPENING_KEYWORDS.includes(tag.keyword)) {
        depth++;
      } else if (tag.keyword === 'end') {
        depth--;
        if (depth === 0) {
          blockTags.push(tag);
          return blockTags;
        }
      } else if ((tag.keyword === 'else' || tag.keyword === 'elseif') && depth === 1) {
        blockTags.push(tag);
      }
    }

    return blockTags;
  }

  /** 中間/終了タグから対応する開始タグを逆方向に探索 */
  private findMatchingOpener(tags: TagInfo[], closer: TagInfo): TagInfo | null {
    const closerIndex = tags.indexOf(closer);
    let depth = 1;

    for (let i = closerIndex - 1; i >= 0; i--) {
      const tag = tags[i];
      if (tag.keyword === 'end') {
        depth++;
      } else if (OPENING_KEYWORDS.includes(tag.keyword)) {
        depth--;
        if (depth === 0) {
          return tag;
        }
      }
      // else/elseif don't affect depth
    }

    return null;
  }
}
