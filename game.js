import { RaceEngine, RACE_CONFIG } from './racing-engine.js';

const $ = id => document.getElementById(id);
const engine = new RaceEngine();
const game = $('game');
const music = $('music');
const voice = $('voice');
const raceSound = $('race-sound');
const soundFiles = { motor: 'assets/music/motor_sound.mp3', crash: 'assets/music/crash_sound.mp3', cheer: 'assets/music/cheer.mp3' };
const nodes = new Map();
const activePhases = ['instructions', 'countdown', 'racing', 'finishing'];
let lastPhase = 'intro';
let paused = false;
let muted = false;
let giftTaps = 0;
let giftTimer;
let rewardIndex = 0;
let rewardVisible = false;
let resumeMusicAfterVoice = false;
let lastFrame = null;
let countdownSpoken = -1;

music.volume = 0.65;
voice.volume = 1;
raceSound.volume = 0.32;
raceSound.preservesPitch = false;

function updateMotorSpeed() {
  if (raceSound.dataset.effect !== 'motor') return;
  const progress = Math.max(0, Math.min(1, (engine.speed - RACE_CONFIG.startSpeed) / (RACE_CONFIG.maxSpeed - RACE_CONFIG.startSpeed)));
  raceSound.playbackRate = 1 + progress * 0.45;
}

function playRaceSound(effect) {
  if (document.hidden || (effect === 'motor' && paused)) return;
  if (raceSound.dataset.effect !== effect) {
    raceSound.pause();
    raceSound.src = soundFiles[effect];
    raceSound.dataset.effect = effect;
  }
  raceSound.loop = effect === 'motor';
  raceSound.volume = effect === 'motor' ? 0.32 : effect === 'cheer' ? 0.75 : 0.85;
  raceSound.muted = muted;
  if (effect === 'motor') updateMotorSpeed();
  else { raceSound.playbackRate = 1; raceSound.currentTime = 0; }
  // Reuse the engine's unlocked media element for crash and finish effects.
  if (raceSound.paused) raceSound.play().catch(() => {});
}

function announce(message) { $('announcement').textContent = message; }
function show(id, visible) { $(id).hidden = !visible; }

function updateMusicUI() {
  const playing = !music.paused && !music.ended;
  $('disk-button').classList.toggle('playing', playing);
  $('music-toggle').classList.toggle('playing', playing);
  $('music-label').textContent = playing ? 'Pause song' : 'Play song';
  $('music-symbol').textContent = playing ? 'Ⅱ' : '▶';
  $('disk-button').setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} Mundo`);
}

async function playMusic() {
  if (!voice.paused) voice.pause();
  if (raceSound.dataset.effect === 'cheer') raceSound.pause();
  try { await music.play(); } catch { announce('Tap the record to play Mundo.'); }
  updateMusicUI();
}

function toggleMusic() {
  if (music.paused) playMusic();
  else music.pause();
}

function updateVoiceUI() {
  const playing = !voice.paused && !voice.ended;
  $('voice-image').src = `assets/ui/${playing ? 'playing' : 'play'}.png`;
  $('voice-image').alt = playing ? 'Playing' : 'Play';
  $('voice-toggle').setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} For my ali`);
  $('voice-toggle').setAttribute('aria-pressed', String(playing));
  $('voice-caption').textContent = playing ? 'Playing your message ♡' : voice.ended ? 'Play your message again ♡' : voice.currentTime > 0 ? 'Message paused · Tap to continue' : 'For my Ali · Tap play to listen';
}

async function toggleVoice() {
  if (!voice.paused) { voice.pause(); return; }
  if (voice.ended) voice.currentTime = 0;
  resumeMusicAfterVoice = resumeMusicAfterVoice || !music.paused;
  music.pause();
  try { await voice.play(); } catch { announce('The recording could not start. Tap play to try again.'); }
}

function muteAudio() {
  muted = !muted;
  music.muted = muted;
  voice.muted = muted;
  raceSound.muted = muted;
  if (!muted && !paused && activePhases.includes(engine.phase)) playRaceSound('motor');
  $('sound').setAttribute('aria-pressed', String(muted));
  $('sound').setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
  $('sound-icon').innerHTML = muted
    ? '<path d="m11 5-6 5H2v4h3l6 5V5Zm5 4 6 6m0-6-6 6"/>'
    : '<path d="m11 5-6 5H2v4h3l6 5V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>';
}

