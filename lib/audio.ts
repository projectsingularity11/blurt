import { Howl } from "howler";
type Cue = "click" | "success" | "miss" | "reveal" | "pop";
// Premade rubberduck CC0 recordings from pingthings' professional Serene Tones pack.
const files: Record<Cue, string> = {
  click: "soft-tone-1",
  success: "chime-1",
  miss: "soft-tone-3",
  reveal: "soft-tone-2",
  pop: "soft-tone-1",
};
const volume: Record<Cue, number> = {
  click: 0.045,
  success: 0.13,
  miss: 0.07,
  reveal: 0.065,
  pop: 0.085,
};
const sounds = new Map<Cue, Howl>();
let last = 0;
export function playCue(cue: Cue = "success") {
  if (
    typeof window === "undefined" ||
    localStorage.getItem("blurt-sound") === "off"
  )
    return;
  if (cue === "click" && performance.now() - last < 100) return;
  last = performance.now();
  let sound = sounds.get(cue);
  if (!sound) {
    sound = new Howl({
      src: [
        `/sounds/professional/${files[cue]}.ogg`,
        `/sounds/professional/${files[cue]}.mp3`,
      ],
      volume: volume[cue],
      preload: true,
    });
    sounds.set(cue, sound);
  }
  if (sound.playing()) sound.stop();
  sound.play();
}
