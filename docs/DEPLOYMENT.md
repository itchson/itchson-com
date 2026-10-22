# Deployment guide

**Status: code review first. No deployment or AWS configuration changes have been performed.** Complete and review the local game before changing production.

## Verified production configuration

Inspected read-only in the AWS console on 22 October 2026:

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
| Missing configuration | Response-header policy, custom error pages, access logging, bucket versioning |

The origin's *display name* still contains `s3-website`, but its actual endpoint is the private S3 REST endpoint. **Keep the REST origin, OAC, and public-access blocking.** S3 website hosting is disabled and does not need to be enabled.

Only four objects were present: `index.html`, `404.html`, `robots.txt`, and `sitemap.xml`. The homepage was last modified on **11 August 2025 at 10:47:16 pm Brisbane time**. Versioning is disabled, so overwriting it currently has no S3 version-history recovery.

## Existing automation is not this repository's deployment

Sydney's `itchson-eth` CodePipeline reads **`itchson/itchson-eth`, branch `main`**, and deploys to `itchson.com`. Its stage view retains a successful 14 February 2024 execution. Its referenced CodeBuild project, `itchson-eth-aws-codebuild`, was absent from the current Sydney project inventory. The pipeline execution-history list was empty at inspection.

Do not trigger this stale pipeline or assume a push to `itchson/itchson-com` publishes anything. The new GitHub workflow validates code only. The buildspec creates an artifact only. A deployment connection must be deliberately configured and tested after review; if using GitHub Actions, use short-lived AWS OIDC credentials with a narrowly scoped repository/branch trust policy. [GitHub AWS OIDC guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

## Release procedure after review

1. Run `npm test` and `npm run build` with Node 24. Preview the actual `build/` output and verify desktop, keyboard, touch, pause/resume, reset, and contact links. If using CodeBuild, first select an [image supporting Node 24](https://docs.aws.amazon.com/codebuild/latest/userguide/available-runtimes.html).
2. Save a complete copy of the four current S3 objects and their metadata outside the live bucket, plus the distribution configuration. Verify that the saved homepage matches the [recorded baseline](SECURITY-REVIEW.md). Enable bucket versioning before release if approved; retain the explicit backup regardless.
3. Configure the response-header policy from `deployment/response-headers-policy.json` and attach it to the distribution's behavior. It includes the CSP, MIME protection, framing restrictions, referrer policy, and HSTS. Preserve the existing private-origin permissions.
4. Use an origin-respecting CloudFront cache policy with **minimum TTL 0**; the current managed policy has a nonzero minimum TTL. Set S3 metadata as below. Publish new assets first, then HTML and discovery files. Include the font's license with its distribution. Exclude `.itchson-build`, source files, tests, audit reports, and secrets.
5. Associate `deployment/cloudfront-function.js` with the viewer-request event if legacy `/blog` and `/faq` aliases should lead to the game. Configure missing-object responses (S3 may return 403) to serve `/404.html` with HTTP 404, rather than making every missing path a successful homepage response.
6. Invalidate changed HTML and legacy routes, then verify the public hostname returns the intended content, headers, MIME types, and error status. Retain previous fingerprinted assets until cached HTML can no longer reference them. Review any later object cleanup separately; do not blindly delete bucket contents.

| Output | Recommended Cache-Control |
| --- | --- |
| HTML | `no-cache, max-age=0, must-revalidate` |
| Fingerprinted CSS/JS | `public, max-age=31536000, immutable` |
| Other assets, robots, sitemap | `public, max-age=3600` |

The preview's HTML uses `no-store` for local iteration; production metadata must be set during upload. CloudFront headers, routing, and cache settings are separate from the files in `build/`.

For rollback, restore the saved entry documents and metadata (or their versioned predecessors), restore any changed distribution settings, and invalidate affected paths. Keep the prior assets available during this process. Review access-logging requirements separately; enabling a log destination introduces retention and storage choices.

References: [AWS OAC/private S3 origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html), [custom error responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesErrorPages.html).
