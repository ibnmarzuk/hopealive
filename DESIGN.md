---
name: Hope-Alive
description: A warm, grounded visual system for the Hope-Alive Islamic Vacation Course.
colors:
  forest-ink: "#203a30"
  deep-forest: "#142b23"
  warm-cream: "#f3efe4"
  soft-paper: "#fbfaf6"
  clean-white: "#fffefa"
  sage: "#c5d0bc"
  pale-sage: "#e7eadf"
  aged-gold: "#c7a15d"
  washed-gold: "#efe5cd"
  quiet-lavender: "#d8d2df"
  muted-green: "#53655a"
  burnished-russet: "#944b34"
  soft-border: "rgba(32, 58, 48, 0.18)"
typography:
  display:
    fontFamily: '"Newsreader", Georgia, "Times New Roman", serif'
    fontSize: "clamp(3.6rem, 6.5vw, 6.2rem)"
    fontWeight: 400
    lineHeight: 0.96
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"Newsreader", Georgia, "Times New Roman", serif'
    fontSize: "clamp(2.8rem, 5.3vw, 5.2rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.65rem"
    fontWeight: 800
    letterSpacing: "0.2em"
rounded:
  sm: "7px"
  md: "12px"
  lg: "18px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.forest-ink}"
    textColor: "{colors.warm-cream}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "14px 26px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.deep-forest}"
    textColor: "{colors.warm-cream}"
    rounded: "{rounded.pill}"
  button-gold:
    backgroundColor: "{colors.aged-gold}"
    textColor: "{colors.deep-forest}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "12px 19px"
    height: "44px"
  card-paper:
    backgroundColor: "{colors.soft-paper}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.md}"
    padding: "24px"
  input-field:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.forest-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "48px"
  status-pill:
    backgroundColor: "{colors.pale-sage}"
    textColor: "{colors.forest-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  navigation:
    backgroundColor: "{colors.soft-paper}"
    textColor: "{colors.muted-green}"
    typography: "{typography.body}"
    height: "88px"
---

# Design System: Hope-Alive

## Overview

**Creative North Star: "The Gathering Place"**

Hope-Alive pairs a field-guide sensibility with the clarity of a practical registration and staff tool. The visual mood is warm, grounded, editorial, welcoming, and practical: forest green anchors the interface, cream and paper create calm reading surfaces, and restrained earth accents make actions and important details easy to find.

Headlines bring a quiet editorial voice; forms and operational information remain direct and legible. Raised cards give the registration flow, participant details, and admin actions a consistent sense of place without competing with the content. Keep the existing Hope-Alive identity and camp artwork; avoid generic charity-template styling and excessive religious decoration.

**Key Characteristics:**
- Forest-green anchors and warm, paper-like page surfaces.
- Editorial serif headings paired with practical sans-serif controls and labels.
- Confident rounded actions and softly lifted cards.
- Clear, mobile-first registration and staff workflows.

## Colors

The palette draws from a welcoming camp field guide: shaded forest, warm paper, soft sage, and restrained golden and russet marks.

### Primary
- **Forest Ink:** The main anchor for headings, primary actions, and the signal strip.
- **Deep Forest:** A darker companion for emphasis, button hover, and high-contrast moments.

### Secondary
- **Burnished Russet:** A small editorial accent for italic heading emphasis, links, and selected markers.
- **Aged Gold:** A warm action accent for the registration call to action and compact highlights.
- **Washed Gold:** A quiet supporting surface for donation and information areas.

### Tertiary
- **Quiet Lavender:** A gentle variation for programme artwork and supporting visual panels.

### Neutral
- **Warm Cream:** The softer ground for the hero, registration, and admin surfaces.
- **Soft Paper:** The primary page and card surface.
- **Clean White:** The near-white fill for form fields.
- **Sage:** A calm supporting color for illustrations and selected surfaces.
- **Pale Sage:** A light surface for participant and status panels.
- **Muted Green:** The secondary text color for supporting information.
- **Soft Border:** A low-contrast divider and field outline.

**The Shared Ground Rule.** Forest anchors the system; gold and russet stay accents, while pale surfaces keep instructions and payment states easy to scan.

## Typography

**Display Font:** Newsreader (with Georgia and Times New Roman fallbacks)  
**Body Font:** Inter (with system sans-serif fallbacks)  
**Label Font:** Inter

**Character:** Newsreader gives headings a considered, editorial voice. Inter keeps registration instructions, controls, status labels, and admin data crisp and familiar.

