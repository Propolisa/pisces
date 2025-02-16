// Hair shader

import * as BABYLON_CORE from "@babylonjs/core";
import { WebGPUEngine } from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";

const BABYLON = { ...BABYLON_CORE, GUI };

export const createCharacterHairScene = async function (
    { engine, canvas, scene },
) {
    const DEBUG_MODE = false;
    const SEGMENT_LENGTH = 0.1;
    const SHADER_CODE = `
${WGSL_SHADERS.SIMPLEX_NOISE}

${WGSL_SHADERS.HERMITE}

// Sphere SDF function
fn sdfSphere(point: vec3<f32>, center: vec3<f32>, radius: f32) -> f32 {
    return length(point - center) - radius;
}

// Collision response
fn resolveCollision(point: vec3<f32>, center: vec3<f32>, radius: f32) -> vec3<f32> {
    let direction = normalize(point - center); // Direction from sphere center to point
    return center + direction * radius;       // Project point to the sphere surface
}

struct TendrilParams {
    tangentScale: f32,
    scaleFalloff: f32,
    curveSamples: u32,
    crossSectionPoints: u32, // Number of points in the cross-section profile
};

// Sphere parameters
const sphereCenter = vec3<f32>(0.0, 0.0, 0.0);
const sphereRadius: f32 = 0.6;

// Global simulation parameters
struct SimulationParams {
    segmentLength: f32,
    stiffness: f32,
    resistance: f32,
    deltaTime: f32,
    controlPointsPerStrand: u32,
    activeTendrilCount: u32,
    gravity: vec3f,
    octaves: i32,
    noiseStrength: f32,
    noiseOffset: f32,
    inverseDeltaTransform: mat4x4<f32>,
    finalBoneMatrix: mat4x4<f32>,
    inverseTransposeRotationBoneMatrix: mat4x4<f32>,
};

// Metadata for tendrils
struct TendrilData {
    rootNormal: vec3<f32>,
};


fn accumulateForces(
    currentPosition: vec3<f32>, 
    previousNeighborPosition: vec3<f32>, 
    nextNeighborPosition: vec3<f32>, 
    previousPosition: vec3<f32>, 
    velocity: vec3<f32>
) -> vec3<f32> {
    var totalForce = vec3<f32>(0.0);

    // Gravity
    totalForce += params.gravity;



    let periodicity =  vec3<f32>(100, 100, 100); // Periodicity every 10 units in each axis 
    let rotation = 2.0; // Rotation angle in radians7

    // Call psrdnoise3
    let noiseData: NG3 = psrdnoise3(currentPosition, periodicity, rotation);

    // Use noiseData.n (scalar noise value) and noiseData.g (gradient vector) as needed
    let noiseValue = noiseData.noise;
    let noiseGradient = normalize(noiseData.gradient) * params.noiseStrength;
    totalForce += noiseGradient;

    // // Wind force (dummy example)
    // let windDirection = vec3<f32>(-1.0, 0.2, -1.0); // Example wind direction
    // let windStrength = 1.; // Example strength
    // let windForce = windDirection * windStrength;
    // totalForce += windForce;


    // Strand direction (based on neighbors)
    let hairDirection = normalize((nextNeighborPosition - currentPosition) + (currentPosition - previousNeighborPosition));

    // Decompose velocity
    let velocityParallel = dot(velocity, hairDirection) * hairDirection;
    let velocityPerpendicular = velocity - velocityParallel;

    // Directional drag
    let parallelResistance = 120.1 * params.resistance;  // Low drag along the strand
    let perpendicularResistance = 200.0 * params.resistance; // High drag orthogonal to the strand
    let dragForce = -velocityParallel * parallelResistance - velocityPerpendicular * perpendicularResistance;

    // Add drag to total force
    totalForce += dragForce;

    return totalForce;
}

const DARK_SEA_GREEN = vec4f(0.29, 0.49, 0.54, 1.0);
const LIGHT_SEA_GREEN = vec4f(0.31, 0.68, 0.78, 1.0);



@group(0) @binding(0) var<storage, read_write> CURRENT_POSITIONS: array<f32>;
@group(0) @binding(1) var<storage, read_write> PREVIOUS_POSITIONS: array<f32>;
@group(0) @binding(2) var<uniform> params: SimulationParams;
@group(0) @binding(3) var<storage, read> tendrilMeta: array<f32>;
@group(0) @binding(4) var<storage, read_write> GEOM_VERTS: array<f32>; // Output vertex positions
@group(0) @binding(5) var<storage, read_write> GEOM_INDICES: array<u32>; // Output mesh indices
@group(0) @binding(6) var<uniform> meshing_params: TendrilParams;
@group(0) @binding(7) var<storage, read_write> GEOM_COLORS: array<f32>; // 4 floats per vertex (RGBA)
@group(0) @binding(8) var<storage, read_write> UPDATED_ROOT_POSITIONS: array<f32>; // updated root control point positions in target mesh
@group(0) @binding(9) var<storage, read_write> UPDATED_ROOT_NORMALS: array<f32>; // updated root control point positions in target mesh

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    
    
    let _usage1 = GEOM_VERTS[0];
    let _usage2 = GEOM_INDICES[1];
    let _usage3 = meshing_params.tangentScale;
    let _usage4 = UPDATED_ROOT_POSITIONS[0];
    let _usage5 = UPDATED_ROOT_NORMALS[0];
    let tendrilIndex = global_id.x;

    // if (tendrilIndex >= params.activeTendrilCount) {
    //     return;
    // }

    let tendril_data_start_idx = tendrilIndex * params.controlPointsPerStrand * 3u;

    
    CURRENT_POSITIONS[tendril_data_start_idx] = UPDATED_ROOT_POSITIONS[(tendrilIndex * 3) + 0];
    CURRENT_POSITIONS[tendril_data_start_idx + 1] = UPDATED_ROOT_POSITIONS[(tendrilIndex * 3) + 1];
    CURRENT_POSITIONS[tendril_data_start_idx + 2] = UPDATED_ROOT_POSITIONS[(tendrilIndex * 3) + 2];

    PREVIOUS_POSITIONS[tendril_data_start_idx] = UPDATED_ROOT_POSITIONS[(tendrilIndex * 3) + 0];
    PREVIOUS_POSITIONS[tendril_data_start_idx + 1] = UPDATED_ROOT_POSITIONS[(tendrilIndex * 3) + 1];
    PREVIOUS_POSITIONS[tendril_data_start_idx + 2] = UPDATED_ROOT_POSITIONS[(tendrilIndex * 3) + 2];


    // Load the entire tendril into a local variable
    var tendrilCurrentPositions: array<vec3<f32>, 64>; // Adjust size to max control points
    var tendrilPreviousPositions: array<vec3<f32>, 64>; // Same as above

    for (var idx: u32 = 0; idx < params.controlPointsPerStrand; idx++) {
        let baseIdx = tendril_data_start_idx + (idx * 3u);
        tendrilCurrentPositions[idx] = vec3<f32>(
            CURRENT_POSITIONS[baseIdx + 0],
            CURRENT_POSITIONS[baseIdx + 1],
            CURRENT_POSITIONS[baseIdx + 2]
        );
        tendrilPreviousPositions[idx] = vec3<f32>(
            PREVIOUS_POSITIONS[baseIdx + 0],
            PREVIOUS_POSITIONS[baseIdx + 1],
            PREVIOUS_POSITIONS[baseIdx + 2]
        );
    }

    let _usage = tendrilMeta[0];
    // Compute the new root normal based on the updated root position and the first segment
    var ROOT_POSITION = tendrilCurrentPositions[0];

    let rootNormal =  vec3f(UPDATED_ROOT_NORMALS[(tendrilIndex * 3) + 0],
     UPDATED_ROOT_NORMALS[(tendrilIndex * 3) + 1],
     UPDATED_ROOT_NORMALS[(tendrilIndex * 3) + 2]);

    for (var idx: u32 = 1; idx < params.controlPointsPerStrand; idx++) {

        var currentPosition = (vec4<f32>(
            tendrilCurrentPositions[idx],
            1.
        ) * params.inverseDeltaTransform).xyz;


        var previousPositionVec = (vec4<f32>(
            tendrilPreviousPositions[idx],
            1.
        ) * params.inverseDeltaTransform).xyz;
        tendrilPreviousPositions[idx] = previousPositionVec;

        let previousPosition = vec3<f32>(
            tendrilPreviousPositions[idx]
        );

        // Fetch neighbors
        var previousNeighborPosition = vec3<f32>(0.0);
        var nextNeighborPosition = vec3<f32>(0.0);

        if (idx > 0) {
            // Previous neighbor exists
            let prevIdx = idx - 1;
            previousNeighborPosition = (vec4<f32>(
            tendrilCurrentPositions[prevIdx], 1.
        ) * params.inverseDeltaTransform).xyz;
        } else {
            // For root, use current position (no prior neighbor)
            previousNeighborPosition = currentPosition;
        }

        if (idx < params.controlPointsPerStrand - 1) {
            // Next neighbor exists
            let nextIdx = idx + 1;
            nextNeighborPosition = (vec4<f32>(
            tendrilCurrentPositions[nextIdx], 1.
        ) * params.inverseDeltaTransform).xyz;
        } else {
            // For tip, use current position (no next neighbor)
            nextNeighborPosition = currentPosition;
        }

        // Compute velocity
        let velocity = currentPosition - previousPosition;

        // Accumulate forces
        let totalForce = accumulateForces(
            currentPosition, 
            previousNeighborPosition, 
            nextNeighborPosition, 
            previousPosition, 
            velocity
        );

        // Verlet integration
        var newPosition = currentPosition + velocity + totalForce * params.deltaTime * params.deltaTime;


        // Update positions
        tendrilPreviousPositions[idx] = currentPosition;
        tendrilCurrentPositions[idx] = newPosition;
    }

    // Bone matrix application to root vertex
    var currentPosition = tendrilCurrentPositions[0];

    // Constraint resolution
    for (var iteration: u32 = 0; iteration < 50; iteration++) {
        for (var idx: u32 = 1; idx < params.controlPointsPerStrand; idx++) {

            let currentPosition = tendrilCurrentPositions[idx];
            let previousPosition = tendrilCurrentPositions[idx - 1u];

            // // Sphere collision constraint
            // let distanceToSphere = sdfSphere(currentPosition, sphereCenter, sphereRadius);
            // if (distanceToSphere < 0.0) {
            //     let correctedPosition = resolveCollision(currentPosition, sphereCenter, sphereRadius);
            //     tendrilCurrentPositions[idx] = correctedPosition;
            // }

            // Distance constraint
            let direction = currentPosition - previousPosition;
            let distance = length(direction);
            let distanceError = distance - params.segmentLength;

            if (distance > 0.0) {
                let correction = (distanceError / distance) * 0.5;
                let correctionVector = direction * correction;

                if (idx != 1) {
                    tendrilCurrentPositions[idx - 1u] += correctionVector;
                }
                tendrilCurrentPositions[idx] -= correctionVector;
            }
        }
    }

    // Apply stiffness at the end
        // After physics integration, apply stiffness
    for (var idx: u32 = 1; idx < params.controlPointsPerStrand; idx++) {
    let rootPosition = tendrilCurrentPositions[0u];
    
    // Calculate the "natural" position based on segment length
    let direction = rootNormal; // Natural direction
    let naturalPosition = rootPosition + direction * (params.segmentLength * f32(idx));
    
    // Easing function to adjust stiffness influence
    let distanceFactor = f32(idx) / f32(params.controlPointsPerStrand);

    let baseStiffnessInfluence = params.stiffness * easeOutCubic(1.0 - distanceFactor);

    // Additive "scalp stiffness" for the first few vertices
    // var scalpStiffnessFactor: f32 = 0.0;
    // let scalpStiffnessFalloff = 4u;
    // if (idx < scalpStiffnessFalloff) {
    //         let t = f32(idx) / f32(scalpStiffnessFalloff); // Normalize idx to range [0, 1] over the first 3 vertices
    //             scalpStiffnessFactor = pow(1.0 - t, 4.0); // Linearly decreases from 1.0 (100%) to 0.0
    //     }

    // Combine the stiffness influences
    // let totalStiffnessInfluence = baseStiffnessInfluence + scalpStiffnessFactor;

    let correction = mix(vec3f(0,0,0), naturalPosition, baseStiffnessInfluence);
    // Blend the computed position with the natural position
    tendrilCurrentPositions[idx] +=  correction;
    tendrilPreviousPositions[idx] +=  correction;
    }



      for (var idx: u32 = 1; idx < params.controlPointsPerStrand; idx++) {
        let baseIdx = tendril_data_start_idx + idx * 3u;
        CURRENT_POSITIONS[baseIdx] = tendrilCurrentPositions[idx].x;
        CURRENT_POSITIONS[baseIdx + 1] = tendrilCurrentPositions[idx].y;
        CURRENT_POSITIONS[baseIdx + 2] = tendrilCurrentPositions[idx].z;
        PREVIOUS_POSITIONS[baseIdx] =     tendrilPreviousPositions[idx].x;
        PREVIOUS_POSITIONS[baseIdx + 1] = tendrilPreviousPositions[idx].y;
        PREVIOUS_POSITIONS[baseIdx + 2] = tendrilPreviousPositions[idx].z;
    }
    

    // Calculate global geometry base indices for the current strand
    // Calculate global geometry base indices for the current strand
let strandVertexBaseIndex = tendrilIndex
    * (params.controlPointsPerStrand - 1u)
    * meshing_params.curveSamples
    * meshing_params.crossSectionPoints
    * 3u;

 let strandIndexBaseIndex = tendrilIndex
     * (params.controlPointsPerStrand - 1u)
     * meshing_params.curveSamples
     * meshing_params.crossSectionPoints
     * 6u;

// Compute tangents (finite differences)
var tangents: array<vec3<f32>, 64>; // Adjust size to max control points
for (var i: u32 = 0u; i < params.controlPointsPerStrand; i = i + 1u) {
    if (i < params.controlPointsPerStrand - 1u) {
        tangents[i] = normalize(tendrilCurrentPositions[i + 1u] - tendrilCurrentPositions[i]);
    } else if (i > 0u) {
        tangents[i] = normalize(tendrilCurrentPositions[i] - tendrilCurrentPositions[i - 1u]);
    } else {
        tangents[i] = vec3<f32>(0.0, 1.0, 0.0); // Default for single point
    }
}

// Generate interpolated curve points using Hermite spline
var curvePoints: array<vec3<f32>, 1024>; // Adjust size as needed
var curveTangents: array<vec3<f32>, 1024>; // Store tangents for parallel transport
var curvePointCount: u32 = 0u;

for (var i: u32 = 0u; i < params.controlPointsPerStrand - 1u; i = i + 1u) {
    let p0 = tendrilCurrentPositions[i];
    let p1 = tendrilCurrentPositions[i + 1u];
    let t0 = tangents[i];
    let t1 = tangents[i + 1u];

    for (var t: f32 = 0.0; t < 1.0; t = t + (1.0 / f32(meshing_params.curveSamples))) {
        curvePoints[curvePointCount] = hermite(p0, p1, t0, t1, t, meshing_params.tangentScale);
        curveTangents[curvePointCount] = normalize(hermiteTangent(p0, p1, t0, t1, t, meshing_params.tangentScale));
        curvePointCount = curvePointCount + 1u;
    }
}

// Initialize the first frame
var normal = rootNormal; // Initial guess for normal
if (abs(dot(normal, curveTangents[0])) > 0.9) {
    normal = vec3<f32>(1.0, 0.0, 0.0); // Adjust if nearly aligned with tangent
}
var binormal = cross(curveTangents[0], normal);
normal = cross(binormal, curveTangents[0]);

// Transform cross-sections and generate mesh
for (var i: u32 = 0u; i < curvePointCount; i = i + 1u) {
    let point = curvePoints[i];
    let tangent = curveTangents[i];

    let color = mix(LIGHT_SEA_GREEN, DARK_SEA_GREEN, smoothstep(0., f32(curvePointCount), f32(i))); //  gradient
    // Parallel transport to update normal and binormal
    if (i > 0u) {
        let prevTangent = curveTangents[i - 1u];
        var rotationAxis = cross(prevTangent, tangent);
        let rotationAngle = acos(clamp(dot(prevTangent, tangent), -1.0, 1.0)); // Avoid numerical issues
        if (length(rotationAxis) > 1e-5) {
            rotationAxis = normalize(rotationAxis);
            let cosAngle = cos(rotationAngle);
            let sinAngle = sin(rotationAngle);

            // Rodrigues' rotation formula for parallel transport
            normal = normal * cosAngle + cross(rotationAxis, normal) * sinAngle +
                rotationAxis * dot(rotationAxis, normal) * (1.0 - cosAngle);
            binormal = binormal * cosAngle + cross(rotationAxis, binormal) * sinAngle +
                rotationAxis * dot(rotationAxis, binormal) * (1.0 - cosAngle);
        }
    }

    // Compute scale
    let scale = ((1.0 - f32(i) / f32(curvePointCount - 1u)) * meshing_params.scaleFalloff) / 5;

    // Generate cross-section points
    for (var j: u32 = 0u; j < meshing_params.crossSectionPoints; j = j + 1u) {
        
        let angle = 2.0 * 3.14 * f32(j) / f32(meshing_params.crossSectionPoints);
        let localPosition = vec3<f32>(cos(angle), sin(angle), 0.0) * scale; // Circle in tangent space

        // Transform from tangent space to world space
        let globalPosition = 
            tangent * localPosition.z +
            binormal * localPosition.x +
            normal * localPosition.y +
            point; // Offset by curve point position

        // Write to GEOM_VERTS
        let globalVertexIndex = strandVertexBaseIndex
            + (i * meshing_params.crossSectionPoints + j) * 3u;
        GEOM_VERTS[globalVertexIndex] = globalPosition.x;
        GEOM_VERTS[globalVertexIndex + 1] = globalPosition.y;
        GEOM_VERTS[globalVertexIndex + 2] = globalPosition.z;
        let colorIndex = strandVertexBaseIndex
            + (i * meshing_params.crossSectionPoints + j) * 4u; // 4 floats per color (RGBA)

        GEOM_COLORS[colorIndex + 0] = color.r;
        GEOM_COLORS[colorIndex + 1] = color.g;
        GEOM_COLORS[colorIndex + 2] = color.b;
        GEOM_COLORS[colorIndex + 3] = color.a; // Alpha (optional, set to 1.0)
        // Generate indices
        if (i > 0u) {
            // Generate indices, closing the loop for the cross-section
            let a = strandVertexBaseIndex + (i - 1u) * meshing_params.crossSectionPoints + j;
            let b = strandVertexBaseIndex + (i - 1u) * meshing_params.crossSectionPoints + ((j + 1u) % meshing_params.crossSectionPoints);
            let c = strandVertexBaseIndex + i * meshing_params.crossSectionPoints + j;
            let d = strandVertexBaseIndex + i * meshing_params.crossSectionPoints + ((j + 1u) % meshing_params.crossSectionPoints);

            let globalIndexOffset = strandIndexBaseIndex
                + (i - 1u) * meshing_params.crossSectionPoints * 6u
                + j * 6u;

            GEOM_INDICES[globalIndexOffset + 0] = a;
            GEOM_INDICES[globalIndexOffset + 1] = b;
            GEOM_INDICES[globalIndexOffset + 2] = c;
            GEOM_INDICES[globalIndexOffset + 3] = b;
            GEOM_INDICES[globalIndexOffset + 4] = d;
            GEOM_INDICES[globalIndexOffset + 5] = c;
        }

    }
}


}

fn alignToRootNormal(
    currentPosition: vec3<f32>, 
    rootNormal: vec3<f32>, 
    rootToPrev: vec3<f32>, 
    segmentLength: f32, 
    stiffness: f32
) -> vec3<f32> {
    // Project the current position onto the root-normal axis
    let projection = dot(currentPosition, rootNormal) * rootNormal;
    let targetPosition = projection + rootToPrev; // Maintain relative segment offset
    // Interpolate between the current position and the target position
    let correctedPosition = mix(currentPosition, targetPosition, stiffness);

    // Normalize the segment length
    let correctedDirection = normalize(correctedPosition - rootToPrev);
    return rootToPrev + correctedDirection * segmentLength;
}


fn falloffCurve(t: f32) -> f32 {
    // Use a smoothstep-based falloff for now
    return smoothstep(0.0, 1.0, 1.0 - t);
}

fn easeOutCubic(t: f32) -> f32 {
    return 1.0 - pow(1.0 - t, 3.0);
}


`;

    window.addEventListener("keydown", (ev) => {
        //Shift+Ctrl+Alt+I
        if (ev.shiftKey && ev.ctrlKey && ev.altKey && ev.keyCode === 73) {
            if (scene.debugLayer.isVisible()) {
                scene.debugLayer.hide();
            } else {
                scene.debugLayer.show();
            }
        }
    });

    scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "/textures/environment.dds",
        scene,
    );
    // ---- GUI ----
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture
        .CreateFullscreenUI("UI");

    const guiPanel = new BABYLON.GUI.StackPanel();
    guiPanel.width = "220px";
    guiPanel.horizontalAlignment =
        BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    guiPanel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    advancedTexture.addControl(guiPanel);

    const createSlider = (label, min, max, value, step, callback) => {
        const text = new BABYLON.GUI.TextBlock();
        text.text = `${label}: ${value}`;
        text.height = "30px";
        text.color = "white";
        text.textHorizontalAlignment =
            BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        guiPanel.addControl(text);

        const slider = new BABYLON.GUI.Slider();
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        slider.step = step;
        slider.height = "20px";
        slider.width = "200px";
        slider.onValueChangedObservable.add((v) => {
            text.text = `${label}: ${v.toFixed(2)}`;
            callback(v);
        });
        guiPanel.addControl(slider);
    };

    var camera = new BABYLON.ArcRotateCamera(
        "camera1",
        0,
        Math.PI / 2,
        5,
        BABYLON.Vector3.Zero(),
        scene,
    );
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 20;
    camera.radius = 15;
    camera.attachControl(canvas, true);
    camera.alpha = Math.PI / 2;

    // Light setup
    const light = new BABYLON.HemisphericLight(
        "light",
        new BABYLON.Vector3(1, 1, 0),
        scene,
    );

    // Example usage in the scene setup
    //
    // Create pointerDragBehavior in the desired mode
    //var pointerDragBehavior = new BABYLON.PointerDragBehavior({});
    //var pointerDragBehavior = new BABYLON.PointerDragBehavior({dragPlaneNormal: new BABYLON.Vector3(0,1,0)});
    var pointerDragBehavior = new BABYLON.PointerDragBehavior();

    // Use drag plane in world space
    pointerDragBehavior.useObjectOrientationForDragging = false;

    // const mesh = BABYLON.MeshBuilder.CreateIcoSphere("mesh", {
    //     radius: .59,
    //     subdivisions: 8,
    // });

    const character_data = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "https://playground.babylonjs.com/scenes/Alien/",
        "Alien.gltf",
        scene,
    ).then(function ({ meshes, animationGroups }) {
        // debugger
        // meshes[0].scaling = new BABYLON.Vector3(0.1, 0.1, 0.1);
        // meshes[1].bakeCurrentTransformIntoVertices();
        return { meshes, animationGroups };
    });
    character_data.meshes[0].dispose(true);
    const character = character_data.meshes[1];

    const mesh = character;

    scene.createDefaultSkybox(scene.environmentTexture);

    var pbr = new BABYLON.StandardMaterial("pbr", scene);
    mesh.material = pbr.clone("pbrclone");
    mesh.material.wireframe = true;

    mesh.addBehavior(pointerDragBehavior);
    // mesh.position.z = 5
    // mesh.position.y = -1.5;

    //  mesh.parent = camera
    // mesh.material = new BABYLON.StandardMaterial()
    mesh.receiveShadows = true;

    if (!checkComputeShadersSupported(engine, scene)) {
        return scene;
    }

    const controlPointsPerStrand = 8; // Number of control points per tendril
    const yThreshold = -4; // Minimum y-value for spawning tendrils
    // mesh.material.wireframe = true
    const tendrilData = generateTendrilsFromMesh(
        mesh,
        yThreshold,
        SEGMENT_LENGTH,
        controlPointsPerStrand,
        100,
    );
    const numTendrils = tendrilData.activeTendrilCount;

    let defaultTendrilParams = {
        tangentScale: 0.001,
        scaleFalloff: 0.1,
        curveSamples: 1,
        crossSectionPoints: 4,
    };
    const bufferSizes = calculateBufferSizes(
        controlPointsPerStrand,
        numTendrils,
        defaultTendrilParams,
    );

    // Update buffers and simulation parameters
    const geom_verts_storage = new BABYLON.StorageBuffer(
        engine,
        bufferSizes.vertexBufferSize,
        BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
            BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
            BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
    );

    const geom_indices_storage = new BABYLON.StorageBuffer(
        engine,
        bufferSizes.indexBufferSize,
        BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
            BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
            BABYLON.Constants.BUFFER_CREATIONFLAG_INDEX,
    );

    const geom_mesh = new BABYLON.Mesh("geom", scene);
    geom_mesh.material = pbr;
    geom_mesh.material.backFaceCulling = false;

    geom_mesh.alwaysSelectAsActiveMesh = true;
    geom_mesh.parent = mesh;

    const geom_buffer = new BABYLON.VertexBuffer(
        engine,
        geom_verts_storage.getBuffer(),
        BABYLON.VertexBuffer.PositionKind,
        true,
        false,
        3,
    );
    geom_mesh.setVerticesBuffer(geom_buffer, false);
    geom_mesh.setIndexBuffer(
        geom_indices_storage.getBuffer(),
        bufferSizes.totalPoints,
        bufferSizes.totalIndices,
    );
    const colorStorageBuffer = new BABYLON.StorageBuffer(
        engine,
        bufferSizes.totalPoints * 4 * 4, // 4 floats (RGBA) for every 3 floats (position)
        BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
            BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
    );
    geom_mesh.setVerticesBuffer(
        new BABYLON.VertexBuffer(
            engine,
            colorStorageBuffer.getBuffer(),
            BABYLON.VertexBuffer.ColorKind,
            true,
            false,
            4, // 4 floats for color (RGBA)
        ),
    );

    const tendrilParamsBuffer = new BABYLON.UniformBuffer(
        engine,
        undefined,
        undefined,
        "params",
    );

    // GUI sliders
    createSlider(
        "Radius falloff",
        0.0,
        5.0,
        defaultTendrilParams.scaleFalloff,
        0.01,
        (value) => {
            defaultTendrilParams.scaleFalloff = value;
            tendrilParamsBuffer.updateFloat("scaleFalloff", value);
        },
    );

    tendrilParamsBuffer.addUniform("tangentScale", 1);
    tendrilParamsBuffer.addUniform("scaleFalloff", 1);
    tendrilParamsBuffer.addUniform("curveSamples", 1);
    tendrilParamsBuffer.addUniform("crossSectionPoints", 1);
    tendrilParamsBuffer.updateFloat(
        "tangentScale",
        defaultTendrilParams.tangentScale,
    );
    tendrilParamsBuffer.updateFloat(
        "scaleFalloff",
        defaultTendrilParams.scaleFalloff,
    );
    tendrilParamsBuffer.updateInt(
        "curveSamples",
        defaultTendrilParams.curveSamples,
    );
    tendrilParamsBuffer.updateInt(
        "crossSectionPoints",
        defaultTendrilParams.crossSectionPoints,
    );
    tendrilParamsBuffer.update();

    console.log("Vertex Buffer Size (bytes):", bufferSizes.vertexBufferSize);
    console.log("Index Buffer Size (bytes):", bufferSizes.indexBufferSize);
    console.log("Total Points:", bufferSizes.totalPoints);
    console.log("Total Indices:", bufferSizes.totalIndices);

    //  setup gravity
    let gravityVector = new BABYLON.Vector3(0, -9.8, 0);
    const arrowLine = createArrow(
        new BABYLON.Vector3(0, 0, 0),
        gravityVector,
        scene,
    );
    arrowLine.scaling.setAll(.1);
    arrowLine.position.z = 0;
    arrowLine.position.x = 0;
    arrowLine.position.y = 1.5;
    arrowLine.rotationQuaternion = new BABYLON.Quaternion(
        0.06353524662257824,
        0.8929985810346042,
        0.3318013821574886,
        0.2973628246858906,
    );

    // Create utility layer the gizmo will be rendered on
    var utilLayer = new BABYLON.UtilityLayerRenderer(scene);

    // Create the gizmo and attach to the box
    var gizmo = new BABYLON.RotationGizmo(utilLayer);
    gizmo.attachedMesh = arrowLine;

    // Keep the gizmo fixed to world rotation
    gizmo.updateGizmoRotationToMatchAttachedMesh = false;
    gizmo.updateGizmoPositionToMatchAttachedMesh = true;

    // Workgroup size (matches @workgroup_size in WGSL)
    const workgroupSizeX = 256;

    // Calculate number of workgroups
    const numWorkgroupsX = Math.ceil(numTendrils / workgroupSizeX);

    // Update buffers and simulation parameters
    const positionsBuffer = new BABYLON.StorageBuffer(
        engine,
        tendrilData.tendrilPositions.byteLength,
        BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
            BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
            BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
    );
    positionsBuffer.update(tendrilData.tendrilPositions);

    const previousPositionsBuffer = new BABYLON.StorageBuffer(
        engine,
        tendrilData.tendrilPreviousPositions.byteLength,
    );
    previousPositionsBuffer.update(tendrilData.tendrilPreviousPositions);

    const metaBuffer = new BABYLON.StorageBuffer(
        engine,
        tendrilData.tendrilMeta.byteLength,
    );
    metaBuffer.update(tendrilData.tendrilMeta);

    const paramsBuffer = new BABYLON.UniformBuffer(
        engine,
        undefined,
        undefined,
        "params",
    );

    let simulationParams = {
        segmentLength: .2 / controlPointsPerStrand,
        stiffness: 0.04,
        resistance: 1.53,
        deltaTime: 0.016,
        controlPointsPerStrand,
        activeTendrilCount: 1, // Single tendri
        noiseStrength: 5,
        noiseOffset: 0,
        gravity: gravityVector,
        octaves: 1,
    };

    simulationParams.activeTendrilCount = tendrilData.activeTendrilCount;
    let previousOriginMatrix = BABYLON.Matrix.Identity(); // Initialize to identity matrix
    let previousBoneMatrix = BABYLON.Matrix.Identity(); // Initialize to identity matri
    let inverseDeltaTransform = BABYLON.Matrix.Identity();
    paramsBuffer.addUniform("segmentLength", 1);
    paramsBuffer.addUniform("stiffness", 1);
    paramsBuffer.addUniform("resistance", 1);
    paramsBuffer.addUniform("deltaTime", 1);
    paramsBuffer.addUniform("controlPointsPerStrand", 1);
    paramsBuffer.addUniform("activeTendrilCount", 1);
    paramsBuffer.addUniform("gravity", 3);
    paramsBuffer.addUniform("octaves", 1);
    paramsBuffer.addUniform("noiseStrength", 1);
    paramsBuffer.addUniform("noiseOffset", 1);
    paramsBuffer.addUniform("inverseDeltaTransform", 16);
    paramsBuffer.addUniform("finalBoneMatrix", 16);
    paramsBuffer.addUniform("inverseTransposeRotationBoneMatrix", 16);
    paramsBuffer.updateFloat("segmentLength", simulationParams.segmentLength);
    paramsBuffer.updateFloat("stiffness", simulationParams.stiffness);
    paramsBuffer.updateFloat("resistance", simulationParams.resistance);
    paramsBuffer.updateFloat("deltaTime", simulationParams.deltaTime);
    paramsBuffer.updateInt(
        "controlPointsPerStrand",
        simulationParams.controlPointsPerStrand,
    );
    paramsBuffer.updateInt(
        "activeTendrilCount",
        simulationParams.activeTendrilCount,
    );
    paramsBuffer.updateVector3("gravity", gravityVector);
    paramsBuffer.updateFloat("noiseStrength", simulationParams.noiseStrength);
    paramsBuffer.updateFloat("noiseOffset", simulationParams.noiseOffset);
    paramsBuffer.updateInt("octaves", simulationParams.controlPointsPerStrand);
    paramsBuffer.updateMatrix("inverseDeltaTransform", inverseDeltaTransform);
    paramsBuffer.updateMatrix("finalBoneMatrix", previousOriginMatrix);
    paramsBuffer.update();

    // ---- Compute Shader Setup ----
    const computeShader = new BABYLON.ComputeShader("tendrilCompute", engine, {
        computeSource: SHADER_CODE,
    }, {
        bindingsMapping: {
            "CURRENT_POSITIONS": { group: 0, binding: 0 },
            "PREVIOUS_POSITIONS": { group: 0, binding: 1 },
            "params": { group: 0, binding: 2 },
            "tendrilMeta": { group: 0, binding: 3 },
            GEOM_VERTS: { group: 0, binding: 4 },
            GEOM_INDICES: { group: 0, binding: 5 },
            meshing_params: { group: 0, binding: 6 },
            GEOM_COLORS: { group: 0, binding: 7 },
            UPDATED_ROOT_POSITIONS: { group: 0, binding: 8 },
            UPDATED_ROOT_NORMALS: { group: 0, binding: 9 },
        },
    });

    // GUI sliders
    createSlider(
        "Stiffness",
        0.0,
        0.2,
        simulationParams.stiffness,
        0.0001,
        (value) => {
            simulationParams.stiffness = value;
            paramsBuffer.updateFloat("stiffness", value);
        },
    );

    createSlider(
        "Resistance",
        0.0,
        5.0,
        simulationParams.resistance,
        0.01,
        (value) => {
            simulationParams.resistance = value;
            paramsBuffer.updateFloat("resistance", value);
        },
    );

    createSlider(
        "Delta Time",
        0.001,
        0.1,
        simulationParams.deltaTime,
        0.001,
        (value) => {
            simulationParams.deltaTime = value;
            paramsBuffer.updateFloat("deltaTime", value);
        },
    );

    let gravityStrengthMultiplier = 9.8;
    createSlider("Gravity strength", 0, 20, 9.8, 0.001, (value) => {
        gravityStrengthMultiplier = value;
    });

    createSlider(
        "Noise strength",
        0,
        10,
        simulationParams.noiseStrength,
        0.001,
        (value) => {
            simulationParams.noiseOffset = value;
            paramsBuffer.updateFloat("noiseStrength", value);
        },
    );

    createSlider(
        "Noise offset",
        0.001,
        5,
        simulationParams.deltaTime,
        0.001,
        (value) => {
            simulationParams.noiseOffset = value;
            paramsBuffer.updateFloat("noiseOffset", value);
        },
    );

    createSlider(
        "Segment length",
        0.0,
        1,
        simulationParams.segmentLength,
        0.001,
        (value) => {
            simulationParams.segmentLength = value;
            paramsBuffer.updateFloat("segmentLength", value);
        },
    );
    // uniformBuffer.updateFloatArray("simulationParams", uniformData);

    computeShader.setStorageBuffer("CURRENT_POSITIONS", positionsBuffer);
    computeShader.setStorageBuffer(
        "PREVIOUS_POSITIONS",
        previousPositionsBuffer,
    );
    computeShader.setUniformBuffer("params", paramsBuffer);
    computeShader.setStorageBuffer("tendrilMeta", metaBuffer);
    computeShader.setStorageBuffer("GEOM_VERTS", geom_verts_storage);
    computeShader.setStorageBuffer("GEOM_INDICES", geom_indices_storage);
    computeShader.setUniformBuffer("meshing_params", tendrilParamsBuffer);
    computeShader.setStorageBuffer("GEOM_COLORS", colorStorageBuffer);

    // ---- Verlet Integration and Constraints Function ----
    function updatePositions(
        simulationParams,
        positions,
        previousPositions,
        controlPointsPerStrand,
    ) {
        const SEGMENT_LENGTH = 5;
        const GRAVITY = new BABYLON.Vector3(0.0, -1.8, 0);

        // Verlet Integration
        for (let i = 1; i < controlPointsPerStrand; i++) { // Skip the root point
            const idx = i * 3;

            const currentPosition = new BABYLON.Vector3(
                positions[idx],
                positions[idx + 1],
                positions[idx + 2],
            );

            const previousPosition = new BABYLON.Vector3(
                previousPositions[idx],
                previousPositions[idx + 1],
                previousPositions[idx + 2],
            );

            const newPosition = currentPosition
                .add(currentPosition.subtract(previousPosition))
                .add(GRAVITY.scale(simulationParams.deltaTime ** 2));

            // Update previousPositions (store previous position)
            previousPositions[idx] = currentPosition.x;
            previousPositions[idx + 1] = currentPosition.y;
            previousPositions[idx + 2] = currentPosition.z;

            // Update positions
            positions[idx] = newPosition.x;
            positions[idx + 1] = newPosition.y;
            positions[idx + 2] = newPosition.z;
        }

        // Enforce Constraints
        for (let iteration = 0; iteration < 5; iteration++) {
            for (let i = 1; i < controlPointsPerStrand; i++) {
                const idx = i * 3;
                const prevIdx = (i - 1) * 3;

                const currentPosition = new BABYLON.Vector3(
                    positions[idx],
                    positions[idx + 1],
                    positions[idx + 2],
                );

                const previousPosition = new BABYLON.Vector3(
                    positions[prevIdx],
                    positions[prevIdx + 1],
                    positions[prevIdx + 2],
                );

                const direction = currentPosition.subtract(previousPosition);
                const distance = direction.length();
                const distanceError = distance - SEGMENT_LENGTH;

                if (distance > 0.0) {
                    const correction = direction.scale(
                        distanceError / distance * 0.5,
                    );

                    // Apply corrections
                    if (i !== 1) { // Don't move the root's neighbor entirely
                        positions[prevIdx] += correction.x;
                        positions[prevIdx + 1] += correction.y;
                        positions[prevIdx + 2] += correction.z;
                    }

                    positions[idx] -= correction.x;
                    positions[idx + 1] -= correction.y;
                    positions[idx + 2] -= correction.z;
                }
            }
        }
    }

    // // ---- Simulation Loop Changes ----
    // scene.onBeforeRenderObservable.add(() => {
    //     updatePositions(simulationParams, positions, previousPositions, controlPointsPerStrand);

    //     // Update line system with new positions
    //     const updatedLine = [];
    //     for (let i = 0; i < controlPointsPerStrand; i++) {
    //         const cpIndex = i * 3;
    //         updatedLine.push(new BABYLON.Vector3(
    //             positions[cpIndex + 0],
    //             positions[cpIndex + 1],
    //             positions[cpIndex + 2]
    //         ));
    //     }

    //     BABYLON.MeshBuilder.CreateLineSystem("lineSystemUpdate", {
    //         lines: [updatedLine],
    //         updatable: true,
    //         instance: lineSystem
    //     });
    // });

    // Visualization
    const tendrilLines = [];
    const tendrilColors = [];
    for (let i = 0; i < tendrilData.activeTendrilCount; i++) {
        const line = [];
        for (let j = 0; j < controlPointsPerStrand; j++) {
            const idx = i * controlPointsPerStrand * 3 + j * 3;
            line.push(
                new BABYLON.Vector3(
                    tendrilData.tendrilPositions[idx],
                    tendrilData.tendrilPositions[idx + 1],
                    tendrilData.tendrilPositions[idx + 2],
                ),
            );
        }
        tendrilLines.push(line);
        tendrilColors.push(
            line.map((e, i) =>
                new BABYLON.Color4(
                    0.1,
                    1 - i * (1 / controlPointsPerStrand),
                    i * (1 / controlPointsPerStrand),
                    1,
                )
            ),
        );
    }

    // Create a skeleton and add a bone
    const skeleton = new BABYLON.Skeleton("skeleton", "skeletonID", scene);
    const rootBone = new BABYLON.Bone("rootBone", skeleton);

    let lineSystem;

    if (DEBUG_MODE) {
        const lineSystem = BABYLON.MeshBuilder.CreateLineSystem("lineSystem", {
            lines: tendrilLines,
            colors: tendrilColors,
            updatable: true,
        }, scene);

        lineSystem.parent = mesh;
        lineSystem.attachToBone(rootBone);
        // Assign random weights to the mesh vertices
        const ls_vertexCount = lineSystem.getTotalVertices();
        const ls_weights = new Float32Array(ls_vertexCount);
        const ls_indices = new Uint32Array(ls_vertexCount);
        for (let i = 0; i < ls_vertexCount * 3; i++) {
            ls_weights[i] = 1; // Random weight for the bone
            ls_indices[i] = 0; // Single bone index
        }
        lineSystem.setVerticesData(
            BABYLON.VertexBuffer.MatricesWeightsKind,
            ls_weights,
            true,
        );
        lineSystem.setVerticesData(
            BABYLON.VertexBuffer.MatricesIndicesKind,
            ls_indices,
            true,
        );

        lineSystem.parent = mesh;
    }

    // Apply the skeleton to the main mesh
    // mesh.skeleton = skeleton;

    // Assign random weights to the mesh vertices
    // const vertexCount = mesh.getTotalVertices();
    // const weights = new Float32Array(vertexCount * 16);
    // const indices = new Uint32Array(vertexCount);

    // for (let i = 0; i < vertexCount; i++) {
    //     indices[i] = 0; // Single bone index
    // }

    // for (let i = 0; i < vertexCount * 16; i++) {
    //     weights[i] = 1; // Single bone index
    // }

    // mesh.setVerticesData(
    //     BABYLON.VertexBuffer.MatricesWeightsKind,
    //     weights,
    //     true,
    // );
    // mesh.setVerticesData(
    //     BABYLON.VertexBuffer.MatricesIndicesKind,
    //     indices,
    //     true,
    // );

    const bone_rotate_speed = 0.01;
    let bone_rotate_speed_multiplier = 1;
    // GUI sliders
    createSlider(
        "Bone speed",
        0.0,
        20.0,
        simulationParams.stiffness,
        0.01,
        (value) => {
            bone_rotate_speed_multiplier = value;
        },
    );

    let sphereSizeTarget = 1;

    // GUI sliders
    createSlider(
        "Sphere size multiplier",
        0.0,
        2.0,
        sphereSizeTarget,
        0.01,
        (value) => {
            sphereSizeTarget = value;
        },
    );

    // Animate the bone
    scene.onBeforeRenderObservable.add(() => {
        simulationParams.noiseOffset = simulationParams.noiseOffset + 0.01;
        paramsBuffer.updateFloat("noiseOffset", simulationParams.noiseOffset);
        mesh.scaling.setAll(
            BABYLON.Scalar.Lerp(mesh.scaling.x, sphereSizeTarget, .1),
        );
        rootBone.rotate(
            BABYLON.Axis.Y,
            bone_rotate_speed * bone_rotate_speed_multiplier,
            BABYLON.Space.LOCAL,
        ); // Rotate the bone around Y-axis

        // gravity
        const rotationMatrix = BABYLON.Matrix.RotationYawPitchRoll(
            arrowLine.rotation.y,
            arrowLine.rotation.x,
            arrowLine.rotation.z,
        );

        arrowLine.rotationQuaternion.toRotationMatrix(rotationMatrix);

        const newGravity = BABYLON.Vector3.Lerp(
            gravityVector,
            BABYLON.Vector3.TransformNormal(
                new BABYLON.Vector3(0, -gravityStrengthMultiplier, 0),
                rotationMatrix,
            ),
            .1,
        );

        gravityVector.copyFrom(newGravity);
        paramsBuffer.updateVector3("gravity", newGravity);
    });

    let pcr = new PointCloudMeshRenderer(character, scene);
    await pcr.initialize();
    const root_transforms_calculator = new MeshTransformsCalculator(
        engine,
        character,
        // selected_mesh_base_indices,
    );
    computeShader.setStorageBuffer(
        "UPDATED_ROOT_POSITIONS",
        root_transforms_calculator._transformedPositions,
    );
    computeShader.setStorageBuffer(
        "UPDATED_ROOT_NORMALS",
        root_transforms_calculator._transformedNormals,
    );

    // ---- Simulation Loop ----
    scene.onBeforeRenderObservable.add(() => {
        // Current transformation matrix of the parent mesh
        const currentOriginMatrix = mesh.getWorldMatrix().clone();

        // Calculate the delta transformation (current * inverse(previous))
        const inversePreviousOriginMatrix = BABYLON.Matrix.Invert(
            previousOriginMatrix,
        );
        const deltaTransform = currentOriginMatrix.multiply(
            inversePreviousOriginMatrix,
        );

        // Update the uniform buffer with the inverse delta transformation
        const inverseDeltaTransform = BABYLON.Matrix.Invert(deltaTransform)
            .transpose();
        paramsBuffer.updateMatrix(
            "inverseDeltaTransform",
            inverseDeltaTransform,
        );

        const currentFinalBoneMatrix = rootBone.getAbsoluteMatrix().clone();

        // Calculate the delta transformation (current * inverse(previous))
        const inversePreviousBoneMatrix = BABYLON.Matrix.Invert(
            previousBoneMatrix,
        );
        const deltaBoneTransform = currentFinalBoneMatrix.multiply(
            inversePreviousBoneMatrix,
        );

        // Extract the rotation part of the matrix for normal transformations
        const rMatrix = BABYLON.Matrix.FromValues(
            deltaBoneTransform.m[0],
            deltaBoneTransform.m[1],
            deltaBoneTransform.m[2],
            0,
            deltaBoneTransform.m[4],
            deltaBoneTransform.m[5],
            deltaBoneTransform.m[6],
            0,
            deltaBoneTransform.m[8],
            deltaBoneTransform.m[9],
            deltaBoneTransform.m[10],
            0,
            0,
            0,
            0,
            1,
        );

        // Calculate the inverse transpose of the rotation matrix
        const inverseTransposeRotationMatrix = BABYLON.Matrix.Invert(rMatrix)
            .transpose();

        // Update the uniform buffer with the matrix for transforming normals
        paramsBuffer.updateMatrix(
            "inverseTransposeRotationBoneMatrix",
            inverseTransposeRotationMatrix,
        );
        // Update the uniform buffer with the inverse delta transformation
        const inverseDeltaBoneTransform = BABYLON.Matrix.Invert(
            deltaBoneTransform,
        ).transpose();
        // console.log(currentFinalBoneMatrix.m)
        paramsBuffer.updateMatrix(
            "finalBoneMatrix",
            deltaBoneTransform.transpose(),
        );

        paramsBuffer.update();
        tendrilParamsBuffer.update();
        previousOriginMatrix = currentOriginMatrix.clone();
        previousBoneMatrix = currentFinalBoneMatrix.clone();

        if (DEBUG_MODE) {
            computeShader.dispatchWhenReady(numWorkgroupsX).then(() => { // Dispatch for 1 workgroup
                positionsBuffer.read().then((updatedPositions) => {
                    updatedPositions = new Float32Array(
                        updatedPositions.buffer,
                    );
                    // debugger
                    lineSystem.updateMeshPositions((positions) => {
                        for (
                            let i = 0;
                            i <
                                controlPointsPerStrand *
                                    simulationParams.activeTendrilCount;
                            i++
                        ) {
                            const cpIndex = i * 3;
                            positions[i * 3 + 0] =
                                updatedPositions[cpIndex + 0];
                            positions[i * 3 + 1] =
                                updatedPositions[cpIndex + 1];
                            positions[i * 3 + 2] =
                                updatedPositions[cpIndex + 2];
                        }
                    }, true);
                });
            });
        } else {
            root_transforms_calculator.update();
            root_transforms_calculator._transformedPositions.read().then(
                (updatedPositions) => {
                    updatedPositions = new Float32Array(
                        updatedPositions.buffer,
                    );
                    // debugger

                    pcr.render(updatedPositions);
                },
            );
            computeShader.dispatchWhenReady(numWorkgroupsX);
        }
    });

    const numOfLines = numTendrils * (controlPointsPerStrand - 1);
    const frequency = 25 / numOfLines;

    engine.runRenderLoop(async () => {
        scene.render();
    });

    return scene;
};

