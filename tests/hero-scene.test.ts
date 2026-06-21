import { describe, expect, it } from "vitest";
import { getHeroSceneFrame } from "../apps/web/app/components/hero-scene-motion";

describe("getHeroSceneFrame", () => {
  it("starts from the reference scene camera and object transform", () => {
    const frame = getHeroSceneFrame({
      width: 1440,
      scrollProgress: 0,
      pointerX: 4,
      pointerY: -4,
      reducedMotion: false
    });

    expect(frame.cameraZ).toBeCloseTo(8.391871, 5);
    expect(frame.positionY).toBeCloseTo(-0.872739, 5);
    expect(frame.positionZ).toBeCloseTo(3.996386, 5);
    expect(frame.rotationX).toBeCloseTo(-1.58825, 4);
    expect(frame.rotationY).toBeCloseTo(0.01745, 4);
    expect(frame.scale).toBe(1.5);
  });

  it("settles the model toward the reference scroll-rested state", () => {
    const frame = getHeroSceneFrame({
      width: 390,
      scrollProgress: 0.5,
      pointerX: 0,
      pointerY: 0,
      reducedMotion: false
    });

    expect(frame.cameraZ).toBeCloseTo(8.391871, 5);
    expect(frame.positionY).toBeCloseTo(0, 4);
    expect(frame.positionZ).toBeCloseTo(4.05, 4);
    expect(frame.rotationX).toBeCloseTo(0, 4);
    expect(frame.rotationY).toBeCloseTo(1.5681, 4);
    expect(frame.scale).toBe(1.5);
  });

  it("disables pointer and scroll transforms for reduced motion", () => {
    const frame = getHeroSceneFrame({
      width: 1440,
      scrollProgress: 1,
      pointerX: 1,
      pointerY: 1,
      reducedMotion: true
    });

    expect(frame.positionY).toBeCloseTo(-0.872739, 5);
    expect(frame.positionZ).toBeCloseTo(3.996386, 5);
    expect(frame.rotationX).toBeCloseTo(-1.5708, 4);
    expect(frame.rotationY).toBe(0);
  });
});
