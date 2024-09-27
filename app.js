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
    _carPlaced = false;
    _gltfData = [];
    oxSDK;
    _scale = 0.1;
    _modelPlaced = false;
    _surfacePlaceholder = null; // Placeholder for surface
    _placeholderVisible = true;

    async init() {
        try {
            this._raycaster = new THREE.Raycaster();
            this._clock = new THREE.Clock(true);
            this._carPlaced = false;
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
                if (!this._modelPlaced && this._surfacePlaceholder) {
                    // Move the placeholder to hit result position
                    this._surfacePlaceholder.position.copy(hitResult.position);
                    this._surfacePlaceholder.visible = true;
                }
            });

            this.addLights();
            this.addSurfacePlaceholder(); // Add surface placeholder

            this.loadModels();
        } catch (err) {
            console.error("Error initializing OxExperience", err);
            throw err;
        }
    }

    async initSDK() {
        try {
            this.oxSDK = new OnirixSDK("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjUyMDIsInByb2plY3RJZCI6MTQ0MjgsInJvbGUiOjMsImlhdCI6MTYxNjc1ODY5NX0.8F5eAPcBGaHzSSLuQAEgpdja9aEZ6Ca_Ll9wg84Rp5k");
            const config = {
                mode: OnirixSDK.TrackingMode.Surface,
            };
            return this.oxSDK.init(config);
        } catch (err) {
            console.error("Error initializing Onirix SDK", err);
            throw err;
        }
    }

    addSurfacePlaceholder() {
        // Create a placeholder to show where the user can click to place the model
        const geometry = new THREE.CircleGeometry(0.1, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this._surfacePlaceholder = new THREE.Mesh(geometry, material);
        this._surfacePlaceholder.rotation.x = -Math.PI / 2; // Align with the surface
        this._surfacePlaceholder.visible = true; // Initially visible
        this._scene.add(this._surfacePlaceholder);

        // Add event listener for clicking on the placeholder
        this._renderer.domElement.addEventListener("click", (event) => {
            this.onCanvasClick(event);
        });
    }

    onCanvasClick(event) {
        if (this._placeholderVisible) {
            const mouse = new THREE.Vector2();
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            this._raycaster.setFromCamera(mouse, this._camera);
            const intersects = this._raycaster.intersectObject(this._surfacePlaceholder);
            if (intersects.length > 0) {
                this.placeCar();
            }
        }
    }

    placeCar() {
        if (!this._modelPlaced) {
            this._modelPlaced = true;
            this._surfacePlaceholder.visible = false; // Hide the placeholder after placing
            this._placeholderVisible = false;
            if (this._currentModel) {
                this._currentModel.visible = true; // Make model visible
            }
            this.oxSDK.start();
        }
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

        const pointLight = new THREE.PointLight(0xffffff, 1, 100);
        pointLight.position.set(5, 10, 5);
        this._scene.add(pointLight);
    }

    setupControls(renderCanvas) {
        this._controls = new OrbitControls(this._camera, renderCanvas);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.25;
        this._controls.enableZoom = true;
        this._controls.enableRotate = true;
        this._controls.enablePan = false;

        renderCanvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 2) {
                this._controls.enablePan = false;
            }
        });

        renderCanvas.addEventListener('touchend', () => {
            this._controls.enablePan = false;
        });
    }

    loadModels() {
        const modelsToLoad = ["Steerad.glb", "Sterrad_PARTS.glb", "USAGE.glb", "USP_1.glb", "UPS_2.glb", "UPS_3.glb"];
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

                // Initially set the model to invisible
                model.visible = false;

                if (index === 0) {
                    this._currentModel = model;
                }
                this._gltfData[index] = gltf;
                this._models[index] = model;
                this._scene.add(model);
            }, undefined, (error) => {
                console.error("Model loading error", error);
            });
        });
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
        if (this._models.length === 0) return;
        this._models.forEach((model) => {
            model.traverse((child) => {
                if (child.material) {
                    child.material.color.set(value);
                    child.material.needsUpdate = true;
                }
            });
        });
    }

    playAudio() {
        var audio = new Audio("audio.mp3");
        audio.play();
    }

    switchModel(index) {
        if (this._gltfData.length > 0) {
            this._currentModel.visible = false;
            this._modelIndex = (this._modelIndex + 1) % this._gltfData.length;
            this._currentModel = this._gltfData[this._modelIndex].scene;
            this._currentModel.visible = true;
        }
    }
}

