# ITCHSON

The full-screen interactive landing page for [itchson.com](https://itchson.com): a starfield game, pixel logo, ship cursor, touch controls, and contact links. The page itself is the game.

This refactor preserves the live site's visual identity and gameplay while moving its inline CSS and JavaScript into maintainable local files. It replaces the obsolete Create React App project with a static build that has **zero npm dependencies**. The reference is the actual page deployed in August 2025, rather than the older React placeholder pages.

## Run locally

Use **Node.js 24**. No package installation is needed.

```sh
npm test
npm run build
npm run preview
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). `npm start` builds and starts the preview in one command. The preview binds only to localhost; `PORT` can override its default port.

Click the starfield to start. The pixel logo resets the game; touch devices retain their joystick and shoot control. The Pause button or Escape pauses/resumes animation, and hidden tabs suspend the animation queue.

## Project layout

- `site/`: publishable HTML, CSS, game scripts, font, and discovery files.
- `scripts/`: Node-only build, local preview, backup/deployment, public-release verification, and shared security policy.
- `test/`: build and output isolation, browser-server security, game timing, touch controls, and deployment safety checks.
- `deployment/`: CloudFront route/response-header templates and scoped deployment IAM documents.
- `licenses/`: third-party notices, including the Press Start 2P font's SIL Open Font License.
- `build/`: generated output, ignored by Git. Never edit this directory by hand.

The builder validates its source allowlist, rejects hidden files and symlinks, injects a Content Security Policy, and fingerprints CSS/JavaScript references. Its `.itchson-build` marker identifies generated output and is excluded from deployment artifacts. The source site makes no external font or script requests; the font is self-hosted.

GitHub Actions validates changes. The prepared production workflow deploys pushes to `master` using a dedicated AWS role and short-lived OIDC credentials once the AWS connection is configured. Before publishing, it backs up the current site locally and to the private `itchson-com-backups-513346603319` bucket. It uploads assets before the homepage, preserves old objects, waits for CloudFront invalidation, and verifies the public release. `buildspec.yml` remains an artifact builder; it is not the production connection.

## Review and deployment status

As of **22 October 2026**, the revamped game has not yet been published to the production bucket. S3 versioning and the separate private backup bucket have been enabled, and the original four site objects have been backed up. The restricted GitHub OIDC role is configured; the first release and automatic deployment verification remain pending.

All **41 automated tests** pass. Chrome mobile emulation covered 320×568, 375×667, and 667×375, including joystick movement, shooting, reset, and portrait/landscape layouts. This is not physical-device or Safari verification.

The existing AWS pipeline references a different repository and must not be reused. See [the security review](docs/SECURITY-REVIEW.md) for evidence and limits, and [the deployment guide](docs/DEPLOYMENT.md) for the new release and recovery procedure.