function createArrow(origin, endpoint, scene) {
    // Create an arrow mesh using GreasedLine
    const arrowOrigin = origin;
    const arrowEnd = endpoint;
    const arrowPoints = [arrowOrigin, arrowEnd];

    let width_mult = 1;

    const arrowLine = BABYLON.CreateGreasedLine(
        "arrowLine",
        {
            points: arrowPoints,
            widthDistribution: BABYLON.GreasedLineMeshWidthDistribution
                .WIDTH_DISTRIBUTION_START,
            widths: arrowPoints.map((e) => [.2 * width_mult, .2 * width_mult])
                .flat(),
        },
        {
            color: new BABYLON.Color3(0, 1, 0),
        },
        scene,
    );

    // Create the arrow cap
    const arrowCap = BABYLON.GreasedLineTools.GetArrowCap(
        arrowEnd,
        BABYLON.Vector3.Down(),
        .2 * width_mult * 4,
        .2 * width_mult * 4,
        .2 * width_mult * 4,
    );

    BABYLON.CreateGreasedLine(
        "arrowCap",
        {
            points: arrowCap.points,
            widths: arrowCap.widths,
            widthDistribution: BABYLON.GreasedLineMeshWidthDistribution
                .WIDTH_DISTRIBUTION_START,
            instance: arrowLine,
        },
        scene,
    );

    // Add interactivity: Rotate the arrow
    arrowLine.rotationQuaternion = new BABYLON.Quaternion();
    arrowLine.rotation.z = 0;

    return arrowLine;
}

