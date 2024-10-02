import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.8.3/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls.js";

class OxExperience {
    _renderer = null;
    _scene = null;
    _camera = null;
    _models = [];
    _modelIndex = 0;
    _currentModel = null;
    _controls = null;
    _animationMixers = [];
    _clock = null;
    _CarPlaced = false;
    _gltfData = [];
    oxSDK;
    _scale = 0.1;
    _modelPlaced = false;
    _startDistance = 0; // Used for pinch zoom

    async init() {
        try {
            this._raycaster = new THREE.Raycaster();
            this._clock = new THREE.Clock(true);
            this._CarPlaced = false;
            const renderCanvas = await this.initSDK();
            this.setupRenderer(renderCanvas);
            this.setupControls(renderCanvas);
            
            const textureLoader = new THREE.TextureLoader();
            this._envMap = textureLoader.load("envmap.jpg");
            this._envMap.mapping = THREE.EquirectangularReflectionMapping;
            this._envMap.encoding = THREE.sRGBEncoding;

            this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
                const delta = this._clock.getDelta();
                this._animationMixers.forEach((mixer) => mixer.update(delta));
                this.render();
            });

            this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => {
                this.updatePose(pose);
            });

            this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => {
                this.onResize();
            });

            this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
                if (this._modelPlaced && !this.isCarPlaced()) {
                    this._models.forEach((model) => {
                        model.position.copy(hitResult.position);
                    });
                }
            });

            const modelsToLoad = ["Recticle.glb", "Steerad.glb", "Sterrad_PARTS.glb", "USAGE.glb", "USP_1.glb", "UPS_2.glb", "UPS_3.glb"];
            const gltfLoader = new GLTFLoader();
            modelsToLoad.forEach((modelUrl, index) => {
                gltfLoader.load(modelUrl, (gltf) => {
                    const model = gltf.scene;
                    model.traverse((child) => {
                        if (child.material) {
                            child.material.envMap = this._envMap;
                            child.material.needsUpdate = true;
                        }
                    });

                    if (gltf.animations && gltf.animations.length) {
                        const mixer = new THREE.AnimationMixer(model);
                        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
                        this._animationMixers.push(mixer);

                        setTimeout(() => {
                            mixer.stopAllAction();
                        }, 9999);
                    }

                    this._gltfData[index] = gltf;
                    this._models[index] = model;

                    if (index === 0) {
                        this._currentModel = model;
                        this._modelPlaced = true;
                        this._scene.add(model);
                    }
                });
            });

            this.addLights();
        } catch (err) {
            console.error("Error initializing OxExperience", err);
        }
    }

    async initSDK() {
        try {
            this.oxSDK = new OnirixSDK("your-onirix-sdk-key");
            const config = {
                mode: OnirixSDK.TrackingMode.Surface,
            };
            return this.oxSDK.init(config);
        } catch (err) {
            console.error("Error initializing Onirix SDK", err);
        }
    }

    placeCar() {
        this._carPlaced = true;
        this.oxSDK.start();
    }

    isCarPlaced() {
        return this._carPlaced;
    }

    setupRenderer(renderCanvas) {
        const width = renderCanvas.width;
        const height = renderCanvas.height;
        this._renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, alpha: true });
        this._renderer.setClearColor(0x000000, 0);
        this._renderer.setSize(width, height);
        this._renderer.outputEncoding = THREE.sRGBEncoding;

        const cameraParams = this.oxSDK.getCameraParameters();
        this._camera = new THREE.PerspectiveCamera(cameraParams.fov, cameraParams.aspect, 0.1, 1000);
        this._camera.matrixAutoUpdate = false;
        this._scene = new THREE.Scene();
        const ambientLight = new THREE.AmbientLight(0x666666, 0.5);
        this._scene.add(ambientLight);
    }

    addLights() {
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        this._scene.add(directionalLight);
    }

    setupControls(renderCanvas) {
        this._controls = new OrbitControls(this._camera, renderCanvas);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.25;
        this._controls.enableZoom = false; // Disable default zoom for manual pinch-zoom control
        this._controls.enableRotate = true;
        this._controls.enablePan = false;

        renderCanvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 2) {
                // Store initial distance between two touches
                const dist = this.getTouchDistance(event.touches);
                this._startDistance = dist;
            }
        });

        renderCanvas.addEventListener('touchmove', (event) => {
            if (event.touches.length === 1) {
                // Single-finger rotation
                this._controls.enableRotate = true;
                this._controls.update();
            } else if (event.touches.length === 2) {
                // Pinch-zoom logic
                const dist = this.getTouchDistance(event.touches);
                const zoomFactor = dist / this._startDistance;

                this._camera.zoom *= zoomFactor;
                this._camera.updateProjectionMatrix();
                this._startDistance = dist; // Update start distance for continuous pinch
            }
        });

        renderCanvas.addEventListener('touchend', () => {
            this._controls.enableRotate = false;
        });
    }

    getTouchDistance(touches) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    render() {
        this._controls.update();
        this._renderer.render(this._scene, this._camera);
    }

    updatePose(pose) {
        let modelViewMatrix = new THREE.Matrix4();
        modelViewMatrix = modelViewMatrix.fromArray(pose);
        this._camera.matrix = modelViewMatrix;
        this._camera.matrixWorldNeedsUpdate = true;
    }

    onResize() {
        const width = this._renderer.domElement.width;
        const height = this._renderer.domElement.height;
        const cameraParams = this.oxSDK.getCameraParameters();
        this._camera.fov = cameraParams.fov;
        this._camera.aspect = cameraParams.aspect;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(width, height);
    }

    changeModelsColor(value) {
        if (this._currentModel) {
            this._currentModel.traverse((child) => {
                if (child.material) {
                    child.material.color.setHex(value);
                }
            });
        }
    }

    switchModel(index) {
        if (this._currentModel) {
            this._scene.remove(this._currentModel);
            const currentMixer = this._animationMixers[index];
            if (currentMixer) {
                currentMixer.stopAllAction();
            }
        }
        this._currentModel = this._models[index];
        if (this._currentModel) {
            this._scene.add(this._currentModel);
            const mixer = new THREE.AnimationMixer(this._currentModel);
            const gltf = this._gltfData[index];
            if (gltf && gltf.animations && gltf.animations.length) {
                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
                this._animationMixers[index] = mixer;
                setTimeout(() => {
                    mixer.stopAllAction();
                }, 9999);
            }
        }
    }
}

const oxExp = new OxExperience();
oxExp.init().then(() => {
    console.log("OxExperience initialized.");
}).catch((error) => {
    console.error("Error initializing Onirix SDK", error);
});
