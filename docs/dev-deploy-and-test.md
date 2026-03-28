# Dev Deployment & Testing Guide

This guide explains how to set up, build, test, and deploy the `dev` version of Squad locally — and how to validate your changes before they land in CI.

---

## Prerequisites

| Requirement | Minimum version |
|-------------|-----------------|
| Node.js | ≥ 22.5.0 |
| npm | ≥ 10.0.0 |
| Git | any recent version |
| gh CLI | optional — required for GitHub integration tests |

---

## 1. Fork and Clone

**Fork on GitHub**

Go to <https://github.com/bradygaster/squad> and click **Fork**.

**Clone your fork**

```bash
git clone git@github.com:{yourusername}/squad.git
cd squad
```

**Add the upstream remote and fetch the `dev` branch**

```bash
git remote add upstream git@github.com:bradygaster/squad.git
git fetch upstream dev
```

`dev` is the integration branch. All PRs must target `dev`, not `main`.

---

## 2. Install Dependencies

```bash
npm install
```

npm workspaces automatically links the two local packages together so that `@bradygaster/squad-cli` can import from `@bradygaster/squad-sdk` without anything being published to npm.

---

## 3. Build

```bash
# Compile TypeScript to dist/ (both packages)
npm run build

# Watch mode — auto-recompile on every save
npm run dev
```

The `prebuild` step runs automatically before `build` and syncs templates and bumps the build counter. Skip it with `SKIP_BUILD_BUMP=1` when publishing.

---

## 4. Make the `squad` Command Use Your Local Build

After building, link the CLI so the global `squad` command points at your local source instead of the published npm package:

```bash
npm link -w packages/squad-cli
```

Verify it worked:

```bash
squad version
# Should output something like: 0.9.2-preview
```

The `-preview` suffix in the version confirms you are running your local dev build, not the published release.

When you make code changes and rebuild (`npm run build` or `npm run dev`), the `squad` command automatically picks up the changes — no re-linking needed.

**Revert to the globally installed npm version**

```bash
npm unlink -w packages/squad-cli
```

---

## 5. Run Tests

Squad uses [Vitest](https://vitest.dev/) for all unit and integration tests.

```bash
# Run the full test suite once
npm test

# Watch mode — re-runs affected tests on every file save
npm run test:watch
```

Tests live in `test/`. Vitest is configured in `vitest.config.ts` and includes all `test/**/*.test.ts` files.

### Run a single test file

```bash
npx vitest run test/cli.test.ts
```

### Run tests with coverage

```bash
npx vitest run --coverage
```

Coverage output goes to `./coverage/`.

---

## 6. Lint and Type Check

```bash
# Type-check both packages (no emit)
npm run lint

# ESLint (style and rules)
npm run lint:eslint

# Markdown and spell-check for docs
npm run lint:docs
```

All three checks must pass before merging.

---

## 7. Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, published releases |
| `dev` | Integration branch — target for all PRs |
| `insider` | Pre-release / experimental features |
| `preview` | Release staging (validated by CI before publish) |
| `{user}/{issue}-{slug}` | Feature branches |

Always branch from `dev`:

```bash
git checkout -b yourname/42-fix-something upstream/dev
```

---

## 8. Pre-Commit Checklist

Before pushing any commit, run:

```bash
npm run build   # must succeed
npm test        # all tests must pass
npm run lint    # no type errors
```

Also verify you haven't accidentally staged deletions:

```bash
git diff --cached --stat                        # check file count looks right
git diff --cached --diff-filter=D --name-only  # must list NO unintended deletions
```

---

## 9. Add a Changeset (Required Before Merge)

Squad uses [changesets](https://github.com/changesets/changesets) for independent package versioning. Every PR must include a changeset.

```bash
npx changeset add
```

This will prompt you to:

1. Select which packages changed (`squad-sdk`, `squad-cli`, or both)
2. Choose the bump type (`patch`, `minor`, or `major`)
3. Write a brief summary

A file is created under `.changeset/` — commit it with your changes.

---

## 10. Open a Pull Request

```bash
git push origin yourname/42-fix-something
gh pr create --base dev --repo bradygaster/squad --head {yourusername}:yourname/42-fix-something
```

Add `Closes #42` to the PR description to link the issue.

---

## 11. CI Pipeline (What Runs Automatically)

GitHub Actions runs the following jobs on every push to `dev` and on every PR targeting `dev`, `main`, `preview`, or `insider`:

| Job | Command | Purpose |
|-----|---------|---------|
| `docs-quality` | `markdownlint-cli2` + `cspell` | Docs linting and spell check |
| `test` | `npm run build && npm test` | Full build and test suite |
| `publish-policy` | Workflow scan | Ensures all `npm publish` calls are workspace-scoped |

The `test` job also runs two safety guards:
- **Source tree canary** — fails if critical source files are missing (guards against accidental mass-deletion)
- **Large deletion guard** — fails if a PR deletes more than 50 files without the `large-deletion-approved` label

All jobs must be green before a PR can merge.

---

## 12. Deploy to `insider` (Pre-Release)

Merging to the `insider` branch triggers the **Publish Insider to npm** workflow automatically. It:

1. Installs dependencies
2. Builds both packages
3. Publishes `@bradygaster/squad-sdk` and `@bradygaster/squad-cli` to npm with the `@insider` dist-tag

Users can install the insider build with:

```bash
npm install -g @bradygaster/squad-cli@insider
```

---

## 13. Deploy to Production (Stable Release)

Production releases are managed through changesets on the `dev` → `main` path:

1. Changesets accumulate on `dev` as PRs merge
2. When a release is ready, the team runs `npx changeset publish` (via GitHub Actions)
3. This bumps `package.json` versions, generates `CHANGELOG.md` entries, publishes to npm, and creates GitHub releases

The **Squad npm Publish** workflow (`squad-npm-publish.yml`) also supports manual dispatch for emergency releases by providing a version number directly.

**Publish order** (enforced by workflow dependencies):

```
preflight checks → CLI smoke tests → publish squad-sdk → publish squad-cli
```

`squad-cli` always publishes after `squad-sdk` to ensure the registry already has the SDK it depends on.

---

## 14. Validate a Published Release

After a release completes, confirm it landed on npm:

```bash
npm view @bradygaster/squad-sdk version
npm view @bradygaster/squad-cli version
```

Test the global install in a clean environment:

```bash
npm install -g @bradygaster/squad-cli@latest
squad version
squad doctor
```

`squad doctor` runs the built-in health check and reports any setup issues.

---

## Quick Reference

```bash
# First-time setup
npm install
npm run build
npm link -w packages/squad-cli

# Day-to-day development
npm run dev            # watch mode build
npm run test:watch     # watch mode tests

# Before committing
npm run build && npm test && npm run lint

# Before opening a PR
npx changeset add

# Revert to published npm version
npm unlink -w packages/squad-cli
```
