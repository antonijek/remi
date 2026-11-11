// Zvukovi igre — prave se u samom pregledaču (Web Audio), bez fajlova i tuđih snimaka.
// Pregledač pušta zvuk tek posle prvog dodira ili klika, pa se zvuk tada "otključava".

const KEY = 'remi.sound'; // '0' = zvuk isključen
let ac = null;

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch (e) {
    console.error('Podešavanje zvuka se ne može pročitati:', e);
    return true;
  }
}

/** Vraća false ako izbor nije mogao da se zapamti (pregledač zabranjuje čuvanje). */
export function setSoundOn(on) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '0');
    return true;
  } catch (e) {
    console.error('Podešavanje zvuka se ne može sačuvati:', e);
    return false;
  }
}

function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume().catch(e => console.error('Zvuk se ne može pokrenuti:', e));
}
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });

/** Jedan ton: kratko uključivanje i meko gašenje (bez "pucketanja"). */
function tone(freq, start, dur, { type = 'sine', gain = 0.2 } = {}) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.03);
}

/** Kratak šum kroz filter — zvuči kao karta koja padne na sto. */
function swish(start, dur, gain, freq) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(start);
}

/**
 * card — odbačena karta; draw — vučena karta; deal — deljenje; meld — spuštena kombinacija;
 * turn — vi ste na potezu (online); win / end — kraj meča.
 */
export function playSound(kind) {
  if (!soundOn() || !ac || ac.state !== 'running') return;
  const t = ac.currentTime + 0.01;
  switch (kind) {
    case 'card':
      swish(t, 0.09, 0.45, 2600);
      break;
    case 'draw':
      swish(t, 0.07, 0.3, 3200);
      break;
    case 'deal':
      for (let i = 0; i < 8; i++) swish(t + i * 0.07, 0.06, 0.25, 2200 + Math.random() * 800);
      break;
    case 'meld':
      swish(t, 0.08, 0.4, 2400);
      swish(t + 0.09, 0.08, 0.4, 2800);
      tone(523, t + 0.12, 0.2, { type: 'triangle', gain: 0.12 });
      break;
    case 'turn':
      tone(660, t, 0.15, { gain: 0.15 });
      tone(880, t + 0.12, 0.25, { gain: 0.15 });
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, 0.4, { type: 'triangle', gain: 0.15 }));
      break;
    case 'end':
      tone(523, t, 0.28, { type: 'triangle', gain: 0.13 });
      tone(392, t + 0.22, 0.45, { type: 'triangle', gain: 0.13 });
      break;
  }
}
