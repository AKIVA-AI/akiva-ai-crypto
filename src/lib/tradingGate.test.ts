import { describe, it, expect } from 'vitest';
import {
  checkTradingGate,
  getTradingState,
  isReducingOrder,
} from './tradingGate';
import type { TradingGateSettings, BookState, Position } from './tradingGate';

describe('Trading Gate - Critical Safety Tests', () => {
  const mockSettings: TradingGateSettings = {
    globalKillSwitch: false,
    reduceOnlyMode: false,
    paperTradingMode: false,
  };

  const mockBook: BookState = {
    id: 'test-book-id',
    status: 'active',
    capitalAllocated: 100000,
    currentExposure: 50000,
    maxDrawdownLimit: 10000,
  };

  describe('Kill Switch', () => {
    it('should block ALL trades when kill switch is active', () => {
      const settings = { ...mockSettings, globalKillSwitch: true };

      const result = checkTradingGate({
        settings,
        book: mockBook,
        orderSide: 'buy',
        orderSize: 1000,
        orderPrice: 50000,
        existingPosition: null,
        isMarketOrder: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('kill switch');
      expect(result.tradingState).toBe('halted');
    });

    it('should block trades even if trying to reduce position', () => {
      const settings = { ...mockSettings, globalKillSwitch: true };
      const existingPosition: Position = {
        instrument: 'BTC-USD',
        size: 1.0,
        side: 'buy',
      };

      const result = checkTradingGate({
        settings,
        book: mockBook,
        orderSide: 'sell', // Trying to close long position
        orderSize: 1.0,
        orderPrice: 51000,
        existingPosition,
        isMarketOrder: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('kill switch');
    });
  });

  describe('Reduce-Only Mode', () => {
    it('should allow closing trades in reduce-only mode', () => {
      const settings = { ...mockSettings, reduceOnlyMode: true };
      const existingPosition: Position = {
        instrument: 'BTC-USD',
        size: 1.0,
        side: 'buy',
      };

      const result = checkTradingGate({
        settings,
        book: mockBook,
        orderSide: 'sell', // Closing long position
        orderSize: 1.0,
        orderPrice: 51000,
        existingPosition,
        isMarketOrder: false,
      });

      expect(result.allowed).toBe(true);
    });

    it('should block new positions in reduce-only mode', () => {
      const settings = { ...mockSettings, reduceOnlyMode: true };

      const result = checkTradingGate({
        settings,
        book: mockBook,
        orderSide: 'buy',
        orderSize: 1.0,
        orderPrice: 50000,
        existingPosition: null, // No existing position
        isMarketOrder: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('reduce-only');
    });
  });

  describe('Paper Trading Mode', () => {
    it('should allow trades in paper trading mode', () => {
      const settings = { ...mockSettings, paperTradingMode: true };

      const result = checkTradingGate({
        settings,
        book: mockBook,
        orderSide: 'buy',
        orderSize: 1000,
        orderPrice: 50000,
        existingPosition: null,
        isMarketOrder: false,
      });

      // Paper trading should allow trades (they're simulated)
      expect(result.allowed).toBe(true);
    });

    it('should allow trades in normal mode', () => {
      const settings = { ...mockSettings, paperTradingMode: false };

      const result = checkTradingGate({
        settings,
        book: mockBook,
        orderSide: 'buy',
        orderSize: 1000,
        orderPrice: 50000,
        existingPosition: null,
        isMarketOrder: false,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('Trading State Priority', () => {
    it('should prioritize kill switch over reduce-only', () => {
      const settings = {
        ...mockSettings,
        globalKillSwitch: true,
        reduceOnlyMode: true,
      };

      const state = getTradingState(settings);
      expect(state).toBe('halted');
    });

    it('should return reduce-only when kill switch is off', () => {
      const settings = {
        ...mockSettings,
        globalKillSwitch: false,
        reduceOnlyMode: true,
      };

      const state = getTradingState(settings);
      expect(state).toBe('reduce_only');
    });

    it('should return normal when both are off', () => {
      const settings = {
        ...mockSettings,
        globalKillSwitch: false,
        reduceOnlyMode: false,
      };

      const state = getTradingState(settings);
      expect(state).toBe('normal');
    });
  });

  describe('Position Reduction Logic', () => {
    it('should identify reducing order correctly', () => {
      const longPosition: Position = {
        instrument: 'BTC-USD',
        size: 1.0,
        side: 'buy',
      };

      const isReducing = isReducingOrder('sell', 1.0, longPosition);
      expect(isReducing).toBe(true);
    });

    it('should identify increasing order correctly', () => {
      const longPosition: Position = {
        instrument: 'BTC-USD',
        size: 1.0,
        side: 'buy',
      };

      const isReducing = isReducingOrder('buy', 1.0, longPosition);
      expect(isReducing).toBe(false);
    });
  });
});

