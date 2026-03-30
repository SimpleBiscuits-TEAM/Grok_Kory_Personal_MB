import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SiteGate } from "./components/SiteGate";
import Home from "./pages/Home";
import Advanced from "./pages/Advanced";
import SupportJoin from "./pages/SupportJoin";
import DebugDashboard from "./pages/DebugDashboard";
import DebugReportButton from "./components/DebugReportButton";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/advanced"} component={Advanced} />
      <Route path={"/support/join/:inviteLink"} component={SupportJoin} />
      <Route path={"/debug"} component={DebugDashboard} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
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
          <SiteGate>
            <Router />
            <DebugReportButton />
          </SiteGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
