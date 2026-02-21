/**
 * CoinScene.tsx
 * Three.js 3D 硬币投掷场景
 * - 俯视 35° 斜角相机，FOV 42°
 * - 三枚乾隆通宝铜钱（CylinderGeometry，三材质：顶/底贴图+侧面金属）
 * - 三枚硬币初始位置/角速度不同，落地时间差 ±0.15s
 * - 动画节奏：上抛→翻转→落地弹跳→阻尼停止→展示结果
 */
import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

export type CoinFace = 2 | 3; // 2=反面, 3=正面

export interface CoinSceneProps {
  /** 触发投掷，传入三枚硬币结果 */
  throwResults: CoinFace[] | null;
  /** 动画完成回调 */
  onAnimationComplete?: () => void;
  /** 是否正在投掷中 */
  isThrowingRef?: React.MutableRefObject<boolean>;
}

// ─── 常量 ──────────────────────────────────────────────────────────────────
const COIN_RADIUS = 1.0;
const COIN_HEIGHT = COIN_RADIUS / 7.5;   // 高度约为直径的 1/15
const COIN_SEGMENTS = 64;

// 三枚硬币的初始 X 位置（散布）
const COIN_X_POSITIONS = [-2.4, 0, 2.4];

// 每枚硬币的初始随机角速度偏移（让翻转看起来不同步）
const COIN_SPIN_OFFSETS = [
  { x: 0.8, z: 0.15 },
  { x: 1.0, z: -0.1 },
  { x: 0.9, z: 0.2 },
];

// 落地时间差（秒）
const LAND_TIME_OFFSETS = [0, 0.12, -0.1];

// 动画阶段时长（秒）
const T_RISE = 0.5;       // 上抛
const T_FLIP = 0.85;      // 翻转
const T_LAND = 0.55;      // 落地弹跳
const T_DAMP = 0.65;      // 阻尼减速
const T_SHOW = 0.8;       // 展示结果

// 上抛高度
const THROW_HEIGHT = 4.5;

// 桌面 Y 坐标（硬币落地位置）
const TABLE_Y = -1.2;