const WGSL_SHADERS = {
    COMPUTE_TRANSFORMS: `
    #ifdef MORPHTARGETS
    fn readVector3FromRawSampler(targetIndex : i32, vertexIndex : u32) -> vec3f
    {			
        let vertexID = f32(vertexIndex) * settings.morphTargetTextureInfo.x;
        let y = floor(vertexID / settings.morphTargetTextureInfo.y);
        let x = vertexID - y * settings.morphTargetTextureInfo.y;
        let textureUV = vec2<i32>(i32(x), i32(y));
        return textureLoad(morphTargets, textureUV, i32(morphTargetTextureIndices[targetIndex]), 0).xyz;
    }
    #endif
    
    struct MorphTargetSettings {
        morphTargetTextureInfo: vec3f,
        morphTargetCount: i32,
    };
    
    struct Params {
        selectedVertexCount: u32
    };
    
    @group(0) @binding(0) var<storage, read> basePositions : array<f32>;
    @group(0) @binding(1) var<storage, read> baseNormals : array<f32>;
    @group(0) @binding(2) var<storage, read_write> transformedPositions : array<f32>;
    @group(0) @binding(3) var<storage, read_write> transformedNormals : array<f32>;
    @group(0) @binding(13) var<uniform> params : Params;
    
    #if NUM_BONE_INFLUENCERS > 0
      @group(0) @binding(5) var boneSampler : texture_2d<f32>;
      @group(0) @binding(6) var<storage, read> indexBuffer :  array<vec4f>;
      @group(0) @binding(7) var<storage, read> weightBuffer : array<vec4f>;
    
      #if NUM_BONE_INFLUENCERS > 4
        @group(0) @binding(8) var<storage, read> indexExtraBuffer : array<vec4f>;
        @group(0) @binding(9) var<storage, read> weightExtraBuffer : array<vec4f>;
      #endif
    #endif
    #ifdef MORPHTARGETS
    @group(0) @binding(4) var<uniform> settings : MorphTargetSettings;
    @group(0) @binding(10) var morphTargets : texture_2d_array<f32>;
    @group(0) @binding(11) var<storage, read> morphTargetInfluences : array<f32>;
    @group(0) @binding(12) var<storage, read> morphTargetTextureIndices : array<f32>;
    #endif
    
    #ifdef CUSTOMSELECTION
    @group(0) @binding(14) var<storage, read> custom_selection : array<u32>;
    #endif
    
    const identity = mat4x4f(
        vec4f(1.0, 0.0, 0.0, 0.0),
        vec4f(0.0, 1.0, 0.0, 0.0),
        vec4f(0.0, 0.0, 1.0, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0)
    );
    
    fn readMatrixFromRawSampler(smp : texture_2d<f32>, index : f32) -> mat4x4<f32> {
        let offset = i32(index)  * 4;    
    
        let m0 = textureLoad(smp, vec2<i32>(offset + 0, 0), 0);
        let m1 = textureLoad(smp, vec2<i32>(offset + 1, 0), 0);
        let m2 = textureLoad(smp, vec2<i32>(offset + 2, 0), 0);
        let m3 = textureLoad(smp, vec2<i32>(offset + 3, 0), 0);
    
        return mat4x4<f32>(m0, m1, m2, m3);
    }
    
    
    
    
    @compute @workgroup_size(256, 1, 1)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        var index = global_id.x;
    
        if (index >= params.selectedVertexCount) {
            return;
        }
    
        #ifdef CUSTOMSELECTION
        index = custom_selection[global_id.x];
        #endif
    
        
    
        let position = vec3f(basePositions[index * 3], basePositions[index * 3 + 1], basePositions[index * 3 + 2]);
        let baseNormal = vec3f(baseNormals[index * 3], baseNormals[index * 3 + 1], baseNormals[index * 3 + 2]);
    
        var finalWorld = identity;
        var positionUpdated = position;
        var normalUpdated = baseNormal;
    
    #if NUM_BONE_INFLUENCERS > 0
          var influence : mat4x4<f32>;
          let matricesIndices = indexBuffer[index];
          let matricesWeights = weightBuffer[index];
    
          influence = readMatrixFromRawSampler(boneSampler, matricesIndices[0]) * matricesWeights[0];
    
          #if NUM_BONE_INFLUENCERS > 
          
              influence = influence + readMatrixFromRawSampler(boneSampler, matricesIndices[1]) * matricesWeights[1];
          #endif	
          #if NUM_BONE_INFLUENCERS > 2
              influence = influence + readMatrixFromRawSampler(boneSampler, matricesIndices[2]) * matricesWeights[2];
          #endif	
          #if NUM_BONE_INFLUENCERS > 3
              influence = influence + readMatrixFromRawSampler(boneSampler, matricesIndices[3]) * matricesWeights[3];
          #endif	
    
          #if NUM_BONE_INFLUENCERS > 4
              let matricesIndicesExtra = indexExtraBuffer[index];
              let matricesWeightsExtra = weightExtraBuffer[index];
              influence = influence + readMatrixFromRawSampler(boneSampler, matricesIndicesExtra.x) * matricesWeightsExtra.x;
              #if NUM_BONE_INFLUENCERS > 5
                  influence = influence + readMatrixFromRawSampler(boneSampler, matricesIndicesExtra.y) * matricesWeightsExtra.y;
              #endif	
              #if NUM_BONE_INFLUENCERS > 6
                  influence = influence + readMatrixFromRawSampler(boneSampler, matricesIndicesExtra.z) * matricesWeightsExtra.z;
              #endif	
              #if NUM_BONE_INFLUENCERS > 7
                  influence = influence + readMatrixFromRawSampler(boneSampler, matricesIndicesExtra.w) * matricesWeightsExtra.w;
              #endif	
          #endif	
    
          finalWorld = finalWorld * influence;
    #endif
    
    #ifdef MORPHTARGETS
        for (var i = 0; i < NUM_MORPH_INFLUENCERS; i = i + 1) {
            if (i >= settings.morphTargetCount) {
                break;
            }
            positionUpdated = positionUpdated + (readVector3FromRawSampler(i, index) - position) * morphTargetInfluences[i];
        }
    #endif
    
        var worldPos = finalWorld * vec4f(positionUpdated.x, positionUpdated.y, positionUpdated.z, 1.0);
        var normalWorld: mat3x3f =  mat3x3f(finalWorld[0].xyz, finalWorld[1].xyz, finalWorld[2].xyz);
        // Transform normal to world space using the inverse transpose of the upper-left 3x3 matrix
        let worldNormal = normalize(normalWorld * normalUpdated);
        
        #ifdef CUSTOMSELECTION
        index = global_id.x;
        #endif
    
        transformedPositions[index * 3] = worldPos.x;
        transformedPositions[(index * 3)+1] = worldPos.y;
        transformedPositions[(index * 3)+2] = worldPos.z;
        transformedNormals[index * 3] = worldNormal.x;
        transformedNormals[(index * 3)+1] = worldNormal.y;
        transformedNormals[(index * 3)+2] = worldNormal.z;
    }
    
    `,
    HERMITE: `
    fn hermiteTangent(
    p0: vec3<f32>, 
    p1: vec3<f32>, 
    t0: vec3<f32>, 
    t1: vec3<f32>, 
    t: f32, 
    tangentScale: f32
) -> vec3<f32> {
    let h00_derivative = 6.0 * t * t - 6.0 * t;
    let h10_derivative = 3.0 * t * t - 4.0 * t + 1.0;
    let h01_derivative = -6.0 * t * t + 6.0 * t;
    let h11_derivative = 3.0 * t * t - 2.0 * t;

    return h00_derivative * p0
        + h10_derivative * (tangentScale * t0)
        + h01_derivative * p1
        + h11_derivative * (tangentScale * t1);
}


    fn hermite(p0: vec3<f32>, p1: vec3<f32>, t0: vec3<f32>, t1: vec3<f32>, t: f32, tangentScale: f32) -> vec3<f32> {
    // Scale tangents
    let scaledT0 = t0 * tangentScale;
    let scaledT1 = t1 * tangentScale;

    // Hermite basis functions
    let t2 = t * t;
    let t3 = t2 * t;
    let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
    let h10 = t3 - 2.0 * t2 + t;
    let h01 = -2.0 * t3 + 3.0 * t2;
    let h11 = t3 - t2;

    // Compute interpolated position
    return p0 * h00 + scaledT0 * h10 + p1 * h01 + scaledT1 * h11;
}
`,
    SIMPLEX_NOISE: `
// Modified from the amazing original:


// psrdnoise (c) 2021 Stefan Gustavson and Ian McEwan
// Published under the MIT license.
// https://github.com/stegu/psrdnoise/
    
fn mod289v4f(i: vec4<f32>) -> vec4<f32> {
	return i - floor(i / 289.0) * 289.0;
}

fn permute289v4f(i: vec4<f32>) -> vec4<f32>
{
	var im: vec4<f32> = mod289v4f(i);
	return mod289v4f((im*34.0 + 10.0)*im);
}

fn mod289v4f_psrn(i: vec4<f32>) -> vec4<f32> {
	return i - floor(i / 289.0) * 289.0;
}


fn permute289v4f_psrn(i: vec4<f32>) -> vec4<f32>
{
	var im: vec4<f32> = mod289v4f_psrn(i);
	return mod289v4f_psrn((im*34.0 + 10.0)*im);
}


fn snoise3(x: vec3<f32>) -> f32
{
	let M = mat3x3<f32>(0.0, 1.0, 1.0, 1.0, 0.0, 1.0,  1.0, 1.0, 0.0);
	let Mi = mat3x3<f32>(-0.5, 0.5, 0.5, 0.5,-0.5, 0.5, 0.5, 0.5,-0.5);

	var uvw: vec3<f32>;
	var i0: vec3<f32>;
	var i1: vec3<f32>;
	var i2: vec3<f32>;
	var i3: vec3<f32>;
	var f0: vec3<f32>;
	var gt_: vec3<f32>;
	var lt_: vec3<f32>;
	var gt: vec3<f32>;
	var lt: vec3<f32>;
	var o1: vec3<f32>;
	var o2: vec3<f32>;
	var v0: vec3<f32>;
	var v1: vec3<f32>;
	var v2: vec3<f32>;
	var v3: vec3<f32>;
	var x0: vec3<f32>;
	var x1: vec3<f32>;
	var x2: vec3<f32>;
	var x3: vec3<f32>;
	
	uvw = M * x;
	i0 = floor(uvw);
	f0 = uvw - i0;
	gt_ = step(f0.xyx, f0.yzz);
	lt_ = 1.0 - gt_;
	gt = vec3<f32>(lt_.z, gt_.xy);
	lt = vec3<f32>(lt_.xy, gt_.z);
	o1 = min( gt, lt );
	o2 = max( gt, lt );
	i1 = i0 + o1;
	i2 = i0 + o2;
	i3 = i0 + vec3<f32>(1.0,1.0,1.0);
	v0 = Mi * i0;
	v1 = Mi * i1;
	v2 = Mi * i2;
	v3 = Mi * i3;
	x0 = x - v0;
	x1 = x - v1;
	x2 = x - v2;
	x3 = x - v3;
	
	var hash: vec4<f32>;
	var theta: vec4<f32>;
	var sz: vec4<f32>;
	var psi: vec4<f32>;
	var St: vec4<f32>;
	var Ct: vec4<f32>;
	var sz_: vec4<f32>;

	hash = permute289v4f( permute289v4f( permute289v4f( 
		vec4<f32>(i0.z, i1.z, i2.z, i3.z ))
		+ vec4<f32>(i0.y, i1.y, i2.y, i3.y ))
		+ vec4<f32>(i0.x, i1.x, i2.x, i3.x ));
	theta = hash * 3.883222077;
	sz = hash * -0.006920415 + 0.996539792;
	psi = hash * 0.108705628;
	Ct = cos(theta);
	St = sin(theta);
	sz_ = sqrt( 1.0 - sz*sz );

	var gx: vec4<f32>;
	var gy: vec4<f32>;
	var gz: vec4<f32>;

	gx = Ct * sz_;
	gy = St * sz_;
	gz = sz;  
	
	var g0: vec3<f32>;
	var g1: vec3<f32>;
	var g2: vec3<f32>;
	var g3: vec3<f32>;
	var w: vec4<f32>;
	var w2: vec4<f32>;
	var w3: vec4<f32>;
	var gdotx: vec4<f32>;
	var n: f32;
	
	g0 = vec3<f32>(gx.x, gy.x, gz.x);
	g1 = vec3<f32>(gx.y, gy.y, gz.y);
	g2 = vec3<f32>(gx.z, gy.z, gz.z);
	g3 = vec3<f32>(gx.w, gy.w, gz.w);
	w = 0.5 - vec4<f32>(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3));
	w = max(w, vec4<f32>(0.0, 0.0, 0.0, 0.0));
	w2 = w * w;
	w3 = w2 * w;
	gdotx = vec4<f32>(dot(g0,x0), dot(g1,x1), dot(g2,x2), dot(g3,x3));
	n = dot(w3, gdotx);
	
	return 39.5 * n;
}



fn fBm(p: vec3f) -> f32 {
    var value: f32 = 0.0;
    var amplitude: f32 = 0.9;
    var frequency: f32 = 0.5;
    
    for (var i: i32 = 0; i < params.octaves; i++) {
        value += (f32(i) * 0.001) + (amplitude * snoise3(p * frequency));
        frequency *= (f32(i) * 0.05) + 2.0;
        amplitude *= (f32(i) * 0.05) + 0.5;
    }
    
    return value;
}

struct NG3 {
	noise: f32,
	gradient: vec3<f32>
};

fn psrdnoise3(x: vec3<f32>, p: vec3<f32>, alpha: f32) -> NG3 {
    let M = mat3x3<f32>(0.0, 1.0, 1.0, 1.0, 0.0, 1.0,  1.0, 1.0, 0.0);
    let Mi = mat3x3<f32>(-0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5);

    var uvw: vec3<f32>;
    var i0: vec3<f32>;
    var i1: vec3<f32>;
    var i2: vec3<f32>;
    var i3: vec3<f32>;
    var f0: vec3<f32>;
    var gt_: vec3<f32>;
    var lt_: vec3<f32>;
    var gt: vec3<f32>;
    var lt: vec3<f32>;
    var o1: vec3<f32>;
    var o2: vec3<f32>;
    var v0: vec3<f32>;
    var v1: vec3<f32>;
    var v2: vec3<f32>;
    var v3: vec3<f32>;
    var x0: vec3<f32>;
    var x1: vec3<f32>;
    var x2: vec3<f32>;
    var x3: vec3<f32>;

    uvw = M * x;
    i0 = floor(uvw);
    f0 = uvw - i0;
    gt_ = step(f0.xyx, f0.yzz);
    lt_ = 1.0 - gt_;
    gt = vec3<f32>(lt_.z, gt_.xy);
    lt = vec3<f32>(lt_.xy, gt_.z);
    o1 = min(gt, lt);
    o2 = max(gt, lt);
    i1 = i0 + o1;
    i2 = i0 + o2;
    i3 = i0 + vec3<f32>(1.0, 1.0, 1.0);
    v0 = Mi * i0;
    v1 = Mi * i1;
    v2 = Mi * i2;
    v3 = Mi * i3;
    x0 = x - v0;
    x1 = x - v1;
    x2 = x - v2;
    x3 = x - v3;

    // Gradient generation logic
    var hash: vec4<f32>;
    var theta: vec4<f32>;
    var sz: vec4<f32>;
    var psi: vec4<f32>;
    var St: vec4<f32>;
    var Ct: vec4<f32>;
    var sz_: vec4<f32>;

    hash = permute289v4f_psrn(permute289v4f_psrn(permute289v4f_psrn(
        vec4<f32>(i0.z, i1.z, i2.z, i3.z)) +
        vec4<f32>(i0.y, i1.y, i2.y, i3.y)) +
        vec4<f32>(i0.x, i1.x, i2.x, i3.x));
    theta = hash * 3.883222077;
    sz = hash * -0.006920415 + 0.996539792;
    psi = hash * 0.108705628;
    Ct = cos(theta);
    St = sin(theta);
    sz_ = sqrt(1.0 - sz * sz);

    var gx: vec4<f32>;
    var gy: vec4<f32>;
    var gz: vec4<f32>;

    // Gradient computation
    gx = Ct * sz_;
    gy = St * sz_;
    gz = sz;

    // Apply rotation based on NOISE_OFFSET
    let angle = fract(params.noiseOffset) * 6.28318530718; // Full circle in radians
    let c = cos(angle);
    let s = sin(angle);

    var rotated_gx: vec4<f32>;
    var rotated_gy: vec4<f32>;
    var rotated_gz: vec4<f32>;

    rotated_gx = gx * c - gy * s;
    rotated_gy = gx * s + gy * c;
    rotated_gz = gz; // Rotation happens in the x-y plane

    gx = rotated_gx;
    gy = rotated_gy;
    gz = rotated_gz;

    var g0: vec3<f32>;
    var g1: vec3<f32>;
    var g2: vec3<f32>;
    var g3: vec3<f32>;
    var w: vec4<f32>;
    var w2: vec4<f32>;
    var w3: vec4<f32>;
    var gdotx: vec4<f32>;
    var n: f32;

    g0 = vec3<f32>(gx.x, gy.x, gz.x);
    g1 = vec3<f32>(gx.y, gy.y, gz.y);
    g2 = vec3<f32>(gx.z, gy.z, gz.z);
    g3 = vec3<f32>(gx.w, gy.w, gz.w);
    w = 0.5 - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3));
    w = max(w, vec4<f32>(0.0, 0.0, 0.0, 0.0));
    w2 = w * w;
    w3 = w2 * w;
    gdotx = vec4<f32>(dot(g0, x0), dot(g1, x1), dot(g2, x2), dot(g3, x3));
    n = 39.5 * dot(w3, gdotx);

    var dw: vec4<f32> = -6.0 * w2 * gdotx;
    var dn0: vec3<f32> = w3.x * g0 + dw.x * x0;
    var dn1: vec3<f32> = w3.y * g1 + dw.y * x1;
    var dn2: vec3<f32> = w3.z * g2 + dw.z * x2;
    var dn3: vec3<f32> = w3.w * g3 + dw.w * x3;
    var g: vec3<f32> = 39.5 * (dn0 + dn1 + dn2 + dn3);

    return NG3(n, g);
}


`,
};

