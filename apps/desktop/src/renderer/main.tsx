import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './query';
import './styles.css';

// Windows/Linux держат системные кнопки окна справа (titleBarOverlay) — им нужен
// запас, чтобы «Выйти» не оказалась под кнопкой закрытия. Платформа нужна только
// вёрстке: новых IPC-каналов не появляется.
if (!/Mac/i.test(navigator.userAgent)) {
  document.documentElement.dataset['platform'] = 'other';
}

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
