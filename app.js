import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.8.5/dist/ox-sdk.esm.js";
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
    _lastPinchDistance = null; // To track pinch zoom
    _lastTouchX = null; // To track single-finger rotation
    
    // Specific improvements for iOS
    _iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    _poseUpdateThreshold = 0.05;  // Adjustable threshold for pose updates

    async init() {
        try {
            this._raycaster = new THREE.Raycaster();
            this._clock = new THREE.Clock(true);
            this._CarPlaced = false;
            const renderCanvas = await this.initSDK();
            this.setupRenderer(renderCanvas);
            this.setupControls(renderCanvas);
            this.setupDeviceMotion();
            
            const textureLoader = new THREE.TextureLoader();
            this._envMap = textureLoader.load("envmap.jpg");
            this._envMap.mapping = THREE.EquirectangularReflectionMapping;
            this._envMap.encoding = THREE.sRGBEncoding;

            // Subscribe to frame updates
            this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
                const delta = this._clock.getDelta();
                this._animationMixers.forEach((mixer) => mixer.update(delta));
                this.render();
            });

            // Subscribe to pose updates
            this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => {
                this.updatePose(pose);
            });

            // Resize handler
            this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => {
                this.onResize();
            });

            // HitTest for placing models on surface
            this.oxSDK.subscribe(OnirixSDK.Events.OnHitTestResult, (hitResult) => {
                if (this._modelPlaced && !this.isCarPlaced()) {
                    this._models.forEach((model) => {
                        model.position.copy(hitResult.position);
                    });
                }
            });

            // Load models
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

        this.addTouchListeners();
    }

    async initSDK() {
        try {
            // iOS specific surface tracking configuration
            const config = {
                mode: OnirixSDK.TrackingMode.Surface,
                stability: this._iosDevice ? 1 : 1, // Adjust stability level for iOS
                hitTestRate: this._iosDevice ? 15 : 30, // Reduce hit test rate on iOS
            };
            this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");
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
        try {
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
        } catch (err) {
            console.error("Error setting up renderer", err);
        }
    }

    addLights() {
        try {
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(5, 10, 7.5);
            this._scene.add(directionalLight);
        } catch (err) {
            console.error("Error adding lights", err);
        }
    }

    setupControls(renderCanvas) {
        try {
            this._controls = new OrbitControls(this._camera, renderCanvas);
            this._controls.enableDamping = true;
            this._controls.dampingFactor = 0.25;
            this._controls.enableZoom = true;
            this._controls.enableRotate = true;
        } catch (err) {
            console.error("Error setting up controls", err);
        }
    }

    render() {
        try {
            this._controls.update();
            this._renderer.render(this._scene, this._camera);
        } catch (err) {
            console.error("Error during rendering", err);
        }
    }

    updatePose(pose) {
        try {
            const modelViewMatrix = new THREE.Matrix4().fromArray(pose);
            const cameraPosition = new THREE.Vector3().setFromMatrixPosition(modelViewMatrix);
            if (this._camera.position.distanceTo(cameraPosition) > this._poseUpdateThreshold) {
                this._camera.matrix = modelViewMatrix;
                this._camera.matrixWorldNeedsUpdate = true;
            }
        } catch (err) {
            console.error("Error updating pose", err);
        }
    }

    onResize() {
        try {
            const width = this._renderer.domElement.width;
            const height = this._renderer.domElement.height;
            const cameraParams = this.oxSDK.getCameraParameters();
            this._camera.fov = cameraParams.fov;
            this._camera.aspect = cameraParams.aspect;
            this._camera.updateProjectionMatrix();
            this._renderer.setSize(width, height);
        } catch (err) {
            console.error("Error handling resize", err);
        }
    }
       scaleScene(value) {
        this._currentModel.scale.set(value, value, value);
    }
     rotateCar(value) {
        this._currentModel.rotation.y = value;
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
            const gltf = this._gltfData[index]; // Assuming you store the GLTF data
            if (gltf && gltf.animations && gltf.animations.length) {
                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
                this._animationMixers[index] = mixer; // Store the mixer for the new model
                setTimeout(() => {
                    mixer.stopAllAction();
                }, 9999);
            }
        }
    }

    setupDeviceMotion() {
        if (this._iosDevice) {
            window.addEventListener("deviceorientation", (event) => {
                // Handle iOS-specific device orientation handling
            });
        }
    }

    addTouchListeners() {
        const canvas = this._renderer.domElement;
        canvas.addEventListener("touchstart", (event) => {
            if (event.touches.length === 2) {
                this._lastPinchDistance = this.getPinchDistance(event.touches);
            } else if (event.touches.length === 1) {
                this._lastTouchX = event.touches[0].clientX;
            }
        });

        canvas.addEventListener("touchmove", (event) => {
            if (event.touches.length === 2 && this._lastPinchDistance !== null) {
                const pinchDistance = this.getPinchDistance(event.touches);
                const scaleChange = pinchDistance / this._lastPinchDistance;
                this._currentModel.scale.multiplyScalar(scaleChange);
                this._lastPinchDistance = pinchDistance;
            } else if (event.touches.length === 1 && this._lastTouchX !== null) {
                const touchX = event.touches[0].clientX;
                const rotationDelta = (touchX - this._lastTouchX) * 0.01;
                this._currentModel.rotation.y += rotationDelta;
                this._lastTouchX = touchX;
            }
        });

        canvas.addEventListener("touchend", (event) => {
            if (event.touches.length === 0) {
                this._lastPinchDistance = null;
                this._lastTouchX = null;
            }
        });
    }

    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
