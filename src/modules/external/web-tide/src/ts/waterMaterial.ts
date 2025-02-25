import fragment from "../shaders/waterMaterial/fragment.glsl?raw";
import vertex from "../shaders/waterMaterial/vertex.glsl?raw";

import { Scene } from "@babylonjs/core/scene";
import { IFFT } from "./utils/IFFT";
import { createStorageTexture } from "./utils/utils";
import { DynamicSpectrum } from "./spectrum/dynamicSpectrum";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Constants } from "@babylonjs/core/Engines/constants";
import { InitialSpectrum } from "./spectrum/initialSpectrum";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";

import TropicalSunnyDay_px from "../assets/skybox/TropicalSunnyDay_px.jpg";
import TropicalSunnyDay_py from "../assets/skybox/TropicalSunnyDay_py.jpg";
import TropicalSunnyDay_pz from "../assets/skybox/TropicalSunnyDay_pz.jpg";
import TropicalSunnyDay_nx from "../assets/skybox/TropicalSunnyDay_nx.jpg";
import TropicalSunnyDay_ny from "../assets/skybox/TropicalSunnyDay_ny.jpg";
import TropicalSunnyDay_nz from "../assets/skybox/TropicalSunnyDay_nz.jpg";

/**
 * The material that makes all the magic happen. Its vertex shader deforms the water mesh according to the height map
 * computed using IFFT. The fragment shader makes is look like water.
 */
export class WaterMaterial extends ShaderMaterial {
    /**
     * The size of the textures used in the simulation. Higher values are more accurate but slower to compute.
     */
    readonly textureSize: number;

    /**
     * The size of the ocean tiles.
     */
    readonly tileSize: number;

    readonly reflectionTexture: CubeTexture;

    /**
     * The spectrum describing the simulation at time t=0.
     */
    readonly initialSpectrum: InitialSpectrum;

    /**
     * The spectrum describing the simulation at the current time.
     */
    readonly dynamicSpectrum: DynamicSpectrum;

    /**
     * The IFFT calculator used to compute the height map, gradient map and displacement map.
     */
    readonly ifft: IFFT;

    /**
     * The height map is used to translate vertically the water vertices.
     * It is computed using the IFFT of the dynamic spectrum.
     */
    readonly heightMap: BaseTexture;

    /**
     * The gradient map is used to compute the normals of the water mesh in order to shade it properly.
     * It is computed using the IFFT of the dynamic spectrum.
     */
    readonly gradientMap: BaseTexture;

    /**
     * The displacement map is used to achieve the "Choppy waves" effect described in Tessendorf's paper.
     * It helps to make sharper wave crests and smoother troughs.
     * It is computed using the IFFT of the dynamic spectrum.
     */
    readonly displacementMap: BaseTexture;

    readonly depthRenderer: DepthRenderer;

    readonly screenRenderTarget: RenderTargetTexture;

    /**
     * The elapsed time in seconds since the simulation started.
     * Starting at 0 creates some visual artefacts, so we start at 1 min to avoid them.
     * @private
     */
    private elapsedSeconds = 60;

