import {
    AbstractMesh,
    ArcRotateCamera,
    Color4,
    Effect,
    GPUParticleSystem,
    Mesh,
    MeshBuilder,
    ParticleSystem,
    Scene,
    Texture,
    Vector3,
} from "@babylonjs/core";

export function setupBubbleEmitter(scene: Scene, mesh: AbstractMesh) {
    // Emitter
    var emitter0 = mesh ||
        MeshBuilder.CreateBox("emitter0", { size: 0.1 }, scene);
    emitter0.isVisible = false;

    // Custom procedural bubble shader for particles
    Effect.ShadersStore["bubbleEmitterFragmentShader"] = `
#ifdef GL_ES
precision highp float;
#endif

varying vec2 vUV;
varying vec4 vColor;

uniform float time;
uniform vec3 sunDir;

void main(void) {
 // Convert UV (0..1) to centered coordinates (-1..1)
 vec2 centeredUV = vUV * 2.0 - 1.0;
 float r = length(centeredUV);

 // Compute alpha with a smooth edge; discard if outside the bubble
 float alpha = smoothstep(0.1, 0.9, r);
 if (r > 1.0) {
     discard;
 }

 // Reconstruct the sphere’s normal (for a unit sphere)
 float z = sqrt(1.0 - r * r);
 vec3 normal = normalize(vec3(centeredUV, z));

 // Compute the specular highlight from the sun direction
 float spec = pow(max(dot(normal, normalize(sunDir)), 0.0), 20.0);

 // Base bubble color (white) plus highlight; optional time-based variation
 vec3 bubbleColor = vec3(1.0) + vec3(spec);
 // bubbleColor *= 0.8 + 0.2 * sin(time + r * 10.0);

 gl_FragColor = vColor * vec4(bubbleColor, alpha);
}
`;

    // Particles
    var particleSystem = new GPUParticleSystem("particles", {capacity: 3000}, scene)
    // Removed the external texture dependency:
    particleSystem.particleTexture = new Texture("textures/flare.png", scene);
    particleSystem.minSize = 0.003;
    particleSystem.maxSize = .04;
    particleSystem.minLifeTime = 0.5;
    particleSystem.maxLifeTime = 5.0;
    particleSystem.minEmitPower = 0.5;
    particleSystem.maxEmitPower = 3.0;
    particleSystem.emitter = emitter0;
    particleSystem.emitRate = 1000;
    particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
    particleSystem.direction1 = new Vector3(-1, 1, -1);
    particleSystem.direction2 = new Vector3(1, 1, 1);
    particleSystem.color1 = new Color4(0.89, 1, 0.98, .01);
    particleSystem.color2 = new Color4(0.12, 0.55, 0.71, .01);
    particleSystem.gravity = new Vector3(0, 5.0, 0);

    // Create the effect and pass in the "time" and "sunDir" uniforms.
    var effect = scene.getEngine().createEffectForParticles(
        "bubbleEmitter",
        ["time", "sunDir"],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        particleSystem,
    );
    particleSystem.setCustomEffect(effect, 0);

    particleSystem.start();

    var time = 0;
    var order = 0.1;
    // Define the sun direction for the highlight (ensure it is normalized)
    var sunDir = new Vector3(0.0, 1.0, 1.0).normalize();

    effect.onBind = function () {
        effect.setFloat("time", time);
        effect.setVector3("sunDir", sunDir);
        time += order;
        if (time > 100 || time < 0) {
            order *= -1;
        }
    };
}
