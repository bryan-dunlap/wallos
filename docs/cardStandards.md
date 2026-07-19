# Project Mosaic

Version: 1.0 Draft

Status: Active Development

Author: Bryan Dunlap

Last Updated: 2026-07-19

---

# Card Standards

## Purpose

Cards are the primary method of presenting information within Project Mosaic.

Every card should feel like part of the same product regardless of the information it displays.

---

# Philosophy

Cards should communicate information quickly.

The user should understand the card's primary purpose within a few seconds.

Cards should reward longer viewing by revealing additional context without overwhelming the display.

---

# Standard Card Layout

Every card follows the same information hierarchy.

```
Category

Primary Information

Secondary Information

Context

Status / Timestamp
```

Not every card requires every field, but information should always follow this order.

---

# Information Hierarchy

Priority should always be given to the most important information.

Example:

Sports

Primary
Current Score

Secondary
Current Inning

Context
Pitch Count

Status
Live

---

Weather

Primary
Current Temperature

Secondary
Forecast

Context
Rain Chance

Status
Updated 3 minutes ago

---

# Card Categories

Planning

Future information.

Static.

Live

Current information.

Scheduler controlled.

Discovery

Interesting information.

Passive.

---

# Typography

Large text should communicate the most important information.

Supporting information should never compete with primary information.

Avoid excessive text.

Cards should remain readable from across the room.

---

# Motion

Motion communicates change.

Cards should animate only when:

- New data arrives
- Scheduler rotates content
- State changes

Animations should never exist solely for decoration.

---

# Colors

Color supports information.

Color should never become the information.

Examples:

Red = Critical

Yellow = Warning

Green = Positive

Neutral colors should dominate the interface.

---

# Card Lifecycle

Every card moves through four states.

Created

↓

Scheduled

↓

Displayed

↓

Expired

Cards should never manage their own display duration.

The Scheduler controls visibility.

---

# Design Checklist

Before creating a new card, ask:

- Is the purpose immediately obvious?
- Can it be read from across the room?
- Does it follow the standard hierarchy?
- Does it fit the existing visual language?
- Is animation necessary?
- Does it integrate with the scheduler?

If the answer to any of these questions is "No," reconsider the design before implementation.