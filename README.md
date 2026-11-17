# Botan E-commerce

Dukaan online ah oo Soomaaliyeed + nidaam maamul (admin) + POS khasnaji, oo ku shaqeeya **Supabase** iyo lacag-bixinta **WaafiPay** (EVC Plus, ZAAD, SAHAL, WAAFI, Jeeb*, eDahab*).

> *Jeeb iyo eDahab waxay shaqeynayaan oo keliya haddii WaafiPay uu ka furo account-kaaga merchant.

## Waxa uu qabto

| Qayb | Astaamaha |
|---|---|
| **Dukaanka** | Alaab ka timaada database, raadin, shaandheyn, variants (size/midab) oo waajib ah, cart aan lumin (localStorage), wishlist, xisaab (account) iyo taariikhda dalabyada, Soomaali/English |
| **Checkout** | Foom la hubiyo (+252), qiimaha server-ka ayaa xisaabiya, wallet-ka waxaa laga aqoonsadaa lambarka, codsiga PIN-ka waxaa loo diraa taleefanka macmiilka, xaaladda lacagta si toos ah (realtime) ayay u cusboonaataa, dib-u-isku-day iyadoon dalab cusub la abuurin |
| **Admin** | Dashboard dhab ah (dakhli, dalabyo, wallets, alaab yaraatay), dalabyo, alaab + sawirro, qaybo, macaamiil, lacag-bixinno + celin (reversal), settings, audit log |
| **Isticmaalayaasha** | Abuur shaqaale, sii ogolaansho mid-mid ah (12 nooc), presets (Khasnaji, Maamule…), xir/fur akoon, beddel furaha sirta |
| **POS / Khasnaji** | Iib degdeg ah, abuur macmiil, qiimo-dhimis, badhamada **Kaydi**, **Kaydi & Daabac**, **Jooji** → nidaamku wuxuu hubiyaa lambarka oo codsiga u diraa EVC/ZAAD/Jeeb…, rasiid 80mm/A4, lacag caddaan ah |

## Qaab-dhismeedka

```
React (Vite) ──► Supabase Postgres (RLS + RPC: create_order, cancel_order, dashboard_stats…)
     │
     └──► Edge Functions ──► waafi-pay   ──► WaafiPay API (API_PURCHASE / API_REVERSAL)
                         └─► admin-users ──► Supabase Auth Admin
```

- **Amniga:** qiimaha dalabka waxaa xisaabiya database-ka (`create_order`). Furayaasha WaafiPay waxay ku jiraan Supabase secrets oo keliya, mana gaaraan browser-ka. Shax kasta waxaa ilaaliya RLS. `mark_order_paid` waxaa wici kara oo keliya edge function-ka (service role).
- **Doorarka:** `owner` → `admin` → `staff` (ogolaansho gaar ah) → `customer`.

## Rakibaadda (local)

```bash
npm install
cp .env.example .env          # geli VITE_SUPABASE_URL iyo VITE_SUPABASE_ANON_KEY
npm run dev
```

## Deploy Supabase (hal mar)

1. Ku samee project cusub [supabase.com](https://supabase.com).
2. Rakib Supabase CLI, kadib:

```bash
export SUPABASE_PROJECT_REF=xxxxxxxxxxxx         # Project Settings → General
export WAAFI_MERCHANT_UID=...                    # WaafiPay
export WAAFI_API_USER_ID=...
export WAAFI_API_KEY=...
export WAAFI_ENV=sandbox                         # production marka aad diyaar tahay
export WAAFI_MODE=live                           # "mock" = tijaabo bilaa lacag
./scripts/deploy-supabase.sh --seed
```

3. **Samee owner-ka:** isdiiwaangeli bogga `/auth`, kadib ku orod SQL Editor:

```sql
update public.profiles set role = 'owner' where email = 'adiga@email.com';
```

4. Gal `/admin`. Kadib:
   - Ka abuur khasnajiyada **Users**.
   - Ka hubi **prefix-yada wallet-ka** **Settings** (61/77 → EVC Plus, 63 → ZAAD, 90 → SAHAL, iwm.).

5. **Frontend:** `npm run build` → `dist/` u dir hosting-kaaga (Coolify, Vercel, Netlify…). Ku dar labada `VITE_*` env vars. SPA-ga u habee in dhammaan dariiqyadu (routes) ay u leexdaan `index.html`.

## Tijaabooyinka

```bash
npm test                 # unit tests (cart, POS ticket, wallet, WaafiPay logic…)
npx tsc -p tsconfig.app.json --noEmit
npm run lint
PGHOST=localhost PGUSER=postgres scripts/test-db.sh   # DB/RLS integration tests
```

**Mock mode** (`WAAFI_MODE=mock`) wuxuu kuu oggolaanayaa inaad tijaabiso adigoon lacag dhab ah isticmaalin:
- Lambar ku dhammaada `0000` → waa la diidayaa.
- Lambar ku dhammaada `9999` → wakhtigiisa ayuu dhaafayaa (timeout).
- Lambar kale → waa la ansixinayaa.

Faahfaahinta lacag-bixinta: [docs/PAYMENTS.md](docs/PAYMENTS.md).

---

## English summary

Somali e-commerce storefront + admin back-office + cashier POS on Supabase (Postgres/RLS, Auth, Edge Functions, Realtime, Storage) with WaafiPay mobile-wallet payments.

- Server-side pricing via the `create_order` RPC.
- Payment requests are sent only from the `waafi-pay` edge function. Credentials live in Supabase secrets.
- Granular per-user permissions are managed through the `admin-users` edge function.
- The POS has **Save**, **Save & Print** and **Cancel**. Save and Save & Print detect the payer's wallet from the phone prefix (admin-editable table) and push a PIN prompt to the payer's phone.
- See "Deploy Supabase" above for setup; `scripts/test-db.sh` runs the database integration tests.
