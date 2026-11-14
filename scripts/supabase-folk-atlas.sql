-- SpotFolk · Folk Atlas — supabase-folk-atlas.sql
-- The signed atlas in the passport: countries you signed (on the spot or not), countries you declare you've been to,
-- and your «I want to go» dreams. Re-runnable.
--   · atlas_marks: your declared countries (kind 'been', shown in your passport to the folk) and your dreams
--     (kind 'wish', private: only you see them). Each one edits and deletes only their own.
--   · atlas_get(p_user): declared countries of a folk; the dreams only for yourself.
--   · atlas_folk(p_groups): for your dreams, how many other folk signed places there (only a number, never who).
--   · shared_get: a shared passport also carries the declared countries and, for each stamp shown, its area
--     rounded to the degree (only to colour the country; fragile places stay out as before).

create table if not exists public.atlas_marks (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  country text not null check (country ~ '^[A-Z]{3}$'),
  kind text not null check (kind in ('been', 'wish')),
  label text check (char_length(label) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, country, kind)
);
alter table public.atlas_marks enable row level security;
grant select, insert, update, delete on public.atlas_marks to authenticated;
drop policy if exists "ognuno vede i suoi segni" on public.atlas_marks;
create policy "ognuno vede i suoi segni" on public.atlas_marks for select to authenticated using (user_id = auth.uid());
drop policy if exists "i folk segnano il loro atlante" on public.atlas_marks;
create policy "i folk segnano il loro atlante" on public.atlas_marks for insert to authenticated
  with check (user_id = auth.uid() and public.is_member()
    and (select count(*) from public.atlas_marks a where a.user_id = auth.uid()) < 400);
drop policy if exists "ognuno modifica i suoi segni" on public.atlas_marks;
create policy "ognuno modifica i suoi segni" on public.atlas_marks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ognuno toglie i suoi segni" on public.atlas_marks;
create policy "ognuno toglie i suoi segni" on public.atlas_marks for delete to authenticated using (user_id = auth.uid());

create or replace function public.atlas_get(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_member() or auth.uid() = p_user) then return null; end if;
  return jsonb_build_object(
    'been', coalesce((select jsonb_agg(a.country order by a.country) from public.atlas_marks a where a.user_id = p_user and a.kind = 'been'), '[]'::jsonb),
    'wish', case when p_user = auth.uid() then coalesce((select jsonb_agg(jsonb_build_object('country', a.country, 'label', a.label, 'at', a.created_at) order by a.created_at)
              from public.atlas_marks a where a.user_id = p_user and a.kind = 'wish'), '[]'::jsonb) end);
end $$;
revoke all on function public.atlas_get(uuid) from public;
grant execute on function public.atlas_get(uuid) to authenticated;

