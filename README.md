# Albania photo vault

A private, password-encrypted photo vault for the Albania trip, alongside its trip map and gallery interface. The deployed site contains encrypted vault data, not the plaintext source photos.

## Encrypted vault

The password derives an Argon2id key that unwraps a master key. HKDF derives the encryption key material used for chunked AES-256-GCM encryption. Photos are stored as ciphertext under `public/vault/`; the vault metadata needed to unlock them is stored alongside that ciphertext.

Encrypt or update the vault locally with:

```sh
npm run vault:encrypt
```

Add another password slot for the vault with:

```sh
npm run vault:rekey
```

Keep passwords out of the repository and never commit plaintext photos or password-bearing files. Only commit the generated encrypted vault data.

## Automatic encryption on push

Install the local Git hook once with `npm run hooks:install`. Then drop new photos or videos into `photos/` and push: the hook incrementally encrypts changed media and prompts for the vault password on the terminal. The password is requested fresh and is never stored; CI has no vault password. The local `.vault-state.json` cache is Git-ignored.

## Security notes

Encryption protects photo contents at rest and in the deployed files, but it cannot prevent offline brute-force attempts against the vault. Use a strong, unique password. Anyone with the encrypted vault can attempt guesses offline. Password slots do not provide revocation of a password or copies of the vault already obtained. Vault metadata and observable file sizes/counts may also reveal information even when photo contents are encrypted.

## Run and deploy

Install dependencies with `yarn install`, then run the app locally with `yarn dev`. GitHub Actions builds the Vite site and deploys the `dist/` artifact to GitHub Pages under `/albania/`. The deployment checks the source tree and build output for plaintext media; local source photos are not part of the published site.
