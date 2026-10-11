/**
 * THE MULTIVERSE — ui/loading.js
 * ==================================================================
 * The loading ceremony: a progress lattice, the current act ("compiling
 * terrain", "generating ninety thousand blades of grass"), rotating tips,
 * and a warning if the machine cannot render any of it.
 */
import { LOADING_TIPS, TITLE_CARDS } from '../engine/text.js';
import { clamp01 } from '../core/math.js';

export class LoadingScreen {
  constructor({ root, onDismiss = null } = {}) {
    this.root = root;
    this.onDismiss = onDismiss;
    this.tipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
    this.progress = 0;
    this.target = 0;
    this.label = 'WAKING THE MACHINE';
    this.sub = '';
    this.finished = false;
    this.minimumVisible = 1.6;
    this.visibleFor = 0;
    this.build();
  }

  build() {
    this.layer = document.createElement('div');
    this.layer.className = 'loading-layer visible';
    this.root.appendChild(this.layer);

    this.inner = document.createElement('div');
    this.inner.className = 'loading-inner';
    this.layer.appendChild(this.inner);

    const title = document.createElement('div');
    title.className = 'loading-title';
    title.textContent = 'THE MULTIVERSE';
    const sub = document.createElement('div');
    sub.className = 'loading-subtitle';
    sub.textContent = 'SIMOLYSIS';
    this.inner.append(title, sub);

    this.bar = document.createElement('div');
    this.bar.className = 'loading-bar';
    this.fill = document.createElement('div');
    this.fill.className = 'loading-fill';
    this.bar.appendChild(this.fill);
    this.inner.appendChild(this.bar);

    this.labelNode = document.createElement('div');
    this.labelNode.className = 'loading-label';
    this.inner.appendChild(this.labelNode);

    this.subNode = document.createElement('div');
    this.subNode.className = 'loading-sublabel';
    this.inner.appendChild(this.subNode);

    this.tipNode = document.createElement('div');
    this.tipNode.className = 'loading-tip';
    this.inner.appendChild(this.tipNode);
    this.setTip();

    this.actions = document.createElement('div');
    this.actions.className = 'loading-actions';
    this.inner.appendChild(this.actions);

    // A card from the prologue can be shown over a slow load.
    this.card = document.createElement('div');
    this.card.className = 'loading-card';
    this.layer.appendChild(this.card);
  }

  setTip(index = null) {
    this.tipIndex = index ?? (this.tipIndex + 1) % LOADING_TIPS.length;
    this.tipNode.textContent = LOADING_TIPS[this.tipIndex];
    return LOADING_TIPS[this.tipIndex];
  }

  /** Give the loader a label; call repeatedly as work proceeds. */
  set(label, sub = '', progress = null) {
    this.label = label ?? this.label;
    this.sub = sub;
    if (progress != null) this.setProgress(progress);
    this.labelNode.textContent = this.label;
    this.subNode.textContent = this.sub;
    return this;
  }

  setProgress(value) {
    this.target = clamp01(value);
  }

  /** A task list: each entry is a step the engine reports when done. */
  steps(labels) {
    this.stepLabels = labels;
    this.stepIndex = 0;
    this.set(labels[0], '', 0);
    return (index = null) => {
      this.stepIndex = index ?? this.stepIndex + 1;
      const label = this.stepLabels[Math.min(this.stepIndex, this.stepLabels.length - 1)];
      this.set(label, '', this.stepIndex / this.stepLabels.length);
      return label;
    };
  }

  update(dt) {
    this.visibleFor += dt;
    this.progress += (this.target - this.progress) * clamp01(dt * 5);
    this.fill.style.transform = `scaleX(${this.progress.toFixed(4)})`;
    if (this.finished && this.progress > 0.995 && this.visibleFor > this.minimumVisible) {
      this.hide();
    }
  }

  /** Show a fatal problem with a friendly sentence and an option to continue anyway. */
  fail(message, { onContinue = null, continueLabel = 'CONTINUE ANYWAY' } = {}) {
    this.set('THE MACHINE HIT A LIMIT', message, 1);
    this.actions.innerHTML = '';
    const node = document.createElement('pre');
    node.className = 'loading-error';
    node.textContent = message;
    this.actions.appendChild(node);
    const button = document.createElement('button');
    button.className = 'menu-button';
    button.textContent = continueLabel;
    button.addEventListener('click', () => {
      this.hide();
      onContinue?.();
    });
    this.actions.appendChild(button);
    this.finished = true;
    this.progress = 1;
    return this;
  }

  /** Add a clickable action to the loading screen (used for "enable audio"). */
  addAction(label, onSelect) {
    const button = document.createElement('button');
    button.className = 'menu-button';
    button.textContent = label;
    button.addEventListener('click', onSelect);
    this.actions.appendChild(button);
    return button;
  }

  showPrologueCard(index = 0) {
    const card = TITLE_CARDS[index % TITLE_CARDS.length];
    this.card.innerHTML = `<div class="card-title">${card.title ?? ''}</div><div class="card-sub">${card.subtitle ?? card.text ?? ''}</div>`;
    this.card.classList.add('visible');
    setTimeout(() => this.card.classList.remove('visible'), 3600);
  }

  finish({ label = 'READY' } = {}) {
    this.set(label, 'Press PLAY to author reality.', 1);
    this.finished = true;
    return this;
  }

  hide() {
    if (this.layer.classList.contains('hidden')) return;
    this.layer.classList.add('hidden');
    setTimeout(() => {
      this.layer.classList.remove('visible');
      this.onDismiss?.();
    }, 800);
  }
}