function checkComputeShadersSupported(engine, scene) {
    const supportCS = engine.getCaps().supportComputeShaders;

    if (supportCS) {
        return true;
    }

    var panel = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI(
        "UI",
        true,
        scene,
    );

    const textNOk =
        "**Use WebGPU to watch this demo which requires compute shaders support. To enable WebGPU please use Edge Canary or Chrome canary. Also, select the WebGPU engine from the top right drop down menu.**";

    var info = new BABYLON.GUI.TextBlock();
    info.text = textNOk;
    info.width = "100%";
    info.paddingLeft = "5px";
    info.paddingRight = "5px";
    info.textHorizontalAlignment =
        BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    info.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    info.color = supportCS ? "green" : "red";
    info.fontSize = supportCS ? "18px" : "24px";
    info.fontStyle = supportCS ? "" : "bold";
    info.textWrapping = true;
    panel.addControl(info);

    return false;
}

/**
 * Generates tendril data based on a mesh.
 * For any vertex above the specified y-threshold, a tendril is spawned with its normal matching the vertex normal.
 * If the mesh does not have normals, they are calculated as the direction from the center to the vertex.
 *
 * @param {BABYLON.Mesh} mesh - The mesh to spawn tendrils from.
 * @param {number} yThreshold - The y-value above which tendrils will spawn.
 * @param {number} SEGMENT_LENGTH - Fixed length for each tendril segment.
 * @param {number} controlPointsPerStrand - Number of control points per tendril.
 * @param {number} percentage - Percentage of vertices to sample for tendril generation.
 * @returns {object} Tendril data: positions, previous positions, metadata, and active tendril count.
 */
