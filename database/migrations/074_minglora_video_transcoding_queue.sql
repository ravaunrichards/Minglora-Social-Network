BEGIN;
CREATE TABLE IF NOT EXISTS public.video_transcode_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 asset_id uuid NOT NULL UNIQUE REFERENCES public.media_assets(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 content_type text NOT NULL CHECK(content_type IN ('post','story','group_post','page_post')),
 content_id text NOT NULL,
 source_bucket text NOT NULL CHECK(source_bucket IN ('minglora-post-media','minglora-stories','minglora-group-media','minglora-page-media')),
 source_path text NOT NULL,
 source_mime_type text NOT NULL CHECK(source_mime_type IN ('video/mp4','video/webm','video/quicktime')),
 source_byte_size bigint NOT NULL CHECK(source_byte_size BETWEEN 1 AND 524288000),
 output_bucket text NOT NULL DEFAULT 'minglora-video-renditions' CHECK(output_bucket='minglora-video-renditions'),
 output_path text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed','cancelled')),
 attempt_count smallint NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 4),
 max_attempts smallint NOT NULL DEFAULT 4 CHECK(max_attempts BETWEEN 1 AND 4),
 available_at timestamptz NOT NULL DEFAULT now(),
 lock_token uuid, locked_at timestamptz, last_error text NOT NULL DEFAULT '',
 output_byte_size bigint CHECK(output_byte_size IS NULL OR output_byte_size BETWEEN 1 AND 524288000),
 duration_ms integer CHECK(duration_ms IS NULL OR duration_ms BETWEEN 1000 AND 3600000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK(source_path LIKE owner_id::text || '/%' AND position('..' in source_path)=0),
 CHECK(output_path LIKE owner_id::text || '/' || asset_id::text || '/%')
);
CREATE INDEX IF NOT EXISTS video_transcode_jobs_ready_idx ON public.video_transcode_jobs(available_at,created_at) WHERE status='queued';
CREATE INDEX IF NOT EXISTS video_transcode_jobs_lease_idx ON public.video_transcode_jobs(locked_at) WHERE status='processing';
ALTER TABLE public.video_transcode_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_transcode_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.video_transcode_jobs TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('minglora-video-renditions','minglora-video-renditions',false,524288000,ARRAY['video/mp4'])
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enqueue_minglora_video_transcode(p_asset_id uuid,p_owner_id uuid,p_content_type text,p_content_id text)
RETURNS public.video_transcode_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.media_assets%ROWTYPE; result public.video_transcode_jobs%ROWTYPE;
BEGIN
 IF p_content_type NOT IN ('post','story','group_post','page_post') OR coalesce(length(trim(p_content_id)),0) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Invalid video content reference'; END IF;
 SELECT * INTO source FROM public.media_assets WHERE id=p_asset_id AND owner_id=p_owner_id FOR SHARE;
 IF NOT FOUND OR source.media_type<>'video' OR source.processing_status='deleted'
  OR source.storage_bucket NOT IN ('minglora-post-media','minglora-stories','minglora-group-media','minglora-page-media')
  OR source.storage_key NOT LIKE p_owner_id::text || '/%' OR position('..' in source.storage_key)>0
  OR source.mime_type NOT IN ('video/mp4','video/webm','video/quicktime') OR source.byte_size NOT BETWEEN 1 AND 524288000
 THEN RAISE EXCEPTION 'Video source is not eligible for processing'; END IF;
 INSERT INTO public.video_transcode_jobs(asset_id,owner_id,content_type,content_id,source_bucket,source_path,source_mime_type,source_byte_size,output_path)
 VALUES(p_asset_id,p_owner_id,p_content_type,p_content_id,source.storage_bucket,source.storage_key,source.mime_type,source.byte_size,
        p_owner_id::text || '/' || p_asset_id::text || '/720p.mp4')
 ON CONFLICT(asset_id) DO UPDATE SET content_type=EXCLUDED.content_type,content_id=EXCLUDED.content_id,status='queued',
  attempt_count=0,available_at=now(),lock_token=NULL,locked_at=NULL,last_error='',updated_at=now()
 WHERE public.video_transcode_jobs.status='failed' RETURNING * INTO result;
 IF NOT FOUND THEN SELECT * INTO result FROM public.video_transcode_jobs WHERE asset_id=p_asset_id; END IF;
 IF result.status NOT IN ('ready','cancelled') THEN
  UPDATE public.media_assets SET processing_status=CASE WHEN result.status='processing' THEN 'processing' WHEN result.status='failed' THEN 'failed' ELSE 'pending' END WHERE id=p_asset_id;
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.claim_minglora_video_transcode()
RETURNS SETOF public.video_transcode_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.video_transcode_jobs SET status='failed',lock_token=NULL,locked_at=NULL,last_error='Worker lease expired after the final attempt',updated_at=now()
 WHERE status='processing' AND locked_at<now()-interval '30 minutes' AND attempt_count>=max_attempts;
 UPDATE public.media_assets ma SET processing_status='failed' FROM public.video_transcode_jobs j
 WHERE j.asset_id=ma.id AND j.status='failed' AND j.last_error='Worker lease expired after the final attempt' AND ma.processing_status='processing';
 RETURN QUERY
 WITH candidate AS (
  SELECT id FROM public.video_transcode_jobs WHERE (status='queued' AND available_at<=now())
   OR (status='processing' AND locked_at<now()-interval '30 minutes' AND attempt_count<max_attempts)
  ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
 ), claimed AS (
  UPDATE public.video_transcode_jobs j SET status='processing',attempt_count=j.attempt_count+1,lock_token=gen_random_uuid(),locked_at=now(),last_error='',updated_at=now()
  FROM candidate c WHERE j.id=c.id RETURNING j.*
 ), update_asset AS (
  UPDATE public.media_assets ma SET processing_status='processing' FROM claimed c WHERE ma.id=c.asset_id RETURNING ma.id
 )
 SELECT claimed.* FROM claimed;
