# Security review — 22 October 2026

## Evidence and scope

The review covered repository source and history, the legacy lockfile, the readable production page, the replacement build/preview code, and a read-only AWS console inspection. No dependency installation was executed during the audit. No AWS resources, settings, or objects were changed.

| Baseline | Evidence |
| --- | --- |
| Legacy repository HEAD | `08d634dd528d8763d57d3404e15b61472e455f83` |
| Saved live HTML | 133,320 bytes |
| Live HTML SHA-256 | `634e2ad01fffbc24cbc238557edd54af8de53420db412ddae130aa10e1887770` |
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

The local preview sets security response headers and rejects traversal and unsupported HTTP methods. The HTML also receives a meta CSP; header-only protections such as `frame-ancestors` require deployment of the supplied CloudFront response-header policy. Local headers do not change AWS automatically.

## Verification

All 23 automated checks pass, including build isolation, preview headers and routing, font-license distribution, shared animation scheduling, and deterministic gameplay across pauses, hidden tabs, and resets. The static build produces 22 publishable files. The replacement lockfile audit reports zero vulnerabilities with zero dependencies.

The built page was reviewed in the browser against the original composition, including the ship sprites, enemy activity, pause control, and keyboard reset. Physical touch-device testing remains a release check; resizing the preview did not apply the requested mobile viewport, so mobile browser verification is not claimed.

## Current incident applicability

The likely incident behind the request is **PHP2Shell**, disclosed on 21 October 2026: CVE-2026-109618 and CVE-2026-109619. PHP's advisory concerns PHP installations serving web requests and provides fixed releases. The inspected production origin is private S3 object storage behind CloudFront, with no PHP execution layer. These PHP runtime vulnerabilities therefore do not apply to this site's verified hosting architecture. This does not rule out unrelated account or supply-chain compromise. [PHP advisory](https://www.php.net/archive/2026.php#2026-10-21-5), [AWS static hosting documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html).

## AWS findings still requiring release work

The existing bucket already blocks all public access, disables ACLs, and permits CloudFront reads only from the site's distribution. Its OAC always signs requests with SigV4. CloudFront redirects HTTP to HTTPS and uses `TLSv1.2_2021`.

The remaining gaps are operational: bucket versioning is disabled; CloudFront has no response-header policy or custom error response; the homepage has no explicit Cache-Control metadata; CloudFront and S3 access logging are disabled. No account-wide conclusion about CloudTrail logging follows from those observations.

The surviving pipeline targets the correct bucket but reads **`itchson/itchson-eth` on `main`**, not this repository. Its stage view retains a February 2024 execution, while the current bucket and live HTML date from August 2025. A working automatic deployment from this repository has not been established. See [DEPLOYMENT.md](DEPLOYMENT.md).
