import { useEffect, useState } from 'react';
import ProjectList from '../features/projects/components/ProjectList';
import ProjectDetailView from '../features/projects/components/ProjectDetailView';
import PageHeader from '../components/common/PageHeader';
import type { SessionUser } from '../types';

function ProjectsPage({ user }: { user?: SessionUser | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const syncFocus = () => {
      const hash = window.location.hash;
      const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
      const focusId = new URLSearchParams(query).get('focus');
      if (focusId) setSelectedId(focusId);
    };

    syncFocus();
    window.addEventListener('hashchange', syncFocus);
    return () => window.removeEventListener('hashchange', syncFocus);
  }, []);

  function handleBack() {
    const [pathPart] = window.location.hash.split('?');
    if (window.location.hash.includes('focus=')) window.location.hash = pathPart;
    setSelectedId(null);
  }

  return (
    <div>
      <PageHeader
        title="项目管理"
        description="管理项目、工作分解结构、流程看板和源码浏览。"
      />
      {selectedId ? (
        <ProjectDetailView id={selectedId} onBack={handleBack} user={user} />
      ) : (
        <ProjectList onOpen={setSelectedId} currentUser={user} />
      )}
    </div>
  );
}

export default ProjectsPage;
