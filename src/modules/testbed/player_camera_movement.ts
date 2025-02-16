//////////////////////////////////////////////////////////////////////////////
// Abstract Camera Controller
//////////////////////////////////////////////////////////////////////////////
// This class handles mouse panning and smoothly positions the camera on an
// orbit around the target mesh at a fixed distance. It sets the camera's

import { PointerEventTypes, Quaternion, Matrix, Vector3, ActionManager, ExecuteCodeAction } from "@babylonjs/core"

// rotationQuaternion so that its full orientation (including up) is available.
export class AbstractCameraController {
    constructor(targetMesh, camera, scene, options = {}) {
        this.targetMesh = targetMesh;
        this.camera = camera;
        this.scene = scene;
        this.desiredCameraDistance = options.desiredCameraDistance || 10;
        this.yaw = options.yaw || 0;
        this.pitch = options.pitch || 0;
        this.mouseSensitivity = options.mouseSensitivity || 0.005;
        this.smoothFactor = options.smoothFactor || 0.1;
        this.isPointerDown = false;
        this.prevPointerX = 0;
        this.prevPointerY = 0;

        // Clear the camera's default inputs.
        this.camera.inputs.clear();

        // Register pointer events for mouse panning.
        this.scene.onPointerObservable.add((pointerInfo) => {
            switch (pointerInfo.type) {
                case PointerEventTypes.POINTERDOWN:
                    this.isPointerDown = true;
                    this.prevPointerX = pointerInfo.event.clientX;
                    this.prevPointerY = pointerInfo.event.clientY;
                    break;
                case PointerEventTypes.POINTERUP:
                    this.isPointerDown = false;
                    break;
                case PointerEventTypes.POINTERMOVE:
                    if (this.isPointerDown) {
                        let deltaX = pointerInfo.event.clientX -
                            this.prevPointerX;
                        let deltaY = pointerInfo.event.clientY -
                            this.prevPointerY;
                        this.prevPointerX = pointerInfo.event.clientX;
                        this.prevPointerY = pointerInfo.event.clientY;
                        // Invert the axes so that mouse movement feels natural.
                        this.yaw += deltaX * this.mouseSensitivity;
                        this.pitch += deltaY * this.mouseSensitivity;
                        // Clamp the pitch to avoid pure 90° extremes (which can be problematic).
                        let pitchLimit = Math.PI / 2 - 0.01;
                        if (this.pitch > pitchLimit) this.pitch = pitchLimit;
                        if (this.pitch < -pitchLimit) this.pitch = -pitchLimit;
                    }
                    break;
            }
        });

        // Register the update function.
        this.scene.onBeforeRenderObservable.add(this.update.bind(this));
    }

    update() {
        // Build a rotation quaternion from yaw and pitch.
        let rotQuat = Quaternion.RotationYawPitchRoll(
            this.yaw,
            this.pitch,
            0,
        );
        // Set the camera's rotationQuaternion.
        this.camera.rotationQuaternion = rotQuat;
        let rotMat = new Matrix();
        rotQuat.toRotationMatrix(rotMat);
        // Compute an offset behind the target mesh.
        let baseOffset = new Vector3(0, 0, -this.desiredCameraDistance);
        let offset = Vector3.TransformCoordinates(baseOffset, rotMat);
        let desiredCameraPos = this.targetMesh.position.add(offset);
        // Smoothly interpolate the camera's position.
        this.camera.position = Vector3.Lerp(
            this.camera.position,
            desiredCameraPos,
            this.smoothFactor,
        );
        // Always look at the target mesh.
        this.camera.setTarget(this.targetMesh.position);
    }
}

