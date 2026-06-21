# Vexel-Inspired Hero Animation Design

## Goal

Replace the landing page's hand-drawn 2D canvas sphere with the licensed Vexel GLB scene while preserving AgentPay's product copy, live payment action, and responsive hierarchy.

## Visual System

- Full-bleed WebGL scene behind the hero copy and live command panel.
- Licensed `model.glb` supplies the animated geometry.
- Licensed `alpha-map.png` masks the repeated luminous surface pattern.
- Blue physical material uses emissive lighting and bloom to match the reference.
- Two cyan point lights and low ambient light create depth without hiding text.
- Pointer tilt is deliberately subtle; scroll progress moves and rotates the scene.

## Architecture

- `HeroScene.tsx` owns Three.js setup, asset loading, animation, resize, pointer, scroll, reduced-motion handling, and disposal.
- The component is dynamically imported with SSR disabled so Three.js is excluded from server rendering.
- Assets are served locally from `apps/web/public/hero` to avoid hotlinking and external runtime dependency.
- The existing paid-agent request flow remains unchanged.

## Responsive And Failure Behavior

- Desktop and mobile use different camera framing but the same scene.
- Device pixel ratio is capped to protect GPU performance.
- Reduced-motion mode renders a stable scene with pointer and scroll movement disabled.
- If WebGL or an asset fails, the existing CSS background remains visible and the hero stays usable.

## Verification

- Typecheck and production build must pass.
- Browser screenshots must be inspected at desktop and mobile sizes.
- Canvas pixels must be nonblank and the hero copy/actions must remain readable and clickable.

