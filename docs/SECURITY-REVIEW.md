# Security review — 22 October 2026

## Evidence and scope

The review covered repository source and history, the legacy lockfile, the readable production page, the replacement build/preview/deployment code, and AWS console inspection. No dependency installation was executed during the audit. After the user authorized release preparation, production-bucket versioning and a separate private backup bucket were enabled, and the original four site objects were backed up. **The revamped page has not yet been published to the production bucket; the restricted GitHub OIDC role is configured, and the first release remains pending.**

| Baseline | Evidence |
| --- | --- |
| Legacy repository HEAD | `08d634dd528d8763d57d3404e15b61472e455f83` |
| Saved live HTML | 133,320 bytes |
| Live HTML SHA-256 | `634e2ad01ffbbc24cbc238557edd54af8de53420db412ddae130aa10e1887770` |
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
- Prepared a deployment script that requires S3 versioning, saves complete current-object backups and metadata, verifies archive uploads before publishing, uses conditional checksum-verified uploads with the homepage last, and never deletes old objects. Automatic runs require a backup archive in the separate private bucket.
- Prepared a GitHub `master` deployment workflow with pinned actions, short-lived AWS OIDC credentials, exact repository/branch trust, serialized deployments, and public-release verification. No long-lived AWS key is stored in the repository or workflow.

The local preview sets security response headers and rejects traversal and unsupported HTTP methods. The HTML also receives a meta CSP; header-only protections such as `frame-ancestors` require deployment of the supplied CloudFront response-header policy. Local headers do not change AWS automatically.

## Verification

All **41 automated checks** pass, including build isolation, preview headers and routing, font-license distribution, shared animation scheduling, deterministic gameplay across pauses/hidden tabs/resets, touch-controller behavior, and deployment backup/order/failure guards. The static build produces 22 publishable files. The replacement lockfile audit reports zero vulnerabilities with zero dependencies.

The built page was reviewed against the original composition, including ship sprites, enemy activity, pause, and keyboard reset. Chrome mobile emulation covered **320×568, 375×667, and 667×375**. Joystick movement, shooting, reset, and portrait/landscape layouts were checked. This is browser emulation, not testing on physical devices or Safari; those platform differences remain unverified.

## Current incident applicability

The likely incident behind the request is **PHP2Shell**, disclosed on 21 October 2026: CVE-2026-109618 and CVE-2026-109619. PHP's advisory concerns PHP installations serving web requests and provides fixed releases. The inspected production origin is private S3 object storage behind CloudFront, with no PHP execution layer. These PHP runtime vulnerabilities therefore do not apply to this site's verified hosting architecture. This does not rule out unrelated account or supply-chain compromise. [PHP advisory](https://www.php.net/archive/2026.php#2026-10-21-5), [AWS static hosting documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html).

## AWS findings still requiring release work

The existing bucket already blocks all public access, disables ACLs, and permits CloudFront reads only from the site's distribution. Its OAC always signs requests with SigV4. CloudFront redirects HTTP to HTTPS and uses `TLSv1.2_2021`.

Bucket versioning is now enabled, the original four objects have been backed up, and the separate private `itchson-com-backups-513346603319` archive bucket is configured. Before the first new-site release, CloudFront still has no response-header policy or custom error response, and the original homepage has no explicit Cache-Control metadata. The prepared CDN helper and deployment script address those settings during release. CloudFront and S3 access logging remain disabled; no account-wide conclusion about CloudTrail logging follows from those observations.

The surviving pipeline targets the correct bucket but reads **`itchson/itchson-eth` on `main`**, not this repository. Its stage view retains a February 2024 execution, while the current bucket and live HTML date from August 2025. The replacement `master` workflow and dedicated OIDC role are prepared, but a working automatic deployment from this repository has not yet been established. The initial manual release, CDN update, and successful automatic run must be verified before claiming completion. See [DEPLOYMENT.md](DEPLOYMENT.md).
