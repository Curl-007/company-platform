import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import StatusBadge from '../../../components/common/StatusBadge';
import { DOC_TYPE_LABELS, DOC_AI_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Document } from '../../../types';
import {
  aiStatusVariant,
  categoryLabel,
  formatFileSize,
  formatLabel,
  isExtractableFormat,
  roleLabel,
} from './documentMeta';

export default function DocumentDetail({
  doc,
  projectMap,
  canUseAi,
  onClose,
}: {
  doc: Document;
  projectMap: Map<string, string>;
  canUseAi: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const projectName = doc.projectId ? (projectMap.get(doc.projectId) ?? doc.projectId) : t('features.documents.documentDetail.none');
  const updated = doc.updatedAt?.includes('T')
    ? doc.updatedAt.replace('T', ' ').slice(0, 16)
    : (doc.updatedAt || '-');

  return (
    <>
      <div className="detail-drawer-scrim" onClick={onClose} />
      <div className="detail-drawer doc-detail-drawer">
        <div className="panel doc-detail-panel">
          <div className="panel-header">
            <div className="panel-header-left min-w-0">
              <div className="min-w-0">
                <div className="panel-title truncate" title={doc.title}>{doc.title}</div>
                <div className="panel-subtitle truncate" title={doc.fileName}>{doc.fileName}</div>
              </div>
            </div>
            <div className="panel-toolbar">
              <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose}>
                <X size={15} aria-hidden="true" /> {t('common.close')}
              </button>
            </div>
          </div>
          <div className="panel-body doc-detail-body">
            <section className="doc-detail-summary">
              <div className="doc-detail-badges">
                <span className="doc-ext-chip">{formatLabel(doc.fileName || doc.title)}</span>
                <StatusBadge label={labelOf(DOC_TYPE_LABELS, doc.type)} status={doc.type} />
                <StatusBadge
                  label={labelOf(DOC_AI_STATUS_LABELS, doc.aiStatus) || t('features.documents.documentDetail.notAnalyzed')}
                  variant={aiStatusVariant(doc.aiStatus)}
                />
                <span className="doc-detail-chip">{categoryLabel(doc.category)}</span>
              </div>
              <div className="doc-detail-metrics">
                <div className="doc-detail-metric">
                  <span>{t('features.documents.documentDetail.owner')}</span>
                  <strong>{doc.owner || t('common.unfilled')}</strong>
                </div>
                <div className="doc-detail-metric">
                  <span>{t('features.documents.documentDetail.ownerRole')}</span>
                  <strong>{roleLabel(doc.ownerRole)}</strong>
                </div>
                <div className="doc-detail-metric">
                  <span>{t('features.documents.documentDetail.project')}</span>
                  <strong title={projectName}>{projectName}</strong>
                </div>
                <div className="doc-detail-metric">
                  <span>{t('features.documents.documentDetail.updatedAt')}</span>
                  <strong className="text-mono">{updated}</strong>
                </div>
              </div>
            </section>

            {canUseAi ? (
              <BusinessAdvicePanel
                targetType="document"
                targetId={doc.id}
                title={t('features.documents.documentDetail.aiDocumentAnalysis')}
                description={t('features.documents.documentDetail.aiAnalysisDescription')}
                buttonText={t('features.documents.documentDetail.aiSummarize')}
                question={t('features.documents.documentDetail.aiSummarizeQuestion')}
                draft={() => ({
                  title: doc.title,
                  type: doc.type,
                  category: doc.category,
                  owner: doc.owner,
                  projectName,
                  linkedRequirements: doc.linkedRequirements,
                })}
              />
            ) : null}

            <section className="doc-detail-block">
              <div className="section-title">{t('features.documents.documentDetail.fileInfo')}</div>
              <div className="doc-file-grid">
                <div>
                  <span>{t('features.documents.documentDetail.size')}</span>
                  <strong>{doc.fileSize ? formatFileSize(doc.fileSize) : t('features.documents.documentDetail.unknown')}</strong>
                </div>
                <div>
                  <span>MIME</span>
                  <strong title={doc.fileType || t('features.documents.documentDetail.unknown')}>{doc.fileType || t('features.documents.documentDetail.unknown')}</strong>
                </div>
                <div>
                  <span>{t('features.documents.documentDetail.bodyExtraction')}</span>
                  <strong>{isExtractableFormat(doc.fileName || '') ? t('features.documents.documentDetail.extractSupported') : t('features.documents.documentDetail.attachmentOnly')}</strong>
                </div>
                <div>
                  <span>{t('features.documents.documentDetail.version')}</span>
                  <strong>{doc.version || '-'}</strong>
                </div>
              </div>
            </section>

            {doc.linkedRequirements?.length ? (
              <section className="doc-detail-block">
                <div className="section-title">{t('features.documents.documentDetail.linkedRequirements')}</div>
                <ul className="doc-detail-list">
                  {doc.linkedRequirements.map((requirement, index) => (
                    <li key={`${requirement}-${index}`}>{requirement}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {doc.risks?.length ? (
              <section className="doc-detail-block">
                <div className="section-title">{t('features.documents.documentDetail.riskItems')}</div>
                <ul className="doc-detail-list">
                  {doc.risks.map((risk, index) => (
                    <li key={`${risk}-${index}`}>{risk}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="doc-detail-block">
              <div className="section-title">{t('features.documents.documentDetail.documentContent')}</div>
              {doc.content ? (
                <pre className="doc-content-preview">{doc.content}</pre>
              ) : (
                <div className="doc-content-empty">
                  <FileText size={16} aria-hidden="true" />
                  {t('features.documents.documentDetail.noExtractedBody')}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