function generateTendrilsFromMesh(
    mesh,
    yThreshold,
    SEGMENT_LENGTH,
    controlPointsPerStrand,
    percentage = 100,
) {
    let positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    let unique_positions = new Set();
    // let deduplicated_positions = [];
    // positions.forEach((f32, i) => {
    //     if (i % 3 === 0) {
    //         let pos = new BABYLON.Vector3(
    //             f32,
    //             positions[i + 1],
    //             positions[i + 2],
    //         );
    //         if (!(unique_positions.has(pos.toString()))) {
    //             deduplicated_positions.push(...pos.asArray());
    //         }
    //         unique_positions.add(pos.toString());
    //     }
    // });

    // positions = deduplicated_positions;
    let normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    // debugger;
    // Calculate mesh center if normals are not available
    let center = new BABYLON.Vector3(0, 0, 0);

    const tendrilPositions = [];
    const tendrilPreviousPositions = [];
    const tendrilMeta = [];
    const vertexToControlPointMap = [];
    let activeTendrilCount = 0;

    // Calculate the number of vertices to sample based on the percentage
    const vertexCount = positions.length / 3;
    const sampleCount = Math.floor((percentage / 100) * vertexCount);

    // Shuffle vertex indices to randomly sample the vertices
    const vertexIndices = Array.from({ length: vertexCount }, (_, i) => i);
    // for (let i = vertexIndices.length - 1; i > 0; i--) {
    //     const j = Math.floor(Math.random() * (i + 1));
    //     [vertexIndices[i], vertexIndices[j]] = [
    //         vertexIndices[j],
    //         vertexIndices[i],
    //     ];
    // }

    // Iterate over the sampled vertices
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
        const vertexIndex = vertexIndices[sampleIndex];
        const x = positions[vertexIndex * 3];
        const y = positions[vertexIndex * 3 + 1];
        const z = positions[vertexIndex * 3 + 2];

        if (y > yThreshold) {
            const rootControlPointIndex = activeTendrilCount *
                controlPointsPerStrand * 3;
            vertexToControlPointMap.push({
                vertexIndex,
                controlPointIndex: rootControlPointIndex,
            });

            activeTendrilCount++;

            let normalX, normalY, normalZ;
            if (normals[vertexIndex * 3] === undefined) {
                // Calculate normal as the direction from center to vertex
                const direction = new BABYLON.Vector3(x, y, z).subtract(center)
                    .normalize();
                normalX = direction.x;
                normalY = direction.y;
                normalZ = direction.z;

                // Store calculated normal back in the normals array
                normals[vertexIndex * 3] = normalX;
                normals[vertexIndex * 3 + 1] = normalY;
                normals[vertexIndex * 3 + 2] = normalZ;
            } else {
                normalX = normals[vertexIndex * 3];
                normalY = normals[vertexIndex * 3 + 1];
                normalZ = normals[vertexIndex * 3 + 2];
            }

            const rootPosition = new BABYLON.Vector3(x, y, z);
            const rootNormal = new BABYLON.Vector3(normalX, normalY, normalZ);

            // Initialize control points along the rootNormal direction
            for (let j = 0; j < controlPointsPerStrand; j++) {
                const distance = SEGMENT_LENGTH * j; // Fixed segment length
                const tendrilPosition = rootPosition.add(
                    rootNormal.scale(distance),
                );

                tendrilPositions.push(
                    tendrilPosition.x,
                    tendrilPosition.y,
                    tendrilPosition.z,
                );
                tendrilPreviousPositions.push(
                    tendrilPosition.x,
                    tendrilPosition.y,
                    tendrilPosition.z,
                ); // Initial previous positions at origin
            }

            // Tendril metadata (identity matrix and root direction)
            tendrilMeta.push(
                rootNormal.x,
                rootNormal.y,
                rootNormal.z,
                0, // rootNormal
            );
        }
    }

    return {
        tendrilPositions: new Float32Array(tendrilPositions),
        tendrilPreviousPositions: new Float32Array(tendrilPreviousPositions),
        tendrilMeta: new Float32Array(tendrilMeta),
        vertexToControlPointMap, // Return the mapping
        activeTendrilCount,
        sampleCount: tendrilPositions.length / 3,
    };
}

