# POS System — Design System & Style Guide

You are building a modern, minimal restaurant POS system. Every UI decision must follow this design system precisely. Do not deviate unless explicitly told to.

---

## Philosophy

- Flat first. No box-shadows, no gradients, no blur, no glow effects.
- Depth is communicated through border weight and background layering only.
- Sparse color. The UI is near-neutral. Color only enters through pastel category tiles and semantic status badges.
- Monospace for numbers. Inter for everything else.
- All spacing is a multiple of 4px. No arbitrary values.
- Sentence case everywhere. No ALL CAPS labels, no Title Case body text. The only exception is section meta-labels (10px uppercase letter-spaced labels like "CATEGORY · STATUS").

---

## Typography

Primary font: Inter (weights 400 and 500 only — never 600+ except display sizes)
Numeric font: DM Mono (use exclusively for prices, quantities, order numbers, table IDs, counters)

Scale:
- Display:   32px / weight 600 / tracking -0.03em   → order totals, hero numbers
- Heading 1: 22px / weight 500 / tracking -0.02em   → page/section titles
- Heading 2: 18px / weight 500 / tracking -0.01em   → panel headers
- Heading 3: 15px / weight 500                       → card titles, item names
- Body:      13px / weight 400                       → descriptions, metadata
- Caption:   11px / weight 400                       → timestamps, subtexts
- Label:     10px / weight 600 / uppercase / tracking 0.10em → section dividers only

Rule: never use font-weight 600 or 700 for body or label text. Never mix monospace with UI labels.

---

## Color System

### Page background
#FAFAF9 — warm off-white (not pure white, reduces eye fatigue)

### Neutral scale (use for all UI surfaces)
50:  #FAFAF9   ← page background
100: #F2F1EF   ← input backgrounds
200: #E4E3DF   ← dividers, subtle borders
400: #C8C7C2   ← placeholder text, icons
600: #5A5A56   ← secondary text
800: #2C2C2A   ← primary text (soft)
900: #1A1A18   ← primary text (strong), button fills

### Category tile pastels (rotate in this order for menu categories)
Salmon:   bg #FFD4C8 / text #7A3520
Mint:     bg #C8EFE0 / text #1A5C40
Lavender: bg #DDD4F5 / text #3D2875
Sky:      bg #C8E4F5 / text #1A4A6C
Peach:    bg #FCE5C8 / text #7A4010
Rose:     bg #F5D0DC / text #6C1A30
Sage:     bg #D8EDD0 / text #2A5020
Lemon:    bg #F5F0C0 / text #5C4C00

Rule: text on a pastel tile must always be the darkest shade of that same hue. Never use #1A1A18 or generic gray on a colored tile.

### Semantic colors (status only — never decorative)
Success:  bg #C8EFD8 / text #2E9B65 / border #6BCA9A
Warning:  bg #FFE4C0 / text #E07030 / border #F5A94A
Danger:   bg #FFD0CC / text #E8472A / border #E8472A
Info:     bg #C8DEF5 / text #2F6DAE / border #5B9BD6

### Staff avatar colors (one per person, consistent per session)
Orange: #E07B40
Blue:   #2F6DAE
Green:  #2E9B65
Purple: #7F77DD
Coral:  #D85A30

### Primary action color
Fire orders / destructive actions: #E8472A (solid red, white text)
Primary CTA (Place Order etc.):   #1A1A18 (near-black, white text)

---

## Spacing

Base unit: 4px
Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px

Usage:
- Component internal padding:     16px
- Gap between cards/tiles:        10–12px
- Section gap:                    24–32px
- Inline element gap (icon+text): 6–8px
- Avatar overlap:                 -8px margin with 2px white border ring

Never use values like 5px, 7px, 9px, 11px, 15px, or 17px.

---

## Border Radius

xs:   4px  → chips, small tags
sm:   8px  → small buttons, steppers
md:   10px → standard buttons, inputs, form elements
lg:   14px → cards, item tiles, panels
xl:   20px → modals, overlays, large containers
pill: 9999px → badges, status dots, table chips, avatar circles

---

