import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/* ========================================================================== */
/* Configuración                                                              */
/* ========================================================================== */

const CONFIG = {
    player: {
        eyeHeight: 1.7,
        walkSpeed: 5.4,
        sprintSpeed: 8.2,
        maxHealth: 100,
        worldRadius: 57
    },
    weapon: {
        magazine: 30,
        fireRate: 0.135,
        reloadTime: 1.45,
        range: 140,
        bodyDamage: 40,
        limbDamage: 30,
        headDamage: 120
    },
    zombie: {
        health: 100,
        attackRange: 1.8,
        attackCooldown: 1.1
    },
    waves: {
        firstWaveSize: 8,
        sizeGrowth: 3,
        spawnInterval: 0.62,
        intermission: 4.5,
        maxActiveBase: 10,
        maxActiveGrowth: 3
    }
};

const WAVE_MESSAGES = [
    'Los muertos se acercan…',
    'No dejes que te rodeen.',
    'Se mueven más rápido. Mantén la distancia.',
    'El cementerio está despertando.',
    'No hay final. Solo la próxima oleada.'
];

const ZOMBIE_COLORS = [0x58712f, 0x4a642b, 0x667d38, 0x435628, 0x526b33];

/* ========================================================================== */
/* Estado                                                                     */
/* ========================================================================== */

const ui = {
    hud: document.getElementById('hud'),
    healthValue: document.getElementById('health-value'),
    healthFill: document.getElementById('health-fill'),
    waveValue: document.getElementById('wave-value'),
    killsValue: document.getElementById('kills-value'),
    remainingValue: document.getElementById('remaining-value'),
    waveStatusText: document.getElementById('wave-status-text'),
    ammoValue: document.getElementById('ammo-value'),
    reloadHint: document.getElementById('reload-hint'),
    hitmarker: document.getElementById('hitmarker'),
    damageVignette: document.getElementById('damage-vignette'),
    lowHealthVignette: document.getElementById('low-health-vignette'),
    waveBanner: document.getElementById('wave-banner'),
    waveBannerTitle: document.getElementById('wave-banner-title'),
    waveBannerSubtitle: document.getElementById('wave-banner-subtitle'),
    startScreen: document.getElementById('start-screen'),
    pauseScreen: document.getElementById('pause-screen'),
    gameOverScreen: document.getElementById('game-over-screen'),
    startButton: document.getElementById('start-button'),
    resumeButton: document.getElementById('resume-button'),
    restartButton: document.getElementById('restart-button'),
    pauseHint: document.querySelector('#pause-screen .hint'),
    finalKills: document.getElementById('final-kills'),
    finalWave: document.getElementById('final-wave')
};

let renderer;
let scene;
let camera;
let controls;
let clock;
let gun;
let muzzleFlash;
let muzzleLight;
let muzzleAnchor;
let flashlight;
let zombieRoot;
let effectsRoot;
let tracerRoot;

const keys = new Set();
const zombies = [];
const effects = [];
const tracers = [];

const playerVelocity = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const rightVector = new THREE.Vector3();
const desiredVelocity = new THREE.Vector3();
const upVector = new THREE.Vector3(0, 1, 0);
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const gunBasePosition = new THREE.Vector3(0.27, -0.22, -0.44);

let gameState = 'menu'; // menu | playing | paused | gameOver
let health = CONFIG.player.maxHealth;
let kills = 0;
let wave = 0;
let pendingSpawns = 0;
let waveActive = false;
let spawnTimer = 0;
let intermissionTimer = 0;
let spawnInterval = CONFIG.waves.spawnInterval;

let ammo = CONFIG.weapon.magazine;
let reloading = false;
let reloadTimer = 0;
let shootCooldown = 0;
let firing = false;
let gunKick = 0;
let bobTime = 0;
let muzzleTimer = 0;
let damageFlash = 0;
let elapsed = 0;
let lastStatusSecond = -1;

let audioContext = null;
let noiseBuffer = null;

/* ========================================================================== */
/* Inicialización                                                             */
/* ========================================================================== */

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080d);
    scene.fog = new THREE.Fog(0x070b10, 16, 92);

    camera = new THREE.PerspectiveCamera(
        76,
        window.innerWidth / window.innerHeight,
        0.05,
        260
    );
    camera.rotation.order = 'YXZ';
    camera.position.set(0, CONFIG.player.eyeHeight, 0);
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    document.getElementById('game-container').appendChild(renderer.domElement);

    controls = new PointerLockControls(camera, renderer.domElement);

    zombieRoot = new THREE.Group();
    effectsRoot = new THREE.Group();
    tracerRoot = new THREE.Group();
    scene.add(zombieRoot, effectsRoot, tracerRoot);

    createLighting();
    createSky();
    createGround();
    createCemetery();
    createWeapon();

    clock = new THREE.Clock();

    bindEvents();
    updateHealthHud();
    updateAmmoHud();
    updateScoreHud();
}

/* ========================================================================== */
/* Mundo                                                                      */
/* ========================================================================== */

function createLighting() {
    const hemisphere = new THREE.HemisphereLight(0x526b8a, 0x0d140b, 0.48);
    scene.add(hemisphere);

    const ambient = new THREE.AmbientLight(0x243329, 0.42);
    scene.add(ambient);

    const moonLight = new THREE.DirectionalLight(0xa9c1ef, 2.35);
    moonLight.position.set(-38, 56, 24);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.left = -52;
    moonLight.shadow.camera.right = 52;
    moonLight.shadow.camera.top = 52;
    moonLight.shadow.camera.bottom = -52;
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 150;
    moonLight.shadow.bias = -0.0008;
    moonLight.shadow.normalBias = 0.035;
    scene.add(moonLight);
    scene.add(moonLight.target);

    flashlight = new THREE.SpotLight(0xffedc4, 55, 36, 0.52, 0.55, 1.35);
    flashlight.position.set(0.08, -0.05, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight);
    camera.add(flashlight.target);

    const lanternLight = new THREE.PointLight(0xff9b4a, 16, 18, 1.6);
    lanternLight.position.set(12, 2.8, 13);
    scene.add(lanternLight);

    const lantern = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.38, 0.26),
        new THREE.MeshStandardMaterial({
            color: 0x3b2a18,
            emissive: 0xff8b32,
            emissiveIntensity: 1.8,
            roughness: 0.7
        })
    );
    lantern.position.copy(lanternLight.position);
    scene.add(lantern);

    const lanternPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 2.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x241d15, roughness: 0.95 })
    );
    lanternPost.position.set(lanternLight.position.x, 1.35, lanternLight.position.z);
    lanternPost.castShadow = true;
    scene.add(lanternPost);
}

function createSky() {
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 95 + Math.random() * 100;
        const height = 20 + Math.random() * 110;
        starPositions[i * 3] = Math.cos(angle) * radius;
        starPositions[i * 3 + 1] = height;
        starPositions[i * 3 + 2] = Math.sin(angle) * radius;
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

    const starMaterial = new THREE.PointsMaterial({
        color: 0xb8c8df,
        size: 0.55,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        fog: false
    });

    scene.add(new THREE.Points(starGeometry, starMaterial));

    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(4.2, 24, 18),
        new THREE.MeshBasicMaterial({ color: 0xdce5d7, fog: false })
    );
    moon.position.set(-48, 61, -75);
    scene.add(moon);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const context = glowCanvas.getContext('2d');
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(215, 230, 220, 0.48)');
    gradient.addColorStop(0.25, 'rgba(178, 205, 222, 0.18)');
    gradient.addColorStop(1, 'rgba(120, 160, 200, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);

    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    const moonGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: glowTexture,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        })
    );
    moonGlow.position.copy(moon.position);
    moonGlow.scale.set(38, 38, 1);
    scene.add(moonGlow);
}

function createGround() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');

    context.fillStyle = '#182016';
    context.fillRect(0, 0, 512, 512);

    const groundColors = ['#11170f', '#1c2519', '#26301e', '#2b251a', '#20291e', '#121811'];
    for (let i = 0; i < 4200; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = Math.random() * 5 + 1;
        context.fillStyle = groundColors[Math.floor(Math.random() * groundColors.length)];
        context.globalAlpha = 0.15 + Math.random() * 0.4;
        context.fillRect(x, y, size, size * (0.4 + Math.random()));
    }

    context.globalAlpha = 0.22;
    for (let i = 0; i < 80; i++) {
        context.strokeStyle = '#38432b';
        context.lineWidth = 1;
        context.beginPath();
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        context.moveTo(x, y);
        context.lineTo(x + (Math.random() - 0.5) * 9, y - Math.random() * 12);
        context.stroke();
    }
    context.globalAlpha = 1;

    const groundTexture = new THREE.CanvasTexture(canvas);
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(22, 22);
    groundTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(170, 170),
        new THREE.MeshStandardMaterial({
            map: groundTexture,
            color: 0xb8c0aa,
            roughness: 1,
            metalness: 0
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const path = new THREE.Mesh(
        new THREE.PlaneGeometry(6.5, 118),
        new THREE.MeshStandardMaterial({
            color: 0x30281d,
            roughness: 1,
            metalness: 0
        })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.012;
    path.receiveShadow = true;
    scene.add(path);

    // Charco de niebla bajo y sutil.
    const mist = new THREE.Mesh(
        new THREE.CircleGeometry(64, 64),
        new THREE.MeshBasicMaterial({
            color: 0x18251c,
            transparent: true,
            opacity: 0.16,
            depthWrite: false
        })
    );
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = 0.03;
    scene.add(mist);
}

function createCemetery() {
    const stoneMaterial = new THREE.MeshStandardMaterial({
        color: 0x666b62,
        roughness: 0.94,
        metalness: 0.03
    });
    const darkStoneMaterial = new THREE.MeshStandardMaterial({
        color: 0x4c514a,
        roughness: 0.96,
        metalness: 0.02
    });
    const dirtMaterial = new THREE.MeshStandardMaterial({
        color: 0x352b20,
        roughness: 1
    });
    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2118,
        roughness: 0.97
    });
    const barkMaterial = new THREE.MeshStandardMaterial({
        color: 0x241b13,
        roughness: 1
    });
    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x454942,
        roughness: 0.98
    });

    const headstoneGeometry = new THREE.BoxGeometry(0.72, 1.22, 0.2);
    const baseGeometry = new THREE.BoxGeometry(1.12, 0.22, 0.62);
    const crossVerticalGeometry = new THREE.BoxGeometry(0.2, 1.35, 0.18);
    const crossHorizontalGeometry = new THREE.BoxGeometry(0.78, 0.2, 0.18);
    const graveGeometry = new THREE.BoxGeometry(1.35, 0.1, 2.35);

    // Tumbas
    for (let i = 0; i < 76; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * 45;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;

        const grave = new THREE.Group();
        grave.position.set(x, 0, z);
        grave.rotation.y = Math.random() * Math.PI * 2;

        const mound = new THREE.Mesh(graveGeometry, dirtMaterial);
        mound.position.y = 0.05;
        mound.rotation.x = -0.015;
        mound.receiveShadow = true;
        grave.add(mound);

        const base = new THREE.Mesh(baseGeometry, darkStoneMaterial);
        base.position.set(0, 0.16, -1.05);
        base.castShadow = true;
        base.receiveShadow = true;
        grave.add(base);

        const useCross = Math.random() < 0.28;
        if (useCross) {
            const vertical = new THREE.Mesh(crossVerticalGeometry, stoneMaterial);
            vertical.position.set(0, 0.94, -1.04);
            vertical.rotation.z = (Math.random() - 0.5) * 0.1;
            vertical.castShadow = true;
            vertical.receiveShadow = true;
            grave.add(vertical);

            const horizontal = new THREE.Mesh(crossHorizontalGeometry, stoneMaterial);
            horizontal.position.set(0, 1.22, -1.04);
            horizontal.rotation.z = vertical.rotation.z;
            horizontal.castShadow = true;
            grave.add(horizontal);
        } else {
            const headstone = new THREE.Mesh(
                headstoneGeometry,
                Math.random() < 0.4 ? darkStoneMaterial : stoneMaterial
            );
            headstone.position.set(0, 0.8, -1.04);
            headstone.rotation.z = (Math.random() - 0.5) * 0.14;
            headstone.rotation.x = (Math.random() - 0.5) * 0.05;
            headstone.castShadow = true;
            headstone.receiveShadow = true;
            grave.add(headstone);
        }

        scene.add(grave);
    }

    // Árboles muertos
    for (let i = 0; i < 27; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 27 + Math.random() * 31;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const height = 3.8 + Math.random() * 4.8;

        const tree = new THREE.Group();
        tree.position.set(x, 0, z);

        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22 + Math.random() * 0.2, 0.42, height, 6),
            barkMaterial
        );
        trunk.position.y = height / 2;
        trunk.rotation.z = (Math.random() - 0.5) * 0.08;
        trunk.castShadow = true;
        tree.add(trunk);

        const branchCount = 2 + Math.floor(Math.random() * 3);
        for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
            const branch = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.15, 2.2 + Math.random() * 1.5, 5),
                barkMaterial
            );
            branch.position.set(
                (Math.random() - 0.5) * 1.3,
                height * (0.55 + Math.random() * 0.35),
                (Math.random() - 0.5) * 1.3
            );
            branch.rotation.z = (Math.random() - 0.5) * 1.6;
            branch.rotation.x = (Math.random() - 0.5) * 1.6;
            branch.castShadow = true;
            tree.add(branch);
        }

        scene.add(tree);
    }

    // Rocas
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 8 + Math.random() * 48;
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.6, 0),
            rockMaterial
        );
        rock.position.set(Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius);
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        rock.scale.y = 0.55 + Math.random() * 0.4;
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
    }

    createFence(woodMaterial);
}

