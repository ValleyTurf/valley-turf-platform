-- #1: point all existing campaigns at the homepage.
-- Run this once in the Supabase SQL editor.

update campaigns
set destination = 'https://valleyturfrevival.com'
where destination is distinct from 'https://valleyturfrevival.com';
