// Works out the next release version for one part of the repo (the app or the API) from that part's
// version tags and the merged PR's labels, as in Money Trail:
//   release: major  -> 1.4.2 becomes 2.0.0
//   release: minor  -> 1.4.2 becomes 1.5.0
//   no label        -> 1.4.2 becomes 1.4.3
// Each part has its own tags (app-v1.4.2, api-v0.3.0), so the two version independently.
// With no tag yet for that part, it counts on from --fallback (the version in package.json or Directory.Build.props).
//
//   node .github/scripts/next-version.mjs --prefix app-v --fallback 0.1.0 \
//     --labels "release: minor,bug" --tags "app-v1.4.2 api-v0.2.0 app-v1.4.1"
import { fileURLToPath } from 'node:url';

export const MAJOR_LABEL = 'release: major';
export const MINOR_LABEL = 'release: minor';

/** "major", "minor" or "patch", from a PR's label names. Major wins over minor. */
export function bumpFromLabels(labels) {
  const names = labels.map((l) => l.trim().toLowerCase());
  if (names.includes(MAJOR_LABEL)) return 'major';
  if (names.includes(MINOR_LABEL)) return 'minor';
  return 'patch';
}

/** The highest plain version among tags with this prefix; other parts' tags and pre-release tags are ignored. */
export function latestVersion(tags, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}(\\d+)\\.(\\d+)\\.(\\d+)$`);
  const versions = tags
    .map((t) => pattern.exec(t.trim()))
    .filter(Boolean)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  return versions[0] ?? null;
}

export function nextVersion(tags, labels, prefix, fallback) {
  const latest = latestVersion(tags, prefix);
  if (!latest) {
    // The first release of this part is the version already written in the code.
    if (!/^\d+\.\d+\.\d+$/.test(fallback)) throw new Error(`The fallback version "${fallback}" must be three numbers.`);
    return fallback;
  }
  const [major, minor, patch] = latest;
  const bump = bumpFromLabels(labels);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? (process.argv[i + 1] ?? '') : '';
  };
  const prefix = arg('--prefix');
  if (!prefix) {
    console.error('--prefix is required, e.g. app-v or api-v');
    process.exit(1);
  }
  const tags = arg('--tags').split(/[\s,]+/).filter(Boolean);
  const labels = arg('--labels').split(',').filter(Boolean);
  console.log(nextVersion(tags, labels, prefix, arg('--fallback')));
}
