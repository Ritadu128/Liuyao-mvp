/**
 * CoinScene.tsx
 * Three.js 3D 硬币投掷场景
 * - 背景：米白宣纸渐变 (#F5F0E6 → #EFE6D6) + subtle vignette，与全站风格一致
 * - 俯视 35° 斜角相机，FOV 42°
 * - 三枚乾隆通宝铜钱（CylinderGeometry，三材质：顶/底贴图+侧面金属）
 * - 贴图路径：/assets/coin-front.jpg 和 /assets/coin-back.jpg（实际文件为 .jpg）
 * - 贴图加载失败时 console.error 输出 URL
 */
import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

export type CoinFace = 2 | 3; // 2=反面, 3=正面

export interface CoinSceneProps {
  throwResults: CoinFace[] | null;
  onAnimationComplete?: () => void;
  isThrowingRef?: React.MutableRefObject<boolean>;
}

// ─── 贴图路径（实际文件为 .jpg）─────────────────────────────────────────────
const COIN_FRONT_URL = '/assets/coin-front.jpg';
const COIN_BACK_URL  = '/assets/coin-back.jpg';

// ─── 常量 ──────────────────────────────────────────────────────────────────
const COIN_RADIUS   = 1.0;
const COIN_HEIGHT   = COIN_RADIUS / 7.5;
const COIN_SEGMENTS = 64;
const COIN_X_POSITIONS = [-2.4, 0, 2.4];
const COIN_SPIN_OFFSETS = [
  { x: 0.8, z: 0.15 },
  { x: 1.0, z: -0.1 },
  { x: 0.9, z: 0.2 },
];
const LAND_TIME_OFFSETS = [0, 0.12, -0.1];
const T_RISE = 0.5;
const T_FLIP = 0.85;
const T_LAND = 0.55;
const T_DAMP = 0.65;
const T_SHOW = 0.8;
const THROW_HEIGHT = 4.5;
const TABLE_Y = -1.2;

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t: number)  { return t * t * t; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

interface CoinState {
  mesh: THREE.Mesh;
  startY: number;
  peakY: number;
  landY: number;
  totalTime: number;
  timeOffset: number;
  spinSpeed: { x: number; z: number };
  targetRotX: number;
  phase: 'idle' | 'rise' | 'flip' | 'land' | 'damp' | 'done';
  elapsed: number;
  phaseStart: number;
}

export default function CoinScene({ throwResults, onAnimationComplete }: CoinSceneProps) {
  const mountRef          = useRef<HTMLDivElement>(null);
  const sceneRef          = useRef<THREE.Scene | null>(null);
  const rendererRef       = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef         = useRef<THREE.PerspectiveCamera | null>(null);
  const coinsRef          = useRef<CoinState[]>([]);
  const animFrameRef      = useRef<number>(0);
  const clockRef          = useRef<THREE.Clock>(new THREE.Clock(false));
  const texturesRef       = useRef<{ front: THREE.Texture | null; back: THREE.Texture | null }>({ front: null, back: null });
  const isAnimatingRef    = useRef(false);
  const completedCoinsRef = useRef(0);

  const createCoinMesh = useCallback((frontTex: THREE.Texture | null, backTex: THREE.Texture | null) => {
    const geo       = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, COIN_SEGMENTS);
    const goldColor = new THREE.Color(0xc8a84b);
    const sideMat = new THREE.MeshStandardMaterial({ color: goldColor, metalness: 0.85, roughness: 0.25 });
    const topMat  = new THREE.MeshStandardMaterial({ map: frontTex ?? null, color: frontTex ? 0xffffff : goldColor, metalness: 0.6, roughness: 0.35 });
    const botMat  = new THREE.MeshStandardMaterial({ map: backTex  ?? null, color: backTex  ? 0xffffff : goldColor, metalness: 0.6, roughness: 0.35 });
    const mesh = new THREE.Mesh(geo, [sideMat, topMat, botMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // 渲染器（不透明，背景色设为宣纸中间色）
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xF0EAD8, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    // 轻微暖雾，增加纵深感
    scene.fog = new THREE.FogExp2(0xF5F0E6, 0.04);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.set(0, 8.5, 7.5);
    camera.lookAt(0, TABLE_Y, 0);
    cameraRef.current = camera;

    // ── 暖色环境光 ──────────────────────────────────────────────────────────
    // 环境光：暖米白，柔和基础亮度
    scene.add(new THREE.AmbientLight(0xFFF5DC, 1.8));

    // 主方向光：暖黄，从右上方斜打，模拟窗光
    const dirLight = new THREE.DirectionalLight(0xFFE8A0, 3.2);
    dirLight.position.set(5, 12, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width  = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near   = 0.5;
    dirLight.shadow.camera.far    = 50;
    dirLight.shadow.camera.left   = -8;
    dirLight.shadow.camera.right  = 8;
    dirLight.shadow.camera.top    = 8;
    dirLight.shadow.camera.bottom = -8;
    scene.add(dirLight);

    // 补光：暖橙，从左侧减少阴影过深
    const fillLight = new THREE.DirectionalLight(0xFFD580, 1.2);
    fillLight.position.set(-4, 6, 2);
    scene.add(fillLight);

    // 底部反射光：模拟宣纸桌面反射
    const bounceLight = new THREE.DirectionalLight(0xFFF0CC, 0.6);
    bounceLight.position.set(0, -3, 2);
    scene.add(bounceLight);

    // ── 桌面（宣纸色，接收阴影）──────────────────────────────────────────────
    const tableGeo = new THREE.PlaneGeometry(20, 20);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0xEFE6D6, roughness: 0.92, metalness: 0.0, transparent: true, opacity: 0.55,
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.rotation.x   = -Math.PI / 2;
    table.position.y   = TABLE_Y - COIN_HEIGHT / 2;
    table.receiveShadow = true;
    scene.add(table);

    // ── 加载贴图（.jpg）──────────────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    let frontLoaded = false;
    let backLoaded  = false;

    const tryUpdateTextures = () => {
      if (!frontLoaded || !backLoaded) return;
      coinsRef.current.forEach((cs) => {
        const mats = cs.mesh.material as THREE.MeshStandardMaterial[];
        if (texturesRef.current.front) {
          mats[1].map = texturesRef.current.front;
          mats[1].color.set(0xffffff);
          mats[1].needsUpdate = true;
        }
        if (texturesRef.current.back) {
          mats[2].map = texturesRef.current.back;
          mats[2].color.set(0xffffff);
          mats[2].needsUpdate = true;
        }
      });
    };

    loader.load(
      COIN_FRONT_URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        texturesRef.current.front = tex;
        frontLoaded = true;
        tryUpdateTextures();
      },
      undefined,
      (err) => {
        console.error('[CoinScene] 正面贴图加载失败:', COIN_FRONT_URL, err);
        frontLoaded = true;
        tryUpdateTextures();
      }
    );

    loader.load(
      COIN_BACK_URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        texturesRef.current.back = tex;
        backLoaded = true;
        tryUpdateTextures();
      },
      undefined,
      (err) => {
        console.error('[CoinScene] 反面贴图加载失败:', COIN_BACK_URL, err);
        backLoaded = true;
        tryUpdateTextures();
      }
    );

    // ── 立即创建三枚硬币（金色占位，贴图加载后更新）──────────────────────
    const coinStates: CoinState[] = [];
    for (let i = 0; i < 3; i++) {
      const mesh = createCoinMesh(null, null);
      mesh.position.set(COIN_X_POSITIONS[i], TABLE_Y, 0);
      mesh.rotation.x = 0;
      scene.add(mesh);
      coinStates.push({
        mesh,
        startY: TABLE_Y,
        peakY: TABLE_Y + THROW_HEIGHT + (Math.random() * 0.5 - 0.25),
        landY: TABLE_Y,
        totalTime: T_RISE + T_FLIP + T_LAND + T_DAMP + T_SHOW,
        timeOffset: LAND_TIME_OFFSETS[i],
        spinSpeed: COIN_SPIN_OFFSETS[i],
        targetRotX: 0,
        phase: 'idle',
        elapsed: 0,
        phaseStart: 0,
      });
    }
    coinsRef.current = coinStates;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (isAnimatingRef.current) {
        const delta = clockRef.current.getDelta();
        updateCoins(delta);
      } else {
        coinsRef.current.forEach((cs, i) => { cs.mesh.rotation.y += 0.008 + i * 0.002; });
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCoins = useCallback((delta: number) => {
    let allDone = true;

    coinsRef.current.forEach((cs) => {
      if (cs.phase === 'done') return;
      allDone = false;

      cs.elapsed += delta;
      const t = cs.elapsed + cs.timeOffset;
      if (t < 0) return;

      if (t < T_RISE) {
        cs.phase = 'rise';
        cs.mesh.position.y = lerp(TABLE_Y, cs.peakY, easeOutCubic(t / T_RISE));
        cs.mesh.rotation.x += delta * (Math.PI * 3 * cs.spinSpeed.x);
        cs.mesh.rotation.z += delta * (Math.PI * cs.spinSpeed.z);
        cs.mesh.rotation.y += delta * 0.5;
        return;
      }
      const tAfterRise = t - T_RISE;
      if (tAfterRise < T_FLIP) {
        cs.phase = 'flip';
        cs.mesh.position.y = lerp(cs.peakY, TABLE_Y + COIN_HEIGHT * 2, easeInCubic(tAfterRise / T_FLIP));
        cs.mesh.rotation.x += delta * (Math.PI * 4 * cs.spinSpeed.x);
        cs.mesh.rotation.z += delta * (Math.PI * 0.8 * cs.spinSpeed.z);
        cs.mesh.rotation.y += delta * 0.3;
        return;
      }
      const tAfterFlip = tAfterRise - T_FLIP;
      if (tAfterFlip < T_LAND) {
        cs.phase = 'land';
        const p = tAfterFlip / T_LAND;
        cs.mesh.position.y = TABLE_Y + Math.sin(p * Math.PI) * 0.4;
        const spinDecay = 1 - easeOutCubic(p);
        cs.mesh.rotation.x += delta * (Math.PI * 2 * cs.spinSpeed.x * spinDecay);
        cs.mesh.rotation.z += delta * (Math.PI * 0.3 * cs.spinSpeed.z * spinDecay);
        return;
      }
      const tAfterLand = tAfterFlip - T_LAND;
      if (tAfterLand < T_DAMP) {
        cs.phase = 'damp';
        cs.mesh.position.y = TABLE_Y;
        const dampFactor = easeOutCubic(tAfterLand / T_DAMP);
        cs.mesh.rotation.x = lerp(cs.mesh.rotation.x, cs.targetRotX, dampFactor * 0.15);
        cs.mesh.rotation.z = lerp(cs.mesh.rotation.z, 0, dampFactor * 0.15);
        return;
      }
      // 展示结果 → 标记完成
      cs.phase = 'done';
      cs.mesh.position.y = TABLE_Y;
      cs.mesh.rotation.x = cs.targetRotX;
      cs.mesh.rotation.z = 0;
      completedCoinsRef.current += 1;
    });

    if (allDone && isAnimatingRef.current) {
      isAnimatingRef.current = false;
      onAnimationComplete?.();
    }
  }, [onAnimationComplete]);

  useEffect(() => {
    if (!throwResults || throwResults.length !== 3) return;

    completedCoinsRef.current = 0;
    isAnimatingRef.current    = true;
    clockRef.current.start();

    coinsRef.current.forEach((cs, i) => {
      const result      = throwResults[i];
      const currentX    = cs.mesh.rotation.x;
      const normalizedX = currentX % (Math.PI * 2);

      let targetX: number;
      if (result === 3) {
        const n = Math.round(currentX / (Math.PI * 2));
        targetX = n * Math.PI * 2;
        if (Math.abs(targetX - currentX) < Math.PI * 2)
          targetX += Math.PI * 2 * (currentX >= 0 ? 1 : -1);
      } else {
        const n = Math.round((currentX - Math.PI) / (Math.PI * 2));
        targetX = n * Math.PI * 2 + Math.PI;
        if (Math.abs(targetX - currentX) < Math.PI * 2)
          targetX += Math.PI * 2;
      }

      cs.mesh.position.set(COIN_X_POSITIONS[i], TABLE_Y, 0);
      cs.mesh.rotation.set(normalizedX, 0, 0);
      cs.targetRotX = targetX;
      cs.peakY      = TABLE_Y + THROW_HEIGHT + (Math.random() * 0.6 - 0.3);
      cs.phase      = 'rise';
      cs.elapsed    = 0;
      cs.phaseStart = 0;
    });
  }, [throwResults]);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        // 宣纸渐变背景（CSS 层）
        background: 'radial-gradient(ellipse at 50% 40%, #F5F0E6 0%, #EFE6D6 55%, #E5D9C4 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Vignette 暗角（subtle，增加聚焦感） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(100,75,30,0.20) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
    </div>
  );
}
