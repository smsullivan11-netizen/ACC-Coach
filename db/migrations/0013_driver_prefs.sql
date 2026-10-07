-- Kept on the account instead of the browser (2026-10-07, user's choice: no cookie or browser storage
-- beyond what is strictly necessary, so no consent banner and the privacy policy stays true):
--  - quote_deck: the dashboard quotes still to come and the last one shown (lib/quotes.ts nextQuote,
--    "3.7.1~5"): every quote once before any repeats;
--  - guide_seen_at: when the driver first closed the guide (components/Tutorial.tsx); it opens by
--    itself until then.
alter table driver add column if not exists quote_deck text;
alter table driver add column if not exists guide_seen_at timestamptz;
