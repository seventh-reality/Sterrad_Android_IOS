<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Three.js and OnirixSDK Example</title>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            background: #000;
        }

        canvas {
            display: block;
        }

        #model-controls {
            display: none;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-40%, 200%);
            padding: 20px;
            margin: auto;
            width: 240px;
            padding: 25px;
        }

        #model1, #model2, #model3 {
            background-color: #FFFFFF00;
            border: 0;
        }

        #tap-to-place {
            display: block;
            margin: auto;
            width: 200px;
            padding: 25px;
            background-color: #231532;
            color: #FFFFFF;
            border: 0;
            border-radius: 20px;
            box-shadow: 0px 0px 5px 2px rgba(0, 0, 0, 0.2);
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 20px;
        }

        button {
            margin-right: 10px;
        }

        #transform-controls, #color-controls {
            display: none;
            position: static;
            top: 20px;
            left: 20px;
            margin-left: auto;
            margin-right: auto;
        }

        #loading-screen {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 20px;
            border-radius: 10px;
        }

        #error-screen {
            display: none;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.7);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }

        #UItext {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, 150%);
            padding: 20px;
            border-radius: 10px;
        }

        #one, #two, #three {
            display: none;
            scale: .7;
        }
    </style>
</head>

<body>
    <div id="UItext">
        <img id="one" src="one.png"></img>
        <img id="two" src="two.png"></img>
        <img id="three" src="three.png"></img>
    </div>
    <div id="transform-controls">
        <button id="tap-to-place">Place Model</button>
    </div>
    <div id="color-controls">
        <button id="black">Black</button>
        <button id="blue">Blue</button>
        <button id="orange">Orange</button>
        <button id="silver">Silver</button>
    </div>
    <div id="model-controls">
        <button id="model1"><img src="Icon.png" style="width:40px;height:40px;"></button>
        <button id="model2"><img src="Icon_1.png" style="width:40px;height:40px;"></button>
        <button id="model3"><img src="Icon_2.png" style="width:40px;height:40px;"></button>
    </div>
    <div id="loading-screen">Loading...</div>
    <div id="error-screen">
        <div id="error-title"></div>
        <div id="error-message"></div>
    </div>

    <script type="module">
        import OnirixSDK from "https://unpkg.com/@onirix/ar-engine-sdk@1.6.5/dist/ox-sdk.esm.js";
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

            oxSDK;

            async init() {
                try {
                    this._raycaster = new THREE.Raycaster();
                    this._clock = new THREE.Clock(true);

                    const renderCanvas = await this.initSDK();
                    this.setupRenderer(renderCanvas);
                    this.setupControls();

                    const textureLoader = new THREE.TextureLoader();
                    this._envMap = textureLoader.load("envmap.jpg");
                    this._envMap.mapping = THREE.EquirectangularReflectionMapping;
                    this._envMap.encoding = THREE.sRGBEncoding;

                    this.oxSDK.subscribe(OnirixSDK.Events.OnFrame, () => {
                        try {
                            const delta = this._clock.getDelta();
                            this._animationMixers.forEach((mixer) => mixer.update(delta));
                            this.render();
                        } catch (err) {
                            console.error("Error during frame update", err);
                        }
                    });

                    this.oxSDK.subscribe(OnirixSDK.Events.OnPose, (pose) => {
                        try {
                            this.updatePose(pose);
                        } catch (err) {
                            console.error("Error updating pose", err);
                        }
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

                    const modelsToLoad = ["Steerad.glb", "Steeradtext.glb", "sterrad_anim.glb"];
                    const gltfLoader = new GLTFLoader();
                    modelsToLoad.forEach((modelUrl, index) => {
                        gltfLoader.load(modelUrl, (gltf) => {
                            try {
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
                                    }, 50000);
                                }

                                this._models[index] = model;
                                if (index === 0) {
                                    this._currentModel = model;
                                    this._modelPlaced = true;
                                    this._scene.add(model);
                                }
                            } catch (err) {
                                console.error("Error loading model", err);
                            }
                        }, undefined, (error) => {
                            console.error("Model loading error", error);
                        });
                    });

                    this.addLights();
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

                    const ambientLight = new THREE.AmbientLight(0x666666, 0.5);
                    this._scene.add(ambientLight);
                } catch (err) {
                    console.error("Error setting up renderer", err);
                    throw err;
                }
            }

            setupControls() {
                try {
                    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
                    this._controls.enableDamping = true;
                    this._controls.dampingFactor = 0.25;
                    this._controls.screenSpacePanning = false;
                    this._controls.maxPolarAngle = Math.PI / 2;
                    this._controls.update();
                } catch (err) {
                    console.error("Error setting up OrbitControls", err);
                    throw err;
                }
            }

            updatePose(pose) {
                try {
                    this._camera.position.copy(pose.position);
                    this._camera.quaternion.copy(pose.rotation);
                    this._camera.projectionMatrix.fromArray(pose.projection);
                    this._camera.updateMatrixWorld(true);
                } catch (err) {
                    console.error("Error updating camera pose", err);
                }
            }

            render() {
                try {
                    this._controls.update();
                    this._renderer.render(this._scene, this._camera);
                } catch (err) {
                    console.error("Error during render", err);
                }
            }

            onResize() {
                try {
                    const cameraParams = this.oxSDK.getCameraParameters();
                    this._camera.fov = cameraParams.fov;
                    this._camera.aspect = cameraParams.aspect;
                    this._camera.updateProjectionMatrix();

                    const renderCanvas = this._renderer.domElement;
                    this._renderer.setSize(renderCanvas.width, renderCanvas.height);
                } catch (err) {
                    console.error("Error during resize", err);
                }
            }

            addLights() {
                try {
                    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
                    directionalLight.position.set(0, 10, 5);
                    this._scene.add(directionalLight);
                } catch (err) {
                    console.error("Error adding lights", err);
                }
            }
        }

        const oxExperience = new OxExperience();
        oxExperience.init();

        const tapToPlaceButton = document.getElementById("tap-to-place");
        tapToPlaceButton.addEventListener("click", () => oxExperience.placeCar());

        document.getElementById("model1").addEventListener("click", () => {
            oxExperience.changeModel(0);
            document.getElementById("one").style.display = "block";
            document.getElementById("two").style.display = "none";
            document.getElementById("three").style.display = "none";
        });

        document.getElementById("model2").addEventListener("click", () => {
            oxExperience.changeModel(1);
            document.getElementById("one").style.display = "none";
            document.getElementById("two").style.display = "block";
            document.getElementById("three").style.display = "none";
        });

        document.getElementById("model3").addEventListener("click", () => {
            oxExperience.changeModel(2);
            document.getElementById("one").style.display = "none";
            document.getElementById("two").style.display = "none";
            document.getElementById("three").style.display = "block";
        });
    </script>
</body>

</html>
