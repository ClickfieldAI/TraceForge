-- 0063 — WPS-required weld parameters as ranges, not single numbers.
--
-- Real WPS documents specify these as ranges ("100-160", "10-14"), same as
-- amps_required/volts_required already were (both text columns from day
-- one). The other four "_planned" columns were numeric, which silently
-- rejected exactly this input with "Please enter a number" — reported by
-- the client entering a real WPS's Travel Speed range. Widening these to
-- text is lossless for existing numeric values (a plain number is valid
-- text too) and matches the pattern already proven correct for Amps/Volts.
alter table public.process_executions
  alter column pre_heat_temp_planned type text using pre_heat_temp_planned::text,
  alter column inter_pass_temp_planned type text using inter_pass_temp_planned::text,
  alter column post_heat_temp_planned type text using post_heat_temp_planned::text,
  alter column travel_speed_planned type text using travel_speed_planned::text,
  alter column gas_flow_rate_planned type text using gas_flow_rate_planned::text,
  alter column consumable_feed_rate_planned type text using consumable_feed_rate_planned::text;