function resetAudio() {
  music.pause();
  voice.pause();
  raceSound.pause();
  music.currentTime = 0;
  voice.currentTime = 0;
  raceSound.currentTime = 0;
  resumeMusicAfterVoice = false;
}

function beginRide() {
  clearTimeout(giftTimer);
  paused = false;
  rewardVisible = false;
  giftTaps = 0;
  show('pause-screen', false);
  show('rewards', false);
  $('gift').disabled = false;
  $('gift-image').src = 'assets/sprites/gift_close.png';
  $('gift-caption').textContent = 'Tap the gift 3 times to open';
  $('gift').setAttribute('aria-label', 'Tap gift, 3 taps to open');
  [...$('gift-dots').children].forEach(dot => dot.classList.remove('filled'));
  if ($('letter-dialog').open) $('letter-dialog').close();
  resetAudio();
  engine.start();
  setPhase(engine.phase, true);
  lastFrame = null;
  $('close-instructions').focus({preventScroll: true});
}

function goHome() {
  clearTimeout(giftTimer);
  resetAudio();
  paused = false;
  rewardVisible = false;
  engine.phase = 'intro';
  show('rewards', false);
  show('pause-screen', false);
  setPhase('intro', true);
  $('start').focus({preventScroll: true});
}

function setPhase(phase, force = false) {
  if (!force && phase === lastPhase) return;
  lastPhase = phase;
  game.dataset.phase = phase;
  const active = activePhases.includes(phase);
  if (active) playRaceSound('motor');
  else if (phase === 'lost') playRaceSound('crash');
  else if (phase === 'won') playRaceSound('cheer');
  else raceSound.pause();
  show('intro', phase === 'intro');
  show('hud', active);
  show('world', active || phase === 'lost');
  show('instructions', phase === 'instructions');
  show('countdown', phase === 'countdown');
  show('controls', active && phase !== 'finishing');
  show('pause', active);
  show('lost', phase === 'lost');
  show('gift-screen', phase === 'won' && !rewardVisible);
  show('finish', phase === 'finishing');
  $('rider').classList.toggle('crashed', phase === 'lost');
  $('race-status').textContent = {
    instructions: 'The road is yours. Get to know your controls.',
    countdown: 'A few seconds to find your lane.',
    racing: 'Stay clear. Your surprise is waiting.',
    finishing: '520! Here comes your finish line.',
  }[phase] || '';
  if (phase === 'countdown') countdownSpoken = -1;
  if (phase === 'racing') announce('Go! Avoid obstacles and reach 520 points.');
  if (phase === 'finishing') announce('520 points! You made it to the finish line.');
  if (phase === 'lost') {
    $('final-score').textContent = engine.score;
    announce(`Game over. You scored ${engine.score} out of 520. Try again.`);
    $('retry').focus({preventScroll: true});
  }
  if (phase === 'won') {
    announce('Congratulations! Tap the gift three times to open your surprise.');
    $('gift').focus({preventScroll: true});
  }
}

function render() {
  setPhase(engine.phase);
  $('score').textContent = String(engine.score).padStart(3, '0');
  $('progress').style.width = `${engine.score / RACE_CONFIG.goal * 100}%`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', String(engine.score));
  const roadOffset = -(engine.roadDistance * 0.65) % 400;
  $('road').style.backgroundPositionX = `${roadOffset / 400 * game.clientWidth}px`;
  if (activePhases.includes(engine.phase)) updateMotorSpeed();
  $('rider').style.left = '7%';
  $('rider').style.width = `${RACE_CONFIG.riderWidth / RACE_CONFIG.width * 100}%`;
  $('rider').style.height = `${RACE_CONFIG.riderHeight / RACE_CONFIG.height * 100}%`;
  $('rider').style.top = `${engine.riderY * 100}%`;
  $('rider').style.transform = `translateY(-100%)${engine.phase === 'lost' ? ' rotate(-8deg)' : ''}`;
  $('rider').style.zIndex = String(Math.round(engine.riderY * 1000));
  if (engine.phase === 'countdown') {
    const count = Math.max(1, Math.ceil(engine.countdown));
    $('countdown-value').textContent = count;
    if (count !== countdownSpoken) { announce(`Get ready. ${count}`); countdownSpoken = count; }
  }
  if (engine.phase === 'finishing') {
    $('finish').style.left = `${(engine.finishX - 200) / 4}%`;
  }
  const visibleIds = new Set();
  for (const obstacle of engine.obstacles) {
    visibleIds.add(obstacle.id);
    let node = nodes.get(obstacle.id);
    if (!node) {
      node = document.createElement('img');
      const cropped = ['broken_car','hole'].includes(obstacle.type);
      node.src = `assets/${cropped ? 'sprites' : 'obstacles'}/${obstacle.type}.${cropped ? 'png' : 'gif'}`;
      node.alt = '';
      node.className = 'obstacle';
      $('traffic').append(node);
      nodes.set(obstacle.id, node);
    }
    node.style.left = `${obstacle.x / 4}%`;
    node.style.width = `${obstacle.width / 4}%`;
    node.style.height = 'auto';
    node.style.objectFit = 'contain';
    node.style.top = `${obstacle.baseline * 100}%`;
    node.style.transform = 'translateY(-100%)';
    node.style.zIndex = String(Math.round(obstacle.baseline * 1000));
  }
  for (const [id, node] of nodes) {
    if (!visibleIds.has(id)) { node.remove(); nodes.delete(id); }
  }
}

