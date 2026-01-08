import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

window.THREE = THREE;
window.OrbitControls = OrbitControls;

await import("./script.js");
