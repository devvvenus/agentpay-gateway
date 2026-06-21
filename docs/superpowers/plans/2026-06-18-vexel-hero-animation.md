# Vexel Hero Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing hero's 2D sphere with the licensed Vexel GLB animation and reference-grade WebGL lighting.

**Architecture:** A client-only Three.js component loads local GLB and alpha-map assets, applies the inspected material and post-processing settings, and renders behind the existing hero content. The component owns lifecycle cleanup and responsive behavior so the payment UI remains independent.

**Tech Stack:** Next.js, React, Three.js, GLTFLoader, EffectComposer, UnrealBloomPass, Playwright.

---

### Task 1: Add Scene Runtime And Licensed Assets

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/public/hero/model.glb`
- Create: `apps/web/public/hero/alpha-map.png`

- [x] Install `three` and `@types/three` in the web workspace.
- [x] Copy the user-approved assets into the local public asset directory.
- [x] Verify both files exist and have non-zero size.

### Task 2: Build The WebGL Hero Scene

**Files:**
- Create: `apps/web/app/components/HeroScene.tsx`
- Modify: `apps/web/app/page.tsx`

- [x] Initialize renderer, scene, responsive perspective camera, GLTF loader, material, two point lights and ambient light.
- [x] Configure effect composer with bloom and tone mapping.
- [x] Play the GLB `Animation` clip at half speed.
- [x] Add subtle pointer tilt and scroll-driven transform with reduced-motion handling.
- [x] Dispose renderer, composer, geometry, materials, textures, listeners and animation frame on unmount.
- [x] Dynamically import the scene with SSR disabled and remove the old 2D canvas implementation.

### Task 3: Integrate Responsive Visual Treatment

**Files:**
- Modify: `apps/web/app/globals.css`

- [x] Replace `.payment-sphere` styling with a full-bleed `.hero-scene` layer.
- [x] Tune hero background, scene mask, stacking and mobile framing.
- [x] Keep all hero controls readable and clickable above the canvas.

### Task 4: Verify Production Quality

**Files:**
- Test: landing page in browser at desktop and mobile viewports.

- [x] Run `pnpm typecheck` and expect success.
- [x] Run `pnpm build` and expect success.
- [x] Capture desktop and mobile screenshots.
- [x] Inspect screenshots and confirm nonblank canvas, correct framing, readable copy and no overlap.
- [x] Confirm the paid-agent button still targets the unchanged real stream endpoint without triggering a paid run during visual QA.