function frame(timestamp) {
  if (lastFrame !== null && !paused && !document.hidden) {
    // A delayed frame must not send a returning player through unseen traffic.
    engine.tick(Math.min((timestamp - lastFrame) / 1000, 0.1));
  }
  lastFrame = timestamp;
  render();
  requestAnimationFrame(frame);
}

function setPaused(value) {
  if (!activePhases.includes(engine.phase)) return;
  paused = value;
  if (value) raceSound.pause();
  else playRaceSound('motor');
  show('pause-screen', value);
  $('pause').setAttribute('aria-label', value ? 'Race paused' : 'Pause race');
  lastFrame = null;
  if (value) { announce('Race paused.'); $('resume').focus({preventScroll: true}); }
  else { announce('Keep riding!'); $('up').focus({preventScroll: true}); }
}

function move(direction) {
  if (paused || $('letter-dialog').open) return;
  engine.move(direction);
}

for (const [id, direction] of [['up', -1], ['down', 1]]) {
  const button = $(id);
  const image = button.querySelector('img');
  const base = `assets/ui/button_${id}`;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    image.src = `${base}_pressed.png`;
    move(direction);
  });
  const release = () => { image.src = `${base}.png`; };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('click', event => { if (event.detail === 0) move(direction); });
}

$('start').addEventListener('click', beginRide);
$('retry').addEventListener('click', beginRide);
$('ride-again').addEventListener('click', beginRide);
$('pause-restart').addEventListener('click', beginRide);
document.querySelectorAll('.home-button').forEach(button => button.addEventListener('click', goHome));
$('close-instructions').addEventListener('click', () => { engine.closeInstructions(); setPhase(engine.phase); $('up').focus({preventScroll:true}); });
$('pause').addEventListener('click', () => setPaused(true));
$('resume').addEventListener('click', () => setPaused(false));
$('sound').addEventListener('click', muteAudio);
$('disk-button').addEventListener('click', toggleMusic);
$('music-toggle').addEventListener('click', toggleMusic);
$('voice-toggle').addEventListener('click', toggleVoice);
music.addEventListener('play', updateMusicUI);
music.addEventListener('pause', updateMusicUI);
voice.addEventListener('play', updateVoiceUI);
voice.addEventListener('pause', updateVoiceUI);
voice.addEventListener('ended', () => { updateVoiceUI(); if (resumeMusicAfterVoice) { resumeMusicAfterVoice = false; playMusic(); } });
music.addEventListener('error', () => announce('Mundo could not load. Check your connection and tap the record to try again.'));
voice.addEventListener('error', () => announce('The recording could not load. Check your connection and try again.'));

function selectReward(index, focus = false) {
  rewardIndex = Math.max(0, Math.min(2, index));
  document.querySelectorAll('[data-reward]').forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === rewardIndex));
    tab.tabIndex = i === rewardIndex ? 0 : -1;
    show(`reward-${i}`, i === rewardIndex);
  });
  $('next-reward').innerHTML = rewardIndex === 2 ? 'Back to the song <span aria-hidden="true">↺</span>' : 'Next surprise <span aria-hidden="true">→</span>';
  if (focus) $(`tab-${rewardIndex}`).focus({preventScroll: true});
}

