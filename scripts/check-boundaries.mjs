#!/usr/bin/env node
/**
 * Dependency-boundary guard.
 *
 * The whole point of this repo is the dependency direction:
 *
 *     app -> wrappers -> core
 *     app -> components          (components import nothing from us)
 *
 * A README promise is not enforcement, so this script fails CI if any package
 * reaches across a boundary. It checks two things per package:
 *
 *   1. package.json dependencies / peerDependencies
 *   2. actual `import ... from '...'` / `require('...')` specifiers in src
 *
 * Run: `npm run check:boundaries`
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Workspace packages that must never be imported by the named package. */
const RULES = {
  'packages/media-core': {
    label: 'core',
    forbidden: [
      'media-react',
      'media-native',
      'media-ui-react',
      'media-ui-native',
      'react',
      'react-dom',
      'react-native',
    ],
    // Core must be portable to a CLI / worker / another UI with zero changes.
    forbiddenGlobals: ['document', 'window', 'localStorage', 'navigator'],
  },
  'packages/media-react': {
    label: 'react wrapper',
    forbidden: ['media-ui-react', 'media-ui-native', 'media-native', 'react-native'],
  },
  'packages/media-native': {
    label: 'native wrapper',
    forbidden: ['media-ui-react', 'media-ui-native', 'media-react', 'react-dom'],
  },
  'packages/media-ui-react': {
    label: 'react components',
    forbidden: ['media-core', 'media-react', 'media-native', 'media-ui-native', 'react-native'],
  },
  'packages/media-ui-native': {
    label: 'native components',
    forbidden: ['media-core', 'media-react', 'media-native', 'media-ui-react', 'react-dom'],
  },
};

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/** `media-core/foo` and `media-core` both count as importing `media-core`. */
const importsPackage = (spec, pkg) => spec === pkg || spec.startsWith(`${pkg}/`);

const violations = [];

for (const [pkgDir, rule] of Object.entries(RULES)) {
  const abs = join(ROOT, pkgDir);
  if (!existsSync(abs)) continue;

  // 1. Declared dependencies
  const pkgJsonPath = join(abs, 'package.json');
  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const declared = {
      ...(pkgJson.dependencies ?? {}),
      ...(pkgJson.peerDependencies ?? {}),
    };
    for (const dep of Object.keys(declared)) {
      if (rule.forbidden.some((f) => importsPackage(dep, f))) {
        violations.push(`${pkgDir}/package.json declares forbidden dependency "${dep}" (${rule.label} must not depend on it)`);
      }
    }
  }

  // 2. Actual import specifiers
  for (const file of walk(join(abs, 'src'))) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file).replace(/\\/g, '/');

    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec || spec.startsWith('.')) continue;
      const hit = rule.forbidden.find((f) => importsPackage(spec, f));
      if (hit) violations.push(`${rel} imports "${spec}" — ${rule.label} must not import ${hit}`);
    }

    // 3. Platform globals (core only)
    for (const globalName of rule.forbiddenGlobals ?? []) {
      const re = new RegExp(`(?<![\\w.$])${globalName}(?![\\w$])`, 'g');
      const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (re.test(stripped)) {
        violations.push(`${rel} references platform global "${globalName}" — ${rule.label} must stay environment-agnostic`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\n  Dependency boundary violations:\n');
  for (const v of violations) console.error(`   x  ${v}`);
  console.error(`\n  ${violations.length} violation(s). See README "Architecture".\n`);
  process.exit(1);
}

console.log('\n  Dependency boundaries OK');
console.log('     app -> wrappers -> core');
console.log('     app -> components  (components import nothing of ours)\n');
