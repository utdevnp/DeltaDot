#!/usr/bin/env bash
# One-time setup: create a stable self-signed code-signing certificate so
# macOS TCC (file-access permission) grants persist across app launches and
# updates — instead of re-prompting for every repository.
#
# Without an Apple Developer certificate this is the way to give DeltaDot a
# stable code-signing identity. Run once on the BUILD machine, then build with
#   DELTADOT_SIGNING_IDENTITY="<name>" npm run package
set -euo pipefail

CERT_NAME="${DELTADOT_SIGNING_IDENTITY:-DeltaDot Signing}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

echo "Creating self-signed code-signing certificate: $CERT_NAME"

# Idempotent: remove any existing certificate with the same common name.
security delete-certificate -c "$CERT_NAME" "$KEYCHAIN" 2>/dev/null || true

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. Generate a key + self-signed certificate with the Code Signing EKU.
cat > "$WORK/req.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $CERT_NAME
OU = DeltaDot
[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = codeSigning
EOF

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" \
  -days 3650 -config "$WORK/req.cnf"

# 2. Package as a .p12 keystore and import it, trusting it for codesign.
#    -legacy writes the older PBE/MAC algorithms that Apple's `security`
#    import accepts (OpenSSL 3.x defaults otherwise fail "MAC verification").
openssl pkcs12 -export -legacy -out "$WORK/cert.p12" \
  -inkey "$WORK/key.pem" -in "$WORK/cert.pem" -passout pass:deltadot

security import "$WORK/cert.p12" \
  -k "$KEYCHAIN" \
  -P "deltadot" \
  -T /usr/bin/codesign

echo ""
echo "Certificate '$CERT_NAME' created and imported."
echo "Verify:  security find-identity -v -p codesigning"
echo "Build:   DELTADOT_SIGNING_IDENTITY='$CERT_NAME' npm run package"
