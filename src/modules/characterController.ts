import {
    ActionManager,
    AnimationGroup,
    Color3,
    Color4,
    ExecuteCodeAction,
    Mesh,
    Observable,
    ParticleSystem,
    Quaternion,
    Ray,
    Scene,
    ShadowGenerator,
    Sound,
    SphereParticleEmitter,
    Texture,
    TransformNode,
    UniversalCamera,
    Vector3,
} from "@babylonjs/core";
import { PlayerInput } from "./inputController";

// export class Player extends TransformNode {

// }

export class Player extends TransformNode {
    public camera: UniversalCamera;
    public scene: Scene;
    private _input: PlayerInput;

    //Player
    public mesh: Mesh; //outer collisionbox of player
    private _isUnderwater: boolean = false; // Track underwater state

    //Camera
    private _camRoot: TransformNode;
    private _yTilt: TransformNode;

    //animations
    private _run: AnimationGroup;
    private _idle: AnimationGroup;
    private _jump: AnimationGroup;
    private _land: AnimationGroup;
    private _dash: AnimationGroup;

    // animation trackers
    private _currentAnim: AnimationGroup = null;
    private _prevAnim: AnimationGroup;
    private _isFalling: boolean = false;
    private _jumped: boolean = false;
    private _isCameraRotating: boolean = false; // Tracks if the camera is already rotating

    //const values
    private static readonly PLAYER_SPEED: number = 0.45;

    public dashTime: number = 0;

    //player movement vars
    private _deltaTime: number = 0;
    private _h: number;
    private _v: number;

    private _moveDirection: Vector3 = new Vector3();
    private _inputAmt: number;

    //dashing
    private _dashPressed: boolean;
    private _canDash: boolean = true;

    //gravity, ground detection, jumping
    private _gravity: Vector3 = new Vector3();
    private _lastGroundPos: Vector3 = Vector3.Zero(); // keep track of the last grounded position
    private _grounded: boolean;
    private _jumpCount: number = 1;

    //player variables
    public lanternsLit: number = 1; //num lanterns lit
    public totalLanterns: number;
    public win: boolean = false; //whether the game is won

    //sparkler
    public sparkler: ParticleSystem; // sparkler particle system
    public sparkLit: boolean = true;
    public sparkReset: boolean = false;

    //moving platforms
    public _raisePlatform: boolean;

    //sfx
    public lightSfx: Sound;
    public sparkResetSfx: Sound;
    private _walkingSfx: Sound;

    //observables
    public onRun = new Observable();

    //tutorial
    public tutorial_move;
    public tutorial_dash;
    public tutorial_jump;

    /**
     * slow_idle = 0
     * idle = 1
     * swim = 2
     * swim_fast = 3
     */
    constructor(
        assets,
        scene: Scene,
        shadowGenerator: ShadowGenerator,
        input?: PlayerInput,
    ) {
        super("player", scene);
        this.scene = scene;

        //set up sounds
        this._loadSounds(this.scene);
        //camera
        this._setupPlayerCamera();
        this.mesh = assets.mesh;
        this.mesh.parent = this;

        // this.scene.getLightByName("sparklight").parent = this.scene
        //     .getTransformNodeByName("Empty");

        this._idle = assets.animationGroups[1];
        this._jump = assets.animationGroups[0];
        this._land = assets.animationGroups[0];
        this._run = assets.animationGroups[2];
        this._dash = assets.animationGroups[3];

        //--COLLISIONS--
        this.mesh.actionManager = new ActionManager(this.scene);

        //--SOUNDS--
        //observable for when to play the walking sfx
        this.onRun.add((play) => {
            if (play && !this._walkingSfx.isPlaying) {
                this._walkingSfx.play();
            } else if (!play && this._walkingSfx.isPlaying) {
                this._walkingSfx.stop();
                this._walkingSfx.isPlaying = false; // make sure that walkingsfx.stop is called only once
            }
        });

        // this._createSparkles(); //create the sparkler particle system
        this._setUpAnimations();
        // shadowGenerator.addShadowCaster(assets.mesh);

        this._input = input;
    }

    private _handleMovement(isUnderwater: boolean): void {
        // Reset movement direction
        this._moveDirection = Vector3.Zero();

        // Fetch input and apply camera-relative movement
        const inputVector = new Vector3(
            this._input.horizontal, // X input
            isUnderwater
                ? (this._input.inputMap["q"]
                    ? 1
                    : this._input.inputMap["e"]
                    ? -1
                    : 0)
                : 0, // Y input for underwater movement only
            this._input.vertical, // Z input
        );

        const clampedInput = inputVector.length() > 1
            ? inputVector.normalize()
            : inputVector;

        const forward = this._camRoot.forward.scale(clampedInput.z);
        const right = this._camRoot.right.scale(clampedInput.x);
        this._moveDirection = forward.add(right);

        // Include vertical movement (if underwater)
        if (isUnderwater) {
            this._moveDirection.y = clampedInput.y; // Preserve Y-axis movement
        }

        // Scale movement by speed
        const inputAmount = Math.min(this._moveDirection.length(), 1);
        this._moveDirection.scaleInPlace(inputAmount * Player.PLAYER_SPEED);

        // Move with collisions
        this.mesh.moveWithCollisions(this._moveDirection);
    }