function createFence(woodMaterial) {
    const radius = 61;
    const segments = 48;
    const postHeight = 1.75;

    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, postHeight, 0.16),
            woodMaterial
        );
        post.position.set(x, postHeight / 2, z);
        post.rotation.z = (Math.random() - 0.5) * 0.06;
        post.castShadow = true;
        scene.add(post);

        const nextAngle = ((i + 1) / segments) * Math.PI * 2;
        const nextX = Math.cos(nextAngle) * radius;
        const nextZ = Math.sin(nextAngle) * radius;
        const midX = (x + nextX) / 2;
        const midZ = (z + nextZ) / 2;
        const length = Math.hypot(nextX - x, nextZ - z);
        const tangent = Math.atan2(nextX - x, nextZ - z);

        for (const railHeight of [0.58, 1.2]) {
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.11, 0.1, length),
                woodMaterial
            );
            rail.position.set(midX, railHeight, midZ);
            rail.rotation.y = tangent;
            rail.castShadow = true;
            scene.add(rail);
        }
    }
}

/* ========================================================================== */
/* Arma en primera persona                                                    */
/* ========================================================================== */

function createWeapon() {
    gun = new THREE.Group();

    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0x202321,
        roughness: 0.42,
        metalness: 0.8
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x0f1110,
        roughness: 0.58,
        metalness: 0.55
    });
    const woodMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d2a1b,
        roughness: 0.72,
        metalness: 0.08
    });

    const receiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.15, 0.42),
        metalMaterial
    );
    receiver.position.set(0, 0, -0.08);
    gun.add(receiver);

    const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.052, 0.4),
        darkMaterial
    );
    barrel.position.set(0, 0.025, -0.43);
    gun.add(barrel);

    const barrelTip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.12, 8),
        darkMaterial
    );
    barrelTip.rotation.x = Math.PI / 2;
    barrelTip.position.set(0, 0.025, -0.64);
    gun.add(barrelTip);

    const handguard = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.26),
        woodMaterial
    );
    handguard.position.set(0, -0.012, -0.34);
    gun.add(handguard);

    const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.14, 0.24),
        woodMaterial
    );
    stock.position.set(0, -0.025, 0.22);
    gun.add(stock);

    const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.19, 0.09),
        darkMaterial
    );
    grip.position.set(0, -0.15, 0.1);
    grip.rotation.x = -0.28;
    gun.add(grip);

    const magazine = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.18, 0.1),
        darkMaterial
    );
    magazine.position.set(0, -0.145, -0.1);
    magazine.rotation.x = 0.16;
    gun.add(magazine);

    const sight = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.05, 0.06),
        metalMaterial
    );
    sight.position.set(0, 0.105, -0.02);
    gun.add(sight);

    muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.025, -0.72);
    gun.add(muzzleAnchor);

    muzzleFlash = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.27, 5),
        new THREE.MeshBasicMaterial({
            color: 0xffdf92,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    muzzleFlash.position.set(0, 0.025, -0.82);
    muzzleFlash.rotation.x = -Math.PI / 2;
    muzzleFlash.visible = false;
    gun.add(muzzleFlash);

    muzzleLight = new THREE.PointLight(0xffb35c, 0, 5, 2);
    muzzleLight.position.set(0, 0.025, -0.58);
    gun.add(muzzleLight);

    gun.position.copy(gunBasePosition);
    gun.rotation.set(0, -0.035, 0.01);
    camera.add(gun);
}

/* ========================================================================== */
/* Entrada y eventos                                                          */
/* ========================================================================== */

function bindEvents() {
    ui.startButton.addEventListener('click', () => {
        ensureAudio();
        startGame();
    });

    ui.resumeButton.addEventListener('click', () => {
        ensureAudio();
        controls.lock();
    });

    ui.restartButton.addEventListener('click', () => {
        ensureAudio();
        startGame();
    });

    controls.addEventListener('lock', () => {
        if (gameState === 'menu' || gameState === 'paused') {
            gameState = 'playing';
        }

        ui.startScreen.classList.add('hidden');
        ui.pauseScreen.classList.add('hidden');
        ui.gameOverScreen.classList.add('hidden');
        ui.hud.classList.remove('hidden');
        ui.pauseHint.innerHTML = 'Pulsa <kbd>ESC</kbd> o el botón para volver a jugar.';
        ensureAudio();
    });

    controls.addEventListener('unlock', () => {
        firing = false;
        keys.clear();

        if (gameState === 'playing') {
            gameState = 'paused';
            ui.pauseScreen.classList.remove('hidden');
        }
    });

    document.addEventListener('pointerlockerror', () => {
        if (gameState !== 'playing' || controls.isLocked) {
            return;
        }

        gameState = 'paused';
        firing = false;
        keys.clear();
        ui.pauseHint.textContent = 'No se pudo capturar el ratón. Pulsa CONTINUAR para reintentarlo.';
        ui.pauseScreen.classList.remove('hidden');
    });

    document.addEventListener('mousedown', (event) => {
        if (event.button !== 0 || gameState !== 'playing' || !controls.isLocked) {
            return;
        }

        firing = true;
        shoot();
    });

    document.addEventListener('mouseup', (event) => {
        if (event.button === 0) {
            firing = false;
        }
    });

    document.addEventListener('contextmenu', (event) => event.preventDefault());

    document.addEventListener('keydown', (event) => {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space'].includes(event.code)) {
            event.preventDefault();
        }

        keys.add(event.code);

        if (event.code === 'KeyR') {
            if (gameState === 'gameOver') {
                startGame();
            } else if (gameState === 'playing') {
                startReload();
            }
        }
    });

    document.addEventListener('keyup', (event) => {
        keys.delete(event.code);
    });

    window.addEventListener('blur', () => {
        firing = false;
        keys.clear();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && gameState === 'playing') {
            controls.unlock();
        }
    });

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ========================================================================== */
/* Ciclo de partida                                                           */
/* ========================================================================== */

