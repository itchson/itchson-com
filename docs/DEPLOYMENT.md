# Deployment guide

**Live release — 22 October 2026:** the revamped game is published on [itchson.com](https://itchson.com). The initial manual deployment uploaded 22 files and completed invalidation `I7JBE3C7OC5N9ASKWU0YLO2G9P`. Public verification passed for the homepage/build match, linked assets, CSP/MIME protection headers, and 404 handling. CloudFront finished deployment, and its final configuration matches the reviewed configuration. The restricted GitHub OIDC role and `master` workflow are configured; [deployment runs](https://github.com/itchson/itchson-com/actions/workflows/deploy.yml) record each automatic release result.

Initial release commit: `e698b737b2e6995e09cca389bd285bd340784684`. Public homepage SHA-256: `7ecddb8fda8833e48f487ac58225f7373cd7275cdbdd1ef4f6bfb1d86492debe`.

## Verified production configuration

Verified and configured for the authorized release on 22 October 2026:

| Resource | Current state |
| --- | --- |
| S3 bucket | `itchson.com`, Sydney (`ap-southeast-2`) |
| CloudFront distribution | `E20TZP2HDNPJLG` |
| CloudFront domain | `d2e3d5n1ikmv02.cloudfront.net` |
| Hostnames | `itchson.com`, `www.itchson.com`, `*.itchson.com` |
| Actual origin | `itchson.com.s3.ap-southeast-2.amazonaws.com` |
| OAC | `E4RMTD656UGGI`, SigV4, always signs |
| Access | Private bucket; all public access blocked; ACLs disabled; read policy restricted to this distribution |
| Viewer behavior | Redirect HTTP to HTTPS; GET/HEAD only; automatic compression |
| TLS / root object | `TLSv1.2_2021` / `index.html` |
| Cache policy | `itchson-origin-cache-control`: minimum/default/maximum TTL 0 / 3600 / 31536000; gzip/Brotli; no cookies, query strings, or additional headers in the cache key |
| Production bucket versioning | Enabled before release |
| Private backup bucket | `itchson-com-backups-513346603319`, separate from the CloudFront origin, with public access blocked, ACLs disabled, encryption, and versioning |
| Response headers | `itchson-security-headers`, including CSP, MIME/framing protection, referrer policy, and HSTS |
| Routes and errors | `itchson-legacy-routes` viewer-request function; S3 403/404 mapped to `/404.html` with status 404 and error TTL 0 |
| Access logging | S3/CloudFront access logging remains disabled |

The origin's *display name* still contains `s3-website`, but its actual endpoint is the private S3 REST endpoint. **Keep the REST origin, OAC, and public-access blocking.** S3 website hosting is disabled and does not need to be enabled.

The original site contained four objects: `index.html`, `404.html`, `robots.txt`, and `sitemap.xml`. The original homepage was last modified on **11 August 2025 at 10:47:16 pm Brisbane time**; its saved SHA-256 is `634e2ad01ffbbc24cbc238557edd54af8de53420db412ddae130aa10e1887770`. Versioning now preserves overwritten versions. [S3 versioning behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html).

Verified original-site backups:

- Local archive: `F:/Dev/Backups/itchson-com/2026-10-22/20261022T011650Z-e9ab46239706.zip`.
- Private archive: `s3://itchson-com-backups-513346603319/backups/original-20261022T011650Z-e9ab46239706.zip`.
- Initial deployment's complete object/metadata/configuration backup: `s3://itchson-com-backups-513346603319/backups/2026-10-22T01-27-33-380Z-22e23151-2b9b-4f09-836a-f15463fd54af/`.

The original archive's checksums were verified. Preserve these backups independently of later deployments.

## Existing automation is not this repository's deployment

Sydney's `itchson-eth` CodePipeline reads **`itchson/itchson-eth`, branch `main`**, and deploys to `itchson.com`. Its stage view retains a successful 14 February 2024 execution. Its referenced CodeBuild project, `itchson-eth-aws-codebuild`, was absent from the current Sydney project inventory. The pipeline execution-history list was empty at inspection.

Do not trigger this stale pipeline or grant its role to the new workflow. Its replacement is `.github/workflows/deploy.yml`, configured for pushes to **this repository's `master` branch** and manual runs on that branch. It uses `arn:aws:iam::513346603319:role/itchson-com-github-deploy` with short-lived OIDC credentials. The verified trust policy restricts the audience to `sts.amazonaws.com` and the subject to `repo:itchson/itchson-com:ref:refs/heads/master`; PRs and other branches cannot assume it. The legacy pipeline’s inbound Deploy transition is disabled; its configuration remains available for recovery. [GitHub AWS OIDC guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

Actions are pinned to commit SHAs. Tests/builds run before credentials are requested, and production runs are serialized without cancelling an in-progress deployment. The role can inspect/publish this site's objects, write backups under the separate archive bucket's `backups/` prefix, and invalidate/read the named CloudFront distribution. It cannot delete objects, read backup archives, change IAM or bucket policies, or reconfigure CloudFront. Repository maintainers who can change `master` can change deployment code; branch access therefore remains part of the trust boundary.

## Release verification and CDN setup

The current suite has **41 passing tests**. Chrome mobile emulation covered 320×568, 375×667, and 667×375, including joystick movement, shooting, pause/resume, reset, and portrait/landscape layouts. Physical-device and Safari behavior remain unverified.

The initial upload ran through `scripts/deploy.mjs`. The restrictive CDN policy was applied only after the new page was uploaded, because it would block the original page's inline game code. `deployment/configure-cdn.py` saves the full original distribution configuration before an ETag-protected update, creates or reuses only exact matching policies/function code, preserves origins/OAC/aliases/TLS and unrelated settings, and waits for deployment. Future configuration runs require a fresh `--backup-dir`; ordinary site deployments do not reconfigure the CDN.

`node scripts/verify-live.mjs` now passes against the public site. The CDN deployment wait completed successfully. Check the `Deploy itchson.com` Actions run after each `master` update; it must finish successfully, including public verification.

## Routine deployment and backups

A push to `master` triggers the configured production workflow. For an authorized manual release with the same AWS permissions:

```sh
node scripts/deploy.mjs --backup-dir /absolute/new/release-backup --backup-bucket itchson-com-backups-513346603319
node scripts/verify-live.mjs
```

The deployment script runs tests/builds itself, verifies the expected AWS account owns the bucket, requires versioning, and confirms the expected CloudFront hostname/origin. It copies every current object to a fresh local backup directory with metadata, tags, SHA-256 checksums, inventory, and the distribution configuration. Original object keys map to safe hashed local filenames in `manifest.json`.

Before any production upload, the complete backup is archived under `s3://itchson-com-backups-513346603319/backups/<timestamp>-<unique-id>/` with AES256 encryption, checksum validation, and the manifest uploaded last. Archive failure stops the release before production writes. GitHub Actions requires this archive option because its local runner directory is temporary. Private snapshots are not uploaded as public-repository Actions artifacts.

Only verified build inventory is published; `.itchson-build`, source files, tests, audit files, and secrets are excluded. Assets are uploaded first and `index.html` last, with explicit MIME/cache metadata and checksum validation. Conditional writes reject competing object changes. **No objects or historical assets are deleted.** The script invalidates `/*` only after successful uploads and waits for completion; public verification then checks the homepage against the build, linked assets, security headers, and a real 404 response.

| Output | Deployment Cache-Control |
| --- | --- |
| HTML | `no-cache, max-age=0, must-revalidate` |
| Fingerprinted CSS/JS | `public, max-age=31536000, immutable` |
| Other assets, robots, sitemap | `public, max-age=3600` |

The preview's HTML uses `no-store` for local iteration; production metadata must be set during upload. CloudFront headers, routing, and cache settings are separate from the files in `build/`.

## Rollback

An administrator with backup-read and distribution-update permissions can restore the original site. The normal workflow role deliberately lacks those permissions.

1. Prevent a concurrent automatic deployment during recovery, and retain the current files/configuration as another backup.
2. Fetch the distribution's **current ETag**. Extract only `DistributionConfig` from the helper's `distribution-original.json` or the initial backup's `cloudfront.json`, and submit that original configuration using the current ETag. Do not reuse the stale ETag saved in the backup. Wait until the distribution is `Deployed` before restoring the old HTML: the new strict CSP would block its inline game.
3. Restore the original four objects with their metadata and tags from the backup manifest, or copy their previous S3 versions into new current versions. Retain newer assets and versions; no deletion is necessary.
4. Invalidate `/*`, wait for completion, and verify the original homepage SHA-256 above, gameplay, links, and error behavior. Resume automatic deployment only after selecting the intended repository release so it cannot immediately overwrite the rollback.

Access logging and archive-retention changes remain separate operational decisions; neither is silently changed by a release.

References: [AWS OAC/private S3 origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html), [custom error responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesErrorPages.html).