//////////////////////////////////////////////////////////////////////////////
// Player Input Physics Simulator
//////////////////////////////////////////////////////////////////////////////
// This class handles keyboard input and physics-style acceleration, and it
// gradually rotates the player's mesh so that its forward face aligns with
// the input direction relative to the camera's current view (as given by its
// full rotation quaternion). In other words, if the user presses W, the mesh
// will eventually face the camera's forward direction; if D is pressed, it will
// face a direction 90° clockwise from that, etc.—with its top always matching
// the camera's effective up.
export class PlayerInputPhysicsSimulator {
    constructor(targetMesh, scene, camera, options = {}) {
        this.targetMesh = targetMesh;
        this.scene = scene;
        this.camera = camera;
        this.velocity = new Vector3(0, 0, 0);
        this.acceleration = options.acceleration || 0.02;
        this.deceleration = options.deceleration || 0.02;
        this.maxSpeed = options.maxSpeed || 0.2;
        this.rotationLerpFactor = options.rotationLerpFactor || 0.1;
        this.inputMap = {};

        // Ensure the scene has an ActionManager.
        if (!scene.actionManager) {
            scene.actionManager = new ActionManager(scene);
        }

        // Register keyboard events.
        scene.actionManager.registerAction(
            new ExecuteCodeAction(
                ActionManager.OnKeyDownTrigger,
                (evt) => {
                    this.inputMap[evt.sourceEvent.key] = true;
                },
            ),
        );
        scene.actionManager.registerAction(
            new ExecuteCodeAction(
                ActionManager.OnKeyUpTrigger,
                (evt) => {
                    this.inputMap[evt.sourceEvent.key] = false;
                },
            ),
        );

        // Register the update function.
        this.scene.onBeforeRenderObservable.add(this.update.bind(this));
    }

    update() {
        // Compute the camera's effective forward, up, and right vectors from its rotationQuaternion.
        let camRotMat = new Matrix();
        this.camera.rotationQuaternion.toRotationMatrix(camRotMat);
        let camForward = Vector3.TransformCoordinates(
            new Vector3(0, 0, 1),
            camRotMat,
        ).normalize();
        let camUp = Vector3.TransformCoordinates(
            new Vector3(0, 1, 0),
            camRotMat,
        ).normalize();
        // Compute right as cross of up and forward (this gives a vector 90° relative to both, consistent with the camera's orientation).
        let camRight = Vector3.Cross(camUp, camForward).normalize();

        // Determine input direction relative to the camera's viewport.
        let inputDir = Vector3.Zero();
        if (
            this.inputMap["ArrowUp"] || this.inputMap["w"] || this.inputMap["W"]
        ) {
            inputDir.addInPlace(camForward);
        }
        if (
            this.inputMap["ArrowDown"] || this.inputMap["s"] ||
            this.inputMap["S"]
        ) {
            inputDir.subtractInPlace(camForward);
        }
        if (
            this.inputMap["ArrowRight"] || this.inputMap["d"] ||
            this.inputMap["D"]
        ) {
            inputDir.addInPlace(camRight);
        }
        if (
            this.inputMap["ArrowLeft"] || this.inputMap["a"] ||
            this.inputMap["A"]
        ) {
            inputDir.subtractInPlace(camRight);
        }

        if (inputDir.length() > 0) {
            inputDir.normalize();
            // Compute the target orientation based on the input direction and the camera's effective up.
            let targetQuat = Quaternion.FromLookDirectionLH(
                inputDir,
                camUp,
            );
            if (!this.targetMesh.rotationQuaternion) {
                this.targetMesh.rotationQuaternion = Quaternion
                    .Identity();
            }
            // Gradually slerp the player's rotation toward the target.
            this.targetMesh.rotationQuaternion = Quaternion.Slerp(
                this.targetMesh.rotationQuaternion,
                targetQuat,
                this.rotationLerpFactor,
            );
            // Accelerate in the input direction.
            this.velocity.addInPlace(inputDir.scale(this.acceleration));
        } else {
            // Apply deceleration when no input is active.
            this.velocity.scaleInPlace(1 - this.deceleration);
        }

        // Clamp the velocity to the maximum speed.
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity = this.velocity.normalize().scale(this.maxSpeed);
        }
        // Update the player's position.
        this.targetMesh.position.addInPlace(this.velocity);
    }
}
