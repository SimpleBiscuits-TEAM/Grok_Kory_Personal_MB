import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DebugReportButton from "./components/DebugReportButton";
import { lazy, Suspense } from "react";
import { Redirect } from "wouter";
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

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/advanced"} component={Advanced} />
        <Route path={"/fleet"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/drag"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/competition"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/weather"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/community"} component={Community} />
        <Route path={"/pitch"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/tasks"}>{() => <Redirect to="/advanced" />}</Route>
        <Route path={"/calibrations"} component={Calibrations} />
        <Route path={"/support/join/:inviteLink"} component={SupportJoin} />
        <Route path={"/debug"} component={DebugDashboard} />
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
          <DebugReportButton />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
