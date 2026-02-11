export type EmotionName = "neutral" | "happy" | "angry" | "sad" | "surprised";

export const emotionPresets: Record<EmotionName, Record<string, number>> = {
  neutral: { happy: 0, angry: 0, sad: 0, surprised: 0 },
  happy: { happy: 1, angry: 0, sad: 0, surprised: 0 },
  angry: { happy: 0, angry: 1, sad: 0, surprised: 0 },
  sad: { happy: 0, angry: 0, sad: 1, surprised: 0 },
  surprised: { happy: 0, angry: 0, sad: 0, surprised: 1 },
};
