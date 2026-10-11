---
name: Pastel Whimsy
colors:
  surface: '#fff8f7'
  surface-dim: '#e8d6d4'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0ef'
  surface-container: '#fdeae8'
  surface-container-high: '#f7e4e2'
  surface-container-highest: '#f1dedc'
  on-surface: '#231918'
  on-surface-variant: '#544243'
  inverse-surface: '#392e2d'
  inverse-on-surface: '#ffedeb'
  outline: '#877273'
  outline-variant: '#d9c1c1'
  surface-tint: '#96454d'
  primary: '#96454d'
  on-primary: '#ffffff'
  primary-container: '#ff9aa2'
  on-primary-container: '#792f38'
  inverse-primary: '#ffb2b7'
  secondary: '#71547c'
  on-secondary: '#ffffff'
  secondary-container: '#f5d0ff'
  on-secondary-container: '#74567e'
  tertiary: '#855300'
  on-tertiary: '#ffffff'
  tertiary-container: '#fba315'
  on-tertiary-container: '#663f00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdadb'
  primary-fixed-dim: '#ffb2b7'
  on-primary-fixed: '#3f020f'
  on-primary-fixed-variant: '#782e37'
  secondary-fixed: '#f8d8ff'
  secondary-fixed-dim: '#dfbae9'
  on-secondary-fixed: '#2a1135'
  on-secondary-fixed-variant: '#583c63'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#fff8f7'
  on-background: '#231918'
  surface-variant: '#f1dedc'
typography:
  display-lg:
    fontFamily: Comfortaa
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Comfortaa
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Comfortaa
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Comfortaa
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  title-lg:
    fontFamily: Quicksand
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  title-md:
    fontFamily: Quicksand
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Quicksand
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 26px
  body-md:
    fontFamily: Quicksand
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 22px
  label-md:
    fontFamily: Quicksand
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Quicksand
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies the playful, heartwarming spirit of Japanese-inspired Kawaii culture blended with cozy Korean stationery boutique aesthetics. Its core personality is gentle, joyful, tactile, and nurturing—creating an intimate, dreamlike digital shopping nook that feels like opening a freshly arrived parcel wrapped in pastel tissue paper and gold star stickers.

The target demographic spans stationery collectors, journaling enthusiasts, students, and lifestyle shoppers who find joy in cute desk accessories, planners, stickers, and plush details. Rather than sterile e-commerce minimalism, the interface relies on soft watercolor washes, pillowy interactive touchpoints, bouncy micro-interactions, and golden sparkle accents that celebrate creativity. The experience evokes warmth, unhurried delight, and pure comfort.

## Colors

The color palette centers around a dreamy confection of candy pastels anchored by an accessible, deep mocha brown to ensure comfortable legibility across all product narratives and price tiers.

- **Primary (`#FF9AA2`):** A soft cotton-candy rose with warm blush undertones, used for dominant call-to-actions, cart badges, and heart-shaped interactions.
- **Secondary (`#D8B4E2`):** Celestial lavender that balances warm blush with cool, soothing balance; applied to category filters, subtle container tints, and backdrop glows.
- **Tertiary (`#F59E0B`):** Warm golden amber inspired by starlight sparks and decorative washi tape seals, reserved for badges, ratings, promotional highlights, and sparkle flourishes.
- **Neutral (`#4A3E3D`):** Rich roasted mocha. Instead of harsh digital black, this deep warm brown ensures high contrast against pastel canvases while keeping the overall impression soft and storybook-like.
- **Background & Containers:** Layered ivory and creamy butter tones (`#FFFDF9`, `#FFF8E7`, and subtle watercolor rainbow linear gradients) allow cards to float like soft marshmallows.

## Typography

Typography prioritizes round, organic, bouncy letterforms to maintain the kawaii charm without sacrificing readability:

- **Comfortaa** provides character-rich display headings and promotional banners. Its circular geometry and softened apexes echo cloud puffs, playful stickers, and handwritten stationery covers.
- **Quicksand** handles all product titles, running body text, specs, and numeric pricing. Its generous x-height, rounded terminal stroke ends, and clear counters make extended browsing fatigue-free on both small mobile displays and desktop viewports.
- Keep body letter-spacing standard to slightly relaxed (`0` to `0.02em`), pairing with mocha brown (`#4A3E3D`) to avoid the low-contrast fuzziness that pure white or pale grays often create with rounded geometric typefaces.