window.app = new OxExperience();
window.app.init();

           

                // Set the new model as the current model
                this._currentModel = this._models[index];
                if (this._currentModel) {
                    this._scene.add(this._currentModel);

                    // Initialize animation if the model has animations
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
            
            // playAudio(audioFile) {
            //     const audio = new Audio(audioFile);
            //     audio.play();
            // }
        
        let previousTouch = null;
       function onTouchStart(event) {
            if (event.touches.length === 1) {
                previousTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }
        }

        function onTouchMove(event) {
            if (event.touches.length === 1 && previousTouch) {
                const touch = event.touches[0];
                const deltaX = touch.clientX - previousTouch.x;
                const deltaY = touch.clientY - previousTouch.y;

                // Update cube rotation based on touch movement
                cube.rotation.y += deltaX * 0.01; // Adjust sensitivity as needed
                cube.rotation.x += deltaY * 0.01;

                // Update previous touch position
                previousTouch = { x: touch.clientX, y: touch.clientY };
            }
        }

         function onTouchEnd() {
            previousTouch = null; // Reset on touch end
        }
        // Event listeners
        window.addEventListener('touchstart', onTouchStart);
        window.addEventListener('touchmove', onTouchMove);
        window.addEventListener('touchend', onTouchEnd);
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
                        oxExp.switchModel(0);
                        playAudio("afterf.mp3");

                        document.getElementById('insidebuttons-controls').style.display = 'block';
                        document.getElementById('insidebuttons-controls1').style.display = 'none';
                        document.getElementById('back-button').style.display = 'block';
                        document.getElementById('model-controls').style.display = 'none';
                        document.getElementById('errorimg').style.display = 'none';

                    });
                    document.querySelector("#model2").addEventListener("click", () => {
                        oxExp.switchModel(0);
                        playAudio("benfitf.mp3");

                        document.getElementById('insidebuttons-controls1').style.display = 'flex';
                        document.getElementById('insidebuttons-controls').style.display = 'none';
                        document.getElementById('back-button').style.display = 'block';
                        document.getElementById('model-controls').style.display = 'none';
                        document.getElementById('errorimg').style.display = 'none';
                        document.getElementById('ins7').style.display = 'none';


                    });
                    document.querySelector("#back").addEventListener("click", () => {
                        oxExp.switchModel(0);
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
                        oxExp.switchModel(0);
                        playAudio("Intro.mp3");
                        document.getElementById('errorimg').style.display = 'none';
                        document.getElementById('insidebuttons-controls').style.display = 'block';
                        document.getElementById('insidebuttons-controls1').style.display = 'none';
                        document.getElementById('back-button').style.display = 'block';


                    });
                    document.querySelector("#ins2").addEventListener("click", () => {
                        oxExp.switchModel(1);
                        playAudio("parts.mp3");
                        document.getElementById('errorimg').style.display = 'none';
                        document.getElementById('insidebuttons-controls').style.display = 'block';
                        document.getElementById('insidebuttons-controls1').style.display = 'none';
                        document.getElementById('back-button').style.display = 'block';

                    });
                    document.querySelector("#ins3").addEventListener("click", () => {
                        oxExp.switchModel(2);
                        playAudio("Usage.mp3");

                        document.getElementById('errorimg').style.display = 'none';
                        document.getElementById('insidebuttons-controls').style.display = 'block';
                        document.getElementById('insidebuttons-controls1').style.display = 'none';
                        document.getElementById('back-button').style.display = 'block';

                    });
                    document.querySelector("#ins4").addEventListener("click", () => {
                        oxExp.switchModel(3);
                        playAudio("wrong.mp3");

                        document.getElementById('insidebuttons-controls').style.display = 'none';
                        document.getElementById('insidebuttons-controls1').style.display = 'flex';
                        document.getElementById('back-button').style.display = 'block';
                        document.getElementById('errorimg').style.display = 'block';
                        document.getElementById('ins7').style.display = 'block';
                        document.getElementById('ins4').style.display = 'none';

                    });
                     document.querySelector("#ins7").addEventListener("click", () => {
                        oxExp.switchModel(3);
                        playAudio("write.mp3");
                        document.getElementById('errorimg').style.display = 'none';
                        document.getElementById('ins7').style.display = 'none';
                        document.getElementById('ins4').style.display = 'block';

                    });
                    document.querySelector("#ins5").addEventListener("click", () => {
                        oxExp.switchModel(4);
                        playAudio("USP_2.mp3");
                        document.getElementById('errorimg').style.display = 'none';
                        document.getElementById('insidebuttons-controls').style.display = 'none';
                        document.getElementById('insidebuttons-controls1').style.display = 'flex';
                        document.getElementById('back-button').style.display = 'block';
                        document.getElementById('ins7').style.display = 'none';
                        document.getElementById('ins4').style.display = 'block';

                    });
                    document.querySelector("#ins6").addEventListener("click", () => {
                        oxExp.switchModel(5);
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
