import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Camera, FreeCamera, WebGPUEngine } from "@babylonjs/core";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { setupIncludes } from "./shaders";
import { pyramidMesh } from "./meshes/pyramidMesh";
import { triangleMesh } from "./meshes/triangleMesh";
import { createBoid3dMaterial, createComputeShaders3d } from "./shaders/3d";
const SIMPLE_BOID = false;

export const boids3d = async (
  engine: WebGPUEngine,
  scene: Scene,
  camera: Camera,
  config: { numBoids?: number } = { numBoids: 32 },
) => {
  const edgeMargin = 0.5;
  const maxSpeed = 2;
  const visualRange = 0.5;
  const minDistance = 0.15;
  const cohesionFactor = 2;
  const alignmentFactor = 5;
  const separationFactor = 1;
  const numBoids = config.numBoids;
  const blockSize = engine.currentLimits.maxComputeWorkgroupSizeX;
  setupIncludes(blockSize);
  const maxBlocks = engine.currentLimits.maxComputeWorkgroupsPerDimension;
  const boidLimit = (blockSize * maxBlocks) / 4;

  let spaceBounds: number;
  spaceBounds = Math.max(1, Math.pow(numBoids, 1 / 3) / 7.5 + edgeMargin);
  const {
    generateBoidsComputeShader,
    boidComputeShader,
    clearGridComputeShader,
    updateGridComputeShader,
    prefixSumComputeShader,
    sumBucketsComputeShader,
    addSumsComputeShader,
    rearrangeBoidsComputeShader,
  } = createComputeShaders3d(engine);

  let boidsComputeBuffer: StorageBuffer;
  let boidsComputeBuffer2: StorageBuffer;
  let gridBuffer: StorageBuffer;
  let gridOffsetsBuffer: StorageBuffer;
  let gridOffsetsBuffer2: StorageBuffer;
  let gridSumsBuffer: StorageBuffer;
  let gridSumsBuffer2: StorageBuffer;
  let gridTotalCells: number;
  let blocks: number;
  let boidMat: ShaderMaterial;
  let boidVerticesBuffer: StorageBuffer;
  let boidNormalsBuffer: StorageBuffer;
  let boidMesh: Mesh;

  const params = new UniformBuffer(engine, undefined, false, "params");
  params.addUniform("numBoids", 1);
  params.addUniform("xBound", 1);
  params.addUniform("yBound", 1);
  params.addUniform("zBound", 1);
  params.addUniform("maxSpeed", 1);
  params.addUniform("minSpeed", 1);
  params.addUniform("turnSpeed", 1);
  params.addUniform("visualRangeSq", 1);
  params.addUniform("minDistanceSq", 1);
  params.addUniform("cohesionFactor", 1);
  params.addUniform("alignmentFactor", 1);
  params.addUniform("separationFactor", 1);
  params.addUniform("dt", 1);
  params.addUniform("gridDimX", 1);
  params.addUniform("gridDimY", 1);
  params.addUniform("gridDimZ", 1);
  params.addUniform("gridCellSize", 1);
  params.addUniform("gridTotalCells", 1);
  params.addUniform("divider", 1);
  params.addUniform("rngSeed", 1);
  params.addUniform("blocks", 1);

  const setup = () => {
    const xBound = 2 * spaceBounds - edgeMargin;
    const yBound = spaceBounds - edgeMargin;
    const zBound = 2 * spaceBounds - edgeMargin;

    const gridDimX = Math.floor((xBound * 2) / visualRange) + 20;
    const gridDimY = Math.floor((yBound * 2) / visualRange) + 20;
    const gridDimZ = Math.floor((zBound * 2) / visualRange) + 20;
    gridTotalCells = gridDimX * gridDimY * gridDimZ;
    blocks = Math.ceil(gridTotalCells / blockSize);

    // Boids
    boidsComputeBuffer = new StorageBuffer(engine, numBoids * 32);
    boidsComputeBuffer2 = new StorageBuffer(engine, numBoids * 32);

    // Load texture and materials
    boidMat = createBoid3dMaterial(scene);
    boidMat.setStorageBuffer("boids", boidsComputeBuffer);

    // Create boid mesh
    const mesh = SIMPLE_BOID ? triangleMesh : pyramidMesh;
    boidMesh = new Mesh("custom", scene);
    boidMesh.setVerticesData(
      VertexBuffer.PositionKind,
      new Float32Array(mesh.vertices.byteLength * 6).fill(0),
    );
    boidMesh.isUnIndexed = true;
    const numVerts = mesh.vertices.length / 4;
    boidMesh.subMeshes[0].verticesCount = numBoids * numVerts;
    boidMat.setUInt("numVertices", numVerts);

    boidVerticesBuffer = new StorageBuffer(engine, mesh.vertices.byteLength);
    boidVerticesBuffer.update(mesh.vertices);
    boidMat.setStorageBuffer("boidVertices", boidVerticesBuffer);
    boidNormalsBuffer = new StorageBuffer(engine, mesh.normals.byteLength);
    boidNormalsBuffer.update(mesh.normals);
    boidMat.setStorageBuffer("boidNormals", boidNormalsBuffer);

    boidMesh.material = boidMat;
    boidMesh.buildBoundingInfo(
      new Vector3(-xBound, -yBound, -zBound),
      new Vector3(xBound, yBound, zBound),
    );

    params.updateUInt("numBoids", numBoids);
    params.updateFloat("xBound", xBound);
    params.updateFloat("yBound", yBound);
    params.updateFloat("zBound", zBound);
    params.updateFloat("maxSpeed", maxSpeed);
    params.updateFloat("minSpeed", maxSpeed * 0.75);
    params.updateFloat("turnSpeed", maxSpeed * 3);
    params.updateFloat("visualRangeSq", visualRange * visualRange);
    params.updateFloat("minDistanceSq", minDistance * minDistance);
    params.updateFloat("cohesionFactor", cohesionFactor);
    params.updateFloat("alignmentFactor", alignmentFactor);
    params.updateFloat("separationFactor", separationFactor);
    params.updateUInt("gridDimX", gridDimX);
    params.updateUInt("gridDimY", gridDimY);
    params.updateUInt("gridDimZ", gridDimZ);
    params.updateFloat("gridCellSize", visualRange);
    params.updateUInt("gridTotalCells", gridTotalCells);
    params.updateUInt("rngSeed", Math.floor(Math.random() * 10000000));
    params.updateUInt("blocks", blocks);

    params.update();

    // Grid
    gridBuffer = new StorageBuffer(engine, numBoids * 8);
    gridOffsetsBuffer = new StorageBuffer(engine, gridTotalCells * 4);
    gridOffsetsBuffer2 = new StorageBuffer(engine, gridTotalCells * 4);
    gridSumsBuffer = new StorageBuffer(engine, blocks * 4);
    gridSumsBuffer2 = new StorageBuffer(engine, blocks * 4);

    clearGridComputeShader.setUniformBuffer("params", params);
    clearGridComputeShader.setStorageBuffer("gridOffsets", gridOffsetsBuffer);

    updateGridComputeShader.setUniformBuffer("params", params);
    updateGridComputeShader.setStorageBuffer("grid", gridBuffer);
    updateGridComputeShader.setStorageBuffer("gridOffsets", gridOffsetsBuffer);
    updateGridComputeShader.setStorageBuffer("boids", boidsComputeBuffer);

    prefixSumComputeShader.setUniformBuffer("params", params);
    prefixSumComputeShader.setStorageBuffer(
      "gridOffsetsOut",
      gridOffsetsBuffer2,
    );
    prefixSumComputeShader.setStorageBuffer("gridOffsetsIn", gridOffsetsBuffer);
    prefixSumComputeShader.setStorageBuffer("gridSums", gridSumsBuffer);

    sumBucketsComputeShader.setUniformBuffer("params", params);

    addSumsComputeShader.setUniformBuffer("params", params);
    addSumsComputeShader.setStorageBuffer("gridOffsetsOut", gridOffsetsBuffer2);

    rearrangeBoidsComputeShader.setUniformBuffer("params", params);
    rearrangeBoidsComputeShader.setStorageBuffer("grid", gridBuffer);
    rearrangeBoidsComputeShader.setStorageBuffer(
      "gridOffsets",
      gridOffsetsBuffer2,
    );
    rearrangeBoidsComputeShader.setStorageBuffer("boidsIn", boidsComputeBuffer);
    rearrangeBoidsComputeShader.setStorageBuffer(
      "boidsOut",
      boidsComputeBuffer2,
    );

    boidComputeShader.setUniformBuffer("params", params);
    boidComputeShader.setStorageBuffer("boidsIn", boidsComputeBuffer2);
    boidComputeShader.setStorageBuffer("boids", boidsComputeBuffer);
    boidComputeShader.setStorageBuffer("gridOffsets", gridOffsetsBuffer2);

    // Generate boids on GPU
    generateBoidsComputeShader.setUniformBuffer("params", params);
    generateBoidsComputeShader.setStorageBuffer("boids", boidsComputeBuffer);
    generateBoidsComputeShader.dispatchWhenReady(
      Math.ceil(numBoids / blockSize),
      1,
      1,
    );
  };

  const disposeAll = () => {
    scene.dispose();
    boidsComputeBuffer.dispose();
    boidsComputeBuffer2.dispose();
    gridBuffer.dispose();
    gridOffsetsBuffer.dispose();
    gridOffsetsBuffer2.dispose();
    gridSumsBuffer.dispose();
    gridSumsBuffer2.dispose();
    boidVerticesBuffer.dispose();
    boidNormalsBuffer.dispose();
  };

  setup();

  let debounce: number;
  window.onresize = () => {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      engine.resize();
    }, 100);
  };

  // simpleToggle.onclick = () => {
  //   const mesh = simpleToggle.checked ? triangleMesh : pyramidMesh;
  //   boidMesh.subMeshes[0].verticesCount = (numBoids * mesh.vertices.length) / 4;
  //   boidVerticesBuffer.dispose();
  //   boidVerticesBuffer = new StorageBuffer(engine, mesh.vertices.length * 4);
  //   boidVerticesBuffer.update(mesh.vertices);
  //   boidMat.setStorageBuffer("boidVertices", boidVerticesBuffer);
  //   boidNormalsBuffer.dispose();
  //   boidNormalsBuffer = new StorageBuffer(engine, mesh.normals.length * 4);
  //   boidNormalsBuffer.update(mesh.normals);
  //   boidMat.setStorageBuffer("boidNormals", boidNormalsBuffer);
  //   boidMat.setUInt("numVertices", mesh.vertices.length / 4);
  // };

  return {
    renderLoopAction: async () => {
      params.updateFloat("dt", engine.getDeltaTime() / 1000);
      params.update();
      boidMat.setVector3("cameraPosition", camera.position);

      clearGridComputeShader.dispatch(blocks, 1, 1);
      updateGridComputeShader.dispatch(Math.ceil(numBoids / blockSize), 1, 1);

      prefixSumComputeShader.dispatch(blocks, 1, 1);

      let swap = false;
      for (let d = 1; d < gridTotalCells; d *= 2) {
        sumBucketsComputeShader.setStorageBuffer(
          "gridSumsIn",
          swap ? gridSumsBuffer2 : gridSumsBuffer,
        );
        sumBucketsComputeShader.setStorageBuffer(
          "gridSumsOut",
          swap ? gridSumsBuffer : gridSumsBuffer2,
        );

        params.updateUInt("divider", d);
        params.update();
        sumBucketsComputeShader.dispatch(Math.ceil(blocks / blockSize), 1, 1);
        swap = !swap;
      }

      addSumsComputeShader.setStorageBuffer(
        "gridSumsIn",
        swap ? gridSumsBuffer2 : gridSumsBuffer,
      );
      addSumsComputeShader.dispatch(blocks, 1, 1);
      rearrangeBoidsComputeShader.dispatch(
        Math.ceil(numBoids / blockSize),
        1,
        1,
      );

      boidComputeShader.dispatch(Math.ceil(numBoids / blockSize), 1, 1);
    },
  };
};
