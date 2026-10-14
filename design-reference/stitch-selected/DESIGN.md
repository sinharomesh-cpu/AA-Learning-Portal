---
name: Lumina Learn
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3f4850'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#707881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006398'
  primary: '#006194'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#93ccff'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#006947'
  on-tertiary: '#ffffff'
  tertiary-container: '#00855b'
  on-tertiary-container: '#f5fff6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Outfit
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2.5rem
  margin-mobile: 1rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

The design system is crafted for an AI-powered interactive learning companion targeting children aged 6–11 alongside their parents and educators. The interface reconciles two foundational demands: vibrant, gamified encouragement that sparks children's intrinsic curiosity, and an orderly, high-legibility structure that instills absolute trust in supervising adults.

The visual style blends **Playful Tactility** with **Modern Soft Minimalism**:
- Generous, organic corner radiuses convey emotional safety and physical comfort.
- Soft, pillowy lift and micro-shadows emulate real-world tactile learning blocks rather than flat corporate SaaS patterns.
- High-contrast visual hierarchy prevents cognitive fatigue, catering to emerging readers and neurodiverse learning styles without infantilizing the experience.
- Interactive affordances are oversized, self-evident, and responsive, offering satisfying micro-interactions that celebrate small learning victories.

## Colors

The palette balances energy and calm focus, preventing sensory overload while maintaining joyful engagement.

- **Primary (`#0284C7` Cerulean Sky):** Guides focus and navigational milestones. Represents discovery, sky, and broad horizons.
- **Secondary (`#F59E0B` Warm Sunshine):** Highlights achievements, active streaks, points, AI prompts, and immediate celebratory focal points.
- **Tertiary (`#10B981` Mint Emerald):** Signals success, completed milestones, mastered topics, and affirmative confirmation actions.
- **Neutrals & Surfaces:**
  - Background Canvas: `#F8FAFC` (Slate-50) tinted with warm white `#FFFFFF` surface layers.
  - Borders & Dividers: `#E2E8F0` (Slate-200) for soft separation.
  - High-Contrast Text: `#0F172A` (Slate-900) for body and headlines, `#475569` (Slate-600) for parent-facing secondary descriptors.
- **Subject Accent Spectrum:**
  - Discovery & Reading: Soft Lilac (`#8B5CF6` / Surface `#F5F3FF`)
  - Creative Expression & Arts: Coral Peach (`#F43F5E` / Surface `#FFF1F2`)
  - STEM & Logic: Bright Cyan (`#06B6D4` / Surface `#ECFEFF`)

## Typography

Typography prioritizes character distinctiveness, open counters, and high x-heights suited for developing readers.

- **Display & Headlines (Outfit):** Geometric, warm, and highly legible. The rounded terminal characteristics make large phrases inviting and approachable without feeling overly immature.
- **Body & Labels (Plus Jakarta Sans):** Balances clarity with a clean rhythm. Set at medium (`500`) weight by default instead of regular (`400`) to improve legibility on varied screen qualities and high-glare environments.
- **Dyslexia and Early-Reader Accommodations:** Line heights are deliberately expanded to `1.4–1.5x` standard measure to prevent visual line crowding. Letter spacing on interactive labels is slightly elevated to ensure immediate recognizability at a glance.

## Layout & Spacing

The layout structure accommodates fine and gross motor controls with spacious touch pads and comfortable spatial margins.

- **Grid Model:** 12-column responsive fluid grid on desktop/tablets, reflowing to a 4-column layout on mobile viewports.
  - Breakpoints: Mobile (`< 640px`), Tablet (`640px – 1024px`), Desktop (`> 1024px`).
  - Desktop Max Canvas Width: `1280px` centered to maintain bounded eye tracking during lessons.
- **Ergonomics & Touch Targets:**
  - Interactive targets never drop below `48px × 48px`, with preferred child controls sized at `56px × 56px` or greater.
  - Bottom navigation bars and primary action hubs sit within thumb-reach zones on mobile devices.
  - Dense dashboards split into progressive single-concept views for young learners, collapsing secondary metrics into parent-gated panels.

