# Mosaic

Version: 1.0 Draft

Status: Active Development

Author: Bryan Dunlap

Last Updated: 2026-08-01

---

# Architecture Overview

Mosaic is built around a modular architecture.

Every subsystem has a single responsibility and communicates through shared events rather than direct dependencies.

This allows new features to be added without requiring major changes to existing systems.

---

# Deployment Model

Mosaic is a web-based application designed to operate independently from its hosting environment.

The backend provides data services, integrations, and application logic. The frontend presents the user interface through a standard web browser.

The hosting environment and display device are separate components.

Potential deployment targets include:

- Desktop computers
- Tablets
- Dedicated displays
- Kiosk systems
- Raspberry Pi devices
- Servers or containers

The display hardware is a deployment choice, not a requirement.

---

# High-Level Architecture

```
                    External Services
────────────────────────────────────────────────

 Calendar     Weather     Sports     Reddit
 Home Assistant     Music     RSS
 Package Tracking   Traffic   Astronomy

                       │
                       ▼

────────────────────────────────────────────────
                Data Providers
────────────────────────────────────────────────

Each provider is responsible for:

• Authentication
• Polling
• Parsing
• Normalizing data

Providers never decide how information is displayed.

                       │
                       ▼

────────────────────────────────────────────────
                  Event Bus
────────────────────────────────────────────────

The Event Bus is the communication hub for Mosaic.

Every provider publishes events.

Every system subscribes to events.

No subsystem communicates directly with another subsystem.

This reduces coupling and improves maintainability.

                       │
                       ▼

────────────────────────────────────────────────
                  Scheduler
────────────────────────────────────────────────

The Scheduler evaluates every event.

Each event includes metadata such as:

• Priority
• Duration
• Expiration
• Cooldown
• Pin Eligibility

The Scheduler decides:

• If an event should appear
• Where it appears
• How long it remains visible
• When it should rotate away

Widgets never make these decisions.

                       │
                       ▼

────────────────────────────────────────────────
                   Renderer
────────────────────────────────────────────────

The Renderer receives display instructions from the Scheduler.

Its responsibilities include:

• Layout
• Animation
• Typography
• Transitions
• Responsive sizing

The Renderer does not retrieve data.

The Renderer does not prioritize information.

It only displays content.

                       │
                       ▼

────────────────────────────────────────────────
               Interface Zones
────────────────────────────────────────────────

Planning

Static information.

Future-oriented.

Examples:

• Calendar
• Weather
• Holidays
• Sports schedule

----------------------------

Live

Current information.

Dynamic.

Scheduler controlled.

Examples:

• Live sports
• Music
• Active timers
• Alerts

----------------------------

Discovery

Passive information.

Rotating content.

Examples:

• Reddit
• Astronomy
• Today in History
• RSS

---

# Companion Website

The Companion Website communicates with Mosaic through configuration services.

Its responsibilities include:

• Layout editing
• Scheduler configuration
• Theme customization
• Widget management
• Sports selection
• Discovery preferences
• Plugin management (future)

The Companion Website does not directly control rendering.

It updates configuration only.

---

# Design Philosophy

Each subsystem has one responsibility.

Examples:

Providers collect data.

The Scheduler decides priority.

The Renderer displays information.

This separation makes the system easier to maintain and extend.

---

# Future Expansion

The architecture should support additional providers without requiring changes to existing providers.

Examples include:

• New sports leagues
• AI services
• Voice assistants
• Additional smart home platforms
• Multiple displays
• Mobile companion applications

Future systems should integrate through the Event Bus whenever possible.

---

# Architectural Goals

The architecture should always strive for:

• Loose coupling
• High cohesion
• Modular components
• Easy testing
• Scalability
• Predictability
• Long-term maintainability

Every architectural decision should reinforce these goals.