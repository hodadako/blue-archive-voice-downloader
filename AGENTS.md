# Commit Style Memory

Use Conventional Commits for all future commits in this repository.

Format:

`<type>(<optional-scope>): <description>`

Common types:

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation-only changes
- `style`: formatting-only changes
- `refactor`: code change without feature or fix
- `perf`: performance improvement
- `test`: add or update tests
- `build`: build/dependency changes
- `ci`: CI workflow changes
- `chore`: maintenance work

Examples:

- `feat(sync): add student map sync command`
- `fix(download): use direct static audio URL for ogg files`
- `docs(readme): add students sync usage`

## Do Not Modify Formulas
- Never edit `src/data/student-name-formulas.json`.
- Never edit `src/data/student-type-formulas.json`.

## Versioning (SemVer)

Follow Semantic Versioning: https://semver.org/

- `MAJOR` (`X.0.0`): incompatible/breaking changes.
- `MINOR` (`0.X.0`): backward-compatible feature additions.
- `PATCH` (`0.0.X`): backward-compatible bug fixes.
- Pre-release tags are allowed when needed (e.g. `1.2.0-beta.1`).
