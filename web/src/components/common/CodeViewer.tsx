import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SourceFile } from '../../types';

// ---------------------------------------------------------------------------
// CodeViewer: read-only code display with line numbers and syntax CSS classes
// ---------------------------------------------------------------------------

interface CodeViewerProps {
  /** Source file data from backend */
  file: SourceFile;
  /** Additional CSS class */
  className?: string;
  /** Max height before scroll (default: 600px) */
  maxHeight?: number | string;
}

// Simple syntax keyword highlighting for common languages.
// This is a lightweight approach — for production, consider highlight.js or Prism.
const KEYWORDS_BY_LANG: Record<string, string[]> = {
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'async', 'await', 'import', 'export', 'default', 'from', 'class', 'extends', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined'],
  typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'async', 'await', 'import', 'export', 'default', 'from', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined', 'readonly', 'public', 'private', 'protected', 'static', 'abstract'],
  python: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'pass', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'async', 'await'],
  java: ['public', 'private', 'protected', 'static', 'final', 'class', 'interface', 'extends', 'implements', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'String', 'null', 'true', 'false'],
  go: ['func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'break', 'continue', 'import', 'package', 'defer', 'go', 'chan', 'select', 'type', 'struct', 'interface', 'map', 'var', 'const', 'nil', 'true', 'false', 'make', 'new', 'append', 'len', 'cap'],
  rust: ['fn', 'let', 'mut', 'return', 'if', 'else', 'for', 'while', 'loop', 'match', 'break', 'continue', 'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'pub', 'self', 'super', 'crate', 'where', 'as', 'in', 'ref', 'move', 'async', 'await', 'true', 'false', 'Some', 'None', 'Ok', 'Err', 'unsafe'],
  html: ['html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'form', 'input', 'button', 'select', 'option', 'textarea', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'nav', 'section', 'article', 'main', 'aside'],
  sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'NULL', 'IS', 'EXISTS', 'UNION', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'],
};

function tokenizeLine(line: string, language: string): React.ReactNode[] {
  const keywords = KEYWORDS_BY_LANG[language] ?? [];
  const keywordSet = new Set(keywords);
  const tokens: React.ReactNode[] = [];
  // Simple regex-based tokenizer
  const parts = line.split(/(\/\/.*|\/[*].*?[*]\/|"[^"]*"|'[^']*'|`[^`]*`|\b\d+\.?\d*\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)/g);

  parts.forEach((part, idx) => {
    if (part === undefined || part === '') return;
    if (part.startsWith('//') || part.startsWith('/*')) {
      tokens.push(<span key={idx} className="code-comment">{part}</span>);
    } else if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'")) || (part.startsWith('`') && part.endsWith('`'))) {
      tokens.push(<span key={idx} className="code-string">{part}</span>);
    } else if (/^\d+\.?\d*$/.test(part)) {
      tokens.push(<span key={idx} className="code-number">{part}</span>);
    } else if (keywordSet.has(part)) {
      tokens.push(<span key={idx} className="code-keyword">{part}</span>);
    } else {
      tokens.push(part);
    }
  });

  return tokens;
}

function CodeViewer({ file, className = '', maxHeight = 600 }: CodeViewerProps) {
  const { t } = useTranslation();
  const lines = useMemo(() => file.content.split('\n'), [file.content]);

  return (
    <div className={`code-viewer ${className}`} style={{ maxHeight, overflow: 'auto' }}>
      <div className="code-viewer-header">
        <span className="code-viewer-lang">{file.language}</span>
        <span className="code-viewer-info">{t('common.linesCount', { count: file.lineCount })}{file.truncated ? ` (${t('common.truncated')})` : ''}</span>
      </div>
      <div className="code-viewer-body">
        <table className="code-viewer-table">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="code-viewer-line">
                <td className="code-viewer-line-number">{idx + 1}</td>
                <td className="code-viewer-line-content">
                  <span>{tokenizeLine(line, file.language)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CodeViewer;
