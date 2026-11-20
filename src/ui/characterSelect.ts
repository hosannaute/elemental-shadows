import { ELEMENT_ORDER, ELEMENT_REGISTRY, type ElementId } from '../elements/elementRegistry';

export interface RosterCallbacks {
  onConfirmMatch: (p1: ElementId, p2: ElementId) => void;
  onCancel: () => void;
}

export class CharacterSelectOverlay {
  public readonly element: HTMLDivElement;
  private selectedP1: ElementId = 'fire';
  private selectedP2: ElementId = 'ice';
  private pickingSide: 'p1' | 'p2' = 'p1';
  private callbacks: RosterCallbacks;

  constructor(callbacks: RosterCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'roster-backdrop hidden';
  }

  public open(currentP1: ElementId, currentP2: ElementId): void {
    this.selectedP1 = currentP1;
    this.selectedP2 = currentP2;
    this.pickingSide = 'p1';
    this.element.classList.remove('hidden');
    this.render();
  }

  public close(): void {
    this.element.classList.add('hidden');
  }

  private render(): void {
    const p1 = ELEMENT_REGISTRY[this.selectedP1];
    const p2 = ELEMENT_REGISTRY[this.selectedP2];

    this.element.innerHTML = `
      <section class="roster-modal" role="dialog" aria-label="Eight-Element Fighter Selection">
        <div class="roster-header">
          <div>
            <h1>ELEMENTAL SHADOWS</h1>
            <p>Select your Elemental Archetype &amp; Sparring Opponent</p>
          </div>
          <div class="roster-side-toggle">
            <button class="side-pill ${this.pickingSide === 'p1' ? 'active p1' : ''}" id="pick-p1">Picking P1: ${p1.fighterName}</button>
            <button class="side-pill ${this.pickingSide === 'p2' ? 'active p2' : ''}" id="pick-p2">Picking P2: ${p2.fighterName}</button>
          </div>
        </div>

        <div class="roster-preview-grid">
          <div class="fighter-dossier" style="--el-color:${p1.cssPrimary};--el-glow:${p1.cssGlow}">
            <div class="dossier-top">
              <div class="dossier-crest">${p1.crestSvg}</div>
              <div>
                <div class="dossier-side">PLAYER 1 · ${p1.name.toUpperCase()}</div>
                <h3>${p1.fighterName} <span>— ${p1.archetype}</span></h3>
              </div>
            </div>
            <div class="dossier-specs">
              <div><strong>Weapon:</strong> ${p1.weaponName}</div>
              <div><strong>Magic:</strong> ${p1.magicName} (${p1.statusLabel})</div>
              <div><strong>Comeback Twist:</strong> ${p1.comebackName} — ${p1.comebackDescription}</div>
            </div>
          </div>

          <div class="vs-badge">VS</div>

          <div class="fighter-dossier" style="--el-color:${p2.cssPrimary};--el-glow:${p2.cssGlow}">
            <div class="dossier-top">
              <div class="dossier-crest">${p2.crestSvg}</div>
              <div>
                <div class="dossier-side">OPPONENT · ${p2.name.toUpperCase()}</div>
                <h3>${p2.fighterName} <span>— ${p2.archetype}</span></h3>
              </div>
            </div>
            <div class="dossier-specs">
              <div><strong>Weapon:</strong> ${p2.weaponName}</div>
              <div><strong>Magic:</strong> ${p2.magicName} (${p2.statusLabel})</div>
              <div><strong>Comeback Twist:</strong> ${p2.comebackName} — ${p2.comebackDescription}</div>
            </div>
          </div>
        </div>

        <div class="element-cards-grid">
          ${ELEMENT_ORDER.map((id) => {
            const el = ELEMENT_REGISTRY[id];
            const isP1 = this.selectedP1 === id;
            const isP2 = this.selectedP2 === id;
            return `
              <button
                class="element-card ${isP1 ? 'selected-p1' : ''} ${isP2 ? 'selected-p2' : ''}"
                data-element="${id}"
                style="--card-color:${el.cssPrimary};--card-glow:${el.cssGlow}"
              >
                <div class="card-badges">
                  ${isP1 ? '<span class="card-tag p1">P1</span>' : ''}
                  ${isP2 ? '<span class="card-tag p2">P2</span>' : ''}
                </div>
                <div class="card-crest">${el.crestSvg}</div>
                <div class="card-name">${el.fighterName}</div>
                <div class="card-sub">${el.name} · ${el.weaponName}</div>
              </button>
            `;
          }).join('')}
        </div>

        <div class="roster-footer">
          <button class="action-pill" id="roster-cancel">BACK TO ARENA</button>
          <button class="action-pill primary" id="roster-fight">ENTER THE DOJO</button>
        </div>
      </section>
    `;

    this.element.querySelector('#pick-p1')?.addEventListener('click', () => {
      this.pickingSide = 'p1';
      this.render();
    });
    this.element.querySelector('#pick-p2')?.addEventListener('click', () => {
      this.pickingSide = 'p2';
      this.render();
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-element]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.element as ElementId;
        if (this.pickingSide === 'p1') {
          this.selectedP1 = id;
          this.pickingSide = 'p2';
        } else {
          this.selectedP2 = id;
        }
        this.render();
      });
    });

    this.element.querySelector('#roster-cancel')?.addEventListener('click', () => {
      this.close();
      this.callbacks.onCancel();
    });

    this.element.querySelector('#roster-fight')?.addEventListener('click', () => {
      this.close();
      this.callbacks.onConfirmMatch(this.selectedP1, this.selectedP2);
    });
  }
}
