[![中文](https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87-red)](./README.md)
[![English](https://img.shields.io/badge/Language-English-blue)](./README.en.md)

# Classroom Digital Pet Management System (Offline MVP)

## How to Run
- Option 1: Open `index.html` directly in your browser.
- Option 2: Start a local static server (still offline), for example:
  - `python -m http.server`
  - or any local static server tool you prefer

## Feature Overview
- Teacher Mode: student management, point rewards, feeding, import/export, display mode entry, and basic settings.
- Student View: view pet status and points (read-only).
- Display Mode: classroom-friendly projection with slideshow/pagination.
  - Current implementation uses multi-card pagination (Previous/Next).

## Data and Storage
- Data is stored in browser LocalStorage on the local machine.
- Supports JSON export/import for backup and restore.
- Supports importing a student roster CSV in the format `studentNo,name,group,alias`.
  - `alias` (pinyin/English name) is optional.
  - Sample file: `data-samples/students.csv`.

## Constraints and Defaults
- Fully offline operation, with no external network dependency.
- Point deduction is disabled.
- Feeding actions are performed by the teacher only.

## Quick Tips
1. On first use, set up a teacher PIN before entering Teacher Mode.
2. After adding a student, the system automatically creates a linked pet profile.
3. Use Display Mode pagination to browse all pets in class.

## Asset Attribution and License
- Pet icons are from Twemoji (CC BY 4.0), downloaded and localized under `assets/pets/`.
- Project homepage: https://github.com/jdecked/twemoji
- License: https://creativecommons.org/licenses/by/4.0/