function startGame() {
    resetRun();

    gameState = 'playing';
    ui.startScreen.classList.add('hidden');
    ui.pauseScreen.classList.add('hidden');
    ui.gameOverScreen.classList.add('hidden');
    ui.hud.classList.remove('hidden');

    ensureAudio();
    controls.lock();
    beginWave(1);
}

function resetRun() {
    clearZombies();
    clearEffects();
    clearTracers();

    gameState = 'playing';
    health = CONFIG.player.maxHealth;
    kills = 0;
    wave = 0;
    pendingSpawns = 0;
    waveActive = false;
    spawnTimer = 0;
    intermissionTimer = 0;
    spawnInterval = CONFIG.waves.spawnInterval;
    ammo = CONFIG.weapon.magazine;
    reloading = false;
    reloadTimer = 0;
    shootCooldown = 0;
    firing = false;
    gunKick = 0;
    muzzleTimer = 0;
    damageFlash = 0;
    elapsed = 0;
    lastStatusSecond = -1;

    keys.clear();
    playerVelocity.set(0, 0, 0);
    camera.position.set(0, CONFIG.player.eyeHeight, 0);
    camera.rotation.set(0, 0, 0);

    gun.position.copy(gunBasePosition);
    gun.rotation.set(0, -0.035, 0.01);
    muzzleFlash.visible = false;
    muzzleLight.intensity = 0;
    ui.reloadHint.textContent = 'R — RECARGAR';
    ui.reloadHint.classList.remove('active');
    ui.lowHealthVignette.classList.remove('active');
    ui.damageVignette.style.opacity = '0';

    updateHealthHud();
    updateAmmoHud();
    updateScoreHud();
}

function beginWave(number) {
    wave = number;
    waveActive = true;
    intermissionTimer = 0;
    pendingSpawns = CONFIG.waves.firstWaveSize + (number - 1) * CONFIG.waves.sizeGrowth;
    spawnInterval = Math.max(0.22, CONFIG.waves.spawnInterval - (number - 1) * 0.04);
    spawnTimer = 0.35;
    lastStatusSecond = -1;

    const subtitle = WAVE_MESSAGES[Math.min(number - 1, WAVE_MESSAGES.length - 1)];
    announce(`OLEADA ${number}`, subtitle);
    ui.waveStatusText.textContent = 'Elimina a todos los zombis';
    updateScoreHud();
    playWaveSound();
}

function completeWave() {
    waveActive = false;
    intermissionTimer = CONFIG.waves.intermission;
    lastStatusSecond = -1;
    announce(`OLEADA ${wave} SUPERADA`, 'La siguiente no tardará en llegar…');
    playWaveClearSound();
}

function updateWaves(delta) {
    if (waveActive) {
        if (pendingSpawns > 0) {
            spawnTimer -= delta;

            if (spawnTimer <= 0) {
                const maxActive = Math.min(
                    26,
                    CONFIG.waves.maxActiveBase + (wave - 1) * CONFIG.waves.maxActiveGrowth
                );

                if (zombies.length < maxActive) {
                    spawnZombie();
                    pendingSpawns -= 1;
                    spawnTimer = spawnInterval;
                    updateScoreHud();
                } else {
                    spawnTimer = 0.2;
                }
            }
        }

        if (pendingSpawns === 0 && zombies.length === 0) {
            completeWave();
        }
    } else if (intermissionTimer > 0) {
        intermissionTimer -= delta;

        const seconds = Math.max(0, Math.ceil(intermissionTimer));
        if (seconds !== lastStatusSecond) {
            lastStatusSecond = seconds;
            ui.waveStatusText.textContent = `Próxima oleada en ${seconds}…`;
        }

        if (intermissionTimer <= 0) {
            beginWave(wave + 1);
        }
    }
}

/* ========================================================================== */
/* Jugador                                                                    */
/* ========================================================================== */

