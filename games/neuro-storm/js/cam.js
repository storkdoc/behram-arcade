/* Orbit camera shared by the WebGL and Canvas2D renderers */
export class OrbitCam {
  constructor() { this.theta = -0.95; this.phi = 1.12; this.radius = 5.2; this.tTheta = this.theta; this.tPhi = this.phi; this.tRadius = this.radius; this.target = [0, -0.05, 0]; this.vTheta = 0; this.vPhi = 0; this.auto = true; this.idle = 0; this.fov = 38; this.fit = 5.2; }
  rotate(dx, dy) { this.tTheta -= dx * 0.0062; this.tPhi = Math.min(2.85, Math.max(0.2, this.tPhi - dy * 0.0062)); this.vTheta = -dx * 0.0062; this.vPhi = -dy * 0.0062; this.idle = 0; }
  zoom(f) { this.tRadius = Math.min(this.fit * 2.2, Math.max(1.6, this.tRadius * f)); this.idle = 0; }
  release() { this.fling = true; }
  setFit(aspect, vfrac = 1) { // distance that frames the brain (radius ~1.45): aspect = free width / canvas height, vfrac = free height / canvas height
    const t = Math.tan(this.fov * Math.PI / 360); const need = 1.5;
    const d = Math.max(need / (t * vfrac), need / (t * aspect)) + 0.6; const old = this.fit; this.fit = d;
    if (!this.inited) { this.radius = this.tRadius = d; this.inited = true; } else this.tRadius *= d / old;
  }
  goTo(theta, phi, rf = 1) { this.tTheta = theta; this.tPhi = phi; this.tRadius = this.fit * rf; this.vTheta = this.vPhi = 0; }
  update(dt, interacting) {
    this.idle += dt;
    if (!interacting) {
      if (this.fling) { this.tTheta += this.vTheta; this.tPhi = Math.min(2.85, Math.max(0.2, this.tPhi + this.vPhi)); this.vTheta *= Math.pow(0.02, dt); this.vPhi *= Math.pow(0.02, dt); if (Math.abs(this.vTheta) + Math.abs(this.vPhi) < 1e-4) this.fling = false; }
      if (this.auto && this.idle > 4) this.tTheta += dt * 0.07 * Math.min(1, (this.idle - 4) / 2);
    }
    const k = 1 - Math.pow(0.0005, dt);
    this.theta += (this.tTheta - this.theta) * k; this.phi += (this.tPhi - this.phi) * k; this.radius += (this.tRadius - this.radius) * k;
  }
  eye() { const s = Math.sin(this.phi); return [this.target[0] + this.radius * s * Math.sin(this.theta), this.target[1] + this.radius * Math.cos(this.phi), this.target[2] + this.radius * s * Math.cos(this.theta)]; }
  apply(c, w, h, view) {
    const e = this.eye(); c.position.set(e[0], e[1], e[2]); c.up.set(0, 1, 0); c.lookAt(this.target[0], this.target[1], this.target[2]);
    c.fov = this.fov; c.aspect = w / h;
    if (view && (view.x || view.y)) c.setViewOffset(w, h, view.x, view.y, w, h); else c.clearViewOffset();
    c.updateProjectionMatrix(); c.updateMatrixWorld();
  }
}