-- p_groups: {"JPN": [spot ids], "ISL": [...]} -> {"JPN": 12, ...} distinct other folk who signed those places
create or replace function public.atlas_folk(p_groups jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not public.is_member() or jsonb_typeof(p_groups) <> 'object' then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into r from (
    select g.key k, count(distinct ps.user_id) n
    from (select key, value from jsonb_each(p_groups) limit 60) g
    cross join lateral (select v::bigint sid from jsonb_array_elements_text(case when jsonb_typeof(g.value) = 'array' then g.value else '[]'::jsonb end) v limit 2000) i
    join public.place_signs ps on ps.spot_id = i.sid and ps.cluster <> 'fabio' and ps.user_id <> auth.uid()
    group by g.key) x;
  return r;
end $$;
revoke all on function public.atlas_folk(jsonb) from public;
grant execute on function public.atlas_folk(jsonb) to authenticated;

-- shared passport: as before, plus the declared countries and the rounded area of each stamp shown
create or replace function public.shared_get(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.shared_links; mem boolean := auth.uid() is not null and public.is_member();
  who text; pub bigint[]; out_ jsonb;
begin
  select * into l from public.shared_links where token = p_token;
  if l.token is null then return null; end if;
  select coalesce(mp.display_name, nullif(trim(coalesce(m.first_name, '') || ' ' || coalesce(left(m.last_name, 1) || '.', '')), ''))
    into who from public.members m left join public.member_profiles mp on mp.user_id = m.user_id where m.user_id = l.user_id;
  if l.kind = 'trip' then
    select jsonb_build_object('kind', 'trip', 'author', coalesce(t.author_name, who), 'trip', jsonb_build_object(
             'id', t.id, 'title', t.title, 'note', t.note, 'mode', t.mode, 'started_on', t.started_on, 'ended_on', t.ended_on,
             'stops', t.stops, 'km', t.km, 'author_name', coalesce(t.author_name, who), 'created_at', t.created_at,
             'created_by', case when mem then t.created_by end))
      into out_ from public.trips t where t.id = l.trip_id;
    return out_;
  end if;
  select coalesce(array_agg(id), '{}') into pub from public.public_spots;
  if l.kind = 'passport' then
    -- the passport its owner chose to share: counts for everyone; the stamps with name and position only where the place can be shown
    select jsonb_build_object('kind', 'passport', 'author', who,
      'avatar', (select case when coalesce(mp.visible, true) then mp.avatar_path end from public.member_profiles mp where mp.user_id = l.user_id),
      'passport', jsonb_build_object(
        'name', who, 'folks', to_jsonb(m.travel_style), 'since', m.created_at,
        'places', (select count(*) from public.spots s where s.created_by = l.user_id and s.status = 'published'),
        'by_folk', coalesce((select jsonb_object_agg(cluster, jsonb_build_object('signs', n, 'tips', tips, 'on_spot', onspot, 'areas', areas))
          from (select ps.cluster, count(*) n, count(ps.tip) tips, count(*) filter (where ps.on_spot) onspot, count(distinct (round(s.lat)::int, round(s.lon)::int)) areas
                from public.place_signs ps join public.spots s on s.id = ps.spot_id where ps.user_id = l.user_id and ps.cluster <> 'fabio' group by ps.cluster) x), '{}'::jsonb),
        'firsts', (select count(*) from public.place_signs ps where ps.user_id = l.user_id and ps.cluster <> 'fabio'
          and not exists (select 1 from public.place_signs o where o.spot_id = ps.spot_id and o.cluster <> 'fabio' and o.created_at < ps.created_at)),
        'seconded', (select count(*) from public.place_signs o join public.place_signs mine on mine.spot_id = o.spot_id and mine.user_id = l.user_id
          and o.user_id <> l.user_id and o.created_at > mine.created_at and o.cluster <> 'fabio'),
        'useful', (select count(*) from public.sign_votes v join public.place_signs ps on ps.id = v.sign_id where ps.user_id = l.user_id),
        'stamps', coalesce((select jsonb_agg(jsonb_build_object('id', case when op then s.id end, 'name', case when op then s.name end, 'cat', s.category,
              'lat', case when op then round(s.lat::numeric, 2) end, 'lon', case when op then round(s.lon::numeric, 2) end,
              'clat', round(s.lat::numeric, 0), 'clon', round(s.lon::numeric, 0),
              'folk', ps.cluster, 'on_spot', ps.on_spot, 'at', ps.created_at) order by ps.created_at desc)
            from (select * from public.place_signs where user_id = l.user_id and cluster <> 'fabio' order by created_at desc limit 500) ps
            join public.spots s on s.id = ps.spot_id
            cross join lateral (select (mem and not coalesce(s.fragile, false)) or s.id = any(pub) as op) o
            where op or not coalesce(s.fragile, false)), '[]'::jsonb),
        'been', coalesce((select jsonb_agg(a.country order by a.country) from public.atlas_marks a where a.user_id = l.user_id and a.kind = 'been'), '[]'::jsonb)))
      into out_ from public.members m where m.user_id = l.user_id;
    return out_;
  end if;
  select jsonb_build_object('kind', 'list', 'title', nullif(l.list_name, ''), 'author', who, 'items', coalesce(jsonb_agg(x order by x->>'saved_at'), '[]'))
    into out_ from (
      select jsonb_build_object('saved_at', f.created_at, 'open', op, 'zone', nullif(s.list, ''), 'category', s.category,
               'spot_id', case when op then s.id end, 'name', case when op then s.name end,
               'lat', case when op then s.lat end, 'lon', case when op then s.lon end) x
      from public.spot_favorites f join public.spots s on s.id = f.spot_id
      cross join lateral (select (mem and not coalesce(s.fragile, false)) or s.id = any(pub) as op) o
      where f.user_id = l.user_id and coalesce(f.list_name, '') = l.list_name and s.status = 'published'
        and (op or not coalesce(s.fragile, false))
      order by f.created_at limit 300) q;
  return out_;
end $$;
revoke all on function public.shared_get(uuid) from public;
grant execute on function public.shared_get(uuid) to anon, authenticated;

