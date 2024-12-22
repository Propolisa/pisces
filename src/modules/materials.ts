import {
    Material,
    MaterialPluginBase,
    ShaderLanguage,
    Vector3,
} from "@babylonjs/core";

export class UnderseaFogPluginMaterial extends MaterialPluginBase {
    constructor(material: Material) {
        // last parameter is a priority, which lets you define the order multiple plugins are run.
        super(material, "UnderseaFog", 200, { "UnderseaFog": false }, true);

        // let's enable it by default
        this.isEnabled = false;
    }

    static fogCenter = new Vector3(1, 1, 0);

    get isEnabled() {
        return this._isEnabled;
    }

    set isEnabled(enabled) {
        if (this._isEnabled === enabled) {
            return;
        }
        this._isEnabled = enabled;
        this.markAllDefinesAsDirty();
        this._enable(this._isEnabled);
    }

    _isEnabled = false;

    // Also, you should always associate a define with your plugin because the list of defines (and their values)
    // is what triggers a recompilation of the shader: a shader is recompiled only if a value of a define changes.
    prepareDefines(defines, scene, mesh) {
        defines["UnderseaFog"] = this._isEnabled;
    }

    getClassName() {
        return "UnderseaFogPluginMaterial";
    }

    getUniforms() {
        return {
            "ubo": [
                { name: "fogCenter", size: 3, type: "vec3" },
            ],
        };
    }

    bindForSubMesh(uniformBuffer, scene, engine, subMesh) {
        if (this._isEnabled) {
            uniformBuffer.updateVector3(
                "fogCenter",
                UnderseaFogPluginMaterial.fogCenter,
            );
        }
    }

    // This is used to inform the system which language is supported
    isCompatible(shaderLanguage) {
        switch (shaderLanguage) {
            case ShaderLanguage.GLSL:
            case ShaderLanguage.WGSL:
                return true;
            default:
                return false;
        }
    }

    getCustomCode(shaderType, shaderLanguage) {
        if (shaderType === "vertex") {
            if (shaderLanguage === ShaderLanguage.WGSL) {
                return {
                    CUSTOM_VERTEX_DEFINITIONS: `varying vFogDistance: vec3f;`,
                    CUSTOM_VERTEX_MAIN_END: `
                   vertexOutputs.vFogDistance = (scene.view * worldPos).xyz;
                //    vertexOutputs.position =  scene.viewProjection * mesh.world * vec4<f32>(vertexInputs.position, 1.0);
               `,
                };
            }
        }
        if (shaderType === "fragment") {
            // we're adding this specific code at the end of the main() function
            if (shaderLanguage === ShaderLanguage.WGSL) {
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                   // Global constants for fog colors
const FOG_COLOR: vec3<f32> = vec3<f32>(0.0, 0.39, 0.62); // Fog base color

// Function to apply fog based on distance
fn apply_fog(original_color: vec3<f32>, distance: f32) -> vec3<f32> {
   // Calculate fog intensity
   let fog_intensity = clamp(distance / 700.0, 0.0, 1.0);

   // Mix original color with fog color based on intensity
   return mix(original_color, FOG_COLOR, fog_intensity);
}

               `,

                    CUSTOM_FRAGMENT_MAIN_END: `
                           var d = length(uniforms.fogCenter - fragmentInputs.vFogDistance);
                           // d = (20.0 - d)/5.0;
                           var cColor = vec4f(apply_fog(fragmentOutputs.color.xyz, d),1.);
                           fragmentOutputs.color = cColor;
                       `,
                };
            }

           
        }
        // for other shader types we're not doing anything, return null
        return null;
    }
}
