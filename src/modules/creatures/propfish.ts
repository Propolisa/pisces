import {
    BakedVertexAnimationManager,
    Matrix,
    Mesh,
    Scene,
    SceneLoader,
    TransformNode,
    Vector4,
    VertexAnimationBaker,
} from "@babylonjs/core";
export class PropFish extends TransformNode {
    constructor(name: string, scene: Scene) {
        super(name, scene);
    }
    async init() {
        const animationRanges = [
            { from: 0, to: 9 },
            { from: 10, to: 19 },
            { from: 20, to: 29 },
            { from: 30, to: 39 },
        ];

        const { mesh, animationGroups } = await SceneLoader.ImportMeshAsync(
            null,
            "./models/",
            "propfish.glb",
            this._scene,
        ).then((result) => {
            return {
                mesh: result.meshes[0] as Mesh,
                animationGroups: result.animationGroups,
            };
        });

        // this.mesh = mesh;
        // this.animationGroups = animationGroups;

    }
}
