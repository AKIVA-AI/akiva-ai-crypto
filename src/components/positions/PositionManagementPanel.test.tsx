import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PositionManagementPanel } from './PositionManagementPanel';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase
const mockPositions = [
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
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: mockPositions,
            error: null
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    })),
    removeChannel: vi.fn()
  }
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

// Mock useLivePriceFeed
vi.mock('@/hooks/useLivePriceFeed', () => ({
  useLivePriceFeed: () => {
    const pricesMap = new Map();
    pricesMap.set('BTC-USDT', { price: 51000, timestamp: Date.now() });
    return {
      prices: pricesMap,
      isConnected: true,
      getPrice: (symbol: string) => symbol === 'BTC-USDT' ? 51000 : null
    };
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
        <TooltipProvider>
          <PositionManagementPanel />
        </TooltipProvider>
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
        expect(screen.getByText(/0\.5/)).toBeInTheDocument(); // size
        expect(screen.getByText(/50,000/)).toBeInTheDocument(); // entry price (formatted with comma)
      });
    });

    it('should show unrealized P&L', async () => {
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/\+\$500\.00/)).toBeInTheDocument(); // unrealized PnL formatted as +$500.00
      });
    });

    it('should show position side (buy/sell)', async () => {
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/LONG/i)).toBeInTheDocument(); // Component shows LONG/SHORT not buy/sell
      });
    });
  });

  describe('Position Actions', () => {
    it('should close position when close button clicked', async () => {
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
      });

      // Find and click close button by title
      const closeButtons = screen.getAllByTitle('Close Position');
      fireEvent.click(closeButtons[0]);

      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('positions');
      });
    });

    it('should show loading state when closing position', async () => {
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
      });

      const closeButtons = screen.getAllByTitle('Close Position');
      fireEvent.click(closeButtons[0]);

      // Button should be disabled during close
      expect(closeButtons[0]).toBeDisabled();
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
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      } as any);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/No open positions/i)).toBeInTheDocument();
      });
    });
  });

  describe('Risk Indicators', () => {
    it('should show liquidation price if available', async () => {
      // Mock position with liquidation price
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
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
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      } as any);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/45,000/)).toBeInTheDocument(); // formatted with comma
      });
    });
  });
});

