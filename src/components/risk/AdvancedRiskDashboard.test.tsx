import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdvancedRiskDashboard from './AdvancedRiskDashboard';

// Mock hooks
vi.mock('@/hooks/useBooks', () => ({
  useBooks: () => ({
    data: [
      { id: 'book-1', name: 'Main Book', is_active: true },
      { id: 'book-2', name: 'Test Book', is_active: true }
    ],
    isLoading: false
  })
}));

// Mock fetch functions
global.fetch = vi.fn((url) => {
  if (url.includes('/var')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        var_95: 0.05,
        var_99: 0.08,
        expected_shortfall: 0.10
      })
    });
  }
  if (url.includes('/stress-test')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        scenarios: [
          { name: 'Market Crash', impact: -0.15 },
          { name: 'Flash Crash', impact: -0.25 }
        ]
      })
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
  });
}) as any;

describe('AdvancedRiskDashboard', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    vi.clearAllMocks();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AdvancedRiskDashboard />
      </QueryClientProvider>
    );
  };

  describe('Book Selection', () => {
    it('should render book selector', () => {
      renderDashboard();
      expect(screen.getByText(/Select Book/i)).toBeInTheDocument();
    });

    it('should show available books', async () => {
      renderDashboard();
      
      const selector = screen.getByRole('combobox');
      fireEvent.click(selector);
      
      await waitFor(() => {
        expect(screen.getByText('Main Book')).toBeInTheDocument();
        expect(screen.getByText('Test Book')).toBeInTheDocument();
      });
    });

    it('should select default book on load', async () => {
      renderDashboard();
      
      await waitFor(() => {
        expect(screen.getByText('Main Book')).toBeInTheDocument();
      });
    });
  });

  describe('VaR Display', () => {
    it('should show VaR metrics', async () => {
      renderDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/VaR \(95%\)/i)).toBeInTheDocument();
      });
    });

    it('should display VaR value', async () => {
      renderDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/-5.0%/)).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching VaR', () => {
      renderDashboard();
      
      // Should show loading spinner initially
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Stress Testing', () => {
    it('should show stress test scenarios', async () => {
      renderDashboard();
      
      // Switch to stress test tab
      const stressTab = screen.getByRole('tab', { name: /Stress Testing/i });
      fireEvent.click(stressTab);
      
      await waitFor(() => {
        expect(screen.getByText(/Market Crash/i)).toBeInTheDocument();
      });
    });

    it('should display scenario impacts', async () => {
      renderDashboard();
      
      const stressTab = screen.getByRole('tab', { name: /Stress Testing/i });
      fireEvent.click(stressTab);
      
      await waitFor(() => {
        expect(screen.getByText(/-15%/)).toBeInTheDocument();
        expect(screen.getByText(/-25%/)).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should have refresh button', () => {
      renderDashboard();
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });

    it('should refetch data when refresh clicked', async () => {
      renderDashboard();
      
      const refreshButton = screen.getByRole('button', { name: /Refresh/i });
      fireEvent.click(refreshButton);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should show all risk tabs', () => {
      renderDashboard();
      
      expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /VaR Analysis/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Stress Testing/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Risk Attribution/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Liquidity Risk/i })).toBeInTheDocument();
    });

    it('should switch between tabs', async () => {
      renderDashboard();
      
      const varTab = screen.getByRole('tab', { name: /VaR Analysis/i });
      fireEvent.click(varTab);
      
      await waitFor(() => {
        expect(varTab).toHaveAttribute('data-state', 'active');
      });
    });
  });

  describe('Empty State', () => {
    it('should show message when no book selected', async () => {
      // Mock no books
      vi.mock('@/hooks/useBooks', () => ({
        useBooks: () => ({
          data: [],
          isLoading: false
        })
      }));
      
      renderDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/Select a trading book/i)).toBeInTheDocument();
      });
    });
  });

  describe('Risk Metrics Overview', () => {
    it('should display key risk metrics', async () => {
      renderDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/VaR \(95%\)/i)).toBeInTheDocument();
        expect(screen.getByText(/1-day loss at 95% confidence/i)).toBeInTheDocument();
      });
    });

    it('should show risk metrics in correct format', async () => {
      renderDashboard();
      
      await waitFor(() => {
        // VaR should be shown as percentage
        expect(screen.getByText(/-5.0%/)).toBeInTheDocument();
      });
    });
  });
});

