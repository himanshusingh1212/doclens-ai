# ExplainSetupDialog Component

> **File:** `src/components/ExplainSetupDialog.tsx`  
> **Type:** AI Mode Configuration Dialog

---

## Purpose

Provides a configuration dialog for first-time AI Assistant setups. Configures prompt overrides and explanation styles for the document reader workspace.

---

## UI Structure

1. **Language Selection Row:**
   - Displays quick-select chips for popular target languages, alongside a text input field for custom language settings.
2. **Explanation Style Grid:**
   - Visual collection of style tiles (Standard, Academic, Simplified, Child-Friendly, Analogical) with helper descriptions.
3. **Action Button Row:**
   - **Save Preferences Button:** Applies and saves selections, then triggers pending translation pipelines.

---

## Properties & State

- **`open` (boolean):** Controls modal visibility.
- **`onComplete` (callback):** Triggered when setup settings are saved.
- **`onOpenChange` (callback):** Handles visibility state changes.

---

## Relationships

- **Used In:** [[PageWorkstation]].
- **Feature powered:** [[AI Translation]].

---

_Part of [[MOC — Components]]_