## Elevation & Depth

Visual hierarchy combines warm ambient illumination with subtle physical dimension, reinforcing the feeling of physical play elements:

- **Level 0 (Flat Canvas):** `#F8FAFC` base backdrop. No shadows.
- **Level 1 (Card Bases & Containers):** Pure `#FFFFFF` elevated with a double-layered soft shadow: `0 4px 12px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)` alongside a subtle border `1px solid rgba(226, 232, 240, 0.8)`.
- **Level 2 (Interactive Modules & Hover Targets):** Soft lift utilizing blue-tinted shadows: `0 10px 25px -4px rgba(2, 132, 199, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Modals, AI Dialogue Overlays & Celebration Sheets):** Ambient blur with strong focus isolation: `0 20px 35px -5px rgba(15, 23, 42, 0.12), 0 8px 16px -4px rgba(15, 23, 42, 0.04)`.
- **Tactile Push Interaction (Buttons & Badges):** Active states drop elevation and compress internal margins with a `translate-y-0.5` transform to give a tactile, squishy mechanical feedback.

## Shapes

The design system enforces a pill-shaped and pillowy geometry:

- **Radii Architecture:**
  - Core Elements (Inputs, Buttons, Chips): Pill radius (`9999px` / `rounded-full`).
  - Content Cards & Lesson Containers: Extra-large rounding (`1.5rem` / `24px`) to remove sharp vertices.
  - Nested Inner Containers: `1rem` (`16px`) to produce organic, concentric padding curves.
- **Visual Safety:** Sharp 90-degree corners are eliminated across all surfaces, ensuring every interactive element feels friendly, approachable, and physically touchable.

## Components

### Buttons
- **Primary Action (Lesson Start / AI Chat):** Cerulean sky `#0284C7` background, white text, pill shape, minimum height `52px`. Includes a subtle 2px bottom lip shadow in `#0369A1` that depresses upon clicking.
- **Secondary Action (Parent Reviews / Secondary Paths):** Transparent surface with `#E2E8F0` border, `#0F172A` text, hover background `#F1F5F9`.
- **Reward / Celebration Action:** Sunshine amber `#F59E0B` with high-contrast text (`#78350F` or `#FFFFFF`), accompanied by particle or star icons.

### Chips & Subject Badges
- Fully rounded pills (`rounded-full`) with `12px` horizontal padding and `6px` vertical padding.
- Tinted pastel surfaces with matching saturated text (e.g., Mint Emerald Chip: Background `#ECFDF5`, Border `#A7F3D0`, Text `#065F46`).
- Always paired with an illustrative, high-legibility glyph or emoji prefix for quick non-textual comprehension.

### Cards & Lesson Tiles
- Surface: `#FFFFFF` with `24px` rounded corners.
- Structure: Clear hierarchy featuring an oversized graphic thumbnail, bold title (`headline-md`), progress meter, and immediate primary action.
- Interactive Cards: Elevated with `2px` inset borders on hover or focus, shifting to a vibrant sky-blue perimeter.

### Checkboxes & Radio Buttons
- Oversized dimensions: `28px × 28px` minimum bounding box.
- Radii: Checkboxes use `8px` rounded corners; Radio inputs are fully circular.
- Selected state uses bold mint green (`#10B981`) or cerulean (`#0284C7`) fills with thick white inner checkmarks (`3px` stroke).

### Input Fields
- Minimum height: `52px` with `1rem` inline padding.
- Border: `2px` solid `#CBD5E1`, transitioning to `#0284C7` with a `4px` focus ring tinted at 15% opacity.
- Generous typography size (`18px`) prevents automatic viewport zoom on mobile web browsers while keeping text clear for young learners.

### AI Companion Bubble & Learning Prompts
- Friendly speech bubble containers with a distinct directional tail and soft lilac or warm amber border.
- Integrated audio-play button (`44px` diameter circular pill) allowing text-to-speech replay on all instructional prompts.