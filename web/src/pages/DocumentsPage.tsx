import DocumentsView from '../features/documents/components/DocumentsView';
import PageFrame from '../components/common/PageFrame';

function DocumentsPage() {
  return (
    <PageFrame
      className="page-frame-documents"
      contentClassName="page-frame-documents-content"
    >
      <DocumentsView />
    </PageFrame>
  );
}

export default DocumentsPage;