    constructor(name: string, initialSpectrum: InitialSpectrum, scene: Scene) {
        if (Effect.ShadersStore["oceanVertexShader"] === undefined) {
            Effect.ShadersStore["oceanVertexShader"] = vertex;
        }
        if (Effect.ShadersStore["oceanFragmentShader"] === undefined) {
            Effect.ShadersStore["oceanFragmentShader"] = fragment;
        }
        super(name, scene, "ocean", {
            attributes: ["position", "normal", "uv"],
            uniforms: ["world", "worldView", "worldViewProjection", "view", "projection", "cameraPositionW", "lightDirection", "tileSize"],
            samplers: ["heightMap", "gradientMap", "displacementMap", "reflectionSampler", "depthSampler", "textureSampler"]
        });
        this.depthRenderer = scene.enableDepthRenderer(scene.activeCamera, false, true);
        this.setTexture("depthSampler", this.depthRenderer.getDepthMap());

        // create render target texture
        this.screenRenderTarget = new RenderTargetTexture("screenTexture", { ratio: scene.getEngine().getRenderWidth() / scene.getEngine().getRenderHeight() }, scene);
        scene.customRenderTargets.push(this.screenRenderTarget);

        this.setTexture("textureSampler", this.screenRenderTarget);

        this.reflectionTexture = new CubeTexture("", scene, null, false, [
            TropicalSunnyDay_px,
            TropicalSunnyDay_py,
            TropicalSunnyDay_pz,
            TropicalSunnyDay_nx,
            TropicalSunnyDay_ny,
            TropicalSunnyDay_nz
        ]);
        //this.reflectionTexture.coordinatesMode = Constants.TEXTURE_CUBE_MAP;
        this.setTexture("reflectionSampler", this.reflectionTexture);

        if (initialSpectrum.h0.textureFormat != Constants.TEXTUREFORMAT_RGBA) {
            throw new Error("The base spectrum must have a texture format of RGBA");
        }

        this.textureSize = initialSpectrum.textureSize;
        this.tileSize = initialSpectrum.tileSize;

        this.initialSpectrum = initialSpectrum;
        this.dynamicSpectrum = new DynamicSpectrum(this.initialSpectrum, scene.getEngine());

        this.ifft = new IFFT(scene.getEngine(), this.textureSize);
        this.heightMap = createStorageTexture("heightBuffer", scene.getEngine(), this.textureSize, this.textureSize, Constants.TEXTUREFORMAT_RG);
        this.gradientMap = createStorageTexture("gradientBuffer", scene.getEngine(), this.textureSize, this.textureSize, Constants.TEXTUREFORMAT_RG);
        this.displacementMap = createStorageTexture("displacementBuffer", scene.getEngine(), this.textureSize, this.textureSize, Constants.TEXTUREFORMAT_RG);

        this.setTexture("heightMap", this.heightMap);
        this.setTexture("gradientMap", this.gradientMap);
        this.setTexture("displacementMap", this.displacementMap);
    }

    /**
     * Update the material with the new state of the ocean simulation.
     * IFFT will be used to compute the height map, gradient map and displacement map for the current time.
     * @param deltaSeconds The time elapsed since the last update in seconds
     * @param lightDirection The direction of the light in the scene
     */
    public update(deltaSeconds: number, lightDirection: Vector3) {
        this.elapsedSeconds += deltaSeconds;
        this.dynamicSpectrum.generate(this.elapsedSeconds);

        const allNonWaterMeshes = this.getScene().meshes.filter((mesh) => mesh.material !== this);

        this.depthRenderer.getDepthMap().renderList = allNonWaterMeshes;
        this.screenRenderTarget.renderList = allNonWaterMeshes;

        this.ifft.applyToTexture(this.dynamicSpectrum.ht, this.heightMap);
        this.ifft.applyToTexture(this.dynamicSpectrum.dht, this.gradientMap);
        this.ifft.applyToTexture(this.dynamicSpectrum.displacement, this.displacementMap);

        const activeCamera = this.getScene().activeCamera;
        if (activeCamera === null) throw new Error("No active camera found");
        this.setVector3("cameraPositionW", activeCamera.globalPosition);

        this.setFloat("tileSize", this.tileSize);

        this.setVector3("lightDirection", lightDirection);
    }

    public dispose(forceDisposeEffect?: boolean, forceDisposeTextures?: boolean, notBoundToMesh?: boolean) {
        this.dynamicSpectrum.dispose();
        this.ifft.dispose();
        this.heightMap.dispose();
        this.gradientMap.dispose();
        this.displacementMap.dispose();

        super.dispose(forceDisposeEffect, forceDisposeTextures, notBoundToMesh);
    }
}