## Elevation & Depth

Depth is modeled after soft tactile paper craft and buoyant plush cushions:

- **Cloud-Like Ambient Shadows:** Forego dark, stark drop shadows in favor of wide-diffusion, low-opacity pastel blurs. Elevate containers using multi-layer shadows tinted with warm blush: `0 8px 24px -4px rgba(255, 154, 162, 0.18), 0 2px 6px 0 rgba(74, 62, 61, 0.04)`.
- **Tonal Layering:** Base canvases use a pale butter/cloud ivory (`#FFFDF9`). Elevated surfaces use pure white (`#FFFFFF`) with ultra-fine borders (`1.5px solid rgba(216, 180, 226, 0.35)`) to maintain silhouette clarity against watercolor backdrops.
- **Floating Hover Physics:** Product cards and interactive badges softly translate upward (`translateY(-4px)`) on hover or focus, accompanied by a faint golden glow (`rgba(245, 158, 11, 0.25)`) and subtle sparkle animations.

## Shapes

The design system embraces maximum softness (`roundedness: 3`), ensuring nearly every interactive element takes the shape of a smooth lozenge, pill, or bubbly pebble:

- **Pill Silhouette (`rounded-full`):** All action buttons, filter tags, price tags, and search inputs feature full pill radius.
- **Soft Pebble Surfaces (`rounded-2xl` to `rounded-3xl`):** Product cards, modal windows, and notification banners utilize `24px` to `32px` corners, ensuring corners never feel sharp or mechanical.
- **Whimsical Borders:** Outer packaging, promo banners, and mascot badges incorporate circular scalloped trims, pastel braided outlines, and hand-drawn star motifs.

## Components

### Buttons
- **Primary Action:** Pill-shaped (`rounded-full`), saturated candy blush background (`#FF9AA2`), crisp mocha text (`#4A3E3D`), and subtle top highlight sheen. Hover invokes a gentle bounce (`scale(1.03)`) and an amber-tinted shadow lift.
- **Secondary Action:** Pill-shaped with a celestial lavender wash (`#F3E8F9`) and a soft lilac border (`#D8B4E2`), housing friendly bold text.
- **Sparkle Icon Buttons:** Compact circular capsules (`44px` minimum touch target) reserved for favorite/wishlist hearts and shopping bag triggers, crowned by a faint golden star emblem.

### Chips & Filter Badges
- Fully rounded pills with `0.5rem` vertical and `1rem` horizontal padding.
- Unselected chips feature frosted vanilla surfaces (`#FFFBF0`) with delicate mocha borders (`rgba(74, 62, 61, 0.12)`).
- Selected chips activate a gentle pastel pink or lavender fill accompanied by a tiny golden sparkle prefix icon (`✦`).

### Product Cards
- Marshmallow white cards (`#FFFFFF`) framed by a dreamy `1.5px` lavender-tinted contour.
- Imagery is framed in soft, slightly curved cutouts featuring warm pastel gradient backdrops (pink to butter-yellow).
- Product title set in `title-md` mocha typography; price styled prominently with warm golden amber badge accents.
- Floating quick-add button sits poised in the lower right corner as an elevated circular pill.

### Form Inputs & Search Fields
- Generously rounded (`rounded-full` or `rounded-2xl`) with `14px 20px` internal padding.
- Background uses a soft cloud tint (`#FAF7F5`), turning pure white with a lavender-blush glow (`outline: 3px solid rgba(255, 154, 162, 0.35)`) upon keyboard focus.
- Placeholder text in softened warm mocha (`rgba(74, 62, 61, 0.5)`).

### Checkboxes & Radio Buttons
- Custom rounded-square (checkbox) and bubble circle (radio) toggles with thicker `2px` borders in pastel rose.
- Checked states display a filled candy rose background hosting a crisp white checkmark or a golden star glyph.

### Floating Cart & Toast Notifications
- Floats over content as a soft cloud bubble with a multi-stop gradient border and pillowy shadow.
- Accompanied by playful micro-copy ("Packed with love! ✨") and mascot-inspired icon stickers.