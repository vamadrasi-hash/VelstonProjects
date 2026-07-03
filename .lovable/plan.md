## Release Worker – UX & Validation Fixes

### 1. Release dialog (Team Today + Work Report)
- Days & Hours become **mandatory** numeric inputs (must be filled, ≥ 0, at least one > 0 OR reason required).
- Replace free-text reason with a **dropdown** (Select), bilingual EN/GU labels:
  - "Selected by mistake / ભૂલથી પસંદ થયું" *(default)*
  - "Absent / ગેરહાજર"
  - "No work today / આજે કામ નથી"
  - "Other / અન્ય" → reveals textarea
- **Reason becomes mandatory only when Days = 0 AND Hours = 0.** Otherwise reason is optional/hidden.
- Confirm button disabled until validation passes; show inline bilingual error.

### 2. Assign page – prevent double-pick
- When a worker is already added to today's roster (any supervisor, any site), their row/chip in the picker is **disabled** and greyed out with a small "Assigned" bilingual badge.
- Release is **not allowed from Assign**. Remove any release action there.
- Release remains available only from **Team Today** and **Work Report**.

### 3. Bilingual
- Add/confirm i18n keys in `src/lib/i18n-sup.ts`:
  `release_reason`, `reason_mistake`, `reason_absent`, `reason_no_work`, `reason_other`, `days_required`, `hours_required`, `reason_required_when_zero`, `already_assigned`.
- Use `<L k="…" />` throughout the dialog and picker.

### Files to change
- `src/components/sup/ReleaseDialog.tsx` — dropdown reason, mandatory days/hours, conditional reason-required logic.
- `src/pages/sup/Team.tsx` — same dialog upgrades in its inline release dialog (or switch to shared `ReleaseDialog`).
- `src/pages/sup/WorkReport.tsx` — ensure it uses updated `ReleaseDialog`.
- `src/pages/sup/Assign.tsx` — disable already-rostered workers; remove any release control.
- `src/lib/i18n-sup.ts` — new bilingual keys.

No DB/schema changes.
