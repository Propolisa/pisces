// 24.12.23 Coding Crusader - Points of an animated mesh
// Jan 2025 -- adapted by Propolis for custom mesh 'scalping' for use in hair sim project
function getTransformedPointAtIndex(index, positionsData, matricesIndicesData, matricesWeightsData, skeletonMatrices){
    let tempVector3 = BABYLON.Vector3.Zero();
    let finalMatrix = new BABYLON.Matrix();
    let tempMatrix = new BABYLON.Matrix();
    let matWeightIdx = (index / 3 ) * 4
    debugger
    for (let inf = 0; inf < 4; inf++) {
            let weight = matricesWeightsData[matWeightIdx + inf];
            if (weight > 0) {
                BABYLON.Matrix.FromFloat32ArrayToRefScaled(skeletonMatrices, Math.floor(matricesIndicesData[matWeightIdx + inf] * 16), weight, tempMatrix);
                finalMatrix.addToSelf(tempMatrix);
            }
        }

        BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(positionsData[index], positionsData[index + 1], positionsData[index + 2], finalMatrix, tempVector3);
        return tempVector3
}


class Rain {
    constructor(scene, particle, mesh, controlMesh = null) {
        this.mesh = mesh;
        this.controlMesh = controlMesh;

        let positionsData = this.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        let normalsData = this.mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind); // Get normals
        let matricesIndicesData = this.mesh.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind);
        let matricesWeightsData = this.mesh.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind);
        let skeletonMatrices = this.mesh.skeleton.getTransformMatrices();

        
        particle.setEnabled(false);
        

        let meshes = [];
        let controlPointPositions = []; // Array for transformed positions
        let controlPointNormals = []; // Array for transformed normals
        let scalpVertexIndices = []; // Array to store qualified vertex indices

    
        this.control_point_positions = controlPointPositions;
        this.control_point_normals = controlPointNormals;
        this.scalpVertexIndices = scalpVertexIndices; // Store qualified indices


        let j = 0;
        	
        for (let index = 0; index < positionsData.length; index += 3) {
            let point = getTransformedPointAtIndex(index, positionsData,matricesIndicesData, matricesWeightsData, skeletonMatrices)

            
            // Raycasting to check if there is a control mesh below
            if (this.controlMesh) {
                const ray = new BABYLON.Ray(point, new BABYLON.Vector3(0, 1, 0), 100); // Cast upward
                let rayHelper = new BABYLON.RayHelper(ray);		
		        	
                const pickInfo = this.controlMesh.intersects(ray, false); // Check for intersection
                if (!pickInfo.hit) {
                    meshes.push(particle.createInstance('particle' + j));
                    controlPointPositions.push(new BABYLON.Vector3()); // Initialize with empty vectors
                    controlPointNormals.push(new BABYLON.Vector3());
                    scalpVertexIndices.push(index); // Store the vertex index
                }
            }

            j++;
        }
       
       scene.onBeforeAnimationsObservable.add(() => {

            // http://jsfiddle.net/gwenaelhagenmuller/fwd5Y/
            // https://doc.babylonjs.com/divingDeeper/mesh/transforms/center_origin/ref_frame

            let j = 0;
            // debugger
            for (let index = 0; index < scalpVertexIndices.length; index++) {
                let scalpVertexIndex = scalpVertexIndices[index]
                 let point = getTransformedPointAtIndex(scalpVertexIndex, positionsData,matricesIndicesData, matricesWeightsData, skeletonMatrices)

                let particle = meshes[j];
               

                particle.position = point


                j++;
            }
        });
    }

    update(mesh) {}
}






// https://doc.babylonjs.com/typedoc/classes/babylon.scalar

let createScene = function () {

    let scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0, 0, 0);

    let light = new BABYLON.DirectionalLight("didr01", new BABYLON.Vector3(0, 0.5, -1.0), scene);
    let light2 = new BABYLON.DirectionalLight("dir01", new BABYLON.Vector3(0, 0.5, 1.0), scene);
    light.position = new BABYLON.Vector3(20, 150, 70);
    let sphere = new BABYLON.MeshBuilder.CreateIcoSphere("sphere", {subdivisions:3, radius: 6})
    // sphere.isVisible = false
    sphere.material = new BABYLON.StandardMaterial("mat")
    sphere.material.wireframe = true
    sphere.position = new BABYLON.Vector3(0.9348693490028381, 64.95291137695312, 2.8474318981170654);
    sphere.scaling = new BABYLON.Vector3(1.1616398096084595, 1.1351898908615112, 1.1751817464828491);
    sphere.bakeCurrentTransformIntoVertices()
    let camera = new BABYLON.ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2, 170, new BABYLON.Vector3(0, 80, 0), scene);
    camera.attachControl(canvas, true);
    let dude_skeleton_ref, dude
    let particle = BABYLON.MeshBuilder.CreateSphere("", {segments:2}, scene);
    
    scene.createDefaultLight();
    scene.createDefaultEnvironment();

    scene.getMeshByName("BackgroundPlane").isVisible = false
    scene.getMeshByName("BackgroundSkybox").scaling.setAll(4)

    // GUI
    var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
    
    var button1 = BABYLON.GUI.Button.CreateSimpleButton("but1", "Animate");
    button1.width = "150px"
    button1.height = "40px";
    button1.color = "white";
    button1.cornerRadius = 20;
    button1.background = "green";
    button1.onPointerUpObservable.add(function() {
        scene.beginAnimation(dude_skeleton_ref, 0, 100, true, 1);
        camera.alpha = Math.PI
        sphere.isVisible = false
    });
    advancedTexture.addControl(button1);    
    BABYLON.SceneLoader.ImportMesh("him", "https://playground.babylonjs.com/scenes/Dude/", "Dude.babylon", scene,
        (newMeshes, particleSystems, skeletons) => {
            let rains = [];
            for (let i = 1; i < 2; i++) {
                //  newMeshes[i].material = material;
                rains.push(new Rain(scene, particle, newMeshes[i],sphere));
            }
            dude_skeleton_ref = skeletons[0]
            dude = newMeshes[1]
            particle.parent = dude
        });

    return scene;

};