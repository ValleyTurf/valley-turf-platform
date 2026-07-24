-- Campaign ROI reporting: a simple editable running-total spend figure per
-- campaign (yard signs, flyer printing, ad boosts, etc.) that you update
-- as costs come in. Compared against attributed revenue to compute ROI.
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

alter table campaigns
  add column if not exists spend numeric(10, 2) not null default 0;
