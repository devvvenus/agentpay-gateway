export type HeroSceneFrameInput = {
  width: number;
  scrollProgress: number;
  pointerX: number;
  pointerY: number;
  reducedMotion: boolean;
};

export type HeroSceneFrame = {
  cameraZ: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  scale: number;
};

const MAX_TILT = Math.PI / 180;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getHeroSceneFrame(input: HeroSceneFrameInput): HeroSceneFrame {
  const mobile = input.width < 720;
  if (input.reducedMotion) {
    return {
      cameraZ: 8.391871340979279,
      positionY: mobile ? -0.35 : -0.8727387364142434,
      positionZ: mobile ? 3.55 : 3.996385590577242,
      rotationX: mobile ? -Math.PI / 2 : -1.5707963267948966,
      rotationY: 0,
      scale: 1.5
    };
  }

  const scrollProgress = clamp(input.scrollProgress, 0, 1);
  const settledProgress = Math.min(1, scrollProgress / 0.4);
  return {
    cameraZ: 8.391871340979279,
    positionY: mobile ? -0.35 + 0.35 * settledProgress : -0.8727387364142434 + 0.8727387364142434 * settledProgress,
    positionZ: mobile ? 3.55 + 0.5 * settledProgress : 3.996385590577242 + 0.653889529693498 * settledProgress,
    rotationX: (mobile ? -Math.PI / 2 : -1.5707963267948966) * (1 - settledProgress) + clamp(input.pointerY, -1, 1) * MAX_TILT,
    rotationY: clamp(input.pointerX, -1, 1) * MAX_TILT + 1.5681030026170655 * settledProgress,
    scale: 1.5
  };
}