function calculateBufferSizes(
    controlPointCount,
    strandMultiplier,
    tendrilParams,
) {
    const {
        curveSamples, // Number of samples per segment
        crossSectionPoints, // Number of points in the cross-section profile
    } = tendrilParams;

    // Number of segments per strand (control points - 1)
    const segmentCount = controlPointCount - 1;

    // Total interpolated points per strand
    const pointsPerStrand = segmentCount * curveSamples * crossSectionPoints;

    // Total interpolated points for all strands
    const totalPoints = pointsPerStrand * strandMultiplier;

    // Vertex buffer size (each position is 3 floats, each float is 4 bytes)
    const vertexBufferSize = totalPoints * 3 * 4;

    // Total indices per segment:
    // Each quad requires 2 triangles = 6 indices
    const quadsPerSegment = curveSamples * crossSectionPoints;
    const indicesPerStrand = (segmentCount * quadsPerSegment) * 6;

    // Total indices for all strands
    const totalIndices = indicesPerStrand * strandMultiplier;

    // Index buffer size (each index is a 4-byte unsigned integer)
    const indexBufferSize = totalIndices * 4;

    return {
        vertexBufferSize,
        indexBufferSize,
        totalPoints,
        totalIndices,
    };
}

class MeshTransformsCalculator {
    constructor(engine, mesh, root_indices = null) {
        root_indices = null;
        this._engine = engine;
        this._mesh = mesh;
        let root_indices_set;
        if (root_indices) {
            root_indices_set = new Set(root_indices);
            this.root_indices_set = root_indices_set;
            this.root_indices = root_indices;
        }

        const originalVertexCount = mesh.getTotalVertices();
        const vertexCount = root_indices
            ? root_indices.length
            : originalVertexCount;
        this.originalVertexCount = originalVertexCount;
        this.vertexCount = vertexCount;
        // Initialize storage buffers
        this._selectedIndices = new BABYLON.StorageBuffer(
            engine,
            Uint32Array.BYTES_PER_ELEMENT * this.vertexCount,
            BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "selected_indices",
        ); // vec3

        this._selectedIndices.update(new Uint32Array(root_indices));
        this._basePositions = new BABYLON.StorageBuffer(
            engine,
            Float32Array.BYTES_PER_ELEMENT * this.originalVertexCount * 3,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "base_positions",
        ); // vec3
        this._baseNormals = new BABYLON.StorageBuffer(
            engine,
            Float32Array.BYTES_PER_ELEMENT * this.originalVertexCount * 3,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "base_normals",
        ); // vec3
        this._transformedPositions = new BABYLON.StorageBuffer(
            engine,
            Float32Array.BYTES_PER_ELEMENT * this.vertexCount * 3,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "tx_positions",
        ); // vec3

        this._transformedNormals = new BABYLON.StorageBuffer(
            engine,
            Float32Array.BYTES_PER_ELEMENT * this.vertexCount * 3,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "tx_normals",
        ); // vec3

        // Define options (e.g., number of bone influencers, morph targets)
        const defines = [];
        if (
            mesh.numBoneInfluencers > 0 && mesh.useBones &&
            mesh.computeBonesUsingShaders && mesh.skeleton
        ) {
            defines.push(
                `#define NUM_BONE_INFLUENCERS ${mesh.numBoneInfluencers}`,
            );
        }
        if (mesh.hasMorphTargets) {
            defines.push(`#define MORPHTARGETS`);
        }

        if (root_indices_set) {
            defines.push(`#define CUSTOMSELECTION`);
        }

        // Prepare the compute shader
        this._computeShader = new BABYLON.ComputeShader(
            "transformCompute",
            engine,
            { computeSource: WGSL_SHADERS.COMPUTE_TRANSFORMS },
            {
                bindingsMapping: this._getBindingsMapping(),
                defines,
            },
        );

        // Upload initial vertex positions and normals
        let positionData = mesh.getVertexBuffer(
            BABYLON.VertexBuffer.PositionKind,
        ).getFloatData(this.originalVertexCount);
        // TODO
        // let indexData = mesh.getIndices(true, true);
        // BABYLON.VertexData.ComputeNormals(
        //     positionData,
        //     indexData,
        //     mesh.getVertexBuffer(BABYLON.VertexBuffer.NormalKind),
        // );
        let normalData = mesh.getVertexBuffer(BABYLON.VertexBuffer.NormalKind)
            .getFloatData(this.originalVertexCount);

        this._basePositions.update(positionData);
        this._baseNormals.update(normalData);
        this._transformedPositions.update(positionData);
        this._transformedNormals.update(normalData);
        // Set compute shader bindings
        this._computeShader.setStorageBuffer(
            "basePositions",
            this._basePositions,
        );
        this._computeShader.setStorageBuffer("baseNormals", this._baseNormals);
        this._computeShader.setStorageBuffer(
            "transformedPositions",
            this._transformedPositions,
        );
        this._computeShader.setStorageBuffer(
            "transformedNormals",
            this._transformedNormals,
        );

        if (root_indices) {
            this._computeShader.setStorageBuffer(
                "custom_selection",
                this._selectedIndices,
            );
        }

        // Add optional buffers for bones
        if (mesh.useBones && mesh.computeBonesUsingShaders && mesh.skeleton) {
            this._addBoneBindings();
        }

        // Add optional buffers for morph targets
        if (mesh.hasMorphTargets) {
            this._addMorphTargetBindings();

            // Uniform settings (example settings)
            this._settingsBuffer = new BABYLON.UniformBuffer(engine);
            this._settingsBuffer.addFloat3("morphTargetTextureInfo", 0, 0, 0);
            this._settingsBuffer.addUniform("morphTargetCount", 1);
            this._settingsBuffer.update();

            this._computeShader.setUniformBuffer(
                "settings",
                this._settingsBuffer,
            );
        }

        // Uniform settings (example settings)
        this._paramsBuffer = new BABYLON.UniformBuffer(engine);
        this._paramsBuffer.addUniform("selectedVertexCount", 1);
        this._paramsBuffer.updateInt("selectedVertexCount", this.vertexCount);
        this._paramsBuffer.update();

        this._computeShader.setUniformBuffer(
            "params",
            this._paramsBuffer,
        );
    }

