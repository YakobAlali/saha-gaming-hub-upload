const patterns = {
  roll: [[220,0,.045],[310,.065,.055],[170,.13,.07],[465,.205,.08]],
  draw: [[420,0,.05],[280,.05,.09]], card: [[350,0,.07],[630,.028,.055]],
  move: [[420,0,.07],[270,.065,.065]], tile: [[244,0,.065],[460,.036,.07]],
  hop: [[350,0,.075],[520,.085,.085]], capture: [[610,0,.075],[285,.075,.13]],
  home: [[450,0,.10],[600,.10,.10],[850,.20,.14]], turn: [[510,0,.075],[720,.095,.10]],
  warning: [[440,0,.07],[370,.105,.09]], special: [[330,0,.075],[495,.07,.10],[660,.16,.12]],
  win: [[392,0,.13],[494,.11,.13],[587,.22,.13],[784,.34,.25]],
  loss: [[523,0,.12],[392,.12,.13],[262,.23,.22]]
};

export function createSound({ getMuted, setMuted }) {
  let context;
  function enable() {
    if (getMuted()) return;
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) return;
    try {
      context ??= new Audio();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* The browser may disable audio for this device. */ }
  }
  function play(type) {
    if (getMuted() || context?.state !== 'running') return;
    const pattern = patterns[type];
    if (!pattern) return;
    const start = context.currentTime + .02;
    for (const [frequency,offset,duration] of pattern) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = ['tile','roll','card'].includes(type) ? 'triangle' : 'sine';
      const at = start + offset;
      osc.frequency.setValueAtTime(frequency,at);
      if (['card','move','roll','draw','tile'].includes(type)) osc.frequency.exponentialRampToValueAtTime(frequency*.62,at+duration);
      gain.gain.setValueAtTime(.0001,at);
      gain.gain.exponentialRampToValueAtTime(type === 'warning' ? .042 : .065,at+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(at);
      osc.stop(at+duration+.01);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
  function toggle() {
    const mute = !getMuted();
    setMuted(mute);
    if (mute) context?.suspend().catch(() => {});
    else { enable(); context?.resume().then(() => play('turn')).catch(() => {}); }
  }
  return { enable,play,toggle };
}
