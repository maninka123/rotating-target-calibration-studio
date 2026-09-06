# Publication boundary check

These checks were repeated before the current release commit on 6 September 2026. They apply only to this independent repository.

| # | Check | Command or method | Recorded result |
| ---: | --- | --- | --- |
| 1 | Repository root | `git rev-parse --show-toplevel`, compared with the current project directory | Pass — both resolve to `rotating-target-calibration-studio/` |
| 2 | Status boundary | `git status --short --untracked-files=all` | Pass — every listed path is relative to this repository root |
| 3 | Staged files | `git ls-files` after `git add -A` | Pass — 60 project files only, including this report |
| 4 | Parent absolute paths | Text scan for home/workspace paths in all project sources and documents | Pass — no matches |
| 5 | External workspace references | Import/reference review | Pass — imports are repository-local or declared registry dependencies; no parent or sibling package, dataset, result, or module is referenced |
| 6 | Escaping symlinks | `find` symlink scan, excluding dependencies and local tool caches | Pass — no symlinks are tracked |
| 7 | Attribution and commit trailers | Case-insensitive prohibited-attribution scan; pre-commit log inspection | Pass — no prohibited reference or co-author trailer in tracked content or history |
| 8 | Measurement data | Extension scan plus staged-content review | Pass — no bag, point-cloud, CSV, measurement, or copied results file is tracked; numbers are specification constants or simulation parameters |
| 9 | External publication material | Staged document and source review | Pass — no external publication, section number, citation, manuscript text, or results table is referenced |
| 10 | Independent history and author | `git log --all` and repository-local identity inspection | Pass — all five existing project commits are authored solely by Pasindu Ranasinghe using the supplied UNSW email address; the staged release uses the same local identity |

Additional checks:

- `git remote -v` contains only the requested project repository on GitHub.
- `.gitignore` excludes dependency/build output, environment files, editor directories, and `.bag`, `.pcd`, and `.csv` data files.
- `git diff --cached --check` reported no whitespace errors after final staging.
- The MIT licence has `Copyright (c) 2026 Pasindu Ranasinghe` and the required affiliation.
