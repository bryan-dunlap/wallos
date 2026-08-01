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

# Hero System

The Hero is Mosaic's primary attention layer.

Unlike standard widgets, which provide persistent awareness, the Hero temporarily elevates information that is timely, relevant, and meaningful.

The Hero exists to answer:

> What is the most important thing to know right now?

The Hero does not replace widgets.

Widgets provide consistent access to information, while the Hero provides temporary focus when an event deserves additional attention.

---

# Hero Architecture

The Hero receives normalized events from Mosaic's event system and evaluates whether they should receive priority display.

The Hero does not retrieve data directly.

Its flow is:

```
Data Providers

      │

      ▼

Normalized Events

      │

      ▼

Preference Evaluation

      │

      ▼

Hero Decision Engine

      │

      ▼

Hero Display State

      │

      ▼

Renderer
```

---

# Hero Responsibilities

The Hero is responsible for:

• Evaluating event priority  
• Applying user preferences  
• Managing display ownership  
• Handling event conflicts  
• Managing temporary interruptions  
• Returning to the previous state when events expire  

The Hero does not:

• Retrieve external data  
• Communicate directly with providers  
• Replace standard widgets  
• Store user preferences  

---

# Hero Priority Model

Events are evaluated based on importance.

Initial priority levels:

| Priority | Category | Example |
|---|---|---|
| 100 | Critical | Security or emergency alerts |
| 90 | Major Live Event | Playoffs or major events |
| 80 | Live Event | Active sports |
| 70 | Time Sensitive | Weather alerts |
| 60 | Upcoming | Calendar reminders |
| 50 | Default | Daily briefing |
| 20 | Discovery | Reddit, facts |

Priority determines eligibility, while user preferences determine final behavior.

---

# Hero Default State

When no event requires attention, the Hero displays a user-configured default experience.

Possible default states include:

• Daily Briefing  
• Calendar  
• Weather Summary  
• Custom User Selection  

The default state exists to provide useful information without requiring an active event.

---

# Hero and Widgets

The Hero and widgets share the same event sources but serve different purposes.

Example:

```
                Weather Event

                      │

          ┌───────────┴───────────┐

          ▼                       ▼

 Weather Widget              Hero Section

 Current Conditions           Weather Alert
```

Widgets provide awareness.

The Hero provides focus.

---

# User Preferences

Hero behavior is controlled through user preferences rather than hard-coded schedules.

Preferences may include:

• Default Hero experience  
• Interruption level  
• Category priorities  
• Favorite teams  
• Weather alert sensitivity  
• Calendar reminder sensitivity  
• Display timing  

This allows Mosaic to adapt to different users while maintaining a consistent underlying architecture.

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