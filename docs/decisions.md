# Mosaic Decisions

Version: 1.0 Draft

Status: Active Development

Author: Bryan Dunlap

Last Updated: 2026-08-01

---

# Project Decisions

## 2026-07-19

### Three-Zone Architecture

Decision:
Planning, Live, and Discovery will be permanent dashboard sections.

Reason:
Separates future planning, current activity, and passive information into predictable locations.

---

### Scheduler Driven Display

Decision:
Widgets never decide when they appear.

Reason:
A centralized scheduler creates a consistent experience and scales better as new content is added.

---

### Universal Card System

Decision:
All information is presented as cards.

Reason:
Creates a unified visual language and simplifies future development.

---

### Pinned Events

Decision:
Pinned regions only exist while active.

Reason:
Avoids permanently wasting dashboard space.

---

## 2026-08-01

### Hero as an Attention Layer

Decision:
The Hero will function as a priority-based attention layer rather than a standard widget.

Reason:
Widgets provide persistent awareness, while the Hero provides temporary focus for information that is timely, relevant, and meaningful.

---

### User Preferences Control Behavior

Decision:
Hero behavior will be controlled through user preferences rather than hard-coded schedules or priorities.

Reason:
Different users have different routines and priorities. Mosaic should provide a consistent framework while allowing each user to customize how information is presented.

---

### Shared Event Sources

Decision:
Widgets and the Hero will consume the same normalized event sources rather than maintaining separate data systems.

Reason:
A shared event architecture prevents duplicate logic, improves consistency, and allows new features to integrate into multiple areas of Mosaic without significant redesign.

---

### Hardware Independence

Decision:
Mosaic will remain independent from any specific display hardware or hosting platform.

Reason:
The display environment is a deployment choice. The application architecture should support different devices and hosting methods without requiring changes to core functionality.

---

## 2026-09-07

### Home Assistant Entity Boundary

Decision:
Home Assistant state payloads terminate at a backend normalization boundary. Phase 2A exposes a bounded, request-driven Mosaic entity snapshot with no frontend polling, Home Assistant actions, or raw attribute passthrough. Future consumers will depend on this normalized snapshot rather than HA-native responses.

Reason:
This keeps credentials and provider-specific data backend-only while establishing one stable, cacheable contract for later Control, Hero, and widget work.

---

### Home Assistant Entity Selection

Decision:
Mosaic persists an ordered, bounded Home Assistant selection as entity IDs only. Control resolves current names and metadata from normalized snapshots, preserves selected IDs that are temporarily missing, and treats selection as presentation-agnostic configuration. Home Assistant control and service actions remain out of scope.

Reason:
Stable IDs survive state and metadata changes without duplicating provider data in configuration, while retaining missing selections prevents temporary device outages from silently changing user intent.

---

### Backend Team Logo Decoding

Decision:
Mosaic will use Sharp behind an isolated byte-decoder boundary for team palette analysis. Palette extraction requires Node.js 20.9 or newer. Resolution is invoked opportunistically through non-blocking startup, configuration, sports acquisition, and Gamecast hooks, while scoring performs only synchronous browser-cache lookup.

Reason:
The team-logo sources already used by Mosaic provide both raster and SVG artwork. Sharp supplies bounded metadata inspection, resizing, alpha preservation, and consistent PNG/SVG/WebP/JPEG/GIF decoding without browser canvas behavior or a separately installed host program. Its current packages include prebuilt Linux ARM and ARM64 binaries on supported modern libc versions. The production Raspberry Pi's architecture, libc, and Node version must be confirmed before deployment because the repository does not currently record them.
