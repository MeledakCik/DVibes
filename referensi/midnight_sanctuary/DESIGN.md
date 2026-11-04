---
name: Midnight Sanctuary
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1b1b1d'
  surface-container: '#201f21'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#cbc4cd'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#303032'
  outline: '#948f97'
  outline-variant: '#49454c'
  surface-tint: '#d0c0e1'
  primary: '#d4c4e5'
  on-primary: '#362c45'
  primary-container: '#b8a9c9'
  on-primary-container: '#493d58'
  inverse-primary: '#655975'
  secondary: '#bbc7dc'
  on-secondary: '#253141'
  secondary-container: '#3e4a5b'
  on-secondary-container: '#adb9cd'
  tertiary: '#b2d2c1'
  on-tertiary: '#19362a'
  tertiary-container: '#97b6a6'
  on-tertiary-container: '#2b483b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eddcfe'
  primary-fixed-dim: '#d0c0e1'
  on-primary-fixed: '#21172f'
  on-primary-fixed-variant: '#4d425d'
  secondary-fixed: '#d7e3f8'
  secondary-fixed-dim: '#bbc7dc'
  on-secondary-fixed: '#101c2b'
  on-secondary-fixed-variant: '#3c4858'
  tertiary-fixed: '#c9ead8'
  tertiary-fixed-dim: '#aecebd'
  on-tertiary-fixed: '#032016'
  on-tertiary-fixed-variant: '#304d40'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  headline-xl:
    fontFamily: Sora
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Sora
    fontSize: 1.25rem
    fontWeight: '500'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Sora
    fontSize: 1rem
    fontWeight: '500'
    lineHeight: 1.5rem
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.6rem
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.45rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.25rem
  label-lg:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.75rem
  margin: 1.5rem
  margin-compact: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers a serene, distraction-free listening environment rooted in a "midnight cozy" philosophy. Designed as a lightweight desktop client for macOS and Windows, it prioritizes acoustic focus and effortless visual rest. The aesthetic merges restrained minimalism with tactile matte layering—avoiding aggressive neon accents, stark pure-black voids, and heavy glass distortions in favor of calm, velvety micro-surfaces.

Visual tone:
- **Intimate and Calm:** Generous negative space, subdued illumination, and velvety dark tones reduce eye strain during late-night listening sessions.
- **Understated Precision:** Controls feel physical yet whisper-quiet, favoring matte finishes, thin hair-line dividers, and muted pastel indicators.
- **Sophisticated Utility:** Chrome recedes entirely into the background, ensuring album art, typography, and playback meters remain the focal heroes.

## Colors

The palette is engineered exclusively for a deep, low-luminance dark canvas with desaturated, cozy pastel highlights.

### Surfaces & Neutrals
- **Canvas Base (`#121214`):** The foundational application backdrop across primary windows.
- **Sidebar & Panels (`#18181C`):** Subdued navigation panels, collapsible sidebars, and inactive track queues.
- **Card & Elevated Surfaces (`#1A1A1E`):** Floating containers, playlist panels, modal dialogs, and popovers.
- **Subtle Borders (`#2A2A30`):** Precise 1px borders providing structure without visual friction.

### Typography
- **Primary Text (`#EAEAF0`):** High legibility for track titles, current artist metadata, and active states.
- **Secondary Text (`#9A9AA3`):** Gentle, muted tone for album descriptions, timestamps, subtle UI metadata, and inactive labels.

### Accents & Dynamic States
- **Muted Lavender (`#B8A9C9`):** Primary system accent for active playback progress, scrub heads, and focused states.
- **Dusty Blue (`#A9B5C9`):** Secondary accent for playlist categories, queue counters, and secondary switches.
- **Pale Sage (`#A9C9B8`):** Ambient accent for positive feedback, volume levels, and EQ balance indicators.
- **Faded Peach (`#C9B8A9`):** Warm accent for favorite markers, heart toggles, and contextual notifications.

## Typography

The typographic hierarchy pairs the geometric personality of **Sora** for headings with the utilitarian legibility of **Inter** for long-form data, metadata, and controls.

- **Headlines (Sora):** Used sparingly on album titles, playlist headlines, and views. Tracking is pulled in slightly (`-0.01em` to `-0.02em`) to maintain a clean, modern poster feel without overwhelming desktop scale.
- **Body & Labels (Inter):** Highly legible at small desktop scales (e.g., track durations, sample rates, metadata tags). Generous line height (1.45x–1.6x) maintains an open, airy feeling across extensive library lists and lyrics views.

## Layout & Spacing

The desktop architecture adopts a modular three-pane layout: collapsible navigation rail (width: 220px–260px), main dynamic scroll view, and persistent bottom-docked playback bar (height: 80px).

