import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/AppShell';
import { PageHeading } from './components/ui';
import { useSession } from './hooks/useSession';
import { useI18n } from './i18n';
import { Act } from './pages/Act';
import { JoinCircle, SignIn, StartCircle } from './pages/Auth';
import { Landing } from './pages/Landing';
import { Today } from './pages/Today';

// Less-used pages load on demand to keep the first download small.
const Medicines = lazy(() => import('./pages/Medicines').then((m) => ({ default: m.Medicines })));
const Appointments = lazy(() => import('./pages/Appointments').then((m) => ({ default: m.Appointments })));
const VisitBrief = lazy(() => import('./pages/Appointments').then((m) => ({ default: m.VisitBrief })));
const Insights = lazy(() => import('./pages/Insights').then((m) => ({ default: m.Insights })));
const Circle = lazy(() => import('./pages/Circle').then((m) => ({ default: m.Circle })));

function Loading() {
  const { t } = useI18n();
  return (
    <p className="page muted" role="status">
      {t('common.loading')}
    </p>
  );
}

/** Signed-in pages: redirect to sign in when there is no session. */
function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return (
    <AppShell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </AppShell>
  );
}

/** Public pages send signed-in people straight to Today. */
function PublicOnly({ children, to = '/today' }: { children: ReactNode; to?: string }) {
  const { session, loading } = useSession();
  if (loading) return <Loading />;
  return session ? <Navigate to={to} replace /> : children;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <main id="main" className="page page-narrow">
      <div className="card stack">
        <PageHeading title={t('notFound.title')} />
        <p>{t('notFound.body')}</p>
        <a className="btn btn-primary" href="/">
          {t('notFound.home')}
        </a>
      </div>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicOnly>
            <Landing />
          </PublicOnly>
        }
      />
      <Route
        path="/start"
        element={
          <PublicOnly to="/circle?welcome=1">
            <StartCircle />
          </PublicOnly>
        }
      />
      <Route
        path="/join"
        element={
          <PublicOnly>
            <JoinCircle />
          </PublicOnly>
        }
      />
      <Route
        path="/signin"
        element={
          <PublicOnly>
            <SignIn />
          </PublicOnly>
        }
      />
      <Route path="/act" element={<Act />} />
      <Route
        path="/today"
        element={
          <Protected>
            <Today />
          </Protected>
        }
      />
      <Route
        path="/medicines"
        element={
          <Protected>
            <Medicines />
          </Protected>
        }
      />
      <Route
        path="/appointments"
        element={
          <Protected>
            <Appointments />
          </Protected>
        }
      />
      <Route
        path="/appointments/:id/brief"
        element={
          <Protected>
            <VisitBrief />
          </Protected>
        }
      />
      <Route
        path="/insights"
        element={
          <Protected>
            <Insights />
          </Protected>
        }
      />
      <Route
        path="/circle"
        element={
          <Protected>
            <Circle />
          </Protected>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
