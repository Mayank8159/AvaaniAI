import { VRM } from "@pixiv/three-vrm";
import { EmotionName, emotionPresets } from "./emotionPresets";

export class EmotionController {
  private vrm: VRM;
  private targets: Record<string, number> = {};
  private current: Record<string, number> = {};

  constructor(vrm: VRM) {
    this.vrm = vrm;
  }

  setEmotion(name: EmotionName) {
    this.targets = { ...emotionPresets[name] };
  }

  // smooth update
  update(dt: number) {
    const speed = 6; // higher = snappier
    const k = 1 - Math.exp(-speed * dt);

    // blend emotion keys
    for (const key of Object.keys(this.targets)) {
      const from = this.current[key] ?? 0;
      const to = this.targets[key] ?? 0;
      const next = from + (to - from) * k;
      this.current[key] = next;

      // Try multiple common expression keys (VRM models vary)
      this.vrm.expressionManager?.setValue(key, next);
      this.vrm.expressionManager?.setValue(key[0].toUpperCase() + key.slice(1), next);
    }
  }

  blink(value: number) {
    this.vrm.expressionManager?.setValue("blink", value);
    this.vrm.expressionManager?.setValue("Blink", value);
    this.vrm.expressionManager?.setValue("blinkLeft", value);
    this.vrm.expressionManager?.setValue("blinkRight", value);
  }
}
