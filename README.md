# TripSplit

A free, two-person Splitwise-style app for tracking who owes whom while travelling.

- Add expenses in any major currency. Each one is converted to AUD at that day's rate (ECB rates from [Frankfurter](https://frankfurter.dev)), and you can edit the rate to match your card.
- Splits: 50/50, "paid for the other in full", custom amounts, or custom percentages.
- Expenses are grouped by trip, with categories and per-category totals.
- **Mark as settled** zeroes the balance. You can also record partial payments. The money itself moves outside the app.
- Works offline. Changes sync between both phones once you're back online.
- Installs to your home screen as an app. It costs nothing to run: Vercel's free Hobby plan and the Supabase free tier.

## Try it locally

```bash
npm install
npm run dev
```

Without a `.env` file the app runs in **local mode**: data stays in this browser, and you can switch between "You" and "Partner" in Settings to try both sides.

```bash
npm test        # unit tests for money/split/balance logic
```

## One-time setup (about 10 minutes)

### 1. Supabase (database + login)

1. Create a free account at <https://supabase.com>, then create a **New project**. Use the Sydney region and any database password.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Under **Authentication → Sign In / Providers → Email**, turn **off** "Confirm email" and save. The app signs in with email + password, and with confirmation off Supabase never needs to send an email, so there's no email setup.
4. Under **Project Settings → API**, copy the **Project URL** and the **anon / publishable key**.

### 2. Vercel (hosting)

1. Push this folder to a GitHub repository (it can be private).
2. Sign up at <https://vercel.com> with **Continue with GitHub**, then choose **Add New → Project** and import the repo. Vercel detects Vite automatically. Don't add the optional Supabase integration; it would create a second database.
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`: the Project URL, without `/rest/v1/`
   - `VITE_SUPABASE_ANON_KEY`: the anon/publishable key. This key is meant to be public: the database's row-level security only allows the two members to read or write data.
4. Click **Deploy**. Then go to **Settings → Deployment Protection** and set **Vercel Authentication** to **Disabled**, otherwise only your Vercel account can open the app.
5. Pushes to `main` redeploy automatically. GitHub Actions also runs the tests on every push.

### 3. Both of you sign in

1. Open the URL on your phone. In Safari, choose **Share → Add to Home Screen**. In Chrome, choose **Install app**.
2. Open it from the home screen, tap **Create account**, and enter your name, email and a password. The app stays signed in after that.
3. Your partner does the same on their phone. **The first two people to sign in become the members, and nobody else can join.**
4. Optional: afterwards, turn off **Authentication → Sign In / Providers → Allow new users to sign up** in Supabase.

## Good to know

- **Supabase pauses free projects after about a week with no activity.** Nothing is lost. If the app shows "Sync error" after a quiet spell, log in to supabase.com and click **Restore project**. Open the app a few days before each trip.
- **Offline:** expenses save on your phone right away. If you're offline when adding a foreign-currency expense, the last known rate is used and marked "rate pending". It's replaced with the correct rate for that date once you're back online. If you've never fetched a rate for that currency, you'll be asked to enter one.
- **Both phones edit the same expense:** the most recent edit wins.
- **Settings → Export CSV** downloads everything.
- Amounts are stored as whole minor units (yen, cents), so there are no rounding surprises. When a split doesn't divide evenly, the person who paid absorbs the extra cent.
