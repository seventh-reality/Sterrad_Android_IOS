import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.8.3/dist/ox-sdk.esm.js";
import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js";

class OxExperience {
    _renderer = null;
    _scene = null;
    _camera = null;
    _models = [];
    _modelIndex = 0;
    _currentModel = null;
    _animationMixers = [];
    _clock = null;
    _CarPlaced = false;
    _gltfData = [];
    oxSDK;
    _modelPlaced = false;
    _lastPinchDistance = null; // To track pinch zoom
    _lastTouchX = null; // To track single-finger rotation

    async init() {
        try {
            this._raycaster = new THREE.Raycaster();
            this._clock = new THREE.Clock(true);
            this._CarPlaced = false;

            const renderCanvas = await this.initSDK();
            this.setupRenderer(renderCanvas);

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
                this.updatePose(ppose);
            });

            this.oxSDK.subscribe(OnirixSDK.Events.OnResize, () => {
                this.onResize();
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
            this.addTouchListeners(); // Add custom touch controls here

        } catch (err) {
            console.error("Error initializing OxExperience", err);
        }
    }

    async initSDK() {
        try {
            this.oxSDK = new OnirixSDK("your-onirix-token");
            const config = {
                mode: OnirixSDK.TrackingMode.Surface,
            };
            return this.oxSDK.init(config);
        } catch (err) {
            console.error("Error initializing Onirix SDK", err);
            throw err;
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
    }

    addLights() {
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        this._scene.add(directionalLight);
    }

    render() {
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

    addTouchListeners() {
        const renderCanvas = this._renderer.domElement;

        renderCanvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 2) {
                this._lastPinchDistance = this.getPinchDistance(event.touches);
            } else if (event.touches.length === 1) {
                this._lastTouchX = event.touches[0].pageX;
            }
        });

        renderCanvas.addEventListener('touchmove', (event) => {
            if (event.touches.length === 2 && this._lastPinchDistance) {
                const currentDistance = this.getPinchDistance(event.touches);
                const deltaDistance = currentDistance - this._lastPinchDistance;
                this.zoomCamera(deltaDistance);
                this._lastPinchDistance = currentDistance;
            } else if (event.touches.length === 1 && this._lastTouchX) {
                const currentTouchX = event.touches[0].pageX;
                const deltaX = currentTouchX - this._lastTouchX;
                this.rotateScene(deltaX);
                this._lastTouchX = currentTouchX;
            }
        });

        renderCanvas.addEventListener('touchend', () => {
            this._lastPinchDistance = null;
            this._lastTouchX = null;
        });
    }

    getPinchDistance(touches) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    zoomCamera(deltaDistance) {
        const zoomSpeed = 0.05;
        this._camera.fov -= deltaDistance * zoomSpeed;
        this._camera.fov = Math.max(20, Math.min(80, this._camera.fov)); // Limit zoom
        this._camera.updateProjectionMatrix();
    }

    rotateScene(deltaX) {
        const rotationSpeed = 0.005;
        if (this._currentModel) {
            this._currentModel.rotation.y += deltaX * rotationSpeed;
        }
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
            }
        }
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
                         playAudio("Feture.mp3");
                        oxExp.placeCar();
                        oxExp.switchModel(1);
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
                        oxExp.switchModel(1);
                        playAudio("benfitf.mp3");

                        document.getElementById('insidebuttons-controls1').style.display = 'flex';
                        document.getElementById('insidebuttons-controls').style.display = 'none';
                        document.getElementById('back-button').style.display = 'block';
                        document.getElementById('model-controls').style.display = 'none';
                        document.getElementById('errorimg').style.display = 'none';
                        document.getElementById('ins7').style.display = 'none';


                    });
                    document.querySelector("#back").addEventListener("click", () => {
                        oxExp.switchModel(1);
                        // playAudio("");
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
            // Stop current audio if playing
            if (!audio.paused) {
                audio.pause();
                audio.currentTime = 0; // Reset time to start
            }

            // Set the new audio source and play
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
