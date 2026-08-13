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

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
      stdio: 'inherit',
    });
    console.log(`  • ad-hoc re-signed ${appPath}`);
  } catch (err) {
    console.error(`  • ad-hoc re-sign failed: ${err.message}`);
  }
};
