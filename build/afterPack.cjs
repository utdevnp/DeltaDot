// Re-signs the macOS app bundle with an ad-hoc identity so the code signature
// is validly sealed. electron-builder leaves the bundle unsealed when no
// Developer ID identity is present ("identity": null), which makes macOS
// Gatekeeper show "DeltaDot is damaged and can't be opened" on other Macs.
// A validly ad-hoc-sealed app instead shows the standard "unidentified
// developer" prompt, which can be bypassed with right-click → Open or
// `xattr -dr com.apple.quarantine`.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  // During universal builds electron-builder fires afterPack once per
  // architecture into `*-x64-temp` / `*-arm64-temp` directories BEFORE the
  // universal merge. Re-signing there breaks the merge (mismatched
  // CodeResources SHAs), so only act on the final merged app.
  if (context.appOutDir.endsWith('-temp')) return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  // Sign with a STABLE identity when provided (a self-signed or Developer ID
  // certificate name) so macOS TCC file-access grants persist across
  // launches/updates. Falls back to ad-hoc ("-"), which has no stable
  // identity and causes macOS to re-prompt for file access.
  const identity = process.env.DELTADOT_SIGNING_IDENTITY || '-';

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', identity, appPath], {
      stdio: 'inherit',
    });
    console.log(`  • signed ${appPath} with identity "${identity}"`);
  } catch (err) {
    // Fail the build rather than ship an unsealed app (macOS would show
    // "damaged and can't be opened" on other machines).
    throw new Error(`code signing failed for ${appPath}: ${err.message}`);
  }
};
