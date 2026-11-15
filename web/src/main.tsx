import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource-variable/fraunces/index.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/700.css';
import './styles/app.css';
import './styles/pages.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { PreferencesProvider } from './hooks/usePreferences';
import { SessionProvider } from './hooks/useSession';
import { I18nProvider } from './i18n';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <I18nProvider>
          <PreferencesProvider>
            <SessionProvider>
              <App />
            </SessionProvider>
          </PreferencesProvider>
        </I18nProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
