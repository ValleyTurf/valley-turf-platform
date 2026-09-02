-- Native "Request a Quote" form (app/request-quote), replacing the
-- Jobber-embedded quote form as the site's public lead-capture flow. Built
-- because Jobber's own request form has a locked-in "marketing SMS"
-- consent checkbox (Jobber Settings > Requests and Bookings > Customization
-- > Advanced settings > "Marketing consent language", gated behind the
-- Marketing Suite add-on) that Twilio's A2P 10DLC review rejects for a
-- non-marketing (transactional-only) campaign: reviewer note was "use case
-- is non-marketing but on opt-in form there is marketing and non-marketing
-- both consent... remove marketing consent from the opt-in form." Since
-- that checkbox can't be removed from Jobber's form, this app now owns the
-- form directly, with only transactional SMS disclosure on it.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

-- Same range-preset pattern as customers.turf_size_range (see
-- 026_add_visit_notes_and_turf_range.sql / TurfSizeField.tsx) — a
-- prospective customer picks an approximate range, not an exact
-- measurement, since nobody's measured their yard yet at quote-request
-- time. Optional field.
alter table leads
  add column if not exists turf_size_range text;

-- Storage paths (not full URLs) for photos a prospect attaches to their
-- quote request, resolved to a public URL when rendered — same pattern as
-- visit_notes.photo_paths.
alter table leads
  add column if not exists photo_paths text[] not null default '{}';

-- Public-read bucket for lead-submitted photos, same reasoning as
-- visit-photos in 026_add_visit_notes_and_turf_range.sql: nothing
-- sensitive (yard/turf photos), paths are random UUIDs, all writes go
-- through supabaseServer (service-role, bypasses RLS), so the only policy
-- needed is public SELECT.
insert into storage.buckets (id, name, public)
values ('lead-photos', 'lead-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to lead photos" on storage.objects;

create policy "Public read access to lead photos"
  on storage.objects for select
  using (bucket_id = 'lead-photos');