- **Grid & Alignment:** Main library grids utilize an auto-fitting card layout with a minimum width of 180px and standard `gutter` (1rem). Dense list views (e.g., table tracklists) collapse the internal gap to `gutter-compact` (0.75rem).
- **Rhythm:** Spacing follows an intentional 4px base. Interior component padding maintains calm breathing space: `space-lg` (1.25rem) for card bodies and `space-sm` (0.5rem) between track rows.
- **Window Scaling:**
  - **Compact Desktop (< 960px):** Sidebar collapses into an icon dock (64px width); canvas outer margin shifts to `margin-compact` (1rem).
  - **Standard Desktop (960px – 1440px):** Two-pane standard (sidebar + content), margin expands to `margin` (1.5rem).
  - **Wide Display (> 1440px):** Optional third right panel (Queue & Lyrics, 320px) docks seamlessly without resizing album art grids.

## Elevation & Depth

Depth is established via tonal layering and whisper-soft 1px outlines rather than heavy drop shadows.

- **Surface Tiers:**
  - Level 0 (Base Canvas): `#121214`
  - Level 1 (Structural Sidebars / Dock): `#18181C` with border `#2A2A30` (top/right)
  - Level 2 (Floating Cards / Track Items): `#1A1A1E` with continuous 1px `#2A2A30` border
  - Level 3 (Menus / Popovers / Modals): `#1F1F24` with elevated ambient glow
- **Ambient Lighting:** When drop shadows are required for flyouts, menus, or album hovers, use an ultra-diffused, tinted shadow:
  - `0 12px 32px -8px rgba(0, 0, 0, 0.5), 0 0 0 1px #2A2A30`
- **Backdrop Diffusion:** Modal backdrops and popover sheets use a soft backdrop blur (`blur(16px)`) over `#121214cc` to sustain context without harsh occlusion.

## Shapes

The geometry balances clean structural discipline with human softness.

- **Primary Cards & Modals:** Standardized between 12px (`rounded-md`, 0.75rem) and 16px (`rounded-lg`, 1rem) border radius to establish calm, friendly contours.
- **Controls & Chips:** 9999px (full pill) for playback actions, tags, filter chips, and search badges.
- **Album Art & Thumbnails:** Fixed at 8px (`rounded-sm`) for compact rows and 12px (`rounded-md`) for featured hero tiles.

## Components

### Buttons & Playback Controls
- **Primary Player Action (Play/Pause):** 44px pill button filled with `#B8A9C9`, content rendered in `#121214` bold icon. Hover introduces a gentle luminosity increase rather than an abrupt color shift.
- **Secondary Actions (Skip, Shuffle, Repeat):** Transparent background with `#9A9AA3` iconography. Active state illuminates to `#EAEAF0` with a subtle 4px dot in `#B8A9C9` underneath.
- **Text & Ghost Buttons:** Padding `0.5rem 1rem`, rounded 9999px, subtle border `1px solid #2A2A30`, text in `#EAEAF0`.

### Scrub Bars & Sliders
- **Track Progress & Volume:** Refined thin track bar (height: 3px, expanding to 5px on track hover).
- **Track Fill:** Solid `#B8A9C9` for current progress; empty background is `#2A2A30`.
- **Thumb:** 10px circular pill head, `#EAEAF0`, visible on hover or during scrub interaction with an ease-out transition.

### Cards & Album Tiles
- **Container:** Background `#1A1A1E`, border `1px solid #2A2A30`, border radius 14px, padding 1rem.
- **Hover State:** Micro-lift of 2px (`transform: translateY(-2px)`), border shifts subtly to `#3A3A42`, shadow deepens subtly.
- **Artwork Container:** Rounded 10px with soft internal inset shadow to prevent light album covers from bleeding into dark UI.

### Track Lists & Rows
- **List Items:** Height 48px, horizontal padding 0.75rem, border-radius 8px.
- **State Changes:** Hover fills row with `#18181C`. Active/Playing track displays title in `#B8A9C9` with an animated 3-bar mini equalizer indicator in `#B8A9C9`.

### Chips & Filter Tags
- **Appearance:** Height 28px, border-radius 9999px, background `#18181C`, border `1px solid #2A2A30`, text `#9A9AA3` (label-md).
- **Active State:** Border `1px solid #B8A9C9`, background `#1A1A1E`, text `#EAEAF0`.

### Input Fields & Search
- **Container:** Height 36px, background `#18181C`, border `1px solid #2A2A30`, border-radius 9999px, padding `0 1rem`.
- **Placeholder & Focus:** Placeholder `#9A9AA3`; focus transition changes border to `#B8A9C9` with no heavy outline rings.