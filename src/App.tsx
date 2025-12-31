import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AlertNotificationProvider } from "@/components/alerts/AlertNotificationSystem";
import { TradingModeProvider } from "@/contexts/TradingModeContext";
import { AICopilotProvider } from "@/contexts/AICopilotContext";
import Index from "./pages/Index";
import Agents from "./pages/Agents";
import Strategies from "./pages/Strategies";
import Execution from "./pages/Execution";
import Risk from "./pages/Risk";
import Launch from "./pages/Launch";
import Treasury from "./pages/Treasury";
import Observability from "./pages/Observability";
import Settings from "./pages/Settings";
import Engine from "./pages/Engine";
import Analytics from "./pages/Analytics";
import Markets from "./pages/Markets";
import Positions from "./pages/Positions";
import AuditLog from "./pages/AuditLog";
import SystemStatus from "./pages/SystemStatus";
import Arbitrage from "./pages/Arbitrage";
import Trade from "./pages/Trade";
import Operations from "./pages/Operations";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <TradingModeProvider>
            <AICopilotProvider>
              <AlertNotificationProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/auth" element={<Auth />} />
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
                  <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AlertNotificationProvider>
            </AICopilotProvider>
          </TradingModeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
