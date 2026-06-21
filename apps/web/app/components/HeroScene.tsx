"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { getHeroSceneFrame } from "./hero-scene-motion";

const MODEL_URL = "/hero/model.glb";
const ALPHA_MAP_URL = "/hero/alpha-map.png";

export default function HeroScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.WebGLRenderingContext) {
      host?.setAttribute("data-scene-state", "unsupported");
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    host.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.55, 0.94);
    composer.addPass(bloom);

    const animatedGroup = new THREE.Group();
    scene.add(animatedGroup);

    const ambient = new THREE.AmbientLight(0xffffff, 2);
    scene.add(ambient);
    const bottomLeft = new THREE.PointLight(0x0a6fd8, 16, 20, 1.76);
    bottomLeft.position.set(-1.08, -0.94, 1.22);
    animatedGroup.add(bottomLeft);
    const topRight = new THREE.PointLight(0x1686e8, 14, 34.15, 0);
    topRight.position.set(0.87, 1.18, 1.22);
    animatedGroup.add(topRight);

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0, y: 0 };
    const clock = new THREE.Clock();
    let mixer: THREE.AnimationMixer | null = null;
    let frameId = 0;
    let disposed = false;

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/hero/draco/");
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    const textureLoader = new THREE.TextureLoader();

    Promise.all([gltfLoader.loadAsync(MODEL_URL), textureLoader.loadAsync(ALPHA_MAP_URL)])
      .then(([gltf, alphaMap]) => {
        if (disposed) return;
        alphaMap.wrapS = THREE.ClampToEdgeWrapping;
        alphaMap.wrapT = THREE.ClampToEdgeWrapping;
        alphaMap.flipY = false;
        alphaMap.needsUpdate = true;

        gltf.scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const sourceMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
          object.material = new THREE.MeshPhysicalMaterial({
            map: sourceMaterial instanceof THREE.MeshStandardMaterial ? sourceMaterial.map : null,
            alphaMap,
            alphaTest: 0.1,
            color: 0x0047b8,
            emissive: 0x1f6fdb,
            emissiveIntensity: 0.58,
            metalness: 1,
            roughness: 1,
            reflectivity: 0.5,
            side: THREE.FrontSide
          });
          object.castShadow = false;
          object.receiveShadow = true;
        });

        animatedGroup.add(gltf.scene);
        const animation = gltf.animations.find((clip) => clip.name === "Animation") ?? gltf.animations[0];
        if (animation && !reducedMotionQuery.matches) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          mixer.clipAction(animation).setEffectiveTimeScale(0.5).play();
        }
        host.setAttribute("data-scene-state", "ready");
      })
      .catch((error: unknown) => {
        host.setAttribute("data-scene-state", "failed");
        console.error("AgentPay hero scene failed to load", error);
      });

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const updatePointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    const render = () => {
      const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const scrollProgress = Math.min(1, Math.max(0, window.scrollY / scrollRange));
      const target = getHeroSceneFrame({
        width: host.clientWidth,
        scrollProgress,
        pointerX: pointer.x,
        pointerY: pointer.y,
        reducedMotion: reducedMotionQuery.matches
      });

      camera.position.z = target.cameraZ;
      animatedGroup.position.y += (target.positionY - animatedGroup.position.y) * 0.055;
      animatedGroup.position.z += (target.positionZ - animatedGroup.position.z) * 0.055;
      animatedGroup.rotation.x += (target.rotationX - animatedGroup.rotation.x) * 0.045;
      animatedGroup.rotation.y += (target.rotationY - animatedGroup.rotation.y) * 0.045;
      animatedGroup.scale.setScalar(target.scale);
      mixer?.update(Math.min(clock.getDelta(), 0.05));
      composer.render();
      frameId = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    frameId = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", updatePointer);
      window.cancelAnimationFrame(frameId);
      mixer?.stopAllAction();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
      dracoLoader.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="hero-scene" data-scene-state="loading" ref={hostRef} aria-hidden="true" />;
}
