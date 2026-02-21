import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DivinationProvider } from "./contexts/DivinationContext";
import { AncientBackground, InkTexture } from "./components/AncientBackground";
import QuestionPage from "./pages/QuestionPage";
import ThrowPage from "./pages/ThrowPage";
import ResultPage from "./pages/ResultPage";
import HistoryPage from "./pages/HistoryPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={QuestionPage} />
      <Route path={"/throw"} component={ThrowPage} />
      <Route path={"/result"} component={ResultPage} />
      <Route path={"/history"} component={HistoryPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {/* 古风背景层 */}
          <InkTexture />
          <AncientBackground />
          {/* 占卜状态全局 Context */}
          <DivinationProvider>
            <div className="relative z-10">
              <Router />
            </div>
          </DivinationProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