class OxExperienceUI {
    _loadingScreen = null;
    _errorScreen = null;
    _errorTitle = null;
    _errorMessage = null;
    init() {
        try {
            this._loadingScreen = document.querySelector("#loading-screen");
            this._errorScreen = document.querySelector("#error-screen");
            this._errorTitle = document.querySelector("#error-title");
            this._errorMessage = document.querySelector("#error-message");
            this._ins7 = document.querySelector("#ins7");
            this._transformControls = document.querySelector("#transform-controls");
            this._colorControls = document.querySelector("#color-controls");
            this._errorimg = document.querySelector("#errorimg");
            this._modelControls = document.querySelector("#model-controls");
            this._backbutton = document.querySelector("#back-button");
            this._insidebuttonscontrols = document.querySelector("#insidebuttons-controls");
            this._insidebuttonscontrols1 = document.querySelector("#insidebuttons-controls1");
            document.querySelector("#tap-to-place").addEventListener("click", () => {
                oxExp.switchModel(1);
                playAudio("Feture.mp3");
                oxExp.placeCar();
                this._transformControls.style.display = "none";
                this._colorControls.style.display = "none";
                this._modelControls.style.display = "flex";
                this._insidebuttonscontrols.style.display = "none";
                this._insidebuttonscontrols1.style.display = "none";
                this._backbutton.style.display = "none";
            });
            document.querySelector("#black").addEventListener("click", () => {
                oxExp.changeModelsColor(0x000000);
            });
            document.querySelector("#blue").addEventListener("click", () => {
                oxExp.changeModelsColor(0x0000ff);
            });
            document.querySelector("#orange").addEventListener("click", () => {
                oxExp.changeModelsColor(0xffa500);
            });
            document.querySelector("#silver").addEventListener("click", () => {
                oxExp.changeModelsColor(0xc0c0c0);
            });
            document.querySelector("#model1").addEventListener("click", () => {
                oxExp.switchModel(1);
                playAudio("afterf.mp3");

                document.getElementById('insidebuttons-controls').style.display = 'block';
                document.getElementById('insidebuttons-controls1').style.display = 'none';
                document.getElementById('back-button').style.display = 'block';
                document.getElementById('model-controls').style.display = 'none';
                document.getElementById('errorimg').style.display = 'none';
            });
            document.querySelector("#model2").addEventListener("click", () => {
                oxExp.switchModel(2);
                playAudio("benfitf.mp3");

                document.getElementById('insidebuttons-controls1').style.display = 'flex';
                document.getElementById('insidebuttons-controls').style.display = 'none';
                document.getElementById('back-button').style.display = 'block';
                document.getElementById('model-controls').style.display = 'none';
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('ins7').style.display = 'none';
            });
            document.querySelector("#back").addEventListener("click", () => {
                oxExp.switchModel(3);
                document.getElementById('insidebuttons-controls1').style.display = 'none';
                document.getElementById('insidebuttons-controls').style.display = 'none';
                document.getElementById('back-button').style.display = 'none';
                document.getElementById('model-controls').style.display = 'flex';
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('ins7').style.display = 'none';
                document.getElementById('ins4').style.display = 'block';
            });
            document.querySelector("#ins1").addEventListener("click", () => {
                oxExp.switchModel(1);
                playAudio("Intro.mp3");
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('insidebuttons-controls').style.display = 'block';
                document.getElementById('insidebuttons-controls1').style.display = 'none';
                document.getElementById('back-button').style.display = 'block';
            });
            document.querySelector("#ins2").addEventListener("click", () => {
                oxExp.switchModel(2);
                playAudio("parts.mp3");
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('insidebuttons-controls').style.display = 'block';
                document.getElementById('insidebuttons-controls1').style.display = 'none';
                document.getElementById('back-button').style.display = 'block';
            });
            document.querySelector("#ins3").addEventListener("click", () => {
                oxExp.switchModel(3);
                playAudio("Usage.mp3");
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('insidebuttons-controls').style.display = 'block';
                document.getElementById('insidebuttons-controls1').style.display = 'none';
                document.getElementById('back-button').style.display = 'block';
            });
            document.querySelector("#ins4").addEventListener("click", () => {
                oxExp.switchModel(4);
                playAudio("wrong.mp3");
                document.getElementById('insidebuttons-controls').style.display = 'none';
                document.getElementById('insidebuttons-controls1').style.display = 'flex';
                document.getElementById('back-button').style.display = 'block';
                document.getElementById('errorimg').style.display = 'block';
                document.getElementById('ins7').style.display = 'block';
                document.getElementById('ins4').style.display = 'none';
            });
            document.querySelector("#ins7").addEventListener("click", () => {
                oxExp.switchModel(4);
                playAudio("write.mp3");
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('ins7').style.display = 'none';
                document.getElementById('ins4').style.display = 'block';
            });
            document.querySelector("#ins5").addEventListener("click", () => {
                oxExp.switchModel(5);
                playAudio("USP_2.mp3");
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('insidebuttons-controls').style.display = 'none';
                document.getElementById('insidebuttons-controls1').style.display = 'flex';
                document.getElementById('back-button').style.display = 'block';
                document.getElementById('ins7').style.display = 'none';
                document.getElementById('ins4').style.display = 'block';
            });
            document.querySelector("#ins6").addEventListener("click", () => {
                oxExp.switchModel(6);
                playAudio("USP_3.mp3");
                document.getElementById('errorimg').style.display = 'none';
                document.getElementById('insidebuttons-controls').style.display = 'none';
                document.getElementById('insidebuttons-controls1').style.display = 'flex';
                document.getElementById('back-button').style.display = 'block';
                document.getElementById('ins7').style.display = 'none';
                document.getElementById('ins4').style.display = 'block';
            });

        } catch (err) {
            console.error("Error initializing UI", err);
        }
    }
    hideLoading() {
        this._loadingScreen.style.display = "none";
        this._transformControls.style.display = "block";
    }
    showError(title, message) {
        this._errorTitle.textContent = title;
        this._errorMessage.textContent = message;
        this._errorScreen.style.display = "block";
    }
}
var audio = document.getElementById('audioPlayer');

function playAudio(audioFile) {
    if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0; // Reset time to start
    }
    audio.src = audioFile;
    audio.play().catch(function (error) {
        console.log('Playback prevented:', error);
    });
}
const oxExp = new OxExperience();
const oxUI = new OxExperienceUI();
oxExp
    .init()
    .then(() => {
        oxUI.init();
        oxUI.hideLoading();
    })
    .catch((error) => {
        console.error("Error initializing Onirix SDK", error);
        oxUI.showError("Initialization Error", error.message);
    });
