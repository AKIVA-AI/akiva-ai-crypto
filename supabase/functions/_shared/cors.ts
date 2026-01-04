/**
 * CORS utilities for Supabase Edge Functions
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

/**
 * Create a CORS-enabled response
 */
export function createCorsResponse(
  body: string,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export function handleCorsOptions(): Response {
  return new Response('ok', { headers: corsHeaders });
}
