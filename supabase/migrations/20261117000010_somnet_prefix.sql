-- Somnet numbers (68…) pay through WAAFI on WaafiPay.
insert into public.wallet_prefixes (prefix, wallet, provider_name, is_active)
values ('68', 'WAAFI', 'Somnet', true)
on conflict (prefix) do update set wallet = excluded.wallet, provider_name = excluded.provider_name, is_active = true;
