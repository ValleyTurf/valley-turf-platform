-- Google Routes API responses are driven for free -- no billing, no
-- quota increase -- and the default quota for that is a flat 100
-- requests/day for the whole project. My Day calls Google fresh on
-- every single page load (it's a force-dynamic page with no caching),
-- so just a handful of people checking it a few times each over a day
-- was enough to blow through that cap and fall back to straight-line
-- distances for everyone, all day, once it was hit.
--
-- This is a persistent cache keyed on the exact set of stops being
-- routed (see cacheKeyFor() in lib/googleRoutes.ts) -- not tied to a
-- particular date, since a fixed driving route between two fixed
-- points (TRAFFIC_UNAWARE mode) doesn't meaningfully change day to
-- day. Repeated page loads of the same day become free after the
-- first; recurring customers/home-base legs stay cheap across
-- different days too.
create table if not exists route_cache (
  cache_key text primary key,
  -- The actual waypoints this entry is for, kept only for debugging --
  -- never read back by the app itself.
  stops jsonb not null,
  -- null means the last attempt to reach Google failed (quota, network,
  -- bad response, etc) -- cached briefly too, so a quota outage doesn't
  -- mean every single page load keeps hammering Google in the meantime.
  legs jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists route_cache_fetched_at_idx
  on route_cache (fetched_at);
