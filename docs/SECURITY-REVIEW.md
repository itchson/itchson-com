# Security review — 22 October 2026

## Evidence and scope

The review covered repository source and history, the legacy lockfile, the readable original production page, the replacement build/preview/deployment code, and AWS console inspection. No dependency installation was executed during the audit. The authorized release is now live: production-bucket versioning and a separate private backup bucket are enabled, the original four objects are preserved locally and in private S3 archives, and the public page matches the new build. The restricted GitHub OIDC role and `master` workflow are configured. Pushes to `master` run the backup, publication, and public-verification sequence; inspect [deployment runs](https://github.com/itchson/itchson-com/actions/workflows/deploy.yml) for each release result.

| Baseline | Evidence |
| --- | --- |
| Legacy repository HEAD | `08d634dd528d8763d57d3404e15b61472e455f83` |
| Saved original HTML | 133,320 bytes |
| Original HTML SHA-256 | `634e2ad01ffbbc24cbc238557edd54af8de53420db412ddae130aa10e1887770` |
| Initial live release commit | `e698b737b2e6995e09cca389bd285bd340784684` |
| Released homepage SHA-256 | `7ecddb8fda8833e48f487ac58225f7373cd7275cdbdd1ef4f6bfb1d86492debe` |
| Legacy npm dependency inventory | 1,967 dependencies |
| Legacy audit report | 215 vulnerabilities: 26 critical, 63 high, 115 moderate, 11 low |
| Replacement npm dependencies | 0 |

Audit counts describe the legacy dependency graph, including build tooling; they do not mean 215 exploitable flaws were present in the deployed static page. The deployed August 2025 game differed from the repository's old React source. The replacement therefore uses the saved live page as its functional reference.

No malware indicators were identified in the readable production scripts inspected. This is a bounded code review, **not a certification that the AWS account, credentials, workstations, or historical deployments were never compromised**. IAM credential history, CloudTrail, and other AWS regions were not audited.

## Findings addressed in the code

- Retired the old CRA/react-scripts dependency tree and the global `next` installation in CodeBuild. The new build uses Node's standard library only.
- Removed `printenv > .env` from the old buildspec. It wrote potentially sensitive build environment values to the workspace. **Publication of that file was not established:** the old artifact configuration used `base-directory: build`, whereas this command wrote `.env` at the repository root.
- Replaced broad artifact selection with an explicit static-file allowlist. Hidden files, symlinks, unsupported source types, repository files, and local audit artifacts are excluded.
- Extracted active code into local scripts and styles. The CSP excludes inline scripts, eval, third-party scripts, frames, forms, and network connections. Original ship shapes and colours are served as local SVG assets; images are restricted to the same origin, without a `data:` allowance.
- Self-hosted the font, retained its license, and added an explicit pause control and hidden-tab animation suspension.
- Kept the original gameplay and pixel composition; stopped redundant idle loops, cached orbit layout, preserved reduced-motion gameplay, and guarded image drawing so a missing sprite cannot terminate the game.
- Deployed through a script that requires S3 versioning, saves complete current-object backups and metadata, verifies archive uploads before publishing, uses conditional checksum-verified uploads with the homepage last, and never deletes old objects. Automatic runs require a backup archive in the separate private bucket.
- Configured a GitHub `master` deployment workflow with pinned actions, short-lived AWS OIDC credentials, exact repository/branch trust, serialized deployments, and public-release verification. No long-lived AWS key is stored in the repository or workflow.

The local preview sets security response headers and rejects traversal and unsupported HTTP methods. The HTML receives a meta CSP, and the applied CloudFront response-header policy adds header-only protections such as `frame-ancestors`. The public CSP and `X-Content-Type-Options: nosniff` headers have been verified.

## Verification

All **41 automated checks** pass, including build isolation, preview headers and routing, font-license distribution, shared animation scheduling, deterministic gameplay across pauses/hidden tabs/resets, touch-controller behavior, and deployment backup/order/failure guards. The static build produces 22 publishable files. The replacement lockfile audit reports zero vulnerabilities with zero dependencies.

The built page was reviewed against the original composition, including ship sprites, enemy activity, pause, and keyboard reset. Chrome mobile emulation covered **320×568, 375×667, and 667×375**. Joystick movement, shooting, pause/resume, reset, and portrait/landscape layouts were checked. This is browser emulation, not testing on physical devices or Safari; those platform differences remain unverified.

The initial manual release published all 22 files and completed CloudFront invalidation. `scripts/verify-live.mjs` passed: the public homepage SHA-256 matches the build, linked release assets return 200, security headers are present, and missing pages return 404. CloudFront completed its global deployment, and the final distribution configuration matches the reviewed proposal. Every automatic deployment also runs the public verification script; inspect its Actions result before treating that release as successful.

## Current incident applicability

The likely incident behind the request is **PHP2Shell**, disclosed on 21 October 2026: CVE-2026-109618 and CVE-2026-109619. PHP's advisory concerns PHP installations serving web requests and provides fixed releases. The inspected production origin is private S3 object storage behind CloudFront, with no PHP execution layer. These PHP runtime vulnerabilities therefore do not apply to this site's verified hosting architecture. This does not rule out unrelated account or supply-chain compromise. [PHP advisory](https://www.php.net/archive/2026.php#2026-10-21-5), [AWS static hosting documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html).

## AWS protections and remaining limits

The existing bucket already blocks all public access, disables ACLs, and permits CloudFront reads only from the site's distribution. Its OAC always signs requests with SigV4. CloudFront redirects HTTP to HTTPS and uses `TLSv1.2_2021`.

Bucket versioning is enabled, and the original four objects have verified backups on the workstation and in the private `itchson-com-backups-513346603319` archive bucket. The CDN update adds security headers, an origin-respecting cache policy, legacy routes, and real 404 handling; deployed objects have explicit MIME and Cache-Control metadata. Backup locations and the ordered CloudFront/S3 rollback procedure are recorded in [DEPLOYMENT.md](DEPLOYMENT.md). CloudFront and S3 access logging remain disabled; no account-wide conclusion about CloudTrail logging follows from those observations.

The legacy pipeline targets the correct bucket but reads **`itchson/itchson-eth` on `main`**, not this repository. Its stage view retains a February 2024 execution; the original site objects dated from August 2025. The replacement uses this repository's `master` workflow and dedicated OIDC role. The legacy pipeline’s inbound Deploy transition is disabled so it cannot publish over the replacement; its configuration is retained for recovery.
