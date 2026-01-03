import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeTicket } from './TradeTicket';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: '123' }, error: null }))
        }))
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null }))
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

describe('TradeTicket', () => {
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

  const renderTradeTicket = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TradeTicket {...props} />
      </QueryClientProvider>
    );
  };

  describe('Order Entry Validation', () => {
    it('should render trade ticket with default values', () => {
      renderTradeTicket();
      expect(screen.getByText(/BUY/i)).toBeInTheDocument();
      expect(screen.getByText(/Market/i)).toBeInTheDocument();
    });

    it('should require book selection before submitting', async () => {
      renderTradeTicket();
      
      const submitButton = screen.getByRole('button', { name: /BUY/i });
      expect(submitButton).toBeDisabled();
    });

    it('should require positive size', async () => {
      renderTradeTicket({ defaultBookId: 'book-123' });
      
      const sizeInput = screen.getByLabelText(/Size/i);
      fireEvent.change(sizeInput, { target: { value: '0' } });
      
      const submitButton = screen.getByRole('button', { name: /BUY/i });
      expect(submitButton).toBeDisabled();
    });

    it('should require price for limit orders', async () => {
      renderTradeTicket({ defaultBookId: 'book-123' });
      
      // Switch to limit order
      const limitButton = screen.getByText(/Limit/i);
      fireEvent.click(limitButton);
      
      // Price field should be visible
      expect(screen.getByLabelText(/Price/i)).toBeInTheDocument();
    });
  });

  describe('Order Submission', () => {
    it('should submit market order successfully', async () => {
      const onClose = vi.fn();
      renderTradeTicket({ defaultBookId: 'book-123', onClose });

      // Set size
      const sizeInput = screen.getByLabelText(/Size/i);
      fireEvent.change(sizeInput, { target: { value: '0.5' } });

      // Submit - look for button with size in text
      const submitButton = screen.getByRole('button', { name: /BUY 0\.5/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should submit limit order with price', async () => {
      const onClose = vi.fn();
      renderTradeTicket({ defaultBookId: 'book-123', onClose });

      // Switch to limit order
      const limitButton = screen.getByText(/Limit/i);
      fireEvent.click(limitButton);

      // Set size and price
      const sizeInput = screen.getByLabelText(/Size/i);
      const priceInput = screen.getByLabelText(/Price/i);
      fireEvent.change(sizeInput, { target: { value: '0.5' } });
      fireEvent.change(priceInput, { target: { value: '50000' } });

      // Submit - look for button with size in text
      const submitButton = screen.getByRole('button', { name: /BUY 0\.5/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should handle sell orders', async () => {
      renderTradeTicket({ defaultBookId: 'book-123' });

      // Switch to sell
      const sellButton = screen.getAllByRole('button', { name: /SELL/i })[0];
      fireEvent.click(sellButton);

      // Set size
      const sizeInput = screen.getByLabelText(/Size/i);
      fireEvent.change(sizeInput, { target: { value: '0.5' } });

      // Submit button should show SELL with size
      expect(screen.getByRole('button', { name: /SELL 0\.5/i })).toBeInTheDocument();
    });
  });

  describe('Risk Warnings', () => {
    it('should show warning when risk exceeds limit', async () => {
      renderTradeTicket({ defaultBookId: 'book-123' });
      
      // Set large size
      const sizeInput = screen.getByLabelText(/Size/i);
      fireEvent.change(sizeInput, { target: { value: '100' } });
      
      // Risk warning should appear
      await waitFor(() => {
        expect(screen.getByText(/Exceeds risk limit/i)).toBeInTheDocument();
      });
    });
  });
});

