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