    _getBindingsMapping() {
        const bindings = {
            basePositions: { group: 0, binding: 0 },
            baseNormals: { group: 0, binding: 1 },
            transformedPositions: { group: 0, binding: 2 },
            transformedNormals: { group: 0, binding: 3 },
            params: { group: 0, binding: 13 },
        };

        if (this._mesh.numBoneInfluencers > 0) {
            bindings.boneSampler = { group: 0, binding: 5 };
            bindings.indexBuffer = { group: 0, binding: 6 };
            bindings.weightBuffer = { group: 0, binding: 7 };

            if (this._mesh.numBoneInfluencers > 4) {
                bindings.indexExtraBuffer = { group: 0, binding: 8 };
                bindings.weightExtraBuffer = { group: 0, binding: 9 };
            }
        }

        if (this._mesh.hasMorphTargets) {
            bindings.settings = { group: 0, binding: 4 },
                bindings.morphTargets = { group: 0, binding: 10 };
            bindings.morphTargetInfluences = { group: 0, binding: 11 };
            bindings.morphTargetTextureIndices = { group: 0, binding: 12 };
        }

        if (this.root_indices_set) {
            bindings.custom_selection = { group: 0, binding: 14 };
        }

        return bindings;
    }

    _addBoneBindings() {
        const mesh = this._mesh;

        // Bone sampler
        const boneSampler = mesh.skeleton.getTransformMatrixTexture(mesh);
        this._computeShader.setTexture("boneSampler", boneSampler, false);

        // Bone index and weight buffers
        let indexData = mesh.getVertexBuffer(
            BABYLON.VertexBuffer.MatricesIndicesKind,
        ).getFloatData(this.originalVertexCount);
        let weightData = mesh.getVertexBuffer(
            BABYLON.VertexBuffer.MatricesWeightsKind,
        ).getFloatData(this.originalVertexCount);

        const indexBuffer = new BABYLON.StorageBuffer(
            this._engine,
            Float32Array.BYTES_PER_ELEMENT * indexData.length,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "indices",
        );
        const weightBuffer = new BABYLON.StorageBuffer(
            this._engine,
            Float32Array.BYTES_PER_ELEMENT * weightData.length,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "weights",
        );

        indexBuffer.update(indexData);
        weightBuffer.update(weightData);

        this._computeShader.setStorageBuffer("indexBuffer", indexBuffer);
        this._computeShader.setStorageBuffer("weightBuffer", weightBuffer);

        // Extra indices/weights for >4 influencers
        if (mesh.numBoneInfluencers > 4) {
            const indexExtraData = mesh.getVertexBuffer(
                BABYLON.VertexBuffer.MatricesIndicesExtraKind,
            ).getFloatData(this.originalVertexCount);
            const weightExtraData = mesh.getVertexBuffer(
                BABYLON.VertexBuffer.MatricesWeightsExtraKind,
            ).getFloatData(this.originalVertexCount);

            const indexExtraBuffer = new BABYLON.StorageBuffer(
                this._engine,
                Float32Array.BYTES_PER_ELEMENT * indexExtraData.length,
                BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                    BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                    BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
                "indices_extra",
            );
            const weightExtraBuffer = new BABYLON.StorageBuffer(
                this._engine,
                Float32Array.BYTES_PER_ELEMENT * weightExtraData.length,
                BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                    BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                    BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
                "weights_extra",
            );

            indexExtraBuffer.update(indexExtraData);
            weightExtraBuffer.update(weightExtraData);

            this._computeShader.setStorageBuffer(
                "indexExtraBuffer",
                indexExtraBuffer,
            );
            this._computeShader.setStorageBuffer(
                "weightExtraBuffer",
                weightExtraBuffer,
            );
        }
    }

