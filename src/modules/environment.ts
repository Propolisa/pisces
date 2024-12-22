import {
    ActionManager,
    AnimationGroup,
    Color3,
    Color4,
    ExecuteCodeAction,
    Mesh,
    MeshBuilder,
    ParticleSystem,
    PBRMetallicRoughnessMaterial,
    Scene,
    SceneLoader,
    Sound,
    Tags,
    Texture,
    TransformNode,
    Vector3,
    VertexBuffer,
} from "@babylonjs/core";
import { Lantern } from "./lantern";
import { Player } from "./characterController";

export class Environment {
    private _scene: Scene;

    //Meshes
    private _lanternObjs: Array<Lantern>; //array of lanterns that need to be lit
    private _lightmtl: PBRMetallicRoughnessMaterial; // emissive texture for when lanterns are lit

    //fireworks
    private _fireworkObjs = [];
    private _startFireworks: boolean = false;

    constructor(scene: Scene) {
        this._scene = scene;
        this._lanternObjs = [];

        //create emissive material for when lantern is lit
        const lightmtl = new PBRMetallicRoughnessMaterial(
            "lantern mesh light",
            this._scene,
        );
        lightmtl.emissiveTexture = new Texture(
            "/textures/litLantern.png",
            this._scene,
            true,
            false,
        );
        lightmtl.emissiveColor = new Color3(
            0.8784313725490196,
            0.7568627450980392,
            0.6235294117647059,
        );
        this._lightmtl = lightmtl;
    }
    //What we do once the environment assets have been imported
    //handles setting the necessary flags for collision and trigger meshes,
    //sets up the lantern objects
    //creates the firework particle systems for end-game
    public async load() {
        const assets = await this._loadAsset();
        //Loop through all environment meshes that were imported
        this._scene.meshes.forEach((m) => {
            m.scaling.setAll(20);
            m.scaling.y = 5;
            m.receiveShadows = true;
            m.checkCollisions = true;
        });
    }

    //Load all necessary meshes for the environment
    public async _loadAsset() {
        //loads game environment
        const ground = await SceneLoader.ImportMeshAsync(
            null,
            "./models/",
            "ground.glb",
            this._scene,
        );

        return {
            ground,
        };
    }
}

class Firework {
    private _scene: Scene;

    //variables used by environment
    private _emitter: Mesh;
    private _rocket: ParticleSystem;
    private _exploded: boolean = false;
    private _height: number;
    private _delay: number;
    private _started: boolean;

    //sounds
    private _explosionSfx: Sound;
    private _rocketSfx: Sound;

    constructor(scene: Scene, i: number) {
        this._scene = scene;
        //Emitter for rocket of firework
        const sphere = Mesh.CreateSphere("rocket", 4, 1, scene);
        sphere.isVisible = false;
        //the origin spawn point for all fireworks is determined by a TransformNode called "fireworks", this was placed in blender
        let randPos = Math.random() * 10;
        sphere.position = new Vector3(
            scene.getTransformNodeByName("fireworks").getAbsolutePosition().x +
                randPos * -1,
            scene.getTransformNodeByName("fireworks").getAbsolutePosition().y,
            scene.getTransformNodeByName("fireworks").getAbsolutePosition().z,
        );
        this._emitter = sphere;

        //Rocket particle system
        let rocket = new ParticleSystem("rocket", 350, scene);
        rocket.particleTexture = new Texture("./textures/flare.png", scene);
        rocket.emitter = sphere;
        rocket.emitRate = 20;
        rocket.minEmitBox = new Vector3(0, 0, 0);
        rocket.maxEmitBox = new Vector3(0, 0, 0);
        rocket.color1 = new Color4(0.49, 0.57, 0.76);
        rocket.color2 = new Color4(0.29, 0.29, 0.66);
        rocket.colorDead = new Color4(0, 0, 0.2, 0.5);
        rocket.minSize = 1;
        rocket.maxSize = 1;
        rocket.addSizeGradient(0, 1);
        rocket.addSizeGradient(1, 0.01);
        this._rocket = rocket;

        //set how high the rocket will travel before exploding and how long it'll take before shooting the rocket
        this._height = sphere.position.y + Math.random() * (15 + 4) + 4;
        this._delay = (Math.random() * i + 1) * 60; //frame based

        this._loadSounds();
    }

