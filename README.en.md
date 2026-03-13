[![中文](https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-%E4%B8%AD%E6%96%87-red)](./README.md)
[![English](https://img.shields.io/badge/Language-English-blue)](./README.en.md)

# Classroom Digital Pet Management System (Offline MVP)

## How to Run
- Option 1: Open `index.html` directly in your browser.
- Option 2: Start a local static server (still offline), for example:
  - `python -m http.server`
  - or any local static server tool you prefer

## Feature Overview
- Teacher Mode: student management, point rewards, supervised feeding mode entry, import/export, display mode entry, and basic settings.
- Student View: view pet status and points (read-only).
- Display Mode: classroom-friendly projection with slideshow/pagination.
  - Current implementation uses multi-card pagination (Previous/Next).
- Pet types: the app now ships with 8 animals: `rabbit`, `panda`, `raccoon`, `capybara`, `cat`, `turtle`, `dog`, and `bird`.
- Pet visuals use 4 local PNG variants per animal, with a fresh variant chosen whenever the user enters a pet-focused page.
- In supervised feeding mode, students first exchange food with points, then feed pets from their own inventory.

## Data and Storage
- Data is stored in browser LocalStorage on the local machine.
- Supports JSON export/import for backup and restore, including student food inventory.
- Supports importing a student roster CSV in the format `studentNo,name,group,alias`.
  - `alias` (pinyin/English name) is optional.
  - Sample file: `data-samples/students.csv`.
- Legacy `hamster` / `fish` pet types, or any invalid `petType`, are automatically migrated to one of the 8 supported animal types during load/import.

## Constraints and Defaults
- Fully offline operation, with no external network dependency.
- Point deduction is disabled.
- Feeding happens only inside supervised feeding mode.

## Quick Tips
1. On first use, set up a teacher PIN before entering Teacher Mode.
2. After adding a student, the system automatically creates a linked pet profile.
3. In supervised feeding mode, students exchange food first, then feed pets from their own inventory.
4. Use Display Mode pagination to browse all pets in class.

## Asset Notes
- Runtime pet visuals use local PNG variants stored under `assets/pets/<type>/`.
- Each pet type includes 4 variants used for page-entry random rotation.