function updatePlayer(delta) {
    const forwardInput =
        (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const rightInput =
        (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sprinting =
        (keys.has('ShiftLeft') || keys.has('ShiftRight')) && forwardInput > 0;

    camera.getWorldDirection(forwardVector);
    forwardVector.y = 0;
    forwardVector.normalize();

    rightVector.crossVectors(forwardVector, upVector).normalize();

    desiredVelocity.set(0, 0, 0);
    desiredVelocity.addScaledVector(forwardVector, forwardInput);
    desiredVelocity.addScaledVector(rightVector, rightInput);

    if (desiredVelocity.lengthSq() > 1) {
        desiredVelocity.normalize();
    }

    desiredVelocity.multiplyScalar(
        sprinting ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed
    );

    const acceleration = 1 - Math.exp(-12 * delta);
    playerVelocity.lerp(desiredVelocity, acceleration);
    camera.position.addScaledVector(playerVelocity, delta);
    camera.position.y = CONFIG.player.eyeHeight;

    const distanceFromCenter = Math.hypot(camera.position.x, camera.position.z);
    if (distanceFromCenter > CONFIG.player.worldRadius) {
        const scale = CONFIG.player.worldRadius / distanceFromCenter;
        camera.position.x *= scale;
        camera.position.z *= scale;
        playerVelocity.multiplyScalar(0.4);
    }

    const movementRatio = Math.min(1, playerVelocity.length() / CONFIG.player.walkSpeed);
    bobTime += delta * (sprinting ? 12 : 8.5) * (0.3 + movementRatio);

    if (reloading) {
        reloadTimer -= delta;

        if (reloadTimer <= 0) {
            reloading = false;
            ammo = CONFIG.weapon.magazine;
            updateAmmoHud();
            ui.reloadHint.textContent = 'R — RECARGAR';
            ui.reloadHint.classList.remove('active');
            playReloadSound();
        }
    }

    if (shootCooldown > 0) {
        shootCooldown -= delta;
    }

    if (firing && controls.isLocked && gameState === 'playing') {
        shoot();
    }

    updateWeaponVisuals(delta, movementRatio, sprinting);
}

function updateWeaponVisuals(delta, movementRatio, sprinting) {
    const swayX = Math.cos(bobTime) * 0.012 * movementRatio;
    const swayY = Math.abs(Math.sin(bobTime)) * 0.016 * movementRatio;
    const reloadDrop = reloading ? -0.18 : 0;
    const targetX = gunBasePosition.x + swayX;
    const targetY = gunBasePosition.y + swayY - reloadDrop;
    const targetZ = gunBasePosition.z + gunKick * 0.14;

    const lerpFactor = 1 - Math.exp(-16 * delta);
    gun.position.x += (targetX - gun.position.x) * lerpFactor;
    gun.position.y += (targetY - gun.position.y) * lerpFactor;
    gun.position.z += (targetZ - gun.position.z) * lerpFactor;

    const targetRotationX = gunKick * 0.17 + (reloading ? 0.5 : 0);
    const targetRotationZ = swayX * 1.2 + (sprinting ? Math.sin(bobTime) * 0.012 : 0);
    gun.rotation.x += (targetRotationX - gun.rotation.x) * lerpFactor;
    gun.rotation.z += (targetRotationZ - gun.rotation.z) * lerpFactor;

    gunKick = Math.max(0, gunKick - delta * 9);

    if (muzzleTimer > 0) {
        muzzleTimer -= delta;
        muzzleFlash.visible = true;
        muzzleLight.intensity = 22;
    } else {
        muzzleFlash.visible = false;
        muzzleLight.intensity = 0;
    }

    damageFlash = Math.max(0, damageFlash - delta * 2.2);
    ui.damageVignette.style.opacity = (damageFlash * 0.9).toFixed(3);

    const lowHealth = health > 0 && health <= 30;
    ui.lowHealthVignette.classList.toggle('active', lowHealth);
}

function damagePlayer(amount) {
    if (gameState !== 'playing') {
        return;
    }

    health = Math.max(0, health - amount);
    damageFlash = Math.min(1, damageFlash + 0.75);
    updateHealthHud();
    playDamageSound();

    if (health <= 0) {
        endGame();
    }
}

function endGame() {
    gameState = 'gameOver';
    firing = false;
    keys.clear();
    reloading = false;
    ui.lowHealthVignette.classList.remove('active');
    ui.damageVignette.style.opacity = '0';
    ui.finalKills.textContent = String(kills);
    ui.finalWave.textContent = String(wave);
    ui.gameOverScreen.classList.remove('hidden');
    ui.pauseScreen.classList.add('hidden');
    ui.hud.classList.add('hidden');
    playDeathSound();
    controls.unlock();
}

/* ========================================================================== */
/* Disparo                                                                    */
/* ========================================================================== */

function shoot() {
    if (gameState !== 'playing' || !controls.isLocked || reloading) {
        return;
    }

    if (shootCooldown > 0) {
        return;
    }

    if (ammo <= 0) {
        startReload();
        playEmptySound();
        return;
    }

    ammo -= 1;
    shootCooldown = CONFIG.weapon.fireRate;
    gunKick = Math.min(1.25, gunKick + 0.85);
    muzzleTimer = 0.055;
    muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.55);
    playGunshot();
    updateAmmoHud();

    raycaster.setFromCamera(screenCenter, camera);
    raycaster.far = CONFIG.weapon.range;

    const intersections = raycaster.intersectObjects(zombieRoot.children, true);
    let hit = null;

    for (const intersection of intersections) {
        const zombie = intersection.object.userData.zombie;
        if (zombie && zombie.alive) {
            hit = intersection;
            break;
        }
    }

    let endPoint;

    if (hit) {
        const zombie = hit.object.userData.zombie;
        const isHeadshot = hit.object.userData.part === 'head';
        const damage = isHeadshot
            ? CONFIG.weapon.headDamage
            : (hit.object.userData.part === 'limb'
                ? CONFIG.weapon.limbDamage
                : CONFIG.weapon.bodyDamage);

        zombie.health -= damage;
        zombie.flash = 0.11;
        endPoint = hit.point.clone();

        spawnBlood(endPoint, isHeadshot ? 14 : 6);
        showHitmarker(isHeadshot);
        playHitSound(isHeadshot);

        if (zombie.health <= 0) {
            killZombie(zombie, endPoint);
        }
    } else {
        endPoint = raycaster.ray.at(80, new THREE.Vector3());
    }

    spawnTracer(endPoint);

    if (ammo <= 0) {
        startReload();
    }
}

function startReload() {
    if (reloading || ammo >= CONFIG.weapon.magazine || gameState !== 'playing') {
        return;
    }

    reloading = true;
    reloadTimer = CONFIG.weapon.reloadTime;
    ui.reloadHint.textContent = 'RECARGANDO…';
    ui.reloadHint.classList.add('active');
    playReloadStartSound();
}

function updateAmmoHud() {
    ui.ammoValue.textContent = String(ammo);
}

function showHitmarker(headshot) {
    ui.hitmarker.classList.remove('active', 'headshot');

    // Reinicia la animación CSS.
    void ui.hitmarker.offsetWidth;

    if (headshot) {
        ui.hitmarker.classList.add('headshot');
    }
    ui.hitmarker.classList.add('active');
}

function spawnTracer(endPoint) {
    if (!muzzleAnchor) {
        return;
    }

    muzzleAnchor.updateWorldMatrix(true, false);
    const startPoint = new THREE.Vector3();
    muzzleAnchor.getWorldPosition(startPoint);

    const geometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
    const material = new THREE.LineBasicMaterial({
        color: 0xffe6a3,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const line = new THREE.Line(geometry, material);
    tracerRoot.add(line);

    tracers.push({
        line,
        material,
        life: 0.065,
        maxLife: 0.065
    });
}

/* ========================================================================== */
/* Zombis                                                                     */
/* ========================================================================== */

const zombieGeometry = {
    body: new THREE.BoxGeometry(0.76, 1.02, 0.44),
    head: new THREE.BoxGeometry(0.48, 0.48, 0.48),
    arm: new THREE.BoxGeometry(0.19, 0.9, 0.19),
    hand: new THREE.BoxGeometry(0.22, 0.2, 0.23),
    leg: new THREE.BoxGeometry(0.25, 0.82, 0.27),
    eye: new THREE.BoxGeometry(0.07, 0.055, 0.025),
    mouth: new THREE.BoxGeometry(0.18, 0.035, 0.02)
};

const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0xff2b18,
    emissive: 0xff1b09,
    emissiveIntensity: 2.8,
    roughness: 0.4
});

const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x240707 });

