# SidebarLayout Component

> **File:** `src/components/SidebarLayout.tsx`  
> **Type:** React Layout Wrapper

---

## Purpose

Provides a persistent navigation shell for all pages except the workspace reader. It houses the application branding, navigation links, primary file picker trigger, and handles responsive layout changes for mobile devices.

---

## UI Structure & Elements

1. **Sidebar Column (`w-64` desktop):**
   - **Branded Header:** Shows the DocLens logo (`◐`) and styling. Links back to the index route.
   - **Navigation Navigation Links:** Vertically stacked list of links with emoji icons (Library, Settings, Voice Settings). Active states receive a green border on the right.
   - **Upload Button:** Prominent "+ New Document" button that triggers a hidden file input.
   - **Help / Support Link:** Anchored to the bottom of the column.
2. **Mobile Header (`h-14` below `md` breakpoint):**
   - Renders a hamburger toggle and the page title. Displays the navigation list as a slide-out drawer with a blurred backdrop overlay.

---

## State & Props

- **`children` (ReactNode):** Inner content rendered in the right-side layout container.
- **`mobileOpen` (boolean):** Internal state managing mobile navigation drawer open states.

---

## Relationships

- **Used By:** [[Library Page]], [[General Settings Page]], [[Voice Settings Page]].
- **Feature powered:** [[Document Management]].

---

*Part of [[MOC — Components]]*