END $$;

CREATE OR REPLACE FUNCTION public.complete_minglora_video_transcode(p_job_id uuid,p_lock_token uuid,p_output_byte_size bigint,p_duration_ms integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE asset_id uuid;
BEGIN
 IF p_output_byte_size NOT BETWEEN 1 AND 524288000 OR p_duration_ms NOT BETWEEN 1000 AND 3600000 THEN RAISE EXCEPTION 'Invalid video output metadata'; END IF;
 UPDATE public.video_transcode_jobs SET status='ready',output_byte_size=p_output_byte_size,duration_ms=p_duration_ms,lock_token=NULL,locked_at=NULL,last_error='',completed_at=now(),updated_at=now()
 WHERE id=p_job_id AND status='processing' AND lock_token=p_lock_token RETURNING video_transcode_jobs.asset_id INTO asset_id;
 IF asset_id IS NULL THEN RAISE EXCEPTION 'Video job lease is no longer valid'; END IF;
 UPDATE public.media_assets SET processing_status='ready',duration_ms=p_duration_ms WHERE id=asset_id;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fail_minglora_video_transcode(p_job_id uuid,p_lock_token uuid,p_error text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE failed_job public.video_transcode_jobs%ROWTYPE;
BEGIN
 UPDATE public.video_transcode_jobs SET status=CASE WHEN attempt_count>=max_attempts THEN 'failed' ELSE 'queued' END,
  available_at=now()+make_interval(secs=>LEAST(3600,30*power(2::numeric,GREATEST(attempt_count-1,0))::integer)),
  lock_token=NULL,locked_at=NULL,last_error=left(coalesce(p_error,'Video processing failed'),500),updated_at=now()
 WHERE id=p_job_id AND status='processing' AND lock_token=p_lock_token RETURNING * INTO failed_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'Video job lease is no longer valid'; END IF;
 UPDATE public.media_assets SET processing_status=CASE WHEN failed_job.status='failed' THEN 'failed' ELSE 'pending' END WHERE id=failed_job.asset_id;
 RETURN failed_job.status;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_minglora_video_transcode(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_minglora_video_transcode() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_minglora_video_transcode(uuid,uuid,bigint,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_minglora_video_transcode(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_minglora_video_transcode(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_minglora_video_transcode() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_minglora_video_transcode(uuid,uuid,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_minglora_video_transcode(uuid,uuid,text) TO service_role;
COMMIT;