### Hierarchy
- **Display** (400, `clamp(3.6rem, 6.5vw, 6.2rem)`, 0.96 line height): The homepage hero and major page headings.
- **Headline** (400, `clamp(2.8rem, 5.3vw, 5.2rem)`, 0.98 line height): Section titles and large editorial statements.
- **Title** (400, about 1.5–1.65rem): Card titles, programme names, and form headings.
- **Body** (400, 1rem, 1.55 line height): Main copy, descriptions, and form instructions.
- **Label** (800, 0.65rem, 0.2em tracking, uppercase where used): Compact metadata and section labels.

**The Editorial Interface Rule.** Use the display serif for prominent headings; keep actions, forms, and operational labels in the body sans-serif.

## Layout

Public pages use generous editorial spacing and broad, responsive grids. The homepage pairs a text-led hero with camp artwork, then moves through concise registration guidance and programme details. Registration uses a two-column introduction and form card on wide screens, stacking into a single readable flow on smaller screens. The admin dashboard prioritizes its overview, search and filters, then the registration table.

Content widths are capped for long pages and kept fluid on small screens. The stylesheet uses responsive breakpoints at 980px, 800px, 760px, 480px, and 360px. On mobile, navigation collapses, multi-column sections stack, admin filters wrap, and form controls retain comfortable tap targets.

## Elevation & Depth

Cards and panels use consistently visible, forest-tinted shadows at rest. Softer shadows distinguish nested fields and participant blocks; interactive cards lift slightly on hover. The receipt dialog uses a stronger shadow to separate it from the dimmed page. Borders and tonal surfaces remain visible so depth is not communicated by shadow alone.

### Shadow Vocabulary
- **Surface** (`0 14px 30px rgba(20, 43, 35, 0.1)`): Registration, admin sign-in, and main content cards.
- **Soft Surface** (`0 8px 18px rgba(20, 43, 35, 0.07)`): Nested participant, fee, and summary panels.
- **Lifted Hover** (`0 20px 38px rgba(20, 43, 35, 0.14)`): Hover state for interactive cards.
- **Modal** (`0 24px 80px rgba(0, 0, 0, 0.28)`): The receipt-review dialog above the admin workspace.

**The Shared Lift Rule.** Give card surfaces a visible shadow at rest; use a stronger lift only for hover or modal hierarchy, and respect reduced-motion preferences.

## Shapes

Controls and compact status markers use generous pill silhouettes. Cards and form panels use softly curved corners, while fields keep a smaller, practical radius. Thin green-tinted borders define edges and preserve contrast between adjacent cream, paper, and sage surfaces. Camp artwork may use distinctive clipping and a curved top edge; keep that treatment specific to the hero image.

## Components

### Buttons
- **Character:** Confident, tactile controls with friendly rounded forms.
- **Shape:** Pill-shaped (`999px`).
- **Primary:** Forest Ink with Warm Cream text; the large registration action is about `52px` high.
- **Gold action:** Aged Gold with Deep Forest text; use for secondary registration prompts.
- **Secondary:** Outline or quiet text actions preserve the primary action’s visual priority.
- **Hover / Focus:** A short color and lift transition; keyboard focus stays clearly visible.

### Chips
- **Style:** Compact pill with a pale sage or status-specific fill and readable dark text.
- **State:** Payment status uses explicit wording as well as color.

### Cards / Containers
- **Corner Style:** Softly curved (`12px` typical; larger cards may use up to `18px`).
- **Background:** Soft Paper, Warm Cream, or Pale Sage, chosen by context.
- **Shadow Strategy:** Use the shared surface shadow at rest; nested content uses the softer value.
- **Border:** Keep a fine, low-contrast outline around raised card surfaces.
- **Internal Padding:** About `16px` for compact entries and `24px` for primary panels, with responsive padding where space is constrained.

### Inputs / Fields
- **Style:** Clean White fill, green-tinted border, and a practical `7px` radius.
- **Focus:** Darken the border and show a visible warm focus ring.
- **Error / Disabled:** Keep error messages explicit and readable; do not rely on color alone.

### Navigation
- **Style:** Light paper header with compact Inter labels and a distinct gold registration action.
- **States:** Links darken on hover; mobile navigation becomes a menu button and stacked menu.

### Participant Entry
The registration form groups each child’s name and class in a softly raised Pale Sage panel. Keep fee guidance close to the fields it depends on and preserve space for readable validation messages.

## Do's and Don'ts

### Do:
- **Do** use Warm Cream for editorial page areas and Soft Paper for forms and cards.
- **Do** lift key cards with the shared forest-tinted shadows and retain visible borders.
- **Do** keep Aged Gold and Burnished Russet as small action or emphasis accents.
- **Do** keep payment and eligibility states understandable without relying on color alone.
- **Do** retain the Hope-Alive identity and the existing camp artwork.

### Don't:
- **Don't** add unverified testimonials, impact numbers, or participant stories.
- **Don't** replace the local identity with generic charity imagery.
- **Don't** use decorative religious ornament as filler.
