const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function getWaveComposition(turn: number, threatLevel: number) {
  let text = 'Scouts';
  let scout = 0;
  let warrior = 0;
  let brute = 0;

  let region = '';
  let t = 0;
  if (turn === 1) { region = 'start'; t = 0; }
  else if (turn <= 12) { region = 'early'; t = (turn - 2) / 10; }
  else if (turn <= 28) { region = 'mid'; t = (turn - 13) / 15; }
  else if (turn <= 39) { region = 'end'; t = (turn - 29) / 10; }
  else { region = 'final'; t = 1; }

  // Clamp threatLevel for the generic patterns
  const tl = Math.min(threatLevel, 3);
  
  if (tl === 0) {
    if (region === 'start') { scout = 0.5; }
    else if (region === 'early') { scout = lerp(0.5, 1.0, t); }
    else if (region === 'mid') { scout = lerp(1.0, 1.5, t); }
    else if (region === 'end') { scout = lerp(1.5, 0.0, t); warrior = lerp(0.0, 1.5, t); }
    else { warrior = 3.0; }
  } else if (tl === 1) {
    if (region === 'start') { scout = 0.8; }
    else if (region === 'early') { scout = lerp(0.8, 1.2, t); warrior = lerp(0.0, 0.5, t); }
    else if (region === 'mid') { scout = lerp(1.2, 1.5, t); warrior = lerp(0.5, 1.0, t); }
    else if (region === 'end') { scout = lerp(1.5, 0.0, t); warrior = lerp(1.0, 2.0, t); }
    else { warrior = 3.0; brute = 1.0; }
  } else if (tl === 2) {
    if (region === 'start') { scout = 1.0; warrior = 0.5; }
    else if (region === 'early') { scout = lerp(1.0, 1.5, t); warrior = lerp(0.5, 1.5, t); }
    else if (region === 'mid') { scout = lerp(1.5, 2.0, t); warrior = lerp(1.5, 2.0, t); }
    else if (region === 'end') { scout = lerp(2.0, 0.0, t); warrior = 2.0; brute = lerp(0.0, 0.5, t); }
    else { warrior = 3.0; brute = 1.5; }
  } else {
    if (region === 'start') { scout = 1.5; warrior = 1.0; brute = 0.2; }
    else if (region === 'early') { scout = lerp(1.5, 2.0, t); warrior = lerp(1.0, 1.5, t); brute = lerp(0.2, 0.5, t); }
    else if (region === 'mid') { scout = lerp(2.0, 0.0, t); warrior = lerp(1.5, 2.0, t); brute = lerp(0.5, 1.0, t); }
    else if (region === 'end') { warrior = lerp(2.0, 0.0, t); brute = lerp(1.0, 2.0, t); }
    else { brute = 3.0; }
  }

  if (brute > 0 && warrior > 0 && scout > 0) text = 'Scouts, Warriors, Brutes';
  else if (brute > 0 && warrior > 0) text = 'Warriors, Brutes';
  else if (brute > 0) text = 'Massive Brute Swarm';
  else if (warrior > 0 && scout > 0) text = 'Scouts, Warriors';
  else if (warrior > 0) text = 'Warriors';
  else text = 'Scouts';

  scout *= 2;

  return { scout, warrior, brute, text };
}
