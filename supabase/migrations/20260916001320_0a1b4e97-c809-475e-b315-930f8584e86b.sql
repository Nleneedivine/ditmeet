CREATE OR REPLACE FUNCTION public.end_meeting_if_empty(_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE active_count int;
BEGIN
  SELECT count(*) INTO active_count
  FROM public.meeting_attendees
  WHERE meeting_id = _meeting_id
    AND left_at IS NULL
    AND status = 'admitted';

  IF active_count = 0 THEN
    UPDATE public.meetings
    SET ended_at = COALESCE(ended_at, now()), status = 'ended'
    WHERE id = _meeting_id AND status <> 'ended';
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.end_meeting_if_empty(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_meeting_if_empty(uuid) TO anon, authenticated;

CREATE POLICY "Super admins update meetings"
ON public.meetings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));