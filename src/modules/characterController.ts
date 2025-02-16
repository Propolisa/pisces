import {
    ActionManager,
    AnimationGroup,
    Color3,
    Color4,
    ExecuteCodeAction,
    Matrix,
    Mesh,
    MeshBuilder,
    Observable,
    ParticleSystem,
    Quaternion,
    Ray,
    Scalar,
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
import {
    AbstractCameraController,
    PlayerInputPhysicsSimulator,
} from "./testbed/player_camera_movement";
import { setupBubbleEmitter } from "./testbed/swim_particle_emitter";

export class Player extends TransformNode {
    [x: string]: any
    public camera: UniversalCamera;
    public scene: Scene;
    private _input: PlayerInput;

    //Player
    public mesh: Mesh; //outer collisionbox of player
    private _isUnderwater: boolean = false; // Track underwater state

    // A constant for movement speed.
    public static PLAYER_SPEED: number = 5;
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

    public dashTime: number = 0;

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

        this.mesh = assets.mesh;
        this.skeleton = assets.skeleton
        this.real_mesh = assets.real_mesh
        this.mesh.parent = this;

        this.rotation.y = 180;

        this._setupCamera();

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

        let target_bones = [
            "mixamorig:RightHand",
            "mixamorig:RightLeg",
            "mixamorig:LeftHand",
            "mixamorig:LeftLeg",
        ];
    
        for (const bone_name of target_bones) {
            
            let matching_bone = this.skeleton.bones.find(e => e.name === bone_name)
            if (matching_bone) {
                let emission_cube = MeshBuilder.CreateBox(
                    `bubble_emitter_${bone_name}`,
                    {
                        size: .2,
                    },
                );
            emission_cube.parent = this
                emission_cube.attachToBone(matching_bone, this.real_mesh)
                // setupBubbleEmitter(this.scene, emission_cube);
            }

        }
        

        this._input = input;
    }

    // For physics-based momentum:
    private _velocity: Vector3 = Vector3.Zero();

    // Create and set up the follow camera.
    private _setupCamera(): UniversalCamera {
        // Create the camera at an initial position.
        const camera = new UniversalCamera(
            "FollowCam",
            new Vector3(0, 10, -10),
            this.scene,
        );

        camera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);
        var cameraController = new AbstractCameraController(
            this,
            camera,
            this.scene,
            {
                desiredCameraDistance: 10,
                mouseSensitivity: 0.005,
                smoothFactor: 0.1,
            },
        );
        var playerController = new PlayerInputPhysicsSimulator(
            this,
            this.scene,
            camera,
            {
                acceleration: 0.02,
                deceleration: 0.02,
                maxSpeed: 0.2,
                rotationLerpFactor: 0.1,
            },
        );
        this.camera = camera;
    }

    private _beforeRenderUpdate(): void {
        this._animatePlayer();
        // Additional updates (animations, ground detection, etc.) can go here.
    }

    public activatePlayerCamera(): UniversalCamera {
        this.scene.registerBeforeRender(() => {
            this._beforeRenderUpdate();
        });
        return this.camera;
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
