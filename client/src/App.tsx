import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DebugReportButton from "./components/DebugReportButton";
import { lazy, Suspense } from "react";
import ScreenGuard from "./components/ScreenGuard";
import { Redirect } from "wouter";
import { useAccessTier } from "@/hooks/useAccessTier";
import AccessGate from "@/components/AccessGate";
// Lazy-load all heavy pages for code splitting
const Home = lazy(() => import("./pages/Home"));
const Advanced = lazy(() => import("./pages/Advanced"));
const Fleet = lazy(() => import("./pages/Fleet"));
const DragRacing = lazy(() => import("./pages/DragRacing"));
const Community = lazy(() => import("./pages/Community"));
const SupportJoin = lazy(() => import("./pages/SupportJoin"));
const DebugDashboard = lazy(() => import("./pages/DebugDashboard"));
// Pitch and Tasks now live inside Advanced tab (redirected)
const Calibrations = lazy(() => import("./pages/Calibrations"));
const TuneDeployPage = lazy(() => import("./pages/TuneDeploy"));
const GitMapPage = lazy(() => import("./pages/GitMap"));
const Strat = lazy(() => import("./pages/Strat"));

// Full-page loading spinner matching PPEI dark theme
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid oklch(0.52 0.22 25 / 0.3)',
          borderTop: '3px solid oklch(0.52 0.22 25)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{
          fontFamily: '"Share Tech Mono", monospace',
          color: 'oklch(0.65 0.01 260)',
          fontSize: '0.8rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}>
          LOADING MODULE...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/** Wrapper that blocks VOP PRO routes for lite-tier users */
function ProGuard({ children }: { children: React.ReactNode }) {
  const { hasPro } = useAccessTier();
  if (!hasPro) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'oklch(0.08 0.004 260)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{
          width: '56px', height: '56px',
          borderRadius: '50%',
          background: 'oklch(0.52 0.22 25 / 0.15)',
          border: '2px solid oklch(0.52 0.22 25 / 0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '1.5rem',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="oklch(0.52 0.22 25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 style={{
          fontFamily: '"Bebas Neue", "Impact", sans-serif',
          fontSize: '1.6rem',
          letterSpacing: '0.1em',
          color: 'white',
          margin: '0 0 0.5rem 0',
        }}>VOP PRO ACCESS REQUIRED</h2>
        <p style={{
          fontFamily: '"Rajdhani", "Segoe UI", sans-serif',
          fontSize: '0.9rem',
          color: 'oklch(0.60 0.010 260)',
          maxWidth: '400px',
          marginBottom: '1.5rem',
        }}>
          This section requires a VOP PRO access code. You currently have VOP LITE access.
        </p>
        <a
          href="/"
          style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '0.9rem',
            letterSpacing: '0.08em',
            color: 'oklch(0.52 0.22 25)',
            textDecoration: 'none',
            padding: '8px 20px',
            border: '1px solid oklch(0.52 0.22 25 / 0.5)',
            borderRadius: '3px',
            background: 'oklch(0.52 0.22 25 / 0.1)',
          }}
        >
          BACK TO VOP LITE
        </a>
      </div>
    );
  }
  return <>{children}</>;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  const { hasAccess, loading } = useAccessTier();

  // Show loading spinner while checking access
  if (loading) return <PageLoader />;

  // Show access gate if no access code entered
  if (!hasAccess) return <AccessGate />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/advanced"}>{() => <ProGuard><Advanced /></ProGuard>}</Route>
        <Route path={"/fleet"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/drag"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/competition"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/weather"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/community"} component={Community} />
        <Route path={"/pitch"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/tasks"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/strat"} component={Strat} />
        <Route path={"/calibrations"}>{() => <ProGuard><Calibrations /></ProGuard>}</Route>
        <Route path={"/tune-deploy"}>{() => <ProGuard><TuneDeployPage /></ProGuard>}</Route>
        <Route path={"/git-map"}>{() => <ProGuard><GitMapPage /></ProGuard>}</Route>
        <Route path={"/support/join/:inviteLink"} component={SupportJoin} />
        <Route path={"/debug"}>{() => <ProGuard><DebugDashboard /></ProGuard>}</Route>
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// V-OP by PPEI — Dark theme by default to match brand identity
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
          <ScreenGuard active={true} />
          <DebugReportButton />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
