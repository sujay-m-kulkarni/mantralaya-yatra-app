# Sign-in setup: Microsoft Entra External ID

Volunteers sign in with their email and a one-time code; there are no passwords. This is done once, after the Azure resources exist ([azure-setup.md](azure-setup.md)). Commands are for PowerShell, from the repository folder, one line at a time.

How it fits together:

| Piece | Where it lives | Set by |
|---|---|---|
| External tenant (the volunteers' accounts) | A new, separate Entra tenant, free for small numbers of users | You, in the portal (step 1) |
| API registration `mantralaya-yatra-api` (scope `access_as_user`, email in access tokens) | External tenant | `infra\entra-setup.ps1` |
| App registration `mantralaya-yatra-app` (redirect `app.mantralayayatra://auth`) | External tenant | `infra\entra-setup.ps1` |
| Sign-up/sign-in user flow with email one-time passcode | External tenant | You, in the portal (step 3) |
| The app's sign-in settings | `ui\app.config.json` → built into every APK | `infra\entra-setup.ps1` |
| The API's token settings (`Auth__Authority`, `Auth__Audience`) | Azure web app settings | You, one command (step 4) |

## 1. Create the external tenant (portal)

1. Azure portal, signed in with the account that has your subscription: search **Microsoft Entra External ID**, then **Overview › Create a tenant** (or **Manage tenants › Create › External**).
2. Tenant name `Mantralaya Yatra`, domain name e.g. `mantralayayatra` (becomes `mantralayayatra.onmicrosoft.com` and the sign-in address `mantralayayatra.ciamlogin.com`), location **India**, your subscription and the resource group `rg-mantralaya-yatra`.
3. Wait for it to finish (a few minutes), then copy its **Tenant ID** from the tenant's overview page.

## 2. Register the API and the app (script)

```powershell
az login --tenant <the new tenant ID> --allow-no-subscriptions
Set-ExecutionPolicy -Scope Process Bypass
.\infra\entra-setup.ps1
```

It checks it is in the new tenant (answer `y`), creates the two registrations, grants consent for all users so volunteers are not asked, writes the `auth` section of `ui\app.config.json`, and prints the two settings for step 4. Safe to run again.

## 3. The sign-in user flow (portal)

In the portal, switch to the **new tenant** (top right, *Switch directory*):

1. **External Identities › User flows › New user flow**.
2. Name `signup-signin`; identity provider **Email one-time passcode**; user attribute **Display Name**; **Create**.
3. Open the flow, **Applications › Add application**, choose `mantralaya-yatra-app`, **Select**.

## 4. Point the API at the tenant

The script printed this command with your ids filled in. Sign back in to your subscription's tenant first:

```powershell
az login
az webapp config appsettings set --resource-group rg-mantralaya-yatra --name <your web app> --settings "Auth__Authority=https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0" "Auth__Audience=<api-app-id>,api://<api-app-id>"
```

The web app restarts with the new settings.

## 5. Commit and build

`ui\app.config.json` now holds the server address and sign-in settings (none of them secret: they are inside every APK anyway). Commit it on your branch; the next build, from your laptop or the pipeline, signs in with this tenant. On the phone, **Set up** then shows *Sign in with email* and no server box.

## Adding volunteers

The accountant adds each volunteer's email in the app (members). The volunteer installs the APK, taps **Sign in with email**, enters that email and the emailed code. The first time, Entra asks them to confirm their name; that creates their account in the tenant. Their access starts with the invitation matching their email.

## If sign-in fails

| Message | Cause |
|---|---|
| The page says the app isn't set up for this user flow, or "AADSTS50011" | Step 3.3 (add the app to the user flow) is missing, or the redirect URI differs: it must be exactly `app.mantralayayatra://auth` |
| "Not signed in" (401) right after signing in | Step 4 is missing or has a typo; check the web app's `Auth__` settings |
| "You are not in a yatra yet" | The accountant has not added this email, or added a different one |
| Sign-in page opens but returning to the app does nothing | The APK was built before this setup; rebuild it after committing `ui\app.config.json` |
