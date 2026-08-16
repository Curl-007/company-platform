import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ToastProvider } from './components/common/Toast';
import { ConfirmProvider } from './components/common/ConfirmDialog';
import { applyWorkTheme, readWorkThemeSettings } from './theme/workTheme';
import { queryClient } from './lib/queryClient';
import './i18n';
import { LanguageProvider } from './i18n/LanguageProvider';
import './styles/global.css';
import './styles/req-workbench.css';
import './styles/qa-workbench.css';
import './styles/dl-workbench.css';
import './styles/doc-workbench.css';
import './styles/reports-workbench.css';
import './styles/flow-workbench.css';
import './styles/ai-connection.css';
import './styles/ai-runtime.css';
// Detail-surface + page-polish layers load last so they override the
// per-feature workbench skins above (same specificity, later cascade).
import './styles/global/07-detail-surface.css';
import './styles/global/08-page-polish.css';
import './styles/global/09-user-request-polish.css';

applyWorkTheme(readWorkThemeSettings());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in DOM');
}

createRoot(rootElement).render(
  <StrictMode>
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </LanguageProvider>
  </StrictMode>,
);
