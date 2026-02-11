import * as THREE from "three";

type PoseConfig = {
    // Shoulder rotation (radians)
    shoulderDown: number; // lowers arms (prevents "Y" pose)
    shoulderOut: number;  // slight outwards A-pose

    // Elbow / wrist (radians)
    elbowBend: number;
    wristBend: number;
};

const DEFAULT_CONFIG: PoseConfig = {
    shoulderDown: 0.75, // try 0.6 - 1.0
    shoulderOut: 0.25,  // try 0.15 - 0.4
    elbowBend: 0.35,
    wristBend: 0.15,
};

export class PoseController {
    private vrm: any;
    private config: PoseConfig;
    private isEnabled = true;

    // Cache rest pose quaternions so we apply offsets additively
    private rest = new Map<string, THREE.Quaternion>();

    constructor(vrm: any, config: Partial<PoseConfig> = {}) {
        this.vrm = vrm;
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Cache rest pose once VRM exists
        this.cacheRestPose();
    }

    public update(_dt: number) {
        if (!this.isEnabled || !this.vrm?.humanoid) return;
        this.applyAPose();
    }

    public enable() {
        this.isEnabled = true;
    }
    public disable() {
        this.isEnabled = false;
    }
    public setConfig(config: Partial<PoseConfig>) {
        Object.assign(this.config, config);
    }

    private cacheRestPose() {
        const humanoid = this.vrm?.humanoid;
        if (!humanoid?.getNormalizedBoneNode) return;

        const bones = [
            "leftUpperArm",
            "rightUpperArm",
            "leftLowerArm",
            "rightLowerArm",
            "leftHand",
            "rightHand",
        ];

        for (const name of bones) {
            const bone = humanoid.getNormalizedBoneNode(name);
            if (bone) this.rest.set(name, bone.quaternion.clone());
        }
    }

    private applyAPose() {
        const humanoid = this.vrm.humanoid;

        // Tune these
        const lower = 0.85;    // how much to bring arms DOWN (0.5–1.1)
        const out = 0.20;      // small outward A-pose flare (0.05–0.35)
        const elbow = 0.35;    // elbow bend
        const wrist = 0.12;    // wrist bend

        // ✅ Upper arms:
        // Z lowers/raises on your rig, but signs must be flipped from your first attempt.
        // Add a small "out" on X to keep it A-pose-ish.
        this.applyOffset(humanoid, "leftUpperArm", out, 0, -lower);
        this.applyOffset(humanoid, "rightUpperArm", -out, 0, lower);

        // ✅ Elbows: bend on X (usually correct)
        this.applyOffset(humanoid, "leftLowerArm", -elbow, 0, 0);
        this.applyOffset(humanoid, "rightLowerArm", -elbow, 0, 0);

        // ✅ Wrists (optional)
        this.applyOffset(humanoid, "leftHand", 0, wrist, 0);
        this.applyOffset(humanoid, "rightHand", 0, -wrist, 0);
    }

    private applyOffset(
        humanoid: any,
        boneName: string,
        x: number,
        y: number,
        z: number
    ) {
        const bone = humanoid.getNormalizedBoneNode(boneName);
        if (!bone) return;

        // If rest wasn't cached (hot reload / late init), cache lazily
        if (!this.rest.has(boneName)) this.rest.set(boneName, bone.quaternion.clone());

        const base = this.rest.get(boneName)!;

        const offsetQ = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(x, y, z, "XYZ")
        );

        bone.quaternion.copy(base).multiply(offsetQ);
    }
}
