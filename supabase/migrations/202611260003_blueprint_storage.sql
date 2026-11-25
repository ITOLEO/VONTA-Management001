-- Permanent sources and temporary transfers share a private, size-limited bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('vonta-blueprints','vonta-blueprints',false,12582912,array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