    private _rotateToMatchMovement(): void {
        const movementDirection = new Vector3(
            this._input.horizontal,
            0,
            this._input.vertical,
        );
        const hasInput = movementDirection.lengthSquared() > 0;

        if (hasInput) {
            const targetAngle =
                Math.atan2(movementDirection.x, movementDirection.z) +
                this._camRoot.rotation.y;
            const targetQuaternion = Quaternion.FromEulerAngles(
                0,
                targetAngle,
                0,
            );

            // Smooth rotation
            this.mesh.rotationQuaternion = Quaternion.Slerp(
                this.mesh.rotationQuaternion,
                targetQuaternion,
                10 * this._deltaTime,
            );
        }
    }

    private _handleCameraRotation(): void {
        if (this._input.inputMap["4"] && !this._isCameraRotating) {
            this._rotateCamera(Math.PI / 4); // Rotate right by 45 degrees
        }
        if (this._input.inputMap["6"] && !this._isCameraRotating) {
            this._rotateCamera(-Math.PI / 4); // Rotate left by 45 degrees
        }
    }

    private _updateFromControls(): void {
        this._deltaTime = this.scene.getEngine().getDeltaTime() / 1000.0;

        // Centralized movement handling
        this._handleMovement(this._isUnderwater); // Pass the underwater state

        // Rotate the player to match movement direction
        this._rotateToMatchMovement();

        // Handle camera rotation based on input
        this._handleCameraRotation();

        // Apply movement to the player mesh
        this.mesh.moveWithCollisions(this._moveDirection);
    }

    private _rotateCamera(angle: number): void {
        if (this._isCameraRotating) return; // Prevent multiple simultaneous rotations

        this._isCameraRotating = true; // Lock rotations

        const initialRotation = this._camRoot.rotation.y;
        const targetRotation = initialRotation + angle;
        const duration = 15; // Number of frames for the rotation
        let frameCount = 0;

        const observer = this.scene.onBeforeRenderObservable.add(() => {
            frameCount++;
            const t = Math.min(frameCount / duration, 1); // Progress over time (0 to 1)

            // Lerp the rotation
            this._camRoot.rotation.y = initialRotation +
                t * (targetRotation - initialRotation);

            if (t >= 1) {
                // Animation complete
                this.scene.onBeforeRenderObservable.remove(observer);
                this._isCameraRotating = false; // Unlock rotation
            }
        });
    }

    private _blendAnimation(
        fromAnim: AnimationGroup,
        toAnim: AnimationGroup,
        duration: number = 15,
    ): void {
        if (!fromAnim || !toAnim || fromAnim === toAnim) {
            // If no animation or same animation, no need to blend
            if (toAnim) {
                toAnim.play(true); // Ensure toAnim is playing if no blending is required
            }
            return;
        }

        // Set up weights for the animations
        fromAnim.setWeightForAllAnimatables(1);
        toAnim.setWeightForAllAnimatables(0);

        // Start the toAnim, but at weight 0 initially
        toAnim.play(true);

        // Observable to manage the blending
        let frameCount = 0;
        const increment = 1 / duration;

        const blendingObserver = this.scene.onBeforeAnimationsObservable.add(
            () => {
                frameCount++;
                const t = Math.min(frameCount * increment, 1);

                // Lerp weights
                fromAnim.setWeightForAllAnimatables(1 - t);
                toAnim.setWeightForAllAnimatables(t);

                // When blending is done, stop the fromAnim and clean up
                if (t >= 1) {
                    this.scene.onBeforeAnimationsObservable.remove(
                        blendingObserver,
                    );
                    fromAnim.stop(); // Stop the old animation
                }
            },
        );
    }

    private _setUpAnimations(): void {
        this.scene.stopAllAnimations();
        this._run.loopAnimation = true;
        this._idle.loopAnimation = true;

        //initialize current and previous
        this._currentAnim = this._idle;
        this._prevAnim = this._land;
    }

