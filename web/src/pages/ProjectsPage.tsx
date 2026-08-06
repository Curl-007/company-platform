import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ProjectList from '../features/projects/components/ProjectList';
import ProjectDetailView from '../features/projects/components/ProjectDetailView';
import PageFrame from '../components/common/PageFrame';
import type { SessionUser } from '../types';

function ProjectsPage({ user }: { user?: SessionUser | null }) {
  const location = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(new URLSearchParams(location.search).get('focus'));
  }, [location.search]);

  function handleBack() {
    const [pathPart] = window.location.hash.split('?');
    if (window.location.hash.includes('focus=')) window.location.hash = pathPart;
    setSelectedId(null);
  }

  return (
    <PageFrame
      className="page-frame-projects"
      contentClassName="page-frame-projects-content"
    >
      {selectedId ? (
        <ProjectDetailView id={selectedId} onBack={handleBack} user={user} />
      ) : (
        <ProjectList onOpen={setSelectedId} currentUser={user} />
      )}
    </PageFrame>
  );
}

export default ProjectsPage;
