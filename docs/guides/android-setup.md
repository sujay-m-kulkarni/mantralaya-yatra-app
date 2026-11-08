# Android: developer setup and APK files

How to build the phone app on your laptop, run it on a phone while developing, and make APK files to install. Same setup as Money Trail. Commands are for **PowerShell**, from the `ui` folder, one line at a time.

## Which APK for what

| APK | How | Signed with | Talks to | Use it for |
|---|---|---|---|---|
| Run on a connected phone | `npm run android:run` | This laptop's debug key | Azure API | Developing: build, install and open in one go |
| Debug APK file | `npm run android:apk` | This laptop's debug key | Azure API | Trying a build on your phone without a cable |
| Release APK from GitHub | Merge a PR to `main` | The release key | Azure API | **Your everyday app.** Each release installs over the last |
| Release APK from this laptop | `.\scripts\release-apk.ps1` | The release key | Azure API | A signed build when GitHub is not an option |

Every build talks to the server in `ui\app.config.json` (the Azure API) and carries the API key (below). To work against the API running on this laptop instead, set `$env:MY_API_URL = "http://<laptop address>:5180"` and `$env:MY_DEV_SIGNIN = "1"`; that build then asks for a server, name and email and uses the API's Development header.

Android only updates an app with one signed by the **same key**. A debug-key build and a release build cannot replace each other; uninstall one to install the other. Data on the phone is lost on uninstall, so sync before uninstalling (the register's chip should say *Synced*).

A build pointed at an https server refuses plain-http traffic and mixed content; only a build pointed at an http laptop address allows them.

## The API key and the fingerprint lock

The app has one user, you. Two things protect the books:

- **The API key** lets the Azure server trust your app. It is a long random value built into the APK when it is made; you never type it. `infra\azure-setup.ps1` creates it and writes it to `ui\app.secrets.json`, which is git-ignored. Laptop builds read it from there; GitHub release builds read the `API_KEY` secret. A build without it warns *no API key for an https server* and the app gets "did not accept this app's key". Because the key is inside the APK, **don't share your APK file** with anyone.
- **The fingerprint lock** keeps the books from anyone holding your phone. The app asks for your fingerprint, face or phone PIN when it opens, and again after 2 minutes in the background (a quick switch to WhatsApp to send a receipt does not lock it). The fingerprint is checked by Android and never leaves the phone. If the phone has no screen lock at all, the app cannot lock; *This build* on the Set up screen says so.

## One-time laptop setup

1. **Node.js 22** (as for Money Trail): `node --version` should print v22 or later.
2. **Android Studio**, which brings the Android SDK, the emulator and a JDK. You already use it for Money Trail; nothing new is needed.
3. Point command-line builds at the SDK and JDK, once per user (then open a new PowerShell window):
   ```powershell
   [Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
   [Environment]::SetEnvironmentVariable('JAVA_HOME', "$env:USERPROFILE\.jdks\jbr-21.0.11", 'User')
   ```
   That is the JDK 21 Money Trail's guide uses for `keytool`. Check both folders exist first; Android Studio shows the SDK path under *Settings › Languages & Frameworks › Android SDK*, and Android Studio's own `C:\Program Files\Android\Android Studio\jbr` also works as `JAVA_HOME`.
4. Install the app's packages: `npm install`.

The first Android build downloads Gradle and its dependencies and takes several minutes; later builds take well under one.

## Phone setup (only for running from the laptop over USB)

1. *Settings › About phone*: tap **Build number** seven times to unlock Developer options. On some phones it is under *Software information*.
2. *Settings › Developer options*: turn on **USB debugging**.
3. Connect by USB and accept **Allow USB debugging** on the phone. `adb devices` (in the SDK's `platform-tools`) should list it.

If Developer options will not cooperate, skip this: build `npm run android:apk` (or take a release from GitHub) and install the APK file instead, below.

## Develop against the API on this laptop (optional)

Normally the app talks to Azure. To try API changes before deploying them, start the API on the laptop so the phone can reach it over Wi-Fi (from `backend`):

```powershell
dotnet run --project src/MantralayaYatra.Api --urls http://0.0.0.0:5180
```

Windows asks once whether to allow it through the firewall: allow it on **private** networks. Find the laptop's address with `ipconfig` (the Wi-Fi adapter's IPv4 address, such as 192.168.1.20).

Then, from `ui`, build against it (`MY_DEV_SIGNIN` leaves the key out of this build, since the laptop API uses the Development header):

```powershell
$env:MY_API_URL = "http://192.168.1.20:5180"
$env:MY_DEV_SIGNIN = "1"
npm run android:run
```

`npm run android:run` builds the web app, copies it into the Android project, builds, installs and opens the app on the phone; pick the phone when asked for a target. Close the PowerShell window afterwards so the next build points at Azure again.

`npm run android:sync` then `npm run android:open` opens the project in Android Studio instead, where **Run** does the same and shows build errors more clearly.

## Make an APK file

```powershell
npm run android:apk
```

The APK lands in `ui\apk\mantralaya-yatra-0.1.0-debug.apk` (the folder is git-ignored). Send it to the phone (USB copy, Google Drive, or WhatsApp to yourself as a document) and open it there; Android asks once to allow installs from that app.

For a signed release APK on the laptop, the same as the pipeline's (the signing key is made once, see [build-pipeline.md](build-pipeline.md)):

```powershell
.\scripts\release-apk.ps1 -Keystore C:\Users\kulka\keys\mantralaya-yatra.jks -ApiUrl https://mantralaya-yatra-api-sujay.azurewebsites.net
```

It asks for the key's password, keeps it only for that build, and leaves `ui\apk\mantralaya-yatra-0.1.0-release.apk`. Leave out `-ApiUrl` for a release-signed build that talks to the laptop. If PowerShell refuses to run scripts: `Set-ExecutionPolicy -Scope Process Bypass`.

## Install releases from GitHub

Every merge to `main` that touches `ui/` publishes **Mantralaya Yatra X.Y.Z** under the repository's *Releases*. On the phone, open the release page in the browser, download the APK and open it. Later releases install over it and keep the data.

## Check which build is installed

On the app's **Set up** screen, open **This build**: version, commit, build time, default server, platform and storage.

## Debugging

| What | How |
|---|---|
| Web side (Angular): console, network, storage | Chrome on the laptop: `chrome://inspect`, then **inspect** under the phone. Works for debug builds |
| Native logs | Android Studio, **Logcat**, filter `package:app.mantralayayatra` |
| The phone's SQLite | Android Studio, **App Inspection › Database Inspector**: table `doc` holds the books as JSON, `app_meta` the settings and sync cursor |
| Java breakpoints (the SQLite bridge) | Android Studio: open `android`, set a breakpoint in `DatabasePlugin.java`, press **Debug** |
| API calls failing on the phone | Is the API listening on `0.0.0.0`? Same Wi-Fi? Windows firewall allowed on private networks? Open `http://<laptop>:5180/health/live` in the phone's browser |

## App icon and splash screen

The sources are in `ui/assets` (a diya on saffron). After changing them:

```powershell
npx @capacitor/assets@3 generate --android --assetPath assets --iconBackgroundColor "#B45309" --splashBackgroundColor "#FBFAF7" --splashBackgroundColorDark "#1C1917"
git checkout -- android/app/src/main/res/mipmap-anydpi-v26
```

The second line keeps the two adaptive-icon files as they are: the generator adds an inset that would shrink the diya.