    _addMorphTargetBindings() {
        const manager = this._mesh.morphTargetManager;

        // Morph target texture
        const morphTargets = manager._targetStoreTexture;
        this._computeShader.setTexture("morphTargets", morphTargets, false);

        // Morph target influences
        const influences = manager.influences;
        const influenceBuffer = new BABYLON.StorageBuffer(
            this._engine,
            Float32Array.BYTES_PER_ELEMENT * influences.length,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "morph_influence",
        );
        influenceBuffer.update(influences);
        this._computeShader.setStorageBuffer(
            "morphTargetInfluences",
            influenceBuffer,
        );

        // Morph target texture indices
        const textureIndices = manager._morphTargetTextureIndices;
        const textureIndexBuffer = new BABYLON.StorageBuffer(
            this._engine,
            Float32Array.BYTES_PER_ELEMENT * textureIndices.length,
            BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
                BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
                BABYLON.Constants.BUFFER_CREATIONFLAG_READ,
            "morph_indices",
        );
        textureIndexBuffer.update(textureIndices);
        this._computeShader.setStorageBuffer(
            "morphTargetTextureIndices",
            textureIndexBuffer,
        );

        // Update uniform settings
        const textureInfo = manager._textureVertexStride;
        this._settingsBuffer.updateFloat3(
            "morphTargetTextureInfo",
            textureInfo,
            manager._textureWidth,
            manager._textureHeight,
        );
        this._settingsBuffer.updateInt("morphTargetCount", influences.length);
    }

    update() {
        // Dispatch the compute shader
        const workgroupSize = Math.ceil(this.vertexCount / 256); // Assuming workgroup_size(256, 1, 1)
        this._computeShader.dispatchWhenReady(workgroupSize);

        // Ensure results are flushed
        this._engine.flushFramebuffer();
    }

    getTransformedPositions() {
        return this._transformedPositions.read();
    }

    getTransformedNormals() {
        return this._transformedNormals.read();
    }

    dispose() {
        this._basePositions.dispose();
        this._baseNormals.dispose();
        this._transformedPositions.dispose();
        this._transformedNormals.dispose();
        this._settingsBuffer.dispose();
    }
}

class PointCloudMeshRenderer {
    constructor(mesh, scene) {
        const vertexData = mesh.getVerticesData(
            BABYLON.VertexBuffer.PositionKind,
        );
        this.blocked = false;
        this.mesh = mesh;
        this.scene = scene;
        this.pcs = new BABYLON.PointsCloudSystem("pcs", 3, scene);
        // Add points based on the initial mesh vertex data
        this.pcs.addPoints(vertexData.length / 3, (particle, i) => {
            particle.position.x = vertexData[i * 3];
            particle.position.y = vertexData[i * 3 + 1];
            particle.position.z = vertexData[i * 3 + 2];
        });

        // Cache vertex count for optimization
        this.vertexCount = vertexData.length / 3;
    }
    async initialize() {
        return this.pcs.buildMeshAsync().then(() => {
            this.pcs.mesh.position.x += 1;
            this.pcs.mesh.parent = this.mesh;
        });
    }

    async render(custom_position_floats) {
        const vertexData = custom_position_floats
            ? custom_position_floats
            : this.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);

        if (!vertexData) {
            console.error("Mesh has no vertex data.");
            return;
        }

        const newVertexCount = vertexData.length / 3;

        if (newVertexCount > this.vertexCount) {
            this.vertexCount = newVertexCount;
            this.blocked = true;
            // Add new particles if the vertex count has increased
            const additionalPoints = newVertexCount - this.vertexCount;
            this.pcs.addPoints(additionalPoints);

            this.pcs.buildMeshAsync().then((e) => this.blocked = false);
        }

        if (!this.blocked) {
            this.pcs.mesh.setVerticesData("position", custom_position_floats);
        }
    }
}