function spawnZombie() {
    const group = new THREE.Group();
    const color = ZOMBIE_COLORS[Math.floor(Math.random() * ZOMBIE_COLORS.length)];
    const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.92,
        metalness: 0.02,
        emissive: 0x5c0000,
        emissiveIntensity: 0
    });

    const body = new THREE.Mesh(zombieGeometry.body, material);
    body.position.y = 1.22;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.zombie = null;
    body.userData.part = 'body';
    group.add(body);

    const head = new THREE.Mesh(zombieGeometry.head, material);
    head.position.y = 1.9;
    head.castShadow = true;
    head.userData.part = 'head';
    group.add(head);

    const leftArm = new THREE.Mesh(zombieGeometry.arm, material);
    leftArm.position.set(-0.48, 1.48, 0.3);
    leftArm.rotation.x = 1.12;
    leftArm.rotation.z = -0.1;
    leftArm.castShadow = true;
    leftArm.userData.part = 'limb';
    group.add(leftArm);

    const rightArm = new THREE.Mesh(zombieGeometry.arm, material);
    rightArm.position.set(0.48, 1.48, 0.3);
    rightArm.rotation.x = 1.12;
    rightArm.rotation.z = 0.1;
    rightArm.castShadow = true;
    rightArm.userData.part = 'limb';
    group.add(rightArm);

    const leftHand = new THREE.Mesh(zombieGeometry.hand, material);
    leftHand.position.set(-0.48, 1.47, 0.73);
    leftHand.castShadow = true;
    leftHand.userData.part = 'limb';
    group.add(leftHand);

    const rightHand = new THREE.Mesh(zombieGeometry.hand, material);
    rightHand.position.set(0.48, 1.47, 0.73);
    rightHand.castShadow = true;
    rightHand.userData.part = 'limb';
    group.add(rightHand);

    const leftLeg = new THREE.Mesh(zombieGeometry.leg, material);
    leftLeg.position.set(-0.19, 0.42, 0);
    leftLeg.castShadow = true;
    leftLeg.userData.part = 'limb';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(zombieGeometry.leg, material);
    rightLeg.position.set(0.19, 0.42, 0);
    rightLeg.castShadow = true;
    rightLeg.userData.part = 'limb';
    group.add(rightLeg);

    const leftEye = new THREE.Mesh(zombieGeometry.eye, eyeMaterial);
    leftEye.position.set(-0.11, 1.94, 0.245);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(zombieGeometry.eye, eyeMaterial);
    rightEye.position.set(0.11, 1.94, 0.245);
    group.add(rightEye);

    const mouth = new THREE.Mesh(zombieGeometry.mouth, mouthMaterial);
    mouth.position.set(0, 1.78, 0.246);
    group.add(mouth);

    const spawnPoint = findSpawnPoint();
    group.position.set(spawnPoint.x, 0, spawnPoint.z);

    const angleToPlayer = Math.atan2(
        camera.position.x - group.position.x,
        camera.position.z - group.position.z
    );
    group.rotation.y = angleToPlayer;

    const scale = 0.92 + Math.random() * 0.18;
    group.scale.setScalar(scale);

    const zombie = {
        group,
        material,
        head,
        leftArm,
        rightArm,
        leftLeg,
        rightLeg,
        health: Math.round(100 * (1 + (wave - 1) * 0.25)),
        alive: true,
        speed: Math.min(5.0, 1.8 + wave * 0.22 + Math.random() * 0.5),
        damage: Math.min(28, 6 + Math.ceil(wave * 1.2)),
        attackTimer: 0.25 + Math.random() * 0.8,
        flash: 0,
        phase: Math.random() * Math.PI * 2
    };

    group.userData.zombie = zombie;
    body.userData.zombie = zombie;
    head.userData.zombie = zombie;

    for (const child of group.children) {
        if (child.userData.part) {
            child.userData.zombie = zombie;
        }
    }

    zombieRoot.add(group);
    zombies.push(zombie);

    // Pequeño estallido de tierra al emerger.
    const spawnDust = new THREE.Vector3(group.position.x, 0.15, group.position.z);
    spawnBlood(spawnDust, 4, 0x3b3423);
}

