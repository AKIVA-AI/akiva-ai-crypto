-- Promote Christopher Canarelli to admin
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = '746515c6-c3cb-4d66-a5b5-c3139b4b98c1';