export interface StickVector {
  x: number;
  y: number;
}

export type StickSide = 'left' | 'right';

const SIDE_KEY = 'voltRunnerJoystickSide';

// On-screen joystick for phones and tablets, so a thumb never covers the runner.
// Touch anywhere in the corner zone: the stick appears under the thumb and the runner
// moves the way you push, faster the further you push.
export class Joystick {
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 }; // stick centre, in zone coordinates
  private vector: StickVector = { x: 0, y: 0 };
  private side: StickSide;

  // Phones and tablets get it by default. `?joystick` forces it on and `?joystick=off`
  // forces it off (handy for trying it on a desktop).
  static wanted(): boolean {
    const forced = new URLSearchParams(window.location.search).get('joystick');
    if (forced !== null) return forced !== 'off' && forced !== '0';
    return window.matchMedia('(pointer: coarse)').matches;
  }

  constructor(private readonly zone: HTMLElement) {
    this.base = zone.querySelector('.joystick-base') as HTMLElement;
    this.knob = zone.querySelector('.joystick-knob') as HTMLElement;
    this.side = Joystick.loadSide();
    zone.classList.toggle('right', this.side === 'right');

    zone.addEventListener('pointerdown', (e) => this.onDown(e));
    zone.addEventListener('pointermove', (e) => this.onMove(e));
    zone.addEventListener('pointerup', (e) => this.onEnd(e));
    zone.addEventListener('pointercancel', (e) => this.onEnd(e));
    zone.addEventListener('lostpointercapture', (e) => this.onEnd(e));
    window.addEventListener('resize', () => this.showAtRest());
    this.showAtRest();
  }

  private static loadSide(): StickSide {
    try {
      return localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left';
    } catch {
      return 'left';
    }
  }

  getSide(): StickSide {
    return this.side;
  }

  setSide(side: StickSide): void {
    this.side = side;
    this.zone.classList.toggle('right', side === 'right');
    try {
      localStorage.setItem(SIDE_KEY, side);
    } catch {
      // Storage blocked: the choice just won't be remembered.
    }
    this.release();
  }

  // Current push, or null when the thumb is off the stick. Each part is -1..1 and the
  // length is 0..1 (1 = pushed to the edge of the ring).
  getVector(): StickVector | null {
    return this.pointerId !== null && (this.vector.x !== 0 || this.vector.y !== 0)
      ? { x: this.vector.x, y: this.vector.y }
      : null;
  }

  // Let go (used when the game pauses, the tab hides, or the side changes).
  release(): void {
    if (this.pointerId !== null) {
      try {
        this.zone.releasePointerCapture(this.pointerId);
      } catch {
        // Already released.
      }
    }
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this.zone.classList.remove('active');
    this.knob.style.transform = '';
    this.showAtRest();
  }

  private get radius(): number {
    return (this.base.offsetWidth || 112) / 2;
  }

  private placeBase(x: number, y: number): void {
    const r = this.radius;
    this.base.style.transform = `translate(${x - r}px, ${y - r}px)`;
  }

  // Idle: a faint ring in the corner so players can see where to put their thumb.
  private showAtRest(): void {
    if (this.pointerId !== null) return;
    const rect = this.zone.getBoundingClientRect();
    const r = this.radius;
    this.placeBase(rect.width / 2, Math.max(r, rect.height - r - 24));
  }

  private onDown(e: PointerEvent): void {
    if (this.pointerId !== null) return; // one thumb only
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.zone.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse; the zone still gets the events while the thumb is on it.
    }

    // The stick appears right under the thumb (kept inside the zone).
    const rect = this.zone.getBoundingClientRect();
    const r = this.radius;
    this.origin = {
      x: Math.min(Math.max(e.clientX - rect.left, r), Math.max(r, rect.width - r)),
      y: Math.min(Math.max(e.clientY - rect.top, r), Math.max(r, rect.height - r))
    };
    this.placeBase(this.origin.x, this.origin.y);
    this.zone.classList.add('active');
    this.update(e);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.update(e);
  }

  private onEnd(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  }

  private update(e: PointerEvent): void {
    const rect = this.zone.getBoundingClientRect();
    const r = this.radius;
    const dx = e.clientX - (rect.left + this.origin.x);
    const dy = e.clientY - (rect.top + this.origin.y);
    const distance = Math.hypot(dx, dy);
    const reach = Math.min(distance, r);
    const ux = distance > 0 ? dx / distance : 0;
    const uy = distance > 0 ? dy / distance : 0;
    this.vector = { x: ux * (reach / r), y: uy * (reach / r) };
    this.knob.style.transform = `translate(${ux * reach}px, ${uy * reach}px)`;
  }
}