function findSpawnPoint() {
    const maxRadius = 55;
    const playerX = camera.position.x;
    const playerZ = camera.position.z;
    let fallbackX = 0;
    let fallbackZ = 0;

    for (let attempt = 0; attempt < 18; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 28 + Math.random() * 19;
        const x = playerX + Math.cos(angle) * distance;
        const z = playerZ + Math.sin(angle) * distance;
        fallbackX = x;
        fallbackZ = z;

        if (Math.hypot(x, z) <= maxRadius) {
            return { x, z };
        }
    }

    const length = Math.hypot(fallbackX, fallbackZ) || 1;
    return {
        x: (fallbackX / length) * maxRadius,
        z: (fallbackZ / length) * maxRadius
    };
}

function updateZombies(delta) {
    const playerPosition = camera.position;

    for (let i = zombies.length - 1; i >= 0; i--) {
        const zombie = zombies[i];

        if (!zombie.alive) {
            continue;
        }

        if (zombie.flash > 0) {
            zombie.flash = Math.max(0, zombie.flash - delta);
            zombie.material.emissiveIntensity = (zombie.flash / 0.11) * 1.2;
        }

        zombie.attackTimer -= delta;

        const dx = playerPosition.x - zombie.group.position.x;
        const dz = playerPosition.z - zombie.group.position.z;
        const distance = Math.hypot(dx, dz);

        if (distance > 0.001) {
            zombie.group.lookAt(
                playerPosition.x,
                zombie.group.position.y,
                playerPosition.z
            );
        }

        if (distance > CONFIG.zombie.attackRange) {
            const directionX = dx / Math.max(distance, 0.001);
            const directionZ = dz / Math.max(distance, 0.001);
            const speed = zombie.speed * (distance < 5 ? 0.88 : 1);

            zombie.group.position.x += directionX * speed * delta;
            zombie.group.position.z += directionZ * speed * delta;

            const walkCycle = Math.sin(elapsed * 7.5 + zombie.phase);
            zombie.leftLeg.rotation.x = walkCycle * 0.55;
            zombie.rightLeg.rotation.x = -walkCycle * 0.55;
            zombie.leftArm.rotation.x = 1.12 + walkCycle * 0.08;
            zombie.rightArm.rotation.x = 1.12 - walkCycle * 0.08;
            zombie.group.position.y = Math.abs(Math.sin(elapsed * 7.5 + zombie.phase)) * 0.035;
        } else {
            zombie.leftLeg.rotation.x *= 0.9;
            zombie.rightLeg.rotation.x *= 0.9;
            zombie.leftArm.rotation.x = 1.12 + Math.sin(elapsed * 10) * 0.25;
            zombie.rightArm.rotation.x = 1.12 - Math.sin(elapsed * 10) * 0.25;
            zombie.group.position.y = 0;

            if (zombie.attackTimer <= 0) {
                zombie.attackTimer = CONFIG.zombie.attackCooldown + Math.random() * 0.35;
                damagePlayer(zombie.damage);
                zombie.leftArm.rotation.x = 1.65;
                zombie.rightArm.rotation.x = 1.65;
            }
        }
    }

    // Evita que todos los zombis ocupen exactamente el mismo punto.
    for (let i = 0; i < zombies.length; i++) {
        const first = zombies[i];
        if (!first.alive) continue;

        for (let j = i + 1; j < zombies.length; j++) {
            const second = zombies[j];
            if (!second.alive) continue;

            const dx = second.group.position.x - first.group.position.x;
            const dz = second.group.position.z - first.group.position.z;
            const distance = Math.hypot(dx, dz);

            if (distance > 0.001 && distance < 0.75) {
                const push = (0.75 - distance) * 0.5;
                const nx = dx / distance;
                const nz = dz / distance;
                first.group.position.x -= nx * push;
                first.group.position.z -= nz * push;
                second.group.position.x += nx * push;
                second.group.position.z += nz * push;
            }
        }
    }
}

function killZombie(zombie, hitPoint) {
    if (!zombie.alive) {
        return;
    }

    zombie.alive = false;
    kills += 1;

    const burstPoint = new THREE.Vector3(
        hitPoint.x,
        Math.max(0.5, hitPoint.y),
        hitPoint.z
    );
    spawnBlood(burstPoint, 20);
    playKillSound();

    zombieRoot.remove(zombie.group);
    zombie.material.dispose();

    const index = zombies.indexOf(zombie);
    if (index !== -1) {
        zombies.splice(index, 1);
    }

    updateScoreHud();
}

/* ========================================================================== */
/* Efectos                                                                    */
/* ========================================================================== */

const bloodGeometry = new THREE.SphereGeometry(0.045, 5, 4);
const bloodMaterialGreen = new THREE.MeshBasicMaterial({ color: 0x89a93c });
const bloodMaterialDirt = new THREE.MeshBasicMaterial({ color: 0x3b3423 });

