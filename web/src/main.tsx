import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ToastProvider } from './components/common/Toast';
import { ConfirmProvider } from './components/common/ConfirmDialog';
import { applyWorkTheme, readWorkThemeSettings } from './theme/workTheme';
import { queryClient } from './lib/queryClient';
import './styles/global.css';
import './styles/req-workbench.css';
import './styles/qa-workbench.css';
import './styles/dl-workbench.css';
import './styles/doc-workbench.css';
import './styles/reports-workbench.css';
import './styles/flow-workbench.css';
import './styles/ai-connection.css';

applyWorkTheme(readWorkThemeSettings());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in DOM');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