// ─── 工具函数 ──────────────────────────────────────────────────────────────
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t: number) {
  return t * t * t;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ─── 硬币状态 ──────────────────────────────────────────────────────────────
interface CoinState {
  mesh: THREE.Mesh;
  startY: number;
  peakY: number;
  landY: number;
  totalTime: number;     // 该硬币动画总时长
  timeOffset: number;    // 落地时间偏移
  spinSpeed: { x: number; z: number };
  targetRotX: number;    // 最终停止时的 rotationX（决定正反面）
  phase: 'idle' | 'rise' | 'flip' | 'land' | 'damp' | 'done';
  elapsed: number;
  phaseStart: number;
}

// ─── 组件 ──────────────────────────────────────────────────────────────────
export default function CoinScene({ throwResults, onAnimationComplete }: CoinSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const coinsRef = useRef<CoinState[]>([]);
  const animFrameRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock(false));
  const texturesRef = useRef<{ front: THREE.Texture | null; back: THREE.Texture | null }>({ front: null, back: null });
  const isAnimatingRef = useRef(false);
  const completedCoinsRef = useRef(0);

  // ── 创建硬币 Mesh ─────────────────────────────────────────────────────────
  const createCoinMesh = useCallback((frontTex: THREE.Texture | null, backTex: THREE.Texture | null) => {
    const geo = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, COIN_SEGMENTS);

    const goldColor = new THREE.Color(0xc8a84b);

    // 侧面金属材质
    const sideMat = new THREE.MeshStandardMaterial({
      color: goldColor,
      metalness: 0.85,
      roughness: 0.25,
    });

    // 顶面（正面）
    const topMat = new THREE.MeshStandardMaterial({
      map: frontTex ?? null,
      color: frontTex ? 0xffffff : goldColor,
      metalness: 0.6,
      roughness: 0.35,
    });

    // 底面（反面）
    const botMat = new THREE.MeshStandardMaterial({
      map: backTex ?? null,
      color: backTex ? 0xffffff : goldColor,
      metalness: 0.6,
      roughness: 0.35,
    });

    // CylinderGeometry 材质顺序：[侧面, 顶面, 底面]
    const mesh = new THREE.Mesh(geo, [sideMat, topMat, botMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }, []);

  // ── 初始化场景 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 场景
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // ── 相机：俯视 35° 斜角，FOV 42° ──────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    // 相机位置：Y 轴抬高（俯视），Z 轴稍后退，形成 35° 俯角
    camera.position.set(0, 8.5, 7.5);
    camera.lookAt(0, TABLE_Y, 0);
    cameraRef.current = camera;

    // ── 光源 ──────────────────────────────────────────────────────────────
    // 环境光（柔和基础亮度）
    const ambientLight = new THREE.AmbientLight(0xfff5e0, 1.2);
    scene.add(ambientLight);

    // 主方向光（从右上方打光，模拟窗光）
    const dirLight = new THREE.DirectionalLight(0xfff8e8, 2.5);
    dirLight.position.set(5, 12, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -8;
    dirLight.shadow.camera.right = 8;
    dirLight.shadow.camera.top = 8;
    dirLight.shadow.camera.bottom = -8;
    scene.add(dirLight);

    // 补光（从左侧，减少阴影过深）
    const fillLight = new THREE.DirectionalLight(0xe8f0ff, 0.8);
    fillLight.position.set(-4, 6, 2);
    scene.add(fillLight);

    // ── 桌面（接收阴影的平面）──────────────────────────────────────────────
    const tableGeo = new THREE.PlaneGeometry(20, 20);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0xf5eed8,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.0, // 完全透明，只接收阴影
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.rotation.x = -Math.PI / 2;
    table.position.y = TABLE_Y - COIN_HEIGHT / 2;
    table.receiveShadow = true;
    scene.add(table);

    // ── 加载贴图 ──────────────────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    let frontLoaded = false;
    let backLoaded = false;

    const tryCreateCoins = () => {
      if (!frontLoaded || !backLoaded) return;
      // 贴图全部加载后，更新已有硬币的材质
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

    loader.load('https://files.manuscdn.com/user_upload_by_module/session_file/310519663370025872/aAUPhjCzdBwgPiEk.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        texturesRef.current.front = tex;
        frontLoaded = true;
        tryCreateCoins();
      },
      undefined,
      () => { frontLoaded = true; tryCreateCoins(); }
    );

    loader.load('https://files.manuscdn.com/user_upload_by_module/session_file/310519663370025872/wTpexhAUYKEEXBaF.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        texturesRef.current.back = tex;
        backLoaded = true;
        tryCreateCoins();
      },
      undefined,
      () => { backLoaded = true; tryCreateCoins(); }
    );

    // ── 立即创建三枚硬币（用金色占位，贴图加载后更新）──────────────────────
    const coinStates: CoinState[] = [];
    for (let i = 0; i < 3; i++) {
      const mesh = createCoinMesh(null, null);
      mesh.position.set(COIN_X_POSITIONS[i], TABLE_Y, 0);
      // 初始静止时正面朝上（rotationX = 0）
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

    // ── 渲染循环 ──────────────────────────────────────────────────────────
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (isAnimatingRef.current) {
        const delta = clockRef.current.getDelta();
        updateCoins(delta);
      } else {
        // 静止时轻微自旋（展示硬币）
        coinsRef.current.forEach((cs, i) => {
          cs.mesh.rotation.y += 0.008 + i * 0.002;
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // ── 响应式 resize ──────────────────────────────────────────────────────
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
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 硬币动画更新函数 ──────────────────────────────────────────────────────
  const updateCoins = useCallback((delta: number) => {
    let allDone = true;

    coinsRef.current.forEach((cs, idx) => {
      if (cs.phase === 'done') return;
      allDone = false;

      cs.elapsed += delta;

      // 每枚硬币有独立的时间偏移（落地时间差）
      const t = cs.elapsed + cs.timeOffset;

      if (t < 0) {
        // 还未到该硬币的起始时间，保持静止
        return;
      }

      // ── 上抛阶段 ──────────────────────────────────────────────────────
      if (t < T_RISE) {
        cs.phase = 'rise';
        const progress = t / T_RISE;
        const eased = easeOutCubic(progress);
        cs.mesh.position.y = lerp(TABLE_Y, cs.peakY, eased);
        // 上抛时开始旋转
        cs.mesh.rotation.x += delta * (Math.PI * 3 * cs.spinSpeed.x);
        cs.mesh.rotation.z += delta * (Math.PI * cs.spinSpeed.z);
        cs.mesh.rotation.y += delta * 0.5;
        return;
      }

      // ── 翻转阶段 ──────────────────────────────────────────────────────
      const tAfterRise = t - T_RISE;
      if (tAfterRise < T_FLIP) {
        cs.phase = 'flip';
        const progress = tAfterRise / T_FLIP;
        // 抛物线下落（从峰值开始落）
        const fallProgress = easeInCubic(progress);
        cs.mesh.position.y = lerp(cs.peakY, TABLE_Y + COIN_HEIGHT * 2, fallProgress);
        // 高速翻转
        cs.mesh.rotation.x += delta * (Math.PI * 4 * cs.spinSpeed.x);
        cs.mesh.rotation.z += delta * (Math.PI * 0.8 * cs.spinSpeed.z);
        cs.mesh.rotation.y += delta * 0.3;
        return;
      }

      // ── 落地弹跳阶段 ──────────────────────────────────────────────────
      const tAfterFlip = tAfterRise - T_FLIP;
      if (tAfterFlip < T_LAND) {
        cs.phase = 'land';
        const progress = tAfterFlip / T_LAND;
        // 弹跳：先落地，再小幅弹起，再落下
        const bounce = Math.sin(progress * Math.PI) * 0.4;
        cs.mesh.position.y = TABLE_Y + bounce;
        // 减速翻转
        const spinDecay = 1 - easeOutCubic(progress);
        cs.mesh.rotation.x += delta * (Math.PI * 2 * cs.spinSpeed.x * spinDecay);
        cs.mesh.rotation.z += delta * (Math.PI * 0.3 * cs.spinSpeed.z * spinDecay);
        return;
      }

      // ── 阻尼减速阶段 ──────────────────────────────────────────────────
      const tAfterLand = tAfterFlip - T_LAND;
      if (tAfterLand < T_DAMP) {
        cs.phase = 'damp';
        const progress = tAfterLand / T_DAMP;
        cs.mesh.position.y = TABLE_Y;
        // 平滑插值到目标角度
        const dampFactor = easeOutCubic(progress);
        cs.mesh.rotation.x = lerp(cs.mesh.rotation.x, cs.targetRotX, dampFactor * 0.15);
        cs.mesh.rotation.z = lerp(cs.mesh.rotation.z, 0, dampFactor * 0.15);
        return;
      }

      // ── 展示结果阶段 ──────────────────────────────────────────────────
      const tAfterDamp = tAfterLand - T_DAMP;
      if (tAfterDamp < T_SHOW) {
        cs.phase = 'done';
        cs.mesh.position.y = TABLE_Y;
        cs.mesh.rotation.x = cs.targetRotX;
        cs.mesh.rotation.z = 0;
        completedCoinsRef.current += 1;
        return;
      }
    });

    // 所有硬币完成
    if (allDone && isAnimatingRef.current) {
      isAnimatingRef.current = false;
      onAnimationComplete?.();
    }
  }, [onAnimationComplete]);

  // ── 接收投掷结果，启动动画 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!throwResults || throwResults.length !== 3) return;

    // 重置状态
    completedCoinsRef.current = 0;
    isAnimatingRef.current = true;
    clockRef.current.start();

    coinsRef.current.forEach((cs, i) => {
      const result = throwResults[i]; // 2=反面, 3=正面
      // 正面朝上：rotationX = 0（或 2π 的倍数）
      // 反面朝上：rotationX = π
      // 为了让动画自然，从当前角度旋转到最近的目标角度
      const currentX = cs.mesh.rotation.x;
      const normalizedX = currentX % (Math.PI * 2);

      let targetX: number;
      if (result === 3) {
        // 正面朝上：找最近的 2nπ
        const n = Math.round(currentX / (Math.PI * 2));
        targetX = n * Math.PI * 2;
        // 确保至少翻转 2 圈
        if (Math.abs(targetX - currentX) < Math.PI * 2) {
          targetX += Math.PI * 2 * Math.sign(currentX >= 0 ? 1 : -1);
        }
      } else {
        // 反面朝上：找最近的 (2n+1)π
        const n = Math.round((currentX - Math.PI) / (Math.PI * 2));
        targetX = n * Math.PI * 2 + Math.PI;
        if (Math.abs(targetX - currentX) < Math.PI * 2) {
          targetX += Math.PI * 2;
        }
      }

      // 重置硬币到桌面起始位置
      cs.mesh.position.set(COIN_X_POSITIONS[i], TABLE_Y, 0);
      cs.mesh.rotation.set(normalizedX, 0, 0);

      cs.targetRotX = targetX;
      cs.peakY = TABLE_Y + THROW_HEIGHT + (Math.random() * 0.6 - 0.3);
      cs.phase = 'rise';
      cs.elapsed = 0;
      cs.phaseStart = 0;
    });
  }, [throwResults]);

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
