import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DivinationProvider } from "./contexts/DivinationContext";
import { AncientBackground, InkTexture } from "./components/AncientBackground";
import QuestionPage from "./pages/QuestionPage";
import ThrowPage from "./pages/ThrowPage";
import ResultPage from "./pages/ResultPage";
import HistoryPage from "./pages/HistoryPage";
import { DisclaimerPage, PrivacyPage } from "./pages/LegalPages";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import { trackEvent } from "./lib/analytics";
import { I18nProvider } from "./i18n/I18nContext";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

function PageViewTracker() {
  const [location] = useLocation();
  useEffect(() => { trackEvent('page_view', location); }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={QuestionPage} />
      <Route path={"/throw"} component={ThrowPage} />
      <Route path={"/result"} component={ResultPage} />
      <Route path={"/history"} component={HistoryPage} />
      <Route path={"/privacy"} component={PrivacyPage} />
      <Route path={"/disclaimer"} component={DisclaimerPage} />
      <Route path={"/data"} component={AnalyticsDashboard} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const dashboardHost = window.location.hostname === 'data.liuyao.win';
  if (dashboardHost) return <AnalyticsDashboard />;
  return (
    <ErrorBoundary>
      <I18nProvider>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {/* 古风背景层 */}
          <InkTexture />
          <AncientBackground />
          {/* 占卜状态全局 Context */}
          <DivinationProvider>
            <LanguageSwitcher />
            <div className="relative z-10">
              <PageViewTracker />
              <Router />
            </div>
          </DivinationProvider>
        </TooltipProvider>
      </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;
