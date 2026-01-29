-- ================================================
-- FIX: ORDERS BOOK ISOLATION
-- Implement book-level access control for orders
-- ================================================

-- 1. Create user_book_assignments table to map users to books
CREATE TABLE IF NOT EXISTS public.user_book_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'admin')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (user_id, book_id)
);

-- 2. Enable RLS on the new table
ALTER TABLE public.user_book_assignments ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies for user_book_assignments
-- Only admins and CIO can manage book assignments
CREATE POLICY "Admin and CIO can manage book assignments"
ON public.user_book_assignments
FOR ALL
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'cio'::public.app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'cio'::public.app_role]));

-- Users can view their own assignments
CREATE POLICY "Users can view their own book assignments"
ON public.user_book_assignments
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role manages book assignments"
ON public.user_book_assignments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Create security definer function to check book access
CREATE OR REPLACE FUNCTION public.has_book_access(_user_id uuid, _book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_book_assignments
    WHERE user_id = _user_id
      AND book_id = _book_id
  )
$$;

-- 5. Create helper function to check if user has any book access (for admin/CIO who see all)
CREATE OR REPLACE FUNCTION public.can_view_order(_user_id uuid, _book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Admins and CIO can view all orders regardless of book assignment
    public.has_any_role(_user_id, ARRAY['admin'::public.app_role, 'cio'::public.app_role])
    OR
    -- Ops can only view orders for books they're assigned to
    (
      public.has_role(_user_id, 'ops'::public.app_role)
      AND public.has_book_access(_user_id, _book_id)
    )
$$;

-- 6. Drop existing orders policy and create new book-scoped policy
DROP POLICY IF EXISTS "Orders viewable by admin CIO and ops" ON public.orders;

CREATE POLICY "Orders viewable with book-level access"
ON public.orders
FOR SELECT
TO authenticated
USING (public.can_view_order(auth.uid(), book_id));

-- 7. Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_book_assignments_user_id ON public.user_book_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_book_assignments_book_id ON public.user_book_assignments(book_id);
CREATE INDEX IF NOT EXISTS idx_user_book_assignments_user_book ON public.user_book_assignments(user_id, book_id);

-- 8. Backfill: Assign all ops users to all existing books
-- This ensures no existing ops workflows break
INSERT INTO public.user_book_assignments (user_id, book_id, access_level)
SELECT 
  ut.user_id,
  b.id as book_id,
  'read' as access_level
FROM public.user_tenants ut
CROSS JOIN public.books b
WHERE ut.role = 'ops'::public.app_role
ON CONFLICT (user_id, book_id) DO NOTHING;

-- 9. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_book_assignments TO authenticated;
GRANT ALL ON public.user_book_assignments TO service_role;