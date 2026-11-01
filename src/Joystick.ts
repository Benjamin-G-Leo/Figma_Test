export interface StickVector {
  x: number;
  y: number;
}

// A full push needs only this share of the ring's radius, so little thumb travel is needed.
const TRAVEL = 0.65;

// On-screen joystick for phones and tablets, so a thumb never covers the runner.
// Touch anywhere on the screen: the stick appears under the thumb and the runner moves
// the way you push, faster the further you push. Left- and right-handed players both
// just put their thumb where it suits them.
export class Joystick {
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 }; // stick centre, in zone coordinates
  private vector: StickVector = { x: 0, y: 0 };

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

    zone.addEventListener('pointerdown', (e) => this.onDown(e));
    zone.addEventListener('pointermove', (e) => this.onMove(e));
    zone.addEventListener('pointerup', (e) => this.onEnd(e));
    zone.addEventListener('pointercancel', (e) => this.onEnd(e));
    zone.addEventListener('lostpointercapture', (e) => this.onEnd(e));
  }

  // Current push, or null when the thumb is off the stick. Each part is -1..1 and the
  // length is 0..1 (1 = pushed to the edge of the ring).
  getVector(): StickVector | null {
    return this.pointerId !== null && (this.vector.x !== 0 || this.vector.y !== 0)
      ? { x: this.vector.x, y: this.vector.y }
      : null;
  }

  // Let go (used when the game pauses or the tab hides).
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
  }

  private get radius(): number {
    return (this.base.offsetWidth || 112) / 2;
  }

  private placeBase(x: number, y: number): void {
    const r = this.radius;
    this.base.style.transform = `translate(${x - r}px, ${y - r}px)`;
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

    // The stick appears right under the thumb (kept inside the screen).
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
    const r = this.radius * TRAVEL; // a push this far counts as full
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let dx = px - this.origin.x;
    let dy = py - this.origin.y;
    const distance = Math.hypot(dx, dy);

    // Thumb dragged past the ring: the stick follows it, so turning back is instant
    // instead of having to travel all the way back across the ring first.
    if (distance > r) {
      const pull = (distance - r) / distance;
      this.origin.x += dx * pull;
      this.origin.y += dy * pull;
      this.placeBase(this.origin.x, this.origin.y);
      dx = px - this.origin.x;
      dy = py - this.origin.y;
    }

    const reach = Math.min(Math.hypot(dx, dy), r);
    const len = Math.hypot(dx, dy);
    const ux = len > 0 ? dx / len : 0;
    const uy = len > 0 ? dy / len : 0;
    this.vector = { x: ux * (reach / r), y: uy * (reach / r) };
    this.knob.style.transform = `translate(${ux * reach}px, ${uy * reach}px)`;
  }
}
