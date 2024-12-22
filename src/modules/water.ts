import { WaterMaterial } from "./external/web-tide/src/ts/waterMaterial";
import { PhillipsSpectrum } from "./external/web-tide/src/ts/spectrum/phillipsSpectrum";
import { DirectionalLight, Engine, MeshBuilder, Scene } from "@babylonjs/core"

export function setupWater(scene: Scene, engine: Engine, light: DirectionalLight) {

    const textureSize = 256;
    const tileSize = 100;
    
    const initialSpectrum = new PhillipsSpectrum(textureSize, tileSize, engine);
    const waterMaterial = new WaterMaterial("waterMaterial", initialSpectrum, scene);
    
    const water = MeshBuilder.CreateGround(
        "water",
        {
            width: tileSize,
            height: tileSize,
            subdivisions: textureSize,
            
        },
        scene
    );
    water.material = waterMaterial;
    water.position.y = 5;

    function updateScene() {
        const deltaSeconds = engine.getDeltaTime() / 1000;
        waterMaterial.update(deltaSeconds, light.direction);
    }
    
    scene.executeWhenReady(() => {
        scene.registerBeforeRender(
            () => updateScene()
        );
        // engine.runRenderLoop(() => scene.render());
    });
    
}
