#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# pack-extensions.sh — Package each extension as an installable .tgz
#
# Usage:
#   pnpm build            # compile everything first
#   bash scripts/pack-extensions.sh
#
# Output: release-artifacts/<name>-<version>.tgz for each extension
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$ROOT/release-artifacts"
STAGING_BASE="$(mktemp -d)"

cleanup() { rm -rf "$STAGING_BASE"; }
trap cleanup EXIT

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.tgz

echo "==> Building all packages..."
(cd "$ROOT" && pnpm build)

echo ""
echo "==> Packaging extensions..."

# Helper: run a node script passing arguments (avoids path escaping issues)
run_node() {
  node -e "$1" -- "${@:2}"
}

pack_extension() {
  local ext_dir="$1"
  local ext_basename
  ext_basename="$(basename "$ext_dir")"

  # Get name and version
  local ext_name
  ext_name="$(run_node "
    const fs=require('fs'),path=require('path');
    const p=JSON.parse(fs.readFileSync(path.resolve(process.argv[1],'package.json'),'utf8'));
    console.log((p.name||'').replace(/^@[^/]+\//,''));
  " "$ext_dir")" || { echo "   SKIPPED: $ext_basename (cannot read package.json)"; return 1; }

  local ext_version
  ext_version="$(run_node "
    const fs=require('fs'),path=require('path');
    const p=JSON.parse(fs.readFileSync(path.resolve(process.argv[1],'package.json'),'utf8'));
    console.log(p.version||'0.1.0');
  " "$ext_dir")" || ext_version="0.1.0"

  echo ""
  echo "── Packing $ext_name@$ext_version ──"

  local staging="$STAGING_BASE/$ext_name"
  mkdir -p "$staging"

  # Copy dist (compiled output)
  if [ -d "$ext_dir/dist" ]; then
    cp -r "$ext_dir/dist" "$staging/dist"
  else
    echo "   WARNING: No dist/ directory found, skipping..."
    return 1
  fi

  # Copy manifest
  if [ -f "$ext_dir/openclaw.plugin.json" ]; then
    cp "$ext_dir/openclaw.plugin.json" "$staging/openclaw.plugin.json"
  else
    echo "   WARNING: No openclaw.plugin.json found, skipping..."
    return 1
  fi

  # Create distribution package.json
  run_node "
    const fs=require('fs'),path=require('path');
    const extDir=path.resolve(process.argv[1]);
    const stagingDir=path.resolve(process.argv[2]);
    const pkg=JSON.parse(fs.readFileSync(path.join(extDir,'package.json'),'utf8'));

    // Rewrite entry to compiled JS
    if(pkg.openclaw&&pkg.openclaw.extensions){
      pkg.openclaw.extensions=pkg.openclaw.extensions.map(e=>{
        if(e==='./src/index.ts')return'./dist/index.js';
        return e.replace(/^\.\/src\/(.+)\.ts$/,'./dist/\$1.js');
      });
    }

    // Remove devDependencies
    delete pkg.devDependencies;

    // Handle workspace deps
    const deps=pkg.dependencies||{};
    for(const[k,v]of Object.entries(deps)){
      if(typeof v==='string'&&v.startsWith('workspace:'))delete deps[k];
    }

    // Move openclaw to peerDependencies
    if(deps.openclaw){
      pkg.peerDependencies=pkg.peerDependencies||{};
      pkg.peerDependencies.openclaw='>='+deps.openclaw;
      delete deps.openclaw;
    }

    // Set main to dist entry
    pkg.main='./dist/index.js';

    fs.writeFileSync(path.join(stagingDir,'package.json'),JSON.stringify(pkg,null,2));
  " "$ext_dir" "$staging"

  # For extensions with workspace:* deps on quality-contracts, vendor the compiled output
  if grep -q '"@openclaw/quality-contracts"' "$ext_dir/package.json" 2>/dev/null; then
    local qc_dist="$ROOT/packages/quality-contracts/dist"
    if [ -d "$qc_dist" ]; then
      echo "   Vendoring quality-contracts into node_modules/"
      mkdir -p "$staging/node_modules/@openclaw/quality-contracts"
      cp -r "$qc_dist" "$staging/node_modules/@openclaw/quality-contracts/dist"

      run_node "
        const fs=require('fs'),path=require('path');
        const srcPkg=path.resolve(process.argv[1]);
        const destDir=path.resolve(process.argv[2]);
        const src=JSON.parse(fs.readFileSync(srcPkg,'utf8'));
        const out={name:src.name,version:src.version,type:'module',exports:{}};
        for(const[key,val]of Object.entries(src.exports||{})){
          if(typeof val==='object'&&val.default){
            const jsPath=val.default.replace(/^\.\/src\//,'./dist/').replace(/\.ts$/,'.js');
            out.exports[key]={types:jsPath.replace(/\.js$/,'.d.ts'),default:jsPath};
          }
        }
        fs.writeFileSync(path.join(destDir,'package.json'),JSON.stringify(out,null,2));
      " "$ROOT/packages/quality-contracts/package.json" "$staging/node_modules/@openclaw/quality-contracts"

      # Copy quality-contracts runtime deps
      for dep in fast-glob picomatch @nodelib glob-parent merge2 micromatch braces fill-range to-regex-range is-number; do
        local dep_dir="$ROOT/node_modules/$dep"
        if [ -d "$dep_dir" ]; then
          mkdir -p "$staging/node_modules/$(dirname "$dep")" 2>/dev/null || true
          cp -r "$dep_dir" "$staging/node_modules/$dep"
        fi
      done
    else
      echo "   WARNING: quality-contracts dist not found"
    fi
  fi

  # For product-team: copy skills and rewrite manifest paths
  if [ "$ext_name" = "product-team" ] && [ -d "$ROOT/skills" ]; then
    echo "   Bundling skills/"
    cp -r "$ROOT/skills" "$staging/skills"

    run_node "
      const fs=require('fs'),path=require('path');
      const manifestPath=path.join(path.resolve(process.argv[1]),'openclaw.plugin.json');
      const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
      if(m.skills)m.skills=m.skills.map(s=>s.replace(/^\.\.\/\.\.\/skills\//,'./skills/'));
      fs.writeFileSync(manifestPath,JSON.stringify(m,null,2));
    " "$staging"
  fi

  # Pack into .tgz
  echo "   Creating tarball..."
  (cd "$staging" && npm pack --pack-destination "$OUT_DIR" 2>/dev/null)

  # Rename to a clean name
  local clean_name="openclaw-${ext_name}-${ext_version}.tgz"
  local found_tgz
  found_tgz="$(ls "$OUT_DIR"/*"${ext_name}"*.tgz 2>/dev/null | head -1 || true)"
  if [ -n "$found_tgz" ] && [ "$(basename "$found_tgz")" != "$clean_name" ]; then
    mv "$found_tgz" "$OUT_DIR/$clean_name"
  fi
  echo "   -> release-artifacts/$clean_name"
}

# Iterate over each extension
for ext_dir in "$ROOT"/extensions/*/; do
  ext_dir="${ext_dir%/}"
  if [ -f "$ext_dir/openclaw.plugin.json" ]; then
    pack_extension "$ext_dir"
  fi
done

echo ""
echo "==> Done. Artifacts:"
ls -lh "$OUT_DIR"/*.tgz 2>/dev/null || echo "   No tarballs produced."
