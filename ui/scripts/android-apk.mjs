// Builds an installable APK file into ui/apk/, without needing a phone connected.
//
//   npm run android:apk            debug APK, signed with this laptop's Android debug key
//   npm run android:apk:release    release APK, signed with the release key (see scripts/release-apk.ps1)
//
// The debug APK installs on any phone (allow "install unknown apps"), but cannot be updated by a
// pipeline release: Android only updates an app signed with the same key. Use it for trying things out.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const windows = process.platform === 'win32';

function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  // On Windows npm, npx and gradlew are .cmd/.bat files, which need a shell to run.
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows });
  if (result.status !== 0) {
    console.error(`\n${command} failed (exit ${result.status ?? result.signal}).`);
    process.exit(result.status ?? 1);
  }
}

if (release) {
  const missing = ['MY_KEYSTORE_FILE', 'MY_KEYSTORE_PASSWORD', 'MY_KEY_ALIAS', 'MY_KEY_PASSWORD'].filter((n) => !process.env[n]);
  if (missing.length > 0) {
    console.error(`A release APK needs the signing key. Missing: ${missing.join(', ')}.`);
    console.error('Run scripts\\release-apk.ps1, which asks for them (docs/guides/android-setup.md).');
    process.exit(1);
  }
  if (!existsSync(process.env.MY_KEYSTORE_FILE)) {
    console.error(`The keystore file was not found: ${process.env.MY_KEYSTORE_FILE}`);
    process.exit(1);
  }
}

run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);
run(windows ? 'gradlew.bat' : './gradlew', [release ? 'assembleRelease' : 'assembleDebug'], join(root, 'android'));

const type = release ? 'release' : 'debug';
const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', type, `app-${type}.apk`);
if (!existsSync(built)) {
  console.error(`Gradle finished but ${built} is missing.`);
  process.exit(1);
}
const version = process.env.MY_VERSION || JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
mkdirSync(join(root, 'apk'), { recursive: true });
const target = join(root, 'apk', `mantralaya-yatra-${version}-${type}.apk`);
copyFileSync(built, target);
console.log(`\nAPK ready (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB): ${target}`);
