# TripSplit

A free, two-person Splitwise-style app for tracking who owes whom while travelling.

- Add expenses in any major currency. Each one is converted to AUD at that day's rate (ECB rates from [Frankfurter](https://frankfurter.dev)), and you can edit the rate to match your card.
- Splits: 50/50, "paid for the other in full", custom amounts, or custom percentages.
- Expenses are grouped by trip, with categories and per-category totals.
- **Mark as settled** zeroes the balance. You can also record partial payments. The money itself moves outside the app.
- Works offline. Changes sync between both phones once you're back online.
- Installs to your home screen as an app. It costs nothing to run: GitHub Pages and the Supabase free tier.

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
3. Under **Authentication → Emails → Templates → Magic Link**, make sure the body includes the 6-digit code, e.g.:
   ```html
   <h2>Your TripSplit code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
   The app signs in with a code instead of a link. On iPhone, a link from Mail would open in Safari, which doesn't share logins with the home-screen app.
4. Under **Project Settings → API**, copy the **Project URL** and the **anon / publishable key**.

### 2. GitHub Pages (hosting)

1. Create a new **public** GitHub repository and push this folder to it. (Free GitHub accounts can only host Pages from public repos. That is fine: the repo holds only code, and your data lives in Supabase behind your login.)
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`: the Project URL
   - `VITE_SUPABASE_ANON_KEY`: the anon/publishable key. This key is meant to be public: the database's row-level security only allows the two members to read or write data.
4. Go to **Actions → Deploy to GitHub Pages → Run workflow**. Pushes to `main` also deploy. The app will be at `https://<your-username>.github.io/<repo-name>/`.

### 3. Both of you sign in

1. Open the URL on your phone. In Safari, choose **Share → Add to Home Screen**. In Chrome, choose **Install app**.
2. Open it from the home screen, then enter your name and email, then the code you receive.
3. Your partner does the same on their phone. **The first two people to sign in become the members, and nobody else can join.**
4. Optional: afterwards, turn off **Authentication → Sign In / Providers → Allow new users to sign up** in Supabase.

## Good to know

- **Supabase pauses free projects after about a week with no activity.** Nothing is lost. If the app shows "Sync error" after a quiet spell, log in to supabase.com and click **Restore project**. Open the app a few days before each trip.
- **Offline:** expenses save on your phone right away. If you're offline when adding a foreign-currency expense, the last known rate is used and marked "rate pending". It's replaced with the correct rate for that date once you're back online. If you've never fetched a rate for that currency, you'll be asked to enter one.
- **Both phones edit the same expense:** the most recent edit wins.
- **Settings → Export CSV** downloads everything.
- Amounts are stored as whole minor units (yen, cents), so there are no rounding surprises. When a split doesn't divide evenly, the person who paid absorbs the extra cent.