function spawnBlood(position, count, colorOverride) {
    const material = colorOverride === 0x3b3423
        ? bloodMaterialDirt
        : bloodMaterialGreen;

    for (let i = 0; i < count; i++) {
        const particle = new THREE.Mesh(bloodGeometry, material);
        particle.position.copy(position);
        particle.position.x += (Math.random() - 0.5) * 0.25;
        particle.position.y += (Math.random() - 0.5) * 0.25;
        particle.position.z += (Math.random() - 0.5) * 0.25;
        particle.scale.setScalar(0.6 + Math.random() * 0.9);
        effectsRoot.add(particle);

        effects.push({
            mesh: particle,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 3.4,
                1.2 + Math.random() * 3.2,
                (Math.random() - 0.5) * 3.4
            ),
            life: 0.45 + Math.random() * 0.4,
            maxLife: 0.85
        });
    }
}

function updateEffects(delta) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        effect.life -= delta;
        effect.velocity.y -= 9.5 * delta;
        effect.mesh.position.addScaledVector(effect.velocity, delta);
        effect.mesh.scale.setScalar(Math.max(0, effect.life / effect.maxLife));

        if (effect.mesh.position.y < 0.02) {
            effect.mesh.position.y = 0.02;
            effect.velocity.y *= -0.2;
            effect.velocity.x *= 0.7;
            effect.velocity.z *= 0.7;
        }

        if (effect.life <= 0) {
            effectsRoot.remove(effect.mesh);
            effects.splice(i, 1);
        }
    }

    for (let i = tracers.length - 1; i >= 0; i--) {
        const tracer = tracers[i];
        tracer.life -= delta;
        tracer.material.opacity = Math.max(0, tracer.life / tracer.maxLife) * 0.9;

        if (tracer.life <= 0) {
            tracerRoot.remove(tracer.line);
            tracer.line.geometry.dispose();
            tracer.material.dispose();
            tracers.splice(i, 1);
        }
    }
}

function clearZombies() {
    for (const zombie of zombies) {
        zombieRoot.remove(zombie.group);
        zombie.material.dispose();
    }
    zombies.length = 0;
}

function clearEffects() {
    for (const effect of effects) {
        effectsRoot.remove(effect.mesh);
    }
    effects.length = 0;
}

function clearTracers() {
    for (const tracer of tracers) {
        tracerRoot.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracer.material.dispose();
    }
    tracers.length = 0;
}

/* ========================================================================== */
/* HUD                                                                        */
/* ========================================================================== */

function updateHealthHud() {
    const roundedHealth = Math.ceil(health);
    ui.healthValue.textContent = String(roundedHealth);
    ui.healthFill.style.width = `${health}%`;

    ui.healthFill.classList.toggle('medium', health > 30 && health <= 60);
    ui.healthFill.classList.toggle('low', health <= 30);

    ui.healthValue.style.color = health <= 30 ? '#ef6b78' : '';
}

function updateScoreHud() {
    ui.waveValue.textContent = String(Math.max(1, wave));
    ui.killsValue.textContent = String(kills);

    const remaining = pendingSpawns + zombies.length;
    ui.remainingValue.textContent = String(remaining);
}

function announce(title, subtitle) {
    ui.waveBannerTitle.textContent = title;
    ui.waveBannerSubtitle.textContent = subtitle;
    ui.waveBanner.classList.remove('visible');
    void ui.waveBanner.offsetWidth;
    ui.waveBanner.classList.add('visible');
}

/* ========================================================================== */
/* Audio sintetizado                                                          */
/* ========================================================================== */

function ensureAudio() {
    if (!audioContext) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            audioContext = new AudioContextClass();
            noiseBuffer = createNoiseBuffer();
        } catch (error) {
            audioContext = null;
            return;
        }
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function createNoiseBuffer() {
    const duration = 0.45;
    const length = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    return buffer;
}

function playGunshot() {
    if (!audioContext) return;

    const now = audioContext.currentTime;

    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1700, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.13);
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.32, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    noise.connect(filter).connect(noiseGain).connect(audioContext.destination);
    noise.start(now);
    noise.stop(now + 0.18);

    const thump = audioContext.createOscillator();
    const thumpGain = audioContext.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(130, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.12);
    thumpGain.gain.setValueAtTime(0.24, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    thump.connect(thumpGain).connect(audioContext.destination);
    thump.start(now);
    thump.stop(now + 0.16);
}

function playHitSound(headshot) {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = headshot ? 'triangle' : 'square';
    oscillator.frequency.setValueAtTime(headshot ? 1080 : 760, now);
    oscillator.frequency.exponentialRampToValueAtTime(headshot ? 1620 : 420, now + 0.06);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.09);
}

function playKillSound() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(105, now);
    oscillator.frequency.exponentialRampToValueAtTime(32, now + 0.3);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.33);
}

function playDamageSound() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(72, now);
    oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.24);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.28);

    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 260;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.09, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.connect(filter).connect(noiseGain).connect(audioContext.destination);
    noise.start(now);
    noise.stop(now + 0.13);
}

function playReloadStartSound() {
    playClickSound(280, 0.04);
}

function playReloadSound() {
    playClickSound(520, 0.05);
}

function playEmptySound() {
    playClickSound(170, 0.05);
}

function playClickSound(frequency, volume) {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.05);
}

function playWaveSound() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    [92, 138].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.04);
        gain.gain.setValueAtTime(0.0001, now + index * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.055, now + 0.08 + index * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65 + index * 0.04);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(now + index * 0.04);
        oscillator.stop(now + 0.7 + index * 0.04);
    });
}

function playWaveClearSound() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    [392, 523, 659].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.03 + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3 + index * 0.08);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(now + index * 0.08);
        oscillator.stop(now + 0.34 + index * 0.08);
    });
}

function playDeathSound() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(110, now);
    oscillator.frequency.exponentialRampToValueAtTime(24, now + 1.25);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.35);
}

/* ========================================================================== */
/* Bucle principal                                                            */
/* ========================================================================== */

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);

    if (gameState === 'playing') {
        elapsed += delta;
        updatePlayer(delta);
        updateZombies(delta);
        updateWaves(delta);
        updateEffects(delta);
    }

    renderer.render(scene, camera);
}
