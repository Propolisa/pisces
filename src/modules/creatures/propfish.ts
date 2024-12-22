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

        this.mesh = mesh;
        this.animationGroups = animationGroups;

        const setAnimationParameters = (vec) => {
            const anim = animationRanges[
                Math.floor(Math.random() * animationRanges.length)
            ];
            const ofst = Math.floor(Math.random() * (anim.to - anim.from + 1));
            vec.set(anim.from, anim.to, ofst, Math.random() * 50 + 30);
        };

        const baker = new VertexAnimationBaker(this._scene, mesh);

        baker.bakeVertexData([{
            from: 0,
            to: animationRanges[animationRanges.length - 1].to,
            name: "Swim",
        }]).then((vertexData) => {
            const vertexTexture = baker.textureFromBakedVertexData(vertexData);

            const manager = new BakedVertexAnimationManager(this._scene);

            manager.texture = vertexTexture;

            mesh.bakedVertexAnimationManager = manager;

            const numInstances = 2;
            const matrices = new Float32Array(numInstances * 16);
            const animParameters = new Float32Array(numInstances * 4);

            const params = new Vector4();
            for (let i = 0; i < numInstances; i++) {
                const matrix = Matrix.Translation(
                    Math.random() * 100 - 50,
                    0,
                    Math.random() * 100 - 50,
                );

                matrices.set(matrix.asArray(), i * 16);

                setAnimationParameters(params);
                animParameters.set(params.asArray(), i * 4);
            }

            mesh.thinInstanceSetBuffer("matrix", matrices);
            mesh.thinInstanceSetBuffer(
                "bakedVertexAnimationSettingsInstanced",
                animParameters,
                4,
            );

            this._scene.registerBeforeRender(() => {
                manager.time += this._scene.getEngine().getDeltaTime() / 1000.0;
            });
        });
    }
}
