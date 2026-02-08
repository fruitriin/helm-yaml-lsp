/**
 * Go Template Expression Tokenizer
 *
 * Scans a TextDocument for all `{{ }}` / `{{- -}}` blocks and tokenizes
 * their contents into TokenSpan[]. Used for semantic token highlighting.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * A single token span within a Go template expression.
 */
export type TokenSpan = {
  line: number;
  character: number;
  length: number;
  /** Index into TOKEN_TYPES */
  tokenType: number;
  /** Bitmask of token modifiers */
  tokenModifiers: number;
};

// Token type indices
const TOKEN_KEYWORD = 0;
const TOKEN_FUNCTION = 1;
const TOKEN_VARIABLE = 2;
const TOKEN_PROPERTY = 3;
const TOKEN_STRING = 4;
const TOKEN_NUMBER = 5;
const TOKEN_COMMENT = 6;
const TOKEN_OPERATOR = 7;

// Token modifier bitmasks
const _MOD_DEFINITION = 1;
const MOD_READONLY = 2;
const MOD_DEFAULT_LIBRARY = 4;

const KEYWORDS = new Set(['if', 'else', 'range', 'with', 'define', 'block', 'end', 'template']);

export const KNOWN_FUNCTIONS = new Set([
  'default',
  'quote',
  'squote',
  'upper',
  'lower',
  'title',
  'trim',
  'trimSuffix',
  'trimPrefix',
  'nospace',
  'trunc',
  'abbrev',
  'replace',
  'repeat',
  'substr',
  'contains',
  'hasPrefix',
  'hasSuffix',
  'indent',
  'nindent',
  'toYaml',
  'toJson',
  'fromYaml',
  'fromJson',
  'toToml',
  'fromToml',
  'b64enc',
  'b64dec',
  'required',
  'fail',
  'print',
  'println',
  'printf',
  'list',
  'dict',
  'get',
  'set',
  'unset',
  'hasKey',
  'pluck',
  'keys',
  'values',
  'pick',
  'omit',
  'merge',
  'mergeOverwrite',
  'append',
  'prepend',
  'concat',
  'first',
  'last',
  'initial',
  'rest',
  'reverse',
  'uniq',
  'without',
  'has',
  'slice',
  'until',
  'untilStep',
  'add',
  'sub',
  'mul',
  'div',
  'mod',
  'max',
  'min',
  'ceil',
  'floor',
  'round',
  'int',
  'int64',
  'float64',
  'toDecimal',
  'toString',
  'now',
  'date',
  'dateModify',
  'dateInZone',
  'ago',
  'duration',
  'htmlDate',
  'unixEpoch',
  'kindOf',
  'kindIs',
  'typeOf',
  'typeIs',
  'deepEqual',
  'coalesce',
  'ternary',
  'empty',
  'compact',
  'mustCompact',
  'join',
  'split',
  'splitList',
  'splitn',
  'sha256sum',
  'sha1sum',
  'adler32sum',
  'genPrivateKey',
  'derivePassword',
  'randAlphaNum',
  'randAlpha',
  'randNumeric',
  'randAscii',
  'env',
  'expandenv',
  'base',
  'dir',
  'ext',
  'clean',
  'isAbs',
  'regexMatch',
  'regexFind',
  'regexFindAll',
  'regexReplaceAll',
  'regexReplaceAllLiteral',
  'regexSplit',
  'lookup',
  'tpl',
  'and',
  'or',
  'not',
  'eq',
  'ne',
  'lt',
  'le',
  'gt',
  'ge',
  'len',
  'semver',
  'semverCompare',
  'cat',
  'wrap',
  'wrapWith',
  'plural',
  'snakecase',
  'camelcase',
  'kebabcase',
  'swapcase',
  'shuffle',
  'toRawJson',
  'mustToRawJson',
  'htpasswd',
  'genCA',
  'genSelfSignedCert',
  'genSignedCert',
  'include',
  'template',
]);

const READONLY_PREFIXES = ['.Release', '.Capabilities'];

/**
 * Tokenize block content between `{{` and `}}` delimiters.
 */
