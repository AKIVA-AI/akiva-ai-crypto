/**
 * Shared input validation utilities for Edge Functions
 * 
 * This module provides:
 * - Schema validation patterns
 * - Common validators
 * - Input sanitization
 */

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

// UUID pattern for IDs
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Instrument format: BASE-QUOTE (e.g., BTC-USDT, ETH-USDC)
const INSTRUMENT_PATTERN = /^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}$/;

// Wallet address patterns by network
const WALLET_PATTERNS = {
  ethereum: /^0x[a-fA-F0-9]{40}$/,
  bitcoin: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

// ============================================================================
// VALIDATION RESULT TYPE
// ============================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

// ============================================================================
// CORE VALIDATORS
// ============================================================================

/**
 * Validates a UUID string
 */
export function validateUUID(value: unknown, fieldName: string): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, errors: [`${fieldName} must be a string`] };
  }
  if (!UUID_PATTERN.test(value)) {
    return { success: false, errors: [`${fieldName} must be a valid UUID`] };
  }
  return { success: true, data: value };
}

/**
 * Validates an instrument format (e.g., BTC-USDT)
 */
export function validateInstrument(value: unknown, fieldName = 'instrument'): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, errors: [`${fieldName} must be a string`] };
  }
  const upper = value.toUpperCase().trim();
  if (!INSTRUMENT_PATTERN.test(upper)) {
    return { success: false, errors: [`${fieldName} must match format BASE-QUOTE (e.g., BTC-USDT)`] };
  }
  return { success: true, data: upper };
}

/**
 * Validates an array of instruments with size limit
 */
export function validateInstrumentsArray(
  value: unknown, 
  fieldName = 'instruments',
  maxLength = 50
): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { success: false, errors: [`${fieldName} must be an array`] };
  }
  if (value.length > maxLength) {
    return { success: false, errors: [`${fieldName} exceeds maximum length of ${maxLength}`] };
  }
  if (value.length === 0) {
    return { success: false, errors: [`${fieldName} must not be empty`] };
  }
  
  const validated: string[] = [];
  const errors: string[] = [];
  
  for (let i = 0; i < value.length; i++) {
    const result = validateInstrument(value[i], `${fieldName}[${i}]`);
    if (result.success && result.data) {
      validated.push(result.data);
    } else if (result.errors) {
      errors.push(...result.errors);
    }
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: validated };
}

/**
 * Validates order side (buy or sell)
 */
export function validateOrderSide(value: unknown, fieldName = 'side'): ValidationResult<'buy' | 'sell'> {
  if (typeof value !== 'string') {
    return { success: false, errors: [`${fieldName} must be a string`] };
  }
  const lower = value.toLowerCase().trim();
  if (lower !== 'buy' && lower !== 'sell') {
    return { success: false, errors: [`${fieldName} must be 'buy' or 'sell'`] };
  }
  return { success: true, data: lower as 'buy' | 'sell' };
}

/**
 * Validates a positive number with optional bounds
 */
export function validatePositiveNumber(
  value: unknown, 
  fieldName: string,
  options: { min?: number; max?: number } = {}
): ValidationResult<number> {
  if (typeof value !== 'number' || isNaN(value)) {
    return { success: false, errors: [`${fieldName} must be a number`] };
  }
  if (value <= 0) {
    return { success: false, errors: [`${fieldName} must be positive`] };
  }
  if (options.min !== undefined && value < options.min) {
    return { success: false, errors: [`${fieldName} must be at least ${options.min}`] };
  }
  if (options.max !== undefined && value > options.max) {
    return { success: false, errors: [`${fieldName} must be at most ${options.max}`] };
  }
  return { success: true, data: value };
}

/**
 * Validates a number (can be zero or negative)
 */
export function validateNumber(
  value: unknown, 
  fieldName: string,
  options: { min?: number; max?: number } = {}
): ValidationResult<number> {
  if (typeof value !== 'number' || isNaN(value)) {
    return { success: false, errors: [`${fieldName} must be a number`] };
  }
  if (options.min !== undefined && value < options.min) {
    return { success: false, errors: [`${fieldName} must be at least ${options.min}`] };
  }
  if (options.max !== undefined && value > options.max) {
    return { success: false, errors: [`${fieldName} must be at most ${options.max}`] };
  }
  return { success: true, data: value };
}