    private _explosions(position: Vector3): void {
        //mesh that gets split into vertices
        const explosion = Mesh.CreateSphere("explosion", 4, 1, this._scene);
        explosion.isVisible = false;
        explosion.position = position;

        let emitter = explosion;
        emitter.useVertexColors = true;
        let vertPos = emitter.getVerticesData(VertexBuffer.PositionKind);
        let vertNorms = emitter.getVerticesData(VertexBuffer.NormalKind);
        let vertColors = [];

        //for each vertex, create a particle system
        for (let i = 0; i < vertPos.length; i += 3) {
            let vertPosition = new Vector3(
                vertPos[i],
                vertPos[i + 1],
                vertPos[i + 2],
            );
            let vertNormal = new Vector3(
                vertNorms[i],
                vertNorms[i + 1],
                vertNorms[i + 2],
            );
            let r = Math.random();
            let g = Math.random();
            let b = Math.random();
            let alpha = 1.0;
            let color = new Color4(r, g, b, alpha);
            vertColors.push(r);
            vertColors.push(g);
            vertColors.push(b);
            vertColors.push(alpha);

            //emitter for the particle system
            let gizmo = Mesh.CreateBox("gizmo", 0.001, this._scene);
            gizmo.position = vertPosition;
            gizmo.parent = emitter;
            let direction = vertNormal.normalize().scale(1); // move in the direction of the normal

            //actual particle system for each exploding piece
            const particleSys = new ParticleSystem(
                "particles",
                500,
                this._scene,
            );
            particleSys.particleTexture = new Texture(
                "textures/flare.png",
                this._scene,
            );
            particleSys.emitter = gizmo;
            particleSys.minEmitBox = new Vector3(1, 0, 0);
            particleSys.maxEmitBox = new Vector3(1, 0, 0);
            particleSys.minSize = .1;
            particleSys.maxSize = .1;
            particleSys.color1 = color;
            particleSys.color2 = color;
            particleSys.colorDead = new Color4(0, 0, 0, 0.0);
            particleSys.minLifeTime = 1;
            particleSys.maxLifeTime = 2;
            particleSys.emitRate = 500;
            particleSys.gravity = new Vector3(0, -9.8, 0);
            particleSys.direction1 = direction;
            particleSys.direction2 = direction;
            particleSys.minEmitPower = 10;
            particleSys.maxEmitPower = 13;
            particleSys.updateSpeed = 0.01;
            particleSys.targetStopDuration = 0.2;
            particleSys.disposeOnStop = true;
            particleSys.start();
        }

        emitter.setVerticesData(VertexBuffer.ColorKind, vertColors);
    }

    private _startFirework(): void {
        if (this._started) { //if it's started, rocket flies up to height & then explodes
            if (this._emitter.position.y >= this._height && !this._exploded) {
                //--sounds--
                this._explosionSfx.play();
                //transition to the explosion particle system
                this._exploded = !this._exploded; // don't allow for it to explode again
                this._explosions(this._emitter.position);
                this._emitter.dispose();
                this._rocket.stop();
            } else {
                //move the rocket up
                this._emitter.position.y += .2;
            }
        } else {
            //use its delay to know when to shoot the firework
            if (this._delay <= 0) {
                this._started = true;
                //--sounds--
                this._rocketSfx.play();
                //start particle system
                this._rocket.start();
            } else {
                this._delay--;
            }
        }
    }

    private _loadSounds(): void {
        this._rocketSfx = new Sound(
            "selection",
            "./sounds/fw_05.wav",
            this._scene,
            function () {
            },
            {
                volume: 0.5,
            },
        );

        this._explosionSfx = new Sound(
            "selection",
            "./sounds/fw_03.wav",
            this._scene,
            function () {
            },
            {
                volume: 0.5,
            },
        );
    }
}
