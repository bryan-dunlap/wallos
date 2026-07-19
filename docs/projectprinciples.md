# Project Mosaic

Version: 1.0 Draft

Status: Active Development

Author: Bryan Dunlap

Last Updated: 2026-07-19

---

# Project Principles

## Purpose

These principles define how Project Mosaic should evolve over time.

Every feature, animation, integration, and interface decision should be evaluated against these principles before implementation.

If a proposed feature conflicts with these principles, the principles take precedence.

---

# Principle 1 — Reward Attention, Never Require It

Mosaic should communicate important information with a glance.

The display should never require a user to stand and watch for information to appear.

Users who spend more time looking at the display should naturally discover additional information, but the most important information should always be immediately visible.

---

# Principle 2 — Meaning Over Novelty

Features should exist because they improve everyday life.

Interesting technology alone is not enough.

Every feature should answer one question:

> Does this make someone's day easier or more enjoyable?

If not, it probably does not belong.

---

# Principle 3 — Motion Communicates Change

Animation should never exist purely for decoration.

Motion should indicate:

- New information
- Changing state
- User feedback
- Passage of time

Avoid flashy effects that distract from the information itself.

---

# Principle 4 — Information Has Priority

Not all information deserves equal attention.

Mosaic should prioritize information based on relevance.

Examples:

Critical
- Weather warnings
- Active timers
- Live sporting events

Normal
- Music
- Package tracking
- Home Assistant updates

Passive
- Reddit
- Astronomy
- Today in History

The scheduler determines visibility.

---

# Principle 5 — Simplicity Wins

When two solutions solve the same problem equally well, choose the simpler one.

Simple systems are:

- Easier to maintain
- Easier to understand
- More reliable
- Easier to extend

---

# Principle 6 — Consistency Creates Quality

Every card should feel like it belongs to the same product.

Typography

Spacing

Animations

Colors

Interaction

All should remain consistent regardless of the data source.

---

# Principle 7 — The Dashboard Exists for the User

Technology should never become the focus.

Users should remember the information they received—not the software that displayed it.

---

# Principle 8 — Ambient First

Mosaic is designed for viewing from across the room.

Information should be understandable without interaction.

Keyboard, mouse, or touch input should never be required for normal operation.

---

# Principle 9 — Predictability Builds Trust

Users should quickly learn where information belongs.

Planning information should always appear in the Planning Zone.

Current events belong in Live.

Interesting information belongs in Discovery.

Consistency is more valuable than novelty.

---

# Principle 10 — Grow Without Becoming Cluttered

Adding new integrations should not increase visual complexity.

Every new feature should integrate into the existing architecture rather than creating new interface patterns.

Mosaic should become more capable over time while remaining equally simple to understand.

---

# Things Mosaic Will Never Do

Mosaic will never:

- Display advertisements.
- Interrupt important information with trivial content.
- Autoplay videos.
- Play unnecessary sounds.
- Flash or use attention-grabbing animations.
- Require technical knowledge to operate.
- Expose implementation details on the primary display.
- Sacrifice readability for visual effects.

---

# The Mosaic Test

Before implementing any feature, ask:

1. Does it improve someone's day?
2. Can it be understood from across the room?
3. Does it respect the user's attention?
4. Does it fit the existing design language?
5. Can it integrate into the scheduler?
6. Does it keep the interface simple?
7. Would Mosaic be meaningfully worse without it?

If most answers are "No," the feature should be reconsidered.

---

# Final Principle

Every feature should support the mission of Project Mosaic:

> Present meaningful information at the moment it becomes meaningful.