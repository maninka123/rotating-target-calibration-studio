# Publication boundary check

These checks were repeated before the current release commit on 7 September 2026. They apply only to this independent repository.

| # | Check | Command or method | Recorded result |
| ---: | --- | --- | --- |
| 1 | Repository root | `git rev-parse --show-toplevel`, compared with the current project directory | Pass — both resolve to `rotating-target-calibration-studio/` |
| 2 | Status boundary | `git status --short --untracked-files=all` | Pass — every listed path is relative to this repository root |
| 3 | Staged files | `git ls-files` after `git add -A` | Pass — 70 project files only, including this report and `CITATION.cff` |
| 4 | Parent absolute paths | Text scan for home/workspace paths in all project sources and documents | Pass — no matches |
| 5 | External workspace references | Import/reference review | Pass — imports are repository-local or declared registry dependencies; no parent or sibling package, dataset, result, or module is referenced |
| 6 | Escaping symlinks | `find` symlink scan, excluding dependencies and local tool caches | Pass — no symlinks are tracked |
| 7 | Attribution and commit trailers | Case-insensitive prohibited-attribution scan; pre-commit log inspection | Pass — no prohibited reference or co-author trailer in tracked content or history |
| 8 | Measurement data | Extension scan plus staged-content review | Pass — no bag, point-cloud, CSV, measurement, or copied workspace results file is tracked; numeric values are model parameters, specification constants or diagnostics produced by this application |
| 9 | External publication material | Staged document and source review | Pass — the citation guidance states only that an associated publication is under review; it includes no unpublished title, abstract, manuscript text, results table, DOI or publication metadata |
| 10 | Independent history and author | `git log` and repository-local identity inspection | Pass — all seventeen existing commits on main are authored by Pasindu Ranasinghe. Sixteen use the supplied UNSW email; the GitHub merge uses the same author's GitHub noreply address. The staged release uses the supplied UNSW email. No parent-workspace history is inherited. |

Additional checks:

- `git remote -v` contains only the requested project repository on GitHub.
- `.gitignore` excludes dependency/build output, environment files, editor directories, and `.bag`, `.pcd`, and `.csv` data files.
- `git diff --cached --check` reported no whitespace errors after final staging.
- The MIT licence has `Copyright (c) 2026 Pasindu Ranasinghe` and the required affiliation.
