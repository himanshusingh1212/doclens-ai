# Escalation Matrix

> Reporting channels and escalation paths for resolving technical blockers, bugs, and project risks.

---

## Escalation Paths

### Level 1: Technical & Development Issues
- **Scope:** Technical bugs, build failures, tool configuration errors, minor pipeline bottlenecks.
- **Action:** Report directly to the squad lead or team channel.
- **Escalation Target:**
  - Ingestion / PDF extraction: Lead of [[Squad A — PDF Extraction]]
  - Translation / AI prompt configurations: Lead of [[Squad B — Translation]]
  - Voice engines / Audio issues: Lead of [[Squad C — TTS]]
  - Infrastructure / API keys: Lead of [[Shared Services]]

### Level 2: Cross-Squad Blockers & Sprint Schedule Risks
- **Scope:** API contract mismatches between squads, build blockages, schedule delays, resource shortages.
- **Action:** Report during weekly planning syncs or directly to the project manager.
- **Escalation Target:** Lead Project Manager of [[Project Management]]

### Level 3: Architecture Changes & Project Risk
- **Scope:** Significant architecture modifications, API key security concerns, team resource changes.
- **Action:** Coordinate direct review requests with the Engineering Head.
- **Escalation Target:** [[Engineering Head]]

---

## Technical Issue Levels

| Level | Severity | Example | Resolution Window |
|-------|----------|---------|-------------------|
| **Blocker** | High | Main branch build failure or server proxy down | 4 Hours |
| **Critical** | Medium-High | Neural voice downloads failing on mobile | 24 Hours |
| **Major** | Medium | Memory diagnostics dashboard showing wrong canvas counts | 3 Days |
| **Minor** | Low | UI alignment issue in sidebar layout | Next Sprint |

---

## Related

- [[Meeting Cadence]] — Weekly sync schedules.
- [[MOC — Teams]] — Team structure overview.
- [[00 — MOC — Project]] — Project index.

---

*Part of [[00 — MOC — Project]]*
