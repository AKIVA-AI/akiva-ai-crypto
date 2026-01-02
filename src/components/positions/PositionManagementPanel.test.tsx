import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PositionManagementPanel } from './PositionManagementPanel';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ 
          data: [
            {
              id: 'pos-1',
              instrument: 'BTC/USDT',
              side: 'buy',
              size: 0.5,
              entry_price: 50000,
              mark_price: 51000,
              unrealized_pnl: 500,
              realized_pnl: 0,
              leverage: 1,
              liquidation_price: null,
              is_open: true,
              book_id: 'book-1',
              strategy_id: null,
              venue_id: 'venue-1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              venues: { name: 'Binance' }
            }
          ], 
          error: null 
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  }
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('PositionManagementPanel', () => {
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

  const renderPanel = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PositionManagementPanel />
      </QueryClientProvider>
    );
  };

  describe('Position Display', () => {
    it('should render positions list', async () => {
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
      });
    });

    it('should show position details', async () => {
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
        expect(screen.getByText(/0.5/)).toBeInTheDocument(); // size
        expect(screen.getByText(/50000/)).toBeInTheDocument(); // entry price
      });
    });

    it('should show unrealized P&L', async () => {
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText(/500/)).toBeInTheDocument(); // unrealized PnL
      });
    });

    it('should show position side (buy/sell)', async () => {
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText(/buy/i)).toBeInTheDocument();
      });
    });
  });

  describe('Position Actions', () => {
    it('should close position when close button clicked', async () => {
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
      });
      
      // Find and click close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      
      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('positions');
      });
    });

    it('should show loading state when closing position', async () => {
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
      });
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      
      // Button should be disabled during close
      expect(closeButton).toBeDisabled();
    });
  });

  describe('Position Filtering', () => {
    it('should filter by instrument', async () => {
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
      });
      
      // Type in search/filter
      const filterInput = screen.getByPlaceholderText(/filter/i);
      fireEvent.change(filterInput, { target: { value: 'BTC' } });
      
      expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
    });

    it('should show empty state when no positions', async () => {
      // Mock empty positions
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      } as any);
      
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText(/No positions/i)).toBeInTheDocument();
      });
    });
  });

  describe('Risk Indicators', () => {
    it('should show liquidation price if available', async () => {
      // Mock position with liquidation price
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ 
            data: [{
              id: 'pos-1',
              instrument: 'BTC/USDT',
              side: 'buy',
              size: 0.5,
              entry_price: 50000,
              mark_price: 51000,
              unrealized_pnl: 500,
              realized_pnl: 0,
              leverage: 10,
              liquidation_price: 45000,
              is_open: true,
              book_id: 'book-1',
              strategy_id: null,
              venue_id: 'venue-1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              venues: { name: 'Binance' }
            }], 
            error: null 
          }))
        }))
      } as any);
      
      renderPanel();
      
      await waitFor(() => {
        expect(screen.getByText(/45000/)).toBeInTheDocument();
      });
    });
  });
});