/**
 * Validates a string with length constraints
 */
export function validateString(
  value: unknown, 
  fieldName: string,
  options: { minLength?: number; maxLength?: number; pattern?: RegExp } = {}
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, errors: [`${fieldName} must be a string`] };
  }
  const trimmed = value.trim();
  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    return { success: false, errors: [`${fieldName} must be at least ${options.minLength} characters`] };
  }
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    return { success: false, errors: [`${fieldName} must be at most ${options.maxLength} characters`] };
  }
  if (options.pattern && !options.pattern.test(trimmed)) {
    return { success: false, errors: [`${fieldName} format is invalid`] };
  }
  return { success: true, data: trimmed };
}

/**
 * Validates a wallet address for a given network
 */
export function validateWalletAddress(
  value: unknown, 
  network: 'ethereum' | 'bitcoin' | 'solana' = 'ethereum',
  fieldName = 'wallet_address'
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, errors: [`${fieldName} must be a string`] };
  }
  const trimmed = value.trim();
  const pattern = WALLET_PATTERNS[network];
  if (pattern && !pattern.test(trimmed)) {
    return { success: false, errors: [`${fieldName} is not a valid ${network} address`] };
  }
  return { success: true, data: trimmed.toLowerCase() };
}

/**
 * Validates an enum value against allowed values
 */
export function validateEnum<T extends string>(
  value: unknown, 
  allowedValues: readonly T[],
  fieldName: string
): ValidationResult<T> {
  if (typeof value !== 'string') {
    return { success: false, errors: [`${fieldName} must be a string`] };
  }
  const lower = value.toLowerCase().trim() as T;
  if (!allowedValues.includes(lower)) {
    return { success: false, errors: [`${fieldName} must be one of: ${allowedValues.join(', ')}`] };
  }
  return { success: true, data: lower };
}

/**
 * Validates a timeframe string
 */
export function validateTimeframe(value: unknown, fieldName = 'timeframe'): ValidationResult<string> {
  const allowedTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '24h', '7d', '30d'] as const;
  if (typeof value !== 'string') {
    return { success: false, errors: [`${fieldName} must be a string`] };
  }
  const lower = value.toLowerCase().trim();
  if (!allowedTimeframes.includes(lower as typeof allowedTimeframes[number])) {
    return { success: false, errors: [`${fieldName} must be one of: ${allowedTimeframes.join(', ')}`] };
  }
  return { success: true, data: lower };
}

// ============================================================================
// SANITIZATION
// ============================================================================

/**
 * Sanitize a label/text to prevent XSS and SQL injection
 * Removes potentially dangerous characters while preserving readability
 */
