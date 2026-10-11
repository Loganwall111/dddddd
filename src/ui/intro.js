/**
 * THE MULTIVERSE — ui/intro.js
 * ==================================================================
 * The opening, as the *player* experiences it: letterboxed frames, title
 * cards, lower-thirds, and the Archivist's commentary typed across the
 * bottom of the screen while the pictures run behind.
 *
 * The sequence is data-driven from lore.PROLOGUE and engine/text.INTRO so
 * that the timeline and the words can be edited independently of the code.
 */
import { INTRO } from '../engine/text.js';
import { PROLOGUE } from '../lore.js';
import { clamp01 } from '../core/math.js';

export class IntroSequence {
  constructor({ root, audio = null, onPhase = null, onComplete = null, onCard = null } = {}) {
    this.root = root;
    this.audio = audio;
    this.onPhase = onPhase;
    this.onComplete = onComplete;
    this.onCard = onCard;
    this.time = 0;
    this.playing = false;
    this.finished = false;
    this.phaseIndex = -1;
    this.beatIndex = -1;
    this.cardIndex = -1;
    this.skippable = true;
    this.spokenIndex = -1;
    this.build();
  }

  build() {
    this.layer = document.createElement('div');
    this.layer.className = 'intro-layer';
    this.root.appendChild(this.layer);

    this.letterboxTop = document.createElement('div');
    this.letterboxTop.className = 'intro-bar intro-bar-top';
    this.letterboxBottom = document.createElement('div');
    this.letterboxBottom.className = 'intro-bar intro-bar-bottom';
    this.layer.append(this.letterboxTop, this.letterboxBottom);

    this.card = document.createElement('div');
    this.card.className = 'intro-card';
    this.layer.appendChild(this.card);

    this.lower = document.createElement('div');
    this.lower.className = 'intro-lower';
    this.layer.appendChild(this.lower);

    this.caption = document.createElement('div');
    this.caption.className = 'intro-caption';
    this.layer.appendChild(this.caption);

    this.skip = document.createElement('button');
    this.skip.className = 'intro-skip';
    this.skip.type = 'button';
    this.skip.textContent = 'PRESS ANY KEY TO SKIP';
    this.skip.addEventListener('click', () => this.finish());
    this.layer.appendChild(this.skip);

    this.progressBar = document.createElement('div');
    this.progressBar.className = 'intro-progress';
    this.progressFill = document.createElement('div');
    this.progressFill.className = 'intro-progress-fill';
    this.progressBar.appendChild(this.progressFill);
    this.layer.appendChild(this.progressBar);

    this.total = Math.max(
      INTRO.length ? INTRO[INTRO.length - 1].at + 24 : 0,
      PROLOGUE.length ? PROLOGUE[PROLOGUE.length - 1].at + (PROLOGUE[PROLOGUE.length - 1].duration ?? 4) : 0
    );
  }

  start({ resumeAt = 0 } = {}) {
    this.playing = true;
    this.finished = false;
    this.time = resumeAt;
    this.layer.classList.add('visible');
    this.skip.classList.add('visible');
    this.audio?.setMusicTheme('void', { immediate: true });
    this._sync(true);
    return this;
  }

  /** Jump straight to the menu (skipped or already seen). */
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.playing = false;
    this.audio?.stopSpeaking?.();
    this.layer.classList.remove('visible');
    this.skip.classList.remove('visible');
    this.card.classList.remove('visible');
    this.lower.classList.remove('visible');
    this.caption.classList.remove('visible');
    this.onComplete?.();
  }

  update(dt) {
    if (!this.playing) return;
    this.time += dt;
    this._sync(false);
    this.progressFill.style.transform = `scaleX(${clamp01(this.time / this.total).toFixed(4)})`;
    if (this.time >= this.total) this.finish();
  }

  /** Fire whatever beat the clock has just entered. */
  _sync(force) {
    // ---- spoken commentary ----
    for (let i = INTRO.length - 1; i >= 0; i--) {
      if (this.time >= INTRO[i].at) {
        if (i !== this.phaseIndex) {
          this.phaseIndex = i;
          const beat = INTRO[i];
          this.phase = beat.phase;
          this.onPhase?.(beat.phase, beat, this.time);
          if (i > this.spokenIndex || force) {
            this.spokenIndex = i;
            if (!force) {
              this.audio?.narrate(beat.text, {
                mood: beat.mood,
                character: beat.phase === 'simolysis' ? 'god' : 'archivist',
                speaker: beat.phase === 'simolysis' ? 'SIMOLYSIS' : 'THE ARCHIVIST',
                priority: 2,
              });
            }
          }
        }
        break;
      }
    }

    // ---- title cards and lower thirds ----
    for (let i = PROLOGUE.length - 1; i >= 0; i--) {
      const beat = PROLOGUE[i];
      if (this.time >= beat.at) {
        if (i !== this.beatIndex) {
          this.beatIndex = i;
          if (beat.kind === 'card') {
            this.card.textContent = beat.title ?? '';
            this.card.classList.add('visible');
            this.lower.classList.remove('visible');
            this._clearCardAfter = beat.duration ?? (beat.ms ?? 4000) / 1000;
            this._cardTimer = this._clearCardAfter;
          } else {
            this.lower.textContent = beat.text ?? '';
            this.lower.classList.add('visible');
            this.card.classList.remove('visible');
            this._cardTimer = (beat.duration ?? (beat.ms ?? 4200) / 1000);
          }
          this.onCard?.(beat);
        }
        break;
      }
    }

    // fade the current card out on its own timer
    if (this._cardTimer != null) {
      this._cardTimer -= 1 / 60;
      if (this._cardTimer <= 0) {
        this._cardTimer = null;
        this.card.classList.remove('visible');
        this.lower.classList.remove('visible');
      }
    }
  }

  /** Subtitles are routed here by the AudioEngine. */
  showCaption({ text, speaker = null, duration = 4 } = {}) {
    this.caption.innerHTML = '';
    if (speaker) {
      const who = document.createElement('span');
      who.className = 'caption-speaker';
      who.textContent = `${speaker}: `;
      this.caption.appendChild(who);
    }
    const body = document.createElement('span');
    body.className = 'caption-text';
    body.textContent = text ?? '';
    this.caption.appendChild(body);
    this.caption.classList.add('visible');
    clearTimeout(this._captionTimer);
    this._captionTimer = setTimeout(() => this.caption.classList.remove('visible'), Math.max(1.5, duration) * 1000);
  }

  hideCaption() {
    this.caption.classList.remove('visible');
  }

  get progress() {
    return clamp01(this.time / this.total);
  }

  get currentPhase() {
    return this.phase ?? 'title';
  }
}
