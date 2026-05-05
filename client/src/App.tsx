import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PrototypePage from "./pages/Prototype";
import AdminTopicsPage from "./pages/AdminTopics";
import AdminGenerationPage from "./pages/AdminGeneration";
import AdminQualityPage from "./pages/AdminQuality";
import AdminPublishingPage from "./pages/AdminPublishing";
import PublicPage from "./pages/PublicPage";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/prototype"} component={PrototypePage} />
      <Route path={"/admin/topics"} component={AdminTopicsPage} />
      <Route path={"/admin/generation"} component={AdminGenerationPage} />
      <Route path={"/admin/quality"} component={AdminQualityPage} />
      <Route path={"/admin/publishing"} component={AdminPublishingPage} />
      <Route path={"/p/:slug"} component={PublicPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
