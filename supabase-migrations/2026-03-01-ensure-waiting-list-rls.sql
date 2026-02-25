-- Ensure correct RLS policies for waiting_list table
-- This migration ensures that users can see their own waiting list entries
-- and insert/delete them as needed for the feature to work correctly from the client side if not using RPCs for reads

-- Enable RLS
ALTER TABLE IF EXISTS public.waiting_list ENABLE ROW LEVEL SECURITY;

-- Policy for identifying own entries (SELECT)
DROP POLICY IF EXISTS "Users can view their own waiting list entries" ON public.waiting_list;
CREATE POLICY "Users can view their own waiting list entries"
ON public.waiting_list
FOR SELECT
TO authenticated
USING (auth.uid() = (SELECT auth_user_id FROM users WHERE id = user_id));
-- Note: The above assumes a link between auth.uid() and public.users(id). 
-- If your system uses a different mapping (e.g. users table has a uuid column matching auth.uid()), adjust accordingly.
-- Usually it is: user_id (int) -> users.id (int). users table has 'uuid' (uuid) -> auth.users.id.

-- Simplified policy assuming common Supabase pattern where user_id matches auth.uid() is tricky with integer IDs.
-- Let's use a more standard robust policy if we can rely on the users table.

-- Re-attempting the policy assuming 'users' table linking
-- (auth.uid() = (select uuid from public.users where id = waiting_list.user_id))

CREATE OR REPLACE FUNCTION public.get_user_id_by_auth_uid()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

DROP POLICY IF EXISTS "Users can view their own waiting list entries" ON public.waiting_list;
CREATE POLICY "Users can view their own waiting list entries"
ON public.waiting_list
FOR SELECT
TO authenticated
USING (user_id = public.get_user_id_by_auth_uid());

-- Allow users to delete their own entries (Leave Waiting List)
DROP POLICY IF EXISTS "Users can delete their own waiting list entries" ON public.waiting_list;
CREATE POLICY "Users can delete their own waiting list entries"
ON public.waiting_list
FOR DELETE
TO authenticated
USING (user_id = public.get_user_id_by_auth_uid());

-- Allow inserting (Join Waiting List) - though we usage RPC usually
DROP POLICY IF EXISTS "Users can insert their own waiting list entries" ON public.waiting_list;
CREATE POLICY "Users can insert their own waiting list entries"
ON public.waiting_list
FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_user_id_by_auth_uid());
