// prettier-ignore
const vertices = new Float32Array([
  // Back face
  0.0, 0.5, 0.0, 1.0,
  0.4, -0.5, 0.4, 1.0,
  -0.4, -0.5, 0.4, 1.0,

  // Right side
  0.0, 0.5, 0.0, 1.0,
  0.4, -0.5, -0.4, 1.0,
  0.4, -0.5, 0.4, 1.0,

  // Front face
  0.0, 0.5, 0.0, 1.0,
  -0.4, -0.5, -0.4, 1.0,
  0.4, -0.5, -0.4, 1.0,

  // Left face
  0.0, 0.5, 0.0, 1.0,
  -0.4, -0.5, 0.4, 1.0,
  -0.4, -0.5, -0.4, 1.0,

  // Bottom face - Triangle 1
  -0.4, -0.5,  0.4, 1.0,
  0.4, -0.5,  0.4, 1.0,
  0.4, -0.5, -0.4, 1.0,

  // Bottom face - Triangle 2
  -0.4, -0.5,  0.4, 1.0,
  0.4, -0.5, -0.4, 1.0,
  -0.4, -0.5, -0.4, 1.0,
]);

// prettier-ignore
const normals = new Float32Array([
  // Back face
  0, 0.371390700340271, 0.9284766912460327, 0,
  // Right face
  0.9284766912460327, 0.371390700340271, 0, 0,
  // Front face
  0, 0.371390700340271, -0.9284766912460327, 0,
  // Left face
  -0.9284766912460327, 0.371390700340271, 0, 0,
  // Bottom face - Triangle 1
  0.0, -1.0, 0.0, 0,
  // Bottom face - Triangle 2
  0.0, -1.0, 0.0, 0,
  ]);

export const pyramidMesh = { normals, vertices };
