# Mosaic

A modular, web-based personal information dashboard designed for always-on displays.

## Overview

Mosaic is an ambient information system designed to quietly enhance everyday life.

It brings together meaningful information from multiple sources into a single, glanceable interface. Instead of replacing existing devices, Mosaic complements them by presenting useful information when it becomes relevant.

Originally developed as a Raspberry Pi wall display project, Mosaic has evolved into a platform-independent web application. The display hardware is only a deployment target; Mosaic can run anywhere capable of hosting the application and displaying a modern web browser.

---

## Core Philosophy

Mosaic is built around one guiding principle:

> Present meaningful information at the moment it becomes meaningful.

The project focuses on:

- **Glanceable information** — Important information should be understood quickly.
- **Calm interaction** — The display should inform without demanding attention.
- **Stable layouts** — Information should remain predictable as data changes.
- **Modular design** — New features should integrate without disrupting existing systems.
- **Personal relevance** — The information displayed should reflect the user's environment and interests.

---

## Current Features

### Dashboard Framework

- Modular widget architecture
- Three-zone dashboard layout:
  - Planning
  - Live
  - Discovery
- Dynamic content updates
- Reusable widget components

### Weather

- Current conditions
- Temperature display
- High/low information
- Precipitation information

### Sports

- MLB schedule integration
- Scheduled, live, and completed game states
- Team logos and records
- Live scoring information

---

## Technology

### Frontend

- HTML
- CSS
- JavaScript

### Backend

- Node.js
- Express

### Integrations

Current:
- MLB Stats API
- Weather services

Future:
- Calendar providers
- Home Assistant
- Music services
- RSS feeds
- Additional sports
- Smart home platforms

---

## Deployment

Mosaic is a browser-based application.

The application can be hosted on any suitable system and displayed through a standard web browser.

Potential deployment targets include:

- Desktop computers
- Tablets
- Dedicated displays
- Kiosk systems
- Raspberry Pi devices
- Servers or containers

The hardware is a deployment choice, not a requirement.

---

## Documentation

Additional project documentation is available in the `docs` directory.

Current documentation includes:

- Project vision
- Architecture
- Design principles
- Development decisions
- Roadmap
- Changelog

---

## Project Status

Mosaic is actively under development.

Current focus areas:

- Widget refinement
- Additional integrations
- Display optimization
- Configuration systems
- Smart home integration

---

## Guiding Principle

Features are added when they improve the experience—not simply because they are possible.

Mosaic prioritizes clarity, reliability, and thoughtful design over feature quantity.