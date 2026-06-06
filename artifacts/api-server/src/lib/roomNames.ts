const adjectives = [
  "swift", "quiet", "bold", "bright", "calm", "clever", "crisp", "deep", "deft", "eager",
  "faint", "grand", "keen", "light", "lofty", "noble", "prime", "sharp", "sleek", "smart",
  "stark", "tidy", "vivid", "warm", "wide", "wise", "zeal", "azure", "coral", "golden",
];

const nouns = [
  "canvas", "studio", "atelier", "board", "sketch", "draft", "frame", "panel", "space", "zone",
  "haven", "nexus", "forge", "lab", "arena", "hub", "deck", "grid", "map", "plan",
];

export function generateRoomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}
