import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AlertNotificationProvider } from "@/components/alerts/AlertNotificationSystem";
import { TradingModeProvider } from "@/contexts/TradingModeContext";
import { UserModeProvider } from "@/contexts/UserModeContext";
import { AICopilotProvider } from "@/contexts/AICopilotContext";
import { MarketDataProvider } from "@/contexts/MarketDataContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// All pages lazy-loaded for fast initial bundle
const Index = lazy(() => import("./pages/Index"));
const Agents = lazy(() => import("./pages/Agents"));
const Strategies = lazy(() => import("./pages/Strategies"));
const Execution = lazy(() => import("./pages/Execution"));
const Risk = lazy(() => import("./pages/Risk"));
const Launch = lazy(() => import("./pages/Launch"));
const Treasury = lazy(() => import("./pages/Treasury"));
const Observability = lazy(() => import("./pages/Observability"));
const Settings = lazy(() => import("./pages/Settings"));
const Engine = lazy(() => import("./pages/Engine"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Markets = lazy(() => import("./pages/Markets"));
const Positions = lazy(() => import("./pages/Positions"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const SystemStatus = lazy(() => import("./pages/SystemStatus"));
const Arbitrage = lazy(() => import("./pages/Arbitrage"));
const Trade = lazy(() => import("./pages/Trade"));
const Operations = lazy(() => import("./pages/Operations"));
const Screener = lazy(() => import("./pages/Screener"));
const Auth = lazy(() => import("./pages/Auth"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MultiExchangeDemo = lazy(() => import("./pages/MultiExchangeDemo"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <TradingModeProvider>
              <UserModeProvider>
                <MarketDataProvider refreshInterval={5000}>
                  <AICopilotProvider>
                    <AlertNotificationProvider>
                      <Toaster />
                      <Sonner />
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                          <Route path="/auth" element={<Auth />} />
                          <Route path="/update-password" element={<UpdatePassword />} />
                          <Route path="/onboarding" element={<Onboarding />} />
                          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                          <Route path="/agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
                          <Route path="/strategies" element={<ProtectedRoute><Strategies /></ProtectedRoute>} />
                          <Route path="/execution" element={<ProtectedRoute><Execution /></ProtectedRoute>} />
                          <Route path="/risk" element={<ProtectedRoute><Risk /></ProtectedRoute>} />
                          <Route path="/launch" element={<ProtectedRoute><Launch /></ProtectedRoute>} />
                          <Route path="/treasury" element={<ProtectedRoute><Treasury /></ProtectedRoute>} />
                          <Route path="/observability" element={<ProtectedRoute><Observability /></ProtectedRoute>} />
                          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                          <Route path="/engine" element={<ProtectedRoute><Engine /></ProtectedRoute>} />
                          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                          <Route path="/markets" element={<ProtectedRoute><Markets /></ProtectedRoute>} />
                          <Route path="/positions" element={<ProtectedRoute><Positions /></ProtectedRoute>} />
                          <Route path="/audit" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
                          <Route path="/status" element={<ProtectedRoute><SystemStatus /></ProtectedRoute>} />
                          <Route path="/arbitrage" element={<ProtectedRoute><Arbitrage /></ProtectedRoute>} />
                          <Route path="/trade" element={<ProtectedRoute><Trade /></ProtectedRoute>} />
                          <Route path="/screener" element={<ProtectedRoute><Screener /></ProtectedRoute>} />
                          <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
                          <Route path="/multi-exchange-demo" element={<ProtectedRoute><MultiExchangeDemo /></ProtectedRoute>} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </Suspense>
                    </AlertNotificationProvider>
                  </AICopilotProvider>
                </MarketDataProvider>
              </UserModeProvider>
            </TradingModeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
