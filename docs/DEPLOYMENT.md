# Deployment guide

**Pre-release status — 22 October 2026:** the new game has not yet been published to `itchson.com`. Versioning has been enabled on the production bucket, the separate private backup bucket has been configured, and the original four site objects have been backed up. The restricted GitHub OIDC role is configured; the first production release and automatic deployment verification remain pending.

## Verified production configuration

Inspected in the AWS console on 22 October 2026; backup protections below were then enabled for the authorized release:

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
| Cache policy | `Managed-CachingOptimized` |
| Production bucket versioning | Enabled before release |
| Private backup bucket | `itchson-com-backups-513346603319`, separate from the CloudFront origin, with public access blocked, ACLs disabled, encryption, and versioning |
| Pending CDN configuration | Response-header policy, origin-respecting cache policy, legacy route function, custom error pages |
| Access logging | S3/CloudFront access logging remains disabled |

The origin's *display name* still contains `s3-website`, but its actual endpoint is the private S3 REST endpoint. **Keep the REST origin, OAC, and public-access blocking.** S3 website hosting is disabled and does not need to be enabled.

The original site contained four objects: `index.html`, `404.html`, `robots.txt`, and `sitemap.xml`. Those original files have been backed up. The homepage was last modified on **11 August 2025 at 10:47:16 pm Brisbane time**; its saved SHA-256 is `634e2ad01ffbbc24cbc238557edd54af8de53420db412ddae130aa10e1887770`. Versioning now preserves future overwritten versions. AWS recommends waiting 15 minutes after first enabling versioning before object writes. [S3 versioning behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html).

## Existing automation is not this repository's deployment

Sydney's `itchson-eth` CodePipeline reads **`itchson/itchson-eth`, branch `main`**, and deploys to `itchson.com`. Its stage view retains a successful 14 February 2024 execution. Its referenced CodeBuild project, `itchson-eth-aws-codebuild`, was absent from the current Sydney project inventory. The pipeline execution-history list was empty at inspection.

Do not trigger this stale pipeline or grant its role to the new workflow. The prepared replacement is `.github/workflows/deploy.yml`, which deploys pushes to **this repository's `master` branch** and supports manual runs on that branch. It uses `arn:aws:iam::513346603319:role/itchson-com-github-deploy` with short-lived OIDC credentials. The trust policy restricts the audience to `sts.amazonaws.com` and the subject to `repo:itchson/itchson-com:ref:refs/heads/master`; PRs and other branches cannot assume it. The role is configured; a successful automatic release has not yet been demonstrated. [GitHub AWS OIDC guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

Actions are pinned to commit SHAs. Tests/builds run before credentials are requested, and production runs are serialized without cancelling an in-progress deployment. The role can inspect/publish this site's objects, write backups under the separate archive bucket's `backups/` prefix, and invalidate/read the named CloudFront distribution. It cannot delete objects, read backup archives, change IAM or bucket policies, or reconfigure CloudFront. Repository maintainers who can change `master` can change deployment code; branch access therefore remains part of the trust boundary.

## First release and CDN setup

1. Run `npm test` and `npm run build` with Node 24. The current suite has 41 passing checks. Chrome mobile emulation has verified 320×568, 375×667, and 667×375 with joystick movement, shooting, reset, and portrait/landscape layouts. Physical Safari testing has not been performed.
2. Complete the dedicated GitHub OIDC provider/role configuration from `deployment/iam/`. Keep the original backup and allow the initial versioning propagation period to finish.
3. Perform the initial upload with `scripts/deploy.mjs` and the explicit backup/archive arguments below. The old live page contains inline code, so attach the new restrictive response-header policy **after** the new page has been uploaded.
4. Apply the prepared one-time local helper `deployment/configure-cdn.py` using `--root <checkout> --backup-dir <new-absolute-directory> --apply`. It saves the full original distribution configuration before updating it with an ETag. It creates or reuses only exact matches for the reviewed response-header policy, a cache policy with minimum/default/maximum TTLs of **0 / 3600 / 31536000**, and the `cloudfront-js-2.0` legacy-route function. It associates the viewer-request function and sets S3 403/404 errors to `/404.html` with status 404 and minimum error TTL 0. It preserves origins, OAC, aliases, TLS, and unrelated settings, then waits for deployment. The helper and reviewed header/function templates are under `deployment/`.
5. Run `node scripts/verify-live.mjs` after CDN setup and check the real site's interactions, headers, legacy routes, and error response. This verification expects the new CSP response header and 404 handling, so it cannot pass before step 4.
6. Merge the reviewed release to `master`, then verify the first automatic deployment completes. Until that end-to-end run succeeds, treat the GitHub connection as unproven.

## Routine deployment and backups

Once setup is complete, a push to `master` runs the production workflow. For an authorized manual release with the same AWS permissions:

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

For rollback, an administrator can restore the saved entry documents and metadata using the archive's manifest, or recover their S3 object versions, then invalidate affected paths. The workflow role deliberately cannot read the archive or delete objects. Restore changed distribution settings from the helper's original configuration backup if needed; restoring the old inline page also requires restoring its compatible header policy. Keep prior assets available during recovery. Access logging and archive-retention changes remain separate operational decisions; neither is silently changed by a release.

References: [AWS OAC/private S3 origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html), [custom error responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesErrorPages.html).
