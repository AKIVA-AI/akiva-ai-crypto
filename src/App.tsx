import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AlertNotificationProvider } from "@/components/alerts/AlertNotificationSystem";
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
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AlertNotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
