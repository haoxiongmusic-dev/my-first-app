// What `npm run build:three` bundles into templates/shared/three-kit.js: three.js plus the
// add-ons templates use. Add an export here (then rebuild and `npm run sync:toolkit`) when a
// template needs another add-on.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoomEnvironment };
