import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import SortableSectionLayout from '../../../components/common/SortableSectionLayout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui';
import { canAccessPageForUser } from '../../../constants/roles';
import type { SessionUser } from '../../../types';
import type { DshDeclarativeView, DshViewBlock } from '../models/declarativeViewModel';

interface DshDeclarativeViewRendererProps {
  view: DshDeclarativeView;
  user: SessionUser;
}

function BlockShell({ block, children, className = '' }: {
  block: DshViewBlock;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dsh-ui-block ${className}`.trim()} data-dsh-block-type={block.type}>
      {block.title ? <header className="dsh-ui-block-header"><h3>{block.title}</h3></header> : null}
      <div className="dsh-ui-block-body">{children}</div>
    </section>
  );
}

function cellText(value: string | number | boolean | null): string {
  if (value === null) return '';
  return String(value);
}

function DshBlockRenderer({ block, user }: { block: DshViewBlock; user: SessionUser }) {
  switch (block.type) {
    case 'stat':
      return (
        <BlockShell block={block} className="dsh-ui-stat">
          <div data-tone={block.tone ?? 'default'} className="dsh-ui-stat">
            <div className="dsh-ui-stat-label">{block.label}</div>
            <div className="dsh-ui-stat-value">{block.value}</div>
            {block.detail ? <p className="dsh-ui-stat-detail">{block.detail}</p> : null}
          </div>
        </BlockShell>
      );
    case 'text':
      return <BlockShell block={block}><p className="dsh-ui-text">{block.text}</p></BlockShell>;
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <BlockShell block={block}>
          <List className="dsh-ui-list">{block.items.map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>)}</List>
        </BlockShell>
      );
    }
    case 'table':
      return (
        <BlockShell block={block} className="dsh-ui-table">
          <Table>
            <TableHeader>
              <TableRow>{block.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, rowIndex) => (
                <TableRow key={`${block.id}-row-${rowIndex}`}>
                  {block.columns.map((column) => <TableCell key={column.key}>{cellText(row[column.key] ?? null)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </BlockShell>
      );
    case 'progress':
      return (
        <BlockShell block={block}>
          <div className="dsh-ui-progress-value"><span>{block.label}</span><strong>{block.value}%</strong></div>
          <div className="dsh-ui-progress-track">
            <div
              className="dsh-ui-progress-fill"
              style={{ width: `${block.value}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={block.value}
            />
          </div>
          {block.detail ? <p className="dsh-ui-progress-detail">{block.detail}</p> : null}
        </BlockShell>
      );
    case 'notice':
      return (
        <BlockShell block={block} className={`dsh-ui-notice dsh-ui-notice--${block.tone ?? 'info'}`}>
          <p className="dsh-ui-text">{block.text}</p>
        </BlockShell>
      );
    case 'links': {
      const accessible = block.items.filter((item) => canAccessPageForUser(user, item.page));
      return (
        <BlockShell block={block}>
          <nav className="dsh-ui-links">
            {accessible.map((item, index) => (
              <Link className="dsh-ui-link" to={`/${item.page}`} key={`${item.page}-${index}`}>
                <span>{item.label}</span><ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </BlockShell>
      );
    }
  }
}

export default function DshDeclarativeViewRenderer({ view, user }: DshDeclarativeViewRendererProps) {
  const { t } = useTranslation();
  const blockLabel = (block: DshViewBlock) => block.title
    ?? ('label' in block ? block.label : t(`features.dshUi.blockType.${block.type}`));
  const style = { '--dsh-surface-columns': '2', '--dsh-surface-gap': '16px' } as CSSProperties;

  return (
    <article className="dsh-ui-view" aria-labelledby={`dsh-view-title-${view.id}`}>
      <header className="dsh-ui-view-heading">
        <h2 id={`dsh-view-title-${view.id}`}>{view.title}</h2>
        {view.description ? <p>{view.description}</p> : null}
      </header>
      <div style={style}>
        <SortableSectionLayout
          surface={view.surface}
          userId={user.id}
          className="dsh-ui-view-grid"
          sections={view.blocks.map((block) => ({
            id: block.id,
            label: blockLabel(block),
            content: <DshBlockRenderer block={block} user={user} />,
          }))}
        />
      </div>
    </article>
  );
}