function tokenizeBlockContent(
  content: string,
  lineNum: number,
  startOffset: number,
  spans: TokenSpan[]
): void {
  let pos = 0;
  while (pos < content.length) {
    // Skip whitespace
    if (/\s/.test(content[pos])) {
      pos++;
      continue;
    }

    // 1. Block comment /* ... */
    if (content[pos] === '/' && content[pos + 1] === '*') {
      const endIdx = content.indexOf('*/', pos + 2);
      if (endIdx !== -1) {
        const len = endIdx + 2 - pos;
        spans.push({
          line: lineNum,
          character: startOffset + pos,
          length: len,
          tokenType: TOKEN_COMMENT,
          tokenModifiers: 0,
        });
        pos = endIdx + 2;
      } else {
        // Unclosed comment — treat rest as comment
        const len = content.length - pos;
        spans.push({
          line: lineNum,
          character: startOffset + pos,
          length: len,
          tokenType: TOKEN_COMMENT,
          tokenModifiers: 0,
        });
        pos = content.length;
      }
      continue;
    }

    // 2. String literal "..."
    if (content[pos] === '"') {
      let end = pos + 1;
      while (end < content.length) {
        if (content[end] === '\\') {
          end += 2; // skip escaped char
        } else if (content[end] === '"') {
          end++;
          break;
        } else {
          end++;
        }
      }
      spans.push({
        line: lineNum,
        character: startOffset + pos,
        length: end - pos,
        tokenType: TOKEN_STRING,
        tokenModifiers: 0,
      });
      pos = end;
      continue;
    }

    // 3. := operator
    if (content[pos] === ':' && content[pos + 1] === '=') {
      spans.push({
        line: lineNum,
        character: startOffset + pos,
        length: 2,
        tokenType: TOKEN_OPERATOR,
        tokenModifiers: 0,
      });
      pos += 2;
      continue;
    }

    // 4. Pipe operator
    if (content[pos] === '|') {
      spans.push({
        line: lineNum,
        character: startOffset + pos,
        length: 1,
        tokenType: TOKEN_OPERATOR,
        tokenModifiers: 0,
      });
      pos++;
      continue;
    }

    // 5. Parentheses — skip (don't tokenize)
    if (content[pos] === '(' || content[pos] === ')') {
      pos++;
      continue;
    }

    // 6. $variable
    if (content[pos] === '$') {
      const m = content.slice(pos).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*/);
      const varLen = m ? m[0].length : 1; // bare $ is also a variable
      spans.push({
        line: lineNum,
        character: startOffset + pos,
        length: varLen,
        tokenType: TOKEN_VARIABLE,
        tokenModifiers: 0,
      });
      pos += varLen;
      continue;
    }

    // 7. Dot-access / property path: .Values.xxx, .Chart.xxx, .Release.xxx, etc.
    if (content[pos] === '.') {
      // Match the full dot-property chain
      const m = content.slice(pos).match(/^\.[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*/);
      if (m) {
        const propStr = m[0];
        const isReadonly = READONLY_PREFIXES.some(
          p => propStr === p || propStr.startsWith(`${p}.`)
        );
        spans.push({
          line: lineNum,
          character: startOffset + pos,
          length: propStr.length,
          tokenType: TOKEN_PROPERTY,
          tokenModifiers: isReadonly ? MOD_READONLY : 0,
        });
        pos += propStr.length;
      } else {
        // Bare dot
        spans.push({
          line: lineNum,
          character: startOffset + pos,
          length: 1,
          tokenType: TOKEN_PROPERTY,
          tokenModifiers: 0,
        });
        pos++;
      }
      continue;
    }

    // 8. Identifier (keyword, function, or number check)
    const identMatch = content.slice(pos).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (identMatch) {
      const word = identMatch[0];

      // Check for "template" used as keyword (not after pipe)
      if (word === 'template' && isKeywordPosition(content, pos)) {
        spans.push({
          line: lineNum,
          character: startOffset + pos,
          length: word.length,
          tokenType: TOKEN_KEYWORD,
          tokenModifiers: 0,
        });
        pos += word.length;
        continue;
      }

      if (KEYWORDS.has(word) && word !== 'template') {
        spans.push({
          line: lineNum,
          character: startOffset + pos,
          length: word.length,
          tokenType: TOKEN_KEYWORD,
          tokenModifiers: 0,
        });
        pos += word.length;
        continue;
      }

      if (KNOWN_FUNCTIONS.has(word)) {
        spans.push({
          line: lineNum,
          character: startOffset + pos,
          length: word.length,
          tokenType: TOKEN_FUNCTION,
          tokenModifiers: MOD_DEFAULT_LIBRARY,
        });
        pos += word.length;
        continue;
      }

      // Unknown identifier — skip
      pos += word.length;
      continue;
    }

    // 9. Number literal
    const numMatch = content.slice(pos).match(/^-?\d+(\.\d+)?/);
    if (numMatch) {
      spans.push({
        line: lineNum,
        character: startOffset + pos,
        length: numMatch[0].length,
        tokenType: TOKEN_NUMBER,
        tokenModifiers: 0,
      });
      pos += numMatch[0].length;
      continue;
    }

    // Skip unrecognized character
    pos++;
  }
}

/**
 * Determine if `template` at the given position is used as a keyword
 * (i.e., not after a pipe `|`).
 */
function isKeywordPosition(content: string, pos: number): boolean {
  // Check if there's a pipe before this position (ignoring whitespace)
  const before = content.slice(0, pos).trimEnd();
  return before.length === 0 || before[before.length - 1] !== '|';
}

/**
 * Regex to match `{{ }}` blocks including trimming variants `{{-` / `-}}`.
 * Captures:
 *  - group 1: opening delimiter (`{{` or `{{-`)
 *  - group 2: content between delimiters
 *  - group 3: closing delimiter (`}}` or `-}}`)
 */
const BLOCK_RE = /(\{\{-?)(.*?)(-?\}\})/g;

/**
 * Scan a TextDocument for all Go template expressions and tokenize them.
 *
 * @returns TokenSpan[] sorted by (line, character) ascending
 */
export function tokenizeGoTemplateExpressions(document: TextDocument): TokenSpan[] {
  const text = document.getText();
  const lines = text.split('\n');
  const spans: TokenSpan[] = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    BLOCK_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = BLOCK_RE.exec(line)) !== null) {
      const openDelim = match[1]; // {{ or {{-
      const content = match[2]; // content between delimiters
      const closeDelim = match[3]; // }} or -}}
      const matchStart = match.index;

      // Emit opening delimiter as operator
      spans.push({
        line: lineNum,
        character: matchStart,
        length: openDelim.length,
        tokenType: TOKEN_OPERATOR,
        tokenModifiers: 0,
      });

      // Tokenize block content
      const contentStart = matchStart + openDelim.length;
      tokenizeBlockContent(content, lineNum, contentStart, spans);

      // Emit closing delimiter as operator
      const closeStart = contentStart + content.length;
      spans.push({
        line: lineNum,
        character: closeStart,
        length: closeDelim.length,
        tokenType: TOKEN_OPERATOR,
        tokenModifiers: 0,
      });
    }
  }

  // Sort by (line, character) ascending
  spans.sort((a, b) => a.line - b.line || a.character - b.character);

  return spans;
}