document.querySelectorAll('[data-reward]').forEach(tab => {
  tab.addEventListener('click', () => selectReward(Number(tab.dataset.reward)));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (rewardIndex + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    selectReward(target, true);
  });
});
$('next-reward').addEventListener('click', () => selectReward((rewardIndex + 1) % 3));

$('gift').addEventListener('click', () => {
  if (engine.phase !== 'won' || giftTaps >= 3) return;
  giftTaps++;
  [...$('gift-dots').children].forEach((dot, i) => dot.classList.toggle('filled', i < giftTaps));
  $('gift').classList.remove('bump');
  void $('gift').offsetWidth;
  $('gift').classList.add('bump');
  const remaining = 3 - giftTaps;
  $('gift-caption').textContent = remaining ? `${remaining} more ${remaining === 1 ? 'tap' : 'taps'}…` : 'This is for you, Ali. ♡';
  $('gift').setAttribute('aria-label', remaining ? `Tap gift, ${remaining} more ${remaining === 1 ? 'tap' : 'taps'} to open` : 'Gift opened');
  announce(remaining ? `${remaining} more ${remaining === 1 ? 'tap' : 'taps'} to open.` : 'Gift opened! Your surprises are ready.');
  if (remaining === 0) {
    $('gift').disabled = true;
    $('gift-image').src = 'assets/sprites/gift_open.png';
    playMusic(); // The third tap provides the browser's required audio gesture.
    giftTimer = setTimeout(() => {
      rewardVisible = true;
      show('gift-screen', false);
      show('rewards', true);
      selectReward(0);
      $('tab-0').focus({preventScroll: true});
    }, 950);
  }
});

function openLetter() {
  $('letter-dialog').showModal();
  document.querySelector('.letter-scroll').scrollTop = 0;
  $('close-letter').focus({preventScroll: true});
}
$('envelope').addEventListener('click', openLetter);
$('open-letter').addEventListener('click', openLetter);
$('close-letter').addEventListener('click', () => $('letter-dialog').close());
$('letter-dialog').addEventListener('close', () => {
  voice.pause();
  if (resumeMusicAfterVoice) { resumeMusicAfterVoice = false; playMusic(); }
  if (rewardVisible) $('envelope').focus({preventScroll: true});
});

document.addEventListener('keydown', event => {
  if ($('letter-dialog').open) return;
  if (['ArrowUp','ArrowDown','w','s','W','S'].includes(event.key) && activePhases.includes(engine.phase)) {
    event.preventDefault();
    move(['ArrowUp','w','W'].includes(event.key) ? -1 : 1);
  }
  if (event.key === 'Escape' && activePhases.includes(engine.phase)) { event.preventDefault(); setPaused(!paused); }
});
document.addEventListener('visibilitychange', () => {
  lastFrame = null;
  if (document.hidden && activePhases.includes(engine.phase)) setPaused(true);
  if (document.hidden && !voice.paused) voice.pause();
  if (document.hidden) raceSound.pause();
});
window.addEventListener('pagehide', () => raceSound.pause());
window.addEventListener('blur', () => { if (activePhases.includes(engine.phase) && !paused) setPaused(true); });

const preloadFiles = ['assets/background/road.png','assets/big_bike/meric_bike_moving.gif',
  ...['white_car','red_car','truck'].map(name => `assets/obstacles/${name}.gif`),
  ...['broken_car','hole','gift_close','gift_open','disk','letter','letter_for_ali','jabi'].map(name => `assets/sprites/${name}.png`),
  ...['button_up_pressed','button_down_pressed'].map(name => `assets/ui/${name}.png`)];
async function preload() {
  const results = await Promise.allSettled(preloadFiles.map(src => new Promise((resolve,reject) => {
    const image = new Image(); image.onload = resolve; image.onerror = () => reject(src); image.src = src;
  })));
  const missing = results.filter(result => result.status === 'rejected');
  if (missing.length) {
    $('loading').textContent = 'Some art couldn’t load. Tap here to retry.';
    $('loading').style.cursor = 'pointer';
    $('loading').onclick = preload;
    return;
  }
  $('start').disabled = false;
  $('loading').textContent = 'DODGE TRAFFIC · REACH 520 · UNWRAP';
  $('loading').onclick = null;
}

preload();
updateMusicUI();
requestAnimationFrame(frame);
