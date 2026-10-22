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
- `scripts/`: Node-only build, local preview, and shared security policy.
- `test/`: build, routing, output isolation, and preview security checks.
- `deployment/`: CloudFront route and response-header policy templates.
- `licenses/`: third-party notices, including the Press Start 2P font's SIL Open Font License.
- `build/`: generated output, ignored by Git. Never edit this directory by hand.

The builder validates its source allowlist, rejects hidden files and symlinks, injects a Content Security Policy, and fingerprints CSS/JavaScript references. Its `.itchson-build` marker identifies generated output and is excluded from deployment artifacts. The source site makes no external font or script requests; the font is self-hosted.

GitHub Actions runs tests and builds changes. `buildspec.yml` prepares the same artifact for a compatible AWS CodeBuild image. **Neither file, by itself, establishes a working production deployment.**

## Review and deployment status

As of **22 October 2026**, this work is for code review and local verification. **No production deployment or AWS setting change has occurred.** The live site remains the existing full-screen game.

The AWS inspection found private S3 hosting behind CloudFront, but the surviving pipeline references a different repository. See [the security review](docs/SECURITY-REVIEW.md) for evidence and limits, and [the deployment guide](docs/DEPLOYMENT.md) before any release.
