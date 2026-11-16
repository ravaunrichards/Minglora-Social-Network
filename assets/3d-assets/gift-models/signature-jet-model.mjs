const TAU = Math.PI * 2;

const normalize = vector => {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return vector.map(value => value / length);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function createSignatureJetModel() {
  const parts = [];
  function add(name, positions, normals, indices, color, metallic = 0.12, roughness = 0.48) {
    const vertices = positions.length / 3;
    if (!name || !positions.length || positions.length !== normals.length || indices.length < 3 ||
        positions.some(value => !Number.isFinite(value)) || normals.some(value => !Number.isFinite(value)) ||
        indices.some(index => !Number.isInteger(index) || index < 0 || index >= vertices)) {
      throw new Error("Invalid Minglora Signature Jet mesh: " + name);
    }
    parts.push({ name, positions, normals, indices, color, metallic, roughness });
  }
  function ellipsoid(name, center, radii, color, options = {}) {
    const segments = options.segments || 30, rings = options.rings || 20;
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring <= rings; ring++) {
      const phi = Math.PI * ring / rings, sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      for (let step = 0; step <= segments; step++) {
        const theta = TAU * step / segments, nx = sinPhi * Math.cos(theta), ny = cosPhi, nz = sinPhi * Math.sin(theta);
        positions.push(center[0] + nx * radii[0], center[1] + ny * radii[1], center[2] + nz * radii[2]);
        normals.push(...normalize([nx / radii[0], ny / radii[1], nz / radii[2]]));
      }
    }
    for (let ring = 0; ring < rings; ring++) for (let step = 0; step < segments; step++) {
      const a = ring * (segments + 1) + step, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, options.metallic ?? 0.12, options.roughness ?? 0.48);
  }
  function tube(name, points, radius, color, options = {}) {
    const sides = options.sides || 10, positions = [], normals = [], indices = [];
    if (points.length < 2) throw new Error("Tube requires at least two points: " + name);
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const tangent = normalize([next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]]);
      const reference = Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const axisU = normalize(cross(tangent, reference)), axisV = normalize(cross(tangent, axisU));
      for (let side = 0; side <= sides; side++) {
        const angle = TAU * side / sides;
        const normal = normalize([
          axisU[0] * Math.cos(angle) + axisV[0] * Math.sin(angle),
          axisU[1] * Math.cos(angle) + axisV[1] * Math.sin(angle),
          axisU[2] * Math.cos(angle) + axisV[2] * Math.sin(angle)
        ]);
        positions.push(points[i][0] + normal[0] * radius, points[i][1] + normal[1] * radius, points[i][2] + normal[2] * radius);
        normals.push(...normal);
      }
    }
    for (let i = 0; i < points.length - 1; i++) for (let side = 0; side < sides; side++) {
      const a = i * (sides + 1) + side, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, options.metallic ?? 0.16, options.roughness ?? 0.4);
  }
  function wing(name, polygon, topY, bottomY, color, metallic = 0.26, roughness = 0.35) {
    const positions = [], normals = [], indices = [], count = polygon.length;
    for (const [x, z] of polygon) { positions.push(x, topY, z); normals.push(0, 1, 0); }
    for (const [x, z] of polygon) { positions.push(x, bottomY, z); normals.push(0, -1, 0); }
    for (let i = 1; i < count - 1; i++) indices.push(0, i, i + 1);
    for (let i = 1; i < count - 1; i++) indices.push(count, count + i + 1, count + i);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count, p = polygon[i], q = polygon[j];
      const edge = normalize([q[0] - p[0], 0, q[1] - p[1]]), normal = normalize([edge[2], 0, -edge[0]]);
      const base = positions.length / 3;
      positions.push(p[0], topY, p[1], q[0], topY, q[1], q[0], bottomY, q[1], p[0], bottomY, p[1]);
      for (let k = 0; k < 4; k++) normals.push(...normal);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function fin(name, polygon, frontZ, backZ, color, metallic = 0.2, roughness = 0.42) {
    const positions = [], normals = [], indices = [], count = polygon.length;
    for (const [x, y] of polygon) { positions.push(x, y, frontZ); normals.push(0, 0, 1); }
    for (const [x, y] of polygon) { positions.push(x, y, backZ); normals.push(0, 0, -1); }
    for (let i = 1; i < count - 1; i++) indices.push(0, i, i + 1);
    for (let i = 1; i < count - 1; i++) indices.push(count, count + i + 1, count + i);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count, p = polygon[i], q = polygon[j];
      const edge = normalize([q[0] - p[0], q[1] - p[1], 0]), normal = normalize([edge[1], -edge[0], 0]);
      const base = positions.length / 3;
      positions.push(p[0], p[1], frontZ, q[0], q[1], frontZ, q[0], q[1], backZ, p[0], p[1], backZ);
      for (let k = 0; k < 4; k++) normals.push(...normal);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function ring(name, center, radiusX, radiusY, color, radius = 0.012, segments = 32) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = TAU * i / segments;
      points.push([center[0] + Math.cos(angle) * radiusX, center[1] + Math.sin(angle) * radiusY, center[2]]);
    }
    tube(name, points, radius, color, { metallic: 0.48, roughness: 0.28, sides: 8 });
  }

  ellipsoid("Signature Jet - pearl titanium fuselage shell", [0, 0.015, -0.005], [0.205, 0.205, 0.86], "#d8e1e9", { metallic: 0.58, roughness: 0.28, segments: 44, rings: 30 });
  ellipsoid("Signature Jet - swept polished nose cone", [0, 0.01, 0.69], [0.145, 0.145, 0.33], "#f4f7fa", { metallic: 0.42, roughness: 0.24, segments: 36, rings: 24 });
  ellipsoid("Signature Jet - midnight-blue lower fuselage keel", [0, -0.105, -0.02], [0.178, 0.105, 0.73], "#142c49", { metallic: 0.36, roughness: 0.36 });
  tube("Signature Jet - continuous champagne fuselage pinstripe", [[0, 0.145, -0.71], [0, 0.16, -0.38], [0, 0.166, -0.03], [0, 0.16, 0.31], [0, 0.13, 0.63]], 0.008, "#e2bd71", { metallic: 0.76, roughness: 0.24 });
  tube("Signature Jet - lower keel highlight", [[0, -0.17, -0.65], [0, -0.19, -0.24], [0, -0.19, 0.24], [0, -0.14, 0.65]], 0.006, "#6b91b8", { metallic: 0.48, roughness: 0.32 });
  ellipsoid("Signature Jet - panoramic smoked-glass flight deck", [0, 0.164, 0.36], [0.118, 0.043, 0.205], "#182b43", { metallic: 0.22, roughness: 0.16, segments: 34, rings: 20 });
  tube("Signature Jet - cockpit gold surround", [[-0.107, 0.177, 0.24], [-0.09, 0.2, 0.4], [0, 0.207, 0.54], [0.09, 0.2, 0.4], [0.107, 0.177, 0.24]], 0.009, "#e5c477", { metallic: 0.82, roughness: 0.22 });
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = 0.11 - i * 0.112, label = side < 0 ? "port" : "starboard";
    ellipsoid("Signature Jet - " + label + " cabin window " + (i + 1), [side * 0.178, 0.065, z], [0.018, 0.027, 0.043], "#294f6d", { metallic: 0.34, roughness: 0.17, segments: 16, rings: 10 });
    ellipsoid("Signature Jet - " + label + " cabin window glint " + (i + 1), [side * 0.187, 0.081, z + 0.008], [0.004, 0.008, 0.018], "#b8e3f2", { metallic: 0.32, roughness: 0.16, segments: 10, rings: 8 });
  }
  const leftWing = [[-0.13, 0.33], [-1.12, 0.13], [-1.0, -0.03], [-0.82, -0.19], [-0.36, -0.36], [-0.14, -0.52]];
  wing("Signature Jet - port swept main wing", leftWing, 0.005, -0.045, "#dfe7ee");
  wing("Signature Jet - starboard swept main wing", leftWing.map(([x, z]) => [-x, z]), 0.005, -0.045, "#dfe7ee");
  wing("Signature Jet - port midnight-blue wing root inlay", [[-0.15, 0.25], [-0.69, 0.08], [-0.57, -0.04], [-0.16, -0.23]], 0.012, -0.006, "#1b3c60", 0.32, 0.31);
  wing("Signature Jet - starboard midnight-blue wing root inlay", [[0.15, 0.25], [0.69, 0.08], [0.57, -0.04], [0.16, -0.23]], 0.012, -0.006, "#1b3c60", 0.32, 0.31);
  for (const side of [-1, 1]) {
    const label = side < 0 ? "port" : "starboard";
    tube("Signature Jet - " + label + " wing leading-edge champagne seam", [[side * 0.16, 0.025, 0.3], [side * 0.48, 0.025, 0.245], [side * 0.82, 0.025, 0.18], [side * 1.08, 0.025, 0.12]], 0.006, "#e6c47c", { metallic: 0.7, roughness: 0.22 });
    ellipsoid("Signature Jet - " + label + " navigation lamp", [side * 1.055, 0.025, 0.11], [0.027, 0.021, 0.035], side < 0 ? "#d94c58" : "#58c69a", { metallic: 0.2, roughness: 0.18 });
    ellipsoid("Signature Jet - " + label + " turbofan nacelle", [side * 0.55, -0.115, -0.115], [0.145, 0.145, 0.37], "#bccbd7", { metallic: 0.7, roughness: 0.25, segments: 34, rings: 22 });
    ellipsoid("Signature Jet - " + label + " engine dark intake", [side * 0.55, -0.115, 0.21], [0.108, 0.11, 0.026], "#172638", { metallic: 0.36, roughness: 0.31 });
    ring("Signature Jet - " + label + " machined intake lip", [side * 0.55, -0.115, 0.226], 0.112, 0.112, "#edf3f7", 0.012);
    ellipsoid("Signature Jet - " + label + " turbine spinner", [side * 0.55, -0.115, 0.241], [0.023, 0.024, 0.018], "#d5b56e", { metallic: 0.85, roughness: 0.21 });
    ellipsoid("Signature Jet - " + label + " exhaust throat", [side * 0.55, -0.115, -0.493], [0.1, 0.1, 0.022], "#25394e", { metallic: 0.7, roughness: 0.38 });
    ring("Signature Jet - " + label + " exhaust rim", [side * 0.55, -0.115, -0.505], 0.104, 0.104, "#8798a8", 0.012);
    tube("Signature Jet - " + label + " engine mounting pylon", [[side * 0.53, -0.015, -0.17], [side * 0.55, -0.08, -0.18], [side * 0.55, -0.13, -0.2]], 0.043, "#8ea1b3", { metallic: 0.6, roughness: 0.34 });
  }
  const leftTail = [[-0.12, -0.57], [-0.54, -0.71], [-0.43, -0.8], [-0.13, -0.83]];
  wing("Signature Jet - port horizontal stabilizer", leftTail, 0.026, -0.012, "#cbd8e2", 0.48, 0.3);
  wing("Signature Jet - starboard horizontal stabilizer", leftTail.map(([x, z]) => [-x, z]), 0.026, -0.012, "#cbd8e2", 0.48, 0.3);
  fin("Signature Jet - swept vertical tail fin", [[-0.035, 0.08], [0.035, 0.08], [0.07, 0.49], [0.035, 0.58], [-0.025, 0.5]], -0.74, -0.83, "#1b3d60");
  fin("Signature Jet - gold tail fin flash", [[-0.031, 0.29], [0.031, 0.29], [0.055, 0.43], [-0.022, 0.43]], -0.728, -0.735, "#e2bc70", 0.7, 0.25);
  for (const side of [-1, 1]) {
    const label = side < 0 ? "port" : "starboard";
    tube("Signature Jet - " + label + " main gear strut", [[side * 0.17, -0.13, -0.3], [side * 0.22, -0.29, -0.34], [side * 0.24, -0.39, -0.34]], 0.017, "#8798a8", { metallic: 0.72, roughness: 0.3 });
    ellipsoid("Signature Jet - " + label + " main gear tyre", [side * 0.24, -0.425, -0.35], [0.075, 0.095, 0.052], "#19212c", { metallic: 0.02, roughness: 0.93, segments: 22, rings: 14 });
    ellipsoid("Signature Jet - " + label + " main gear alloy hub", [side * 0.24, -0.425, -0.301], [0.039, 0.046, 0.014], "#d7e2e9", { metallic: 0.82, roughness: 0.25 });
  }
  tube("Signature Jet - nose gear strut", [[0, -0.15, 0.51], [0, -0.32, 0.57], [0, -0.4, 0.57]], 0.016, "#8798a8", { metallic: 0.72, roughness: 0.3 });
  ellipsoid("Signature Jet - nose landing tyre", [0, -0.435, 0.57], [0.049, 0.071, 0.045], "#19212c", { metallic: 0.02, roughness: 0.93 });
  ellipsoid("Signature Jet - nose landing wheel hub", [0, -0.435, 0.612], [0.026, 0.038, 0.012], "#d7e2e9", { metallic: 0.82, roughness: 0.25 });
  tube("Signature Jet - dorsal antenna", [[0, 0.19, -0.52], [0, 0.29, -0.58], [0, 0.31, -0.63]], 0.008, "#334a61", { metallic: 0.32, roughness: 0.42 });
  tube("Signature Jet - forward service-door outline", [[0.178, 0.12, 0.04], [0.188, 0.12, -0.08], [0.18, 0.12, -0.19]], 0.0035, "#7d8e9d", { metallic: 0.3, roughness: 0.45 });
  ellipsoid("Signature Jet - rear red anti-collision beacon", [0, 0.21, -0.72], [0.022, 0.025, 0.021], "#d94b59", { metallic: 0.16, roughness: 0.2 });

  const chunks = [], bufferViews = [], accessors = [], primitives = [], materials = [];
  let byteOffset = 0;
  function addBuffer(buffer, target) {
    const padding = (4 - (buffer.length % 4)) % 4;
    const padded = padding ? Buffer.concat([buffer, Buffer.alloc(padding)]) : buffer;
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    chunks.push(padded); byteOffset += padded.length; return view;
  }
  for (const part of parts) {
    const positionBuffer = Buffer.from(new Float32Array(part.positions).buffer);
    const normalBuffer = Buffer.from(new Float32Array(part.normals).buffer);
    const maxIndex = Math.max(...part.indices);
    const use32Bit = maxIndex > 65535;
    const indexBuffer = use32Bit ? Buffer.from(new Uint32Array(part.indices).buffer) : Buffer.from(new Uint16Array(part.indices).buffer);
    const positionView = addBuffer(positionBuffer, 34962), normalView = addBuffer(normalBuffer, 34962), indexView = addBuffer(indexBuffer, 34963);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], part.positions[i + axis]); max[axis] = Math.max(max[axis], part.positions[i + axis]);
    }
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: positionView, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min, max });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: "VEC3" });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: use32Bit ? 5125 : 5123, count: part.indices.length, type: "SCALAR" });
    const rgb = [1, 3, 5].map(index => parseInt(part.color.slice(index, index + 2), 16) / 255);
    const materialIndex = materials.length;
    materials.push({ name: part.name + " PBR finish", pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: part.metallic, roughnessFactor: part.roughness }, doubleSided: true });
    primitives.push({ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: materialIndex, mode: 4, extras: { mingloraPartName: part.name } });
  }
  const binary = Buffer.concat(chunks);
  return {
    asset: { version: "2.0", generator: "Minglora Gift Studio", extras: {
      mingloraAssetId: "gift-signature-jet-3d-v1",
      source: "assets/3d-assets/gift-models/signature-jet-model.mjs",
      artDirection: "unbranded pearl-titanium private jet with swept twin wings, panoramic smoked cockpit glazing, two turbofan nacelles with machined intake lips, six paired cabin windows, champagne pinstripes, stabilizers, vertical tail fin and retractable landing gear",
      reviewStatus: "design-review-pending"
    }},
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Signature Jet - Pearl Titanium Twin-Turbofan Aircraft" }],
    meshes: [{ name: "Minglora Signature Jet - Fuselage, Swept Wings, Twin Turbofans and Gear", primitives }],
    materials, buffers: [{ byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64") }],
    bufferViews, accessors
  };
}
