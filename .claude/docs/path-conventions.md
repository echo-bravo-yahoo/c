# Paths in tests and docs

Use placeholder filesystem paths in tests, fixtures, code comments, and docs.
Real paths leak private directory layout, bake one machine's structure into
assertions, and date the example. Reach for a real path only when the real
value is the point.

## Rule

- Default to obviously-synthetic paths: `/home/user/...`, `/tmp/...`, `/repo/...`.
- Keep only the property under test. If an example exercises a path quirk — a
  space, a dot, a literal hyphen, or a hyphen-and-space in one segment —
  reproduce that quirk in a synthetic path, not a real directory that happens
  to have it.
- Use a real path only when reproducing it is the point: a specific reported
  path in a regression test, or a platform-mandated location (`/etc/...`).

## Examples

| Property under test            | Use                              | Not                                         |
| ------------------------------ | -------------------------------- | ------------------------------------------- |
| hyphen + space in one segment  | `2023-2024 archive/q1 notes`     | a real notes folder that happens to have it |
| a space-bearing directory      | `/home/user/my docs/notes`       | `/mnt/d/Human Documents/notes`              |
| an ordinary nested path        | `/home/user/project`             | a real checkout path                        |

Rationale: an example is read far more often than the machine it came from. A
generic path communicates intent; a real one communicates someone's home dir.