export function sanitizeLabel(value: string, maxLength = 100): string {
  return value
    .replace(/[<>'";&|`$\\]/g, '') // Remove dangerous chars
    .replace(/\s+/g, ' ')          // Normalize whitespace
    .trim()
    .slice(0, maxLength);
}

/**
 * Create a validation error response
 */
export function validationErrorResponse(
  errors: string[], 
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: 'Validation failed',
      validation_errors: errors 
    }),
    { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

// ============================================================================
// PLACE ORDER VALIDATION
// ============================================================================

export interface PlaceOrderInput {
  book_id: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  order_type?: string;
  strategy_id?: string;
  venue_id?: string;
}

export function validatePlaceOrderInput(body: Record<string, unknown>): ValidationResult<PlaceOrderInput> {
  const errors: string[] = [];
  
  // Required fields
  const bookIdResult = validateUUID(body.book_id, 'book_id');
  if (!bookIdResult.success) errors.push(...(bookIdResult.errors || []));
  
  const instrumentResult = validateInstrument(body.instrument);
  if (!instrumentResult.success) errors.push(...(instrumentResult.errors || []));
  
  const sideResult = validateOrderSide(body.side);
  if (!sideResult.success) errors.push(...(sideResult.errors || []));
  
  const sizeResult = validatePositiveNumber(body.size, 'size', { min: 0.00000001, max: 100000000 });
  if (!sizeResult.success) errors.push(...(sizeResult.errors || []));
  
  // Optional fields
  let price: number | undefined;
  if (body.price !== undefined && body.price !== null) {
    const priceResult = validatePositiveNumber(body.price, 'price', { min: 0.00000001 });
    if (!priceResult.success) errors.push(...(priceResult.errors || []));
    else price = priceResult.data;
  }
  
  let strategyId: string | undefined;
  if (body.strategy_id !== undefined && body.strategy_id !== null) {
    const result = validateUUID(body.strategy_id, 'strategy_id');
    if (!result.success) errors.push(...(result.errors || []));
    else strategyId = result.data;
  }
  
  let venueId: string | undefined;
  if (body.venue_id !== undefined && body.venue_id !== null) {
    const result = validateUUID(body.venue_id, 'venue_id');
    if (!result.success) errors.push(...(result.errors || []));
    else venueId = result.data;
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return {
    success: true,
    data: {
      book_id: bookIdResult.data!,
      instrument: instrumentResult.data!,
      side: sideResult.data!,
      size: sizeResult.data!,
      price,
      order_type: typeof body.order_type === 'string' ? body.order_type.toLowerCase() : 'market',
      strategy_id: strategyId,
      venue_id: venueId,
    }
  };
}

// ============================================================================
// WHALE ALERT VALIDATION
// ============================================================================

export interface WhaleAlertInput {
  action: string;
  wallet_address?: string;
  label?: string;
  network?: 'ethereum' | 'bitcoin' | 'solana';
  category?: string;
  instrument?: string;
  instruments?: string[];
  limit?: number;
  min_usd?: number;
}

const WHALE_ACTIONS = [
  'track_wallet', 'untrack_wallet', 'get_transactions', 'get_wallets', 
  'simulate_whale_activity', 'fetch_real_alerts', 'generate_signals', 'health_check'
] as const;

const WHALE_CATEGORIES = ['exchange', 'defi', 'institution', 'unknown'] as const;

export function validateWhaleAlertInput(body: Record<string, unknown>): ValidationResult<WhaleAlertInput> {
  const errors: string[] = [];
  
  // Validate action
  const actionResult = validateEnum(body.action, WHALE_ACTIONS, 'action');
  if (!actionResult.success) {
    return { success: false, errors: actionResult.errors };
  }
  
  const action = actionResult.data!;
  const result: WhaleAlertInput = { action };
  
  // Validate based on action
  if (action === 'track_wallet' || action === 'untrack_wallet') {
    if (!body.wallet_address) {
      errors.push('wallet_address is required for this action');
    } else {
      const network = (body.network as 'ethereum' | 'bitcoin' | 'solana') || 'ethereum';
      const walletResult = validateWalletAddress(body.wallet_address, network);
      if (!walletResult.success) errors.push(...(walletResult.errors || []));
      else result.wallet_address = walletResult.data;
    }
  }
  
  // Validate optional fields
  if (body.label !== undefined) {
    const labelResult = validateString(body.label, 'label', { maxLength: 100 });
    if (!labelResult.success) errors.push(...(labelResult.errors || []));
    else result.label = sanitizeLabel(labelResult.data!, 100);
  }
  
  if (body.network !== undefined) {
    const networkResult = validateEnum(body.network, ['ethereum', 'bitcoin', 'solana'] as const, 'network');
    if (!networkResult.success) errors.push(...(networkResult.errors || []));
    else result.network = networkResult.data;
  }
  
  if (body.category !== undefined) {
    const categoryResult = validateEnum(body.category, WHALE_CATEGORIES, 'category');
    if (!categoryResult.success) errors.push(...(categoryResult.errors || []));
    else result.category = categoryResult.data;
  }
  
  if (body.instrument !== undefined) {
    const instrumentResult = validateInstrument(body.instrument);
    if (!instrumentResult.success) errors.push(...(instrumentResult.errors || []));
    else result.instrument = instrumentResult.data;
  }
  
  if (body.instruments !== undefined) {
    const instrumentsResult = validateInstrumentsArray(body.instruments);
    if (!instrumentsResult.success) errors.push(...(instrumentsResult.errors || []));
    else result.instruments = instrumentsResult.data;
  }
  
  if (body.limit !== undefined) {
    const limitResult = validatePositiveNumber(body.limit, 'limit', { min: 1, max: 500 });
    if (!limitResult.success) errors.push(...(limitResult.errors || []));
    else result.limit = limitResult.data;
  }
  
  if (body.min_usd !== undefined) {
    const minUsdResult = validatePositiveNumber(body.min_usd, 'min_usd', { min: 1, max: 1000000000 });
    if (!minUsdResult.success) errors.push(...(minUsdResult.errors || []));
    else result.min_usd = minUsdResult.data;
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: result };
}

// ============================================================================
// MARKET INTELLIGENCE VALIDATION
// ============================================================================

export interface MarketIntelligenceInput {
  action: string;
  instruments?: string[];
  timeframe?: string;
}

const MARKET_INTELLIGENCE_ACTIONS = [
  'fetch_news', 'fetch_sentiment', 'fetch_derivatives', 
  'analyze_signals', 'get_intelligence_summary', 'health_check'
] as const;

export function validateMarketIntelligenceInput(body: Record<string, unknown>): ValidationResult<MarketIntelligenceInput> {
  const errors: string[] = [];
  
  // Validate action
  const actionResult = validateEnum(body.action, MARKET_INTELLIGENCE_ACTIONS, 'action');
  if (!actionResult.success) {
    return { success: false, errors: actionResult.errors };
  }
  
  const result: MarketIntelligenceInput = { action: actionResult.data! };
  
  // Validate optional instruments array
  if (body.instruments !== undefined) {
    const instrumentsResult = validateInstrumentsArray(body.instruments, 'instruments', 20);
    if (!instrumentsResult.success) errors.push(...(instrumentsResult.errors || []));
    else result.instruments = instrumentsResult.data;
  }
  
  // Validate optional timeframe
  if (body.timeframe !== undefined) {
    const timeframeResult = validateTimeframe(body.timeframe);
    if (!timeframeResult.success) errors.push(...(timeframeResult.errors || []));
    else result.timeframe = timeframeResult.data;
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: result };
}

// ============================================================================
// EXTERNAL SIGNALS VALIDATION  
// ============================================================================

export interface ExternalSignalsInput {
  action: string;
  source?: string;
  instruments?: string[];
  config?: Record<string, unknown>;
}

const EXTERNAL_SIGNALS_ACTIONS = [
  'list_sources', 'fetch_signals', 'fetch_all', 
  'get_aggregated', 'configure_source', 'get_status', 'health_check'
] as const;

const VALID_SOURCES = ['lunarcrush', 'onchain', 'cryptocompare', 'tradingview'] as const;

export function validateExternalSignalsInput(body: Record<string, unknown>): ValidationResult<ExternalSignalsInput> {
  const errors: string[] = [];
  
  // Validate action
  const actionResult = validateEnum(body.action, EXTERNAL_SIGNALS_ACTIONS, 'action');
  if (!actionResult.success) {
    return { success: false, errors: actionResult.errors };
  }
  
  const action = actionResult.data!;
  const result: ExternalSignalsInput = { action };
  
  // Validate source if required
  if (action === 'fetch_signals' || action === 'configure_source') {
    if (!body.source) {
      errors.push('source is required for this action');
    } else {
      const sourceResult = validateEnum(body.source, VALID_SOURCES, 'source');
      if (!sourceResult.success) errors.push(...(sourceResult.errors || []));
      else result.source = sourceResult.data;
    }
  } else if (body.source !== undefined) {
    const sourceResult = validateEnum(body.source, VALID_SOURCES, 'source');
    if (!sourceResult.success) errors.push(...(sourceResult.errors || []));
    else result.source = sourceResult.data;
  }
  
  // Validate optional instruments
  if (body.instruments !== undefined) {
    const instrumentsResult = validateInstrumentsArray(body.instruments, 'instruments', 30);
    if (!instrumentsResult.success) errors.push(...(instrumentsResult.errors || []));
    else result.instruments = instrumentsResult.data;
  }
  
  // Config is allowed but should be an object
  if (body.config !== undefined) {
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      errors.push('config must be an object');
    } else {
      result.config = body.config as Record<string, unknown>;
    }
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true, data: result };
}