## Elevation (no shadows — border weight only)

Level 0 — resting:       border: 0.5px solid rgba(0,0,0,0.08)
Level 1 — hover:         border: 1px solid rgba(0,0,0,0.14)
Level 2 — active/focus:  border: 1.5px solid rgba(0,0,0,0.22)
Selected/accent:         border: 1.5px solid #1A1A18

Background layering:
- Page:        #FAFAF9
- Surface:     #F2F1EF (secondary areas, sidebar)
- Card:        #FFFFFF (raised components)
- Overlay:     #FFFFFF with Level 2 border

No box-shadow anywhere. No drop-shadow filters.

---

## Component Specs

### Category tiles
Size: ~120×88px minimum, border-radius: 14px
Layout: label bottom-left, count below label
Font: 13px/500 for name, 10px/400 for count (70% opacity)
Background: pastel from the rotation above
No icons unless explicitly required

### Menu item cards
Background: #FFFFFF, border: Level 0, border-radius: 12px, padding: 14px 16px
Rows: item name (13px/500) → price (13px/400, color #5A5A56) → footer row
Footer: order count left (11px, tertiary), quantity number right (20px/500, DM Mono) or stepper
Stepper buttons: 24×24px, 8px radius, Level 1 border, no fill

### Order side panel
Width: 220–260px, background: #FFFFFF, Level 0 border, border-radius: 14px, padding: 16px
Order rows: name left / price right, 12px, separated by 0.5px dividers
Highlighted row (selected/active item): background #FFE5D0, text color from Peach/Salmon ramp
Totals: Tax → Subtotal → Total in increasing weight (12px → 12px → 14px/500)
CTA buttons: full width, border-radius: 10px, height: 40px

### Buttons
Primary (Fire orders):   bg #E8472A, text #FFFFFF, radius 10px, padding 10px 20px
Primary (Place Order):   bg #1A1A18, text #FFFFFF, radius 10px, padding 10px 20px
Secondary:               bg transparent, border 1.5px #C8C7C2, text #1A1A18, same sizing
Ghost:                   bg transparent, no border, text #5A5A56
Small variant:           padding 6px 14px, font-size 12px, radius 8px

### Status badges
Shape: pill (border-radius 9999px), padding 3px 10px
Font: 11px/500
Include a 5px filled circle dot (same color as text) before the label
States: Success / Warning / Danger / Info as defined in semantic colors above

### Inputs
Height: 36px, border-radius: 9px, border: 1px solid #C8C7C2
Font: 13px Inter, padding: 9px 12px
Focus: border-color → #1A1A18 (no glow ring, no shadow)
Placeholder: color #C8C7C2

### Table chips (bottom status bar)
Shape: pill, background: #FFFFFF, Level 0 border
Contents: colored table number badge (28×28px, 8px radius) + staff name (12px/500) + item count (11px tertiary) + status badge
Table number badge: solid color per staff member (use staff avatar colors), white text, DM Mono

### Staff avatars
Size: 30–32px circle, border-radius: 50%
Solid background color (one per staff member, from avatar color list)
White initials, 12px/500 Inter
When stacked: margin-left -8px, border: 2px solid #FAFAF9

### Sidebar nav
Background: #F2F1EF, border-radius: 14px, border: Level 0, padding: 12px 0
Nav items: 13px Inter, padding 8px 16px, gap 6px (dot + label)
Active:   background #1A1A18, text #FFFFFF, border-radius: 8px, margin: 0 4px
Hover:    background #E4E3DF, text #1A1A18
Inactive: text #5A5A56

### Payment method pills
Layout: column (icon 16px + label 11px), border-radius: 10px, border: 1.5px
Size: min-width 64px, padding: 8px 16px
Inactive: border #C8C7C2, text #5A5A56
Active:   border #1A1A18, text #1A1A18, background #F2F1EF

---

## Dark Mode

When implementing dark mode, swap as follows:
- Page bg:      #141413
- Surface:      #1E1E1C
- Card:         #242422
- Border:       rgba(255,255,255,0.08) → rgba(255,255,255,0.14) → rgba(255,25