    private _animatePlayer(): void {
        let targetAnim: AnimationGroup;

        // Determine the target animation
        if (this._input.inputMap["Shift"]) {
            targetAnim = this._dash;
        } else if (
            !this._isFalling &&
            !this._jumped &&
            (this._input.inputMap["ArrowUp"] || this._input.mobileUp ||
                this._input.inputMap["ArrowDown"] || this._input.mobileDown ||
                this._input.inputMap["ArrowLeft"] || this._input.mobileLeft ||
                this._input.inputMap["ArrowRight"] || this._input.mobileRight)
        ) {
            targetAnim = this._run;
        } else if (this._jumped && !this._isFalling) {
            targetAnim = this._jump;
        } else if (!this._isFalling && this._grounded) {
            targetAnim = this._idle;
        } else if (this._isFalling) {
            targetAnim = this._land;
        }

        // Blend to the target animation if it's different from the current animation
        if (this._currentAnim !== targetAnim) {
            const prevAnim = this._currentAnim;
            this._currentAnim = targetAnim;
            this._blendAnimation(prevAnim, targetAnim);
        }
    }

    //--GROUND DETECTION--
    //Send raycast to the floor to detect if there are any hits with meshes below the character
    private _floorRaycast(
        offsetx: number,
        offsetz: number,
        raycastlen: number,
    ): Vector3 {
        //position the raycast from bottom center of mesh
        let raycastFloorPos = new Vector3(
            this.mesh.position.x + offsetx,
            this.mesh.position.y + 0.5,
            this.mesh.position.z + offsetz,
        );
        let ray = new Ray(raycastFloorPos, Vector3.Up().scale(-1), raycastlen);

        //defined which type of meshes should be pickable
        let predicate = function (mesh) {
            return mesh.isPickable && mesh.isEnabled();
        };

        let pick = this.scene.pickWithRay(ray, predicate);

        if (pick.hit) { //grounded
            return pick.pickedPoint;
        } else { //not grounded
            return Vector3.Zero();
        }
    }

    //raycast from the center of the player to check for whether player is grounded
    private _isGrounded(): boolean {
        if (this._floorRaycast(0, 0, .6).equals(Vector3.Zero())) {
            return false;
        } else {
            return true;
        }
    }

    //https://www.babylonjs-playground.com/#FUK3S#8
    //https://www.html5gamedevs.com/topic/7709-scenepick-a-mesh-that-is-enabled-but-not-visible/
    //check whether a mesh is sloping based on the normal
    private _checkSlope(): boolean {
        if (this._isUnderwater) {
            return false; // No slope handling underwater
        }

        // Original slope logic
        let predicate = function (mesh) {
            return mesh.isPickable && mesh.isEnabled();
        };

        // 4 raycasts outward from center
        let raycast = new Vector3(
            this.mesh.position.x,
            this.mesh.position.y + 0.5,
            this.mesh.position.z + 0.25,
        );
        let ray = new Ray(raycast, Vector3.Up().scale(-1), 1.5);
        let pick = this.scene.pickWithRay(ray, predicate);

        let raycast2 = new Vector3(
            this.mesh.position.x,
            this.mesh.position.y + 0.5,
            this.mesh.position.z - 0.25,
        );
        let ray2 = new Ray(raycast2, Vector3.Up().scale(-1), 1.5);
        let pick2 = this.scene.pickWithRay(ray2, predicate);

        let raycast3 = new Vector3(
            this.mesh.position.x + 0.25,
            this.mesh.position.y + 0.5,
            this.mesh.position.z,
        );
        let ray3 = new Ray(raycast3, Vector3.Up().scale(-1), 1.5);
        let pick3 = this.scene.pickWithRay(ray3, predicate);

        let raycast4 = new Vector3(
            this.mesh.position.x - 0.25,
            this.mesh.position.y + 0.5,
            this.mesh.position.z,
        );
        let ray4 = new Ray(raycast4, Vector3.Up().scale(-1), 1.5);
        let pick4 = this.scene.pickWithRay(ray4, predicate);

        if (pick.hit && !pick.getNormal().equals(Vector3.Up())) {
            if (pick.pickedMesh.name.includes("stair")) {
                return true;
            }
        } else if (pick2.hit && !pick2.getNormal().equals(Vector3.Up())) {
            if (pick2.pickedMesh.name.includes("stair")) {
                return true;
            }
        } else if (pick3.hit && !pick3.getNormal().equals(Vector3.Up())) {
            if (pick3.pickedMesh.name.includes("stair")) {
                return true;
            }
        } else if (pick4.hit && !pick4.getNormal().equals(Vector3.Up())) {
            if (pick4.pickedMesh.name.includes("stair")) {
                return true;
            }
        }

        return false;
    }

    //--GAME UPDATES--
    private _beforeRenderUpdate(): void {
        this._updateFromControls();
        // this._updateGroundDetection();
        this._animatePlayer();
    }

    public activatePlayerCamera(): UniversalCamera {
        this.scene.registerBeforeRender(() => {
            this._beforeRenderUpdate();
            this._updateCamera();
        });
        return this.camera;
    }

    private _setupPlayerCamera(): UniversalCamera {
        // Root node for the camera, handles movement and rotation around the player
        this._camRoot = new TransformNode("root");
        this._camRoot.position = new Vector3(0, 0, 0); // Base position at the player

        // Camera tilt node, handles the downward tilt of 30 degrees
        this._yTilt = new TransformNode("yTilt");
        this._yTilt.rotation = new Vector3(Math.PI / 6, 0, 0); // 30-degree tilt
        this._yTilt.parent = this._camRoot;

        // UniversalCamera setup
        this.camera = new UniversalCamera(
            "camera",
            new Vector3(0, 0, -10),
            this.scene,
        );
        this.camera.parent = this._yTilt;

        const canvasSize = this._scene.getEngine().getInputElementClientRect();

        // Orthographic mode settings
        this.camera.mode = UniversalCamera.ORTHOGRAPHIC_CAMERA;
        const orthoSize = 10; // Adjust to control zoom level
        const aspectRatio = this.scene.getEngine().getAspectRatio(this.camera);
        this.camera.orthoLeft = -orthoSize * aspectRatio;
        this.camera.orthoRight = orthoSize * aspectRatio;
        this.camera.orthoTop = orthoSize;
        this.camera.orthoBottom = -orthoSize;
        this.camera.minZ = -100;

        this.scene.activeCamera = this.camera;
        return this.camera;
    }

    private _updateCamera(): void {
        // Maintain the camera's position relative to the player
        const playerPosition = this.mesh.position;

        // Smoothly follow the player's position
        this._camRoot.position = Vector3.Lerp(
            this._camRoot.position,
            new Vector3(
                playerPosition.x,
                playerPosition.y + 2,
                playerPosition.z,
            ),
            0.1,
        );
    }

    private _createSparkles(): void {
        const sphere = Mesh.CreateSphere("sparkles", 4, 1, this.scene);
        sphere.position = new Vector3(0, 0, 0);
        sphere.parent = this.scene.getTransformNodeByName("Empty"); // place particle system at the tip of the sparkler on the player mesh
        sphere.isVisible = false;

        let particleSystem = new ParticleSystem("sparkles", 1000, this.scene);
        particleSystem.particleTexture = new Texture(
            "textures/flwr.png",
            this.scene,
        );
        particleSystem.emitter = sphere;
        particleSystem.particleEmitterType = new SphereParticleEmitter(0);

        particleSystem.updateSpeed = 0.014;
        particleSystem.minAngularSpeed = 0;
        particleSystem.maxAngularSpeed = 360;
        particleSystem.minEmitPower = 1;
        particleSystem.maxEmitPower = 3;

        particleSystem.minSize = 0.5;
        particleSystem.maxSize = 2;
        particleSystem.minScaleX = 0.5;
        particleSystem.minScaleY = 0.5;
        particleSystem.color1 = new Color4(0.8, 0.8549019607843137, 1, 1);
        particleSystem.color2 = new Color4(
            0.8509803921568627,
            0.7647058823529411,
            1,
            1,
        );

        particleSystem.addRampGradient(0, Color3.White());
        particleSystem.addRampGradient(1, Color3.Black());
        particleSystem.getRampGradients()[0].color = Color3.FromHexString(
            "#BBC1FF",
        );
        particleSystem.getRampGradients()[1].color = Color3.FromHexString(
            "#FFFFFF",
        );
        particleSystem.maxAngularSpeed = 0;
        particleSystem.maxInitialRotation = 360;
        particleSystem.minAngularSpeed = -10;
        particleSystem.maxAngularSpeed = 10;

        particleSystem.start();

        this.sparkler = particleSystem;
    }

    private _loadSounds(scene: Scene): void {
        this.lightSfx = new Sound(
            "light",
            "./sounds/Rise03.mp3",
            scene,
            function () {
            },
        );

        this.sparkResetSfx = new Sound(
            "sparkReset",
            "./sounds/Rise04.mp3",
            scene,
            function () {
            },
        );

        this._jumpingSfx = new Sound(
            "jumping",
            "./sounds/187024__lloydevans09__jump2.wav",
            scene,
            function () {
            },
            {
                volume: 0.25,
            },
        );

        this._dashingSfx = new Sound(
            "dashing",
            "./sounds/194081__potentjello__woosh-noise-1.wav",
            scene,
            function () {
            },
        );

        this._walkingSfx = new Sound(
            "walking",
            "./sounds/Concrete 2.wav",
            scene,
            function () {
            },
            {
                loop: true,
                volume: 0.20,
                playbackRate: 0.6,
            },
        );

        this._resetSfx = new Sound(
            "reset",
            "./sounds/Retro Magic Protection 25.wav",
            scene,
            function () {
            },
            {
                volume: 0.25,
            },
        );
    }
}
