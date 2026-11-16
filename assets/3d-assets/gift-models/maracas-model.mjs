const TAU = Math.PI * 2;
const unit = (x, y, z) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export function createMaracasModel() {
  const parts = [];
  const add = (name, positions, normals, indices, color, metallic = 0.12, roughness = 0.42) => {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) throw new Error("Invalid Maracas mesh: " + name);
    const existing = parts.find(part => part.name === name && part.color === color && part.metallic === metallic && part.roughness === roughness);
    if (existing) {
      const offset = existing.positions.length / 3;
      existing.positions.push(...positions);
      existing.normals.push(...normals);
      existing.indices.push(...indices.map(index => index + offset));
    } else parts.push({ name, positions, normals, indices, color, metallic, roughness });
  };
  function transform(point, pose, direction = false) {
    const cosine = Math.cos(pose.angle), sine = Math.sin(pose.angle);
    const x = cosine * point[0] - sine * point[1], y = sine * point[0] + cosine * point[1];
    return direction ? [x, y, point[2]] : [x + pose.x, y + pose.y, point[2] + pose.z];
  }
  function lathe(name, profile, pose, color, metallic = 0.12, roughness = 0.42, segments = 48) {
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring < profile.length; ring++) {
      const [y] = profile[ring], before = profile[Math.max(0, ring - 1)], after = profile[Math.min(profile.length - 1, ring + 1)];
      const slope = (after[1] - before[1]) / ((after[0] - before[0]) || 1);
      for (let step = 0; step <= segments; step++) {
        const angle = TAU * step / segments, cosine = Math.cos(angle), sine = Math.sin(angle);
        positions.push(...transform([profile[ring][1] * cosine, y, profile[ring][1] * sine], pose));
        normals.push(...unit(...transform([cosine, -slope, sine], pose, true)));
      }
    }
    for (let ring = 0; ring < profile.length - 1; ring++) for (let step = 0; step < segments; step++) {
      const a = ring * (segments + 1) + step, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function ellipsoid(name, center, radii, pose, color, metallic = 0.12, roughness = 0.42, segments = 18, rings = 12) {
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring <= rings; ring++) {
      const phi = Math.PI * ring / rings;
      for (let step = 0; step <= segments; step++) {
        const theta = TAU * step / segments, nx = Math.sin(phi) * Math.cos(theta), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(theta);
        positions.push(...transform([center[0] + nx * radii[0], center[1] + ny * radii[1], center[2] + nz * radii[2]], pose));
        normals.push(...unit(...transform([nx / radii[0], ny / radii[1], nz / radii[2]], pose, true)));
      }
    }
    for (let ring = 0; ring < rings; ring++) for (let step = 0; step < segments; step++) {
      const a = ring * (segments + 1) + step, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function tube(name, points, radius, pose, color, metallic = 0.18, roughness = 0.38, sides = 8) {
    const positions = [], normals = [], indices = [];
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      const previous = points[Math.max(0, pointIndex - 1)], next = points[Math.min(points.length - 1, pointIndex + 1)];
      const tangent = unit(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]);
      const reference = Math.abs(tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
      const u = unit(...cross(tangent, reference)), v = unit(...cross(tangent, u));
      const localRadius = Array.isArray(radius) ? radius[pointIndex] : radius;
      for (let side = 0; side <= sides; side++) {
        const angle = TAU * side / sides;
        const normal = unit(
          u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
          u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
          u[2] * Math.cos(angle) + v[2] * Math.sin(angle)
        );
        positions.push(...transform([points[pointIndex][0] + normal[0] * localRadius, points[pointIndex][1] + normal[1] * localRadius, points[pointIndex][2] + normal[2] * localRadius], pose));
        normals.push(...unit(...transform(normal, pose, true)));
      }
    }
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) for (let side = 0; side < sides; side++) {
      const a = pointIndex * (sides + 1) + side, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function torus(name, center, major, minor, pose, color, metallic = 0.56, roughness = 0.28, segments = 36, sides = 8) {
    const positions = [], normals = [], indices = [];
    for (let step = 0; step <= segments; step++) {
      const u = TAU * step / segments;
      for (let side = 0; side <= sides; side++) {
        const v = TAU * side / sides, cosine = Math.cos(v), sine = Math.sin(v);
        positions.push(...transform([center[0] + (major + minor * cosine) * Math.cos(u), center[1] + minor * sine, center[2] + (major + minor * cosine) * Math.sin(u)], pose));
        normals.push(...unit(...transform([cosine * Math.cos(u), sine, cosine * Math.sin(u)], pose, true)));
      }
    }
    for (let step = 0; step < segments; step++) for (let side = 0; side < sides; side++) {
      const a = step * (sides + 1) + side, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function maraca(label, pose, palette) {
    const prefix = "Maracas " + label + " ";
    lathe(prefix + "lacquered gourd shell", [
      [0.025, 0.034], [0.075, 0.105], [0.15, 0.173], [0.25, 0.218], [0.37, 0.242],
      [0.49, 0.229], [0.6, 0.184], [0.69, 0.112], [0.755, 0.045], [0.775, 0.014]
    ], pose, palette.body, 0.12, 0.34, 56);
    lathe(prefix + "sculpted hardwood handle", [
      [-0.75, 0.025], [-0.71, 0.041], [-0.64, 0.046], [-0.5, 0.043], [-0.28, 0.04], [-0.08, 0.047], [0.025, 0.062]
    ], pose, palette.wood, 0.08, 0.39, 32);
    ellipsoid(prefix + "rounded handle pommel", [0, -0.735, 0], [0.046, 0.044, 0.046], pose, palette.gold, 0.62, 0.25, 16, 10);
    ellipsoid(prefix + "neck ferrule", [0, 0.055, 0], [0.073, 0.055, 0.073], pose, palette.gold, 0.68, 0.24, 18, 10);
    for (const [index, y, radius, color] of [[1, -0.6, 0.047, palette.accent], [2, -0.42, 0.045, palette.gold], [3, -0.22, 0.045, palette.accent]]) {
      torus(prefix + "raised woven grip band " + index, [0, y, 0], radius, 0.008, pose, color, 0.58, 0.3, 28, 7);
    }
    const wrap = [];
    for (let step = 0; step <= 72; step++) {
      const t = step / 72, angle = TAU * 7 * t, y = -0.58 + t * 0.39;
      wrap.push([0.047 * Math.cos(angle), y, 0.047 * Math.sin(angle)]);
    }
    tube(prefix + "spiral-wrapped hardwood handle", wrap, 0.006, pose, palette.pattern, 0.2, 0.42, 6);
    torus(prefix + "lower painted enamel ring", [0, 0.15, 0], 0.165, 0.011, pose, palette.gold, 0.64, 0.25, 44, 8);
    torus(prefix + "middle painted enamel ring", [0, 0.29, 0], 0.229, 0.012, pose, palette.accent, 0.3, 0.34, 44, 8);
    torus(prefix + "upper painted enamel ring", [0, 0.57, 0], 0.196, 0.01, pose, palette.gold, 0.64, 0.25, 44, 8);
    torus(prefix + "crown fillet", [0, 0.685, 0], 0.103, 0.008, pose, palette.accent, 0.42, 0.31, 36, 7);
    ellipsoid(prefix + "crown bead", [0, 0.758, 0], [0.035, 0.035, 0.035], pose, palette.gold, 0.7, 0.22, 14, 9);
    for (let row = 0; row < 3; row++) {
      const y = 0.235 + row * 0.145;
      for (let column = 0; column < 3; column++) {
        const x = (column - 1) * 0.104 + (row % 2 ? 0.025 : -0.025);
        const vertical = (y - 0.4) / 0.405, horizontal = x / 0.244;
        const depth = 0.184 * Math.sqrt(Math.max(0.08, 1 - vertical * vertical - horizontal * horizontal)), z = depth + 0.004;
        const motif = [[x, y + 0.045, z], [x + 0.036, y, z + 0.002], [x, y - 0.045, z], [x - 0.036, y, z + 0.002], [x, y + 0.045, z]];
        tube(prefix + "painted diamond seed inlay " + row + "-" + column, motif, 0.0065, pose, palette.pattern, 0.22, 0.35, 6);
        ellipsoid(prefix + "seed bead centre " + row + "-" + column, [x, y, z + 0.006], [0.012, 0.012, 0.008], pose, palette.gold, 0.62, 0.24, 10, 7);
      }
    }
    for (let ray = 0; ray < 10; ray++) {
      const angle = TAU * ray / 10, inner = 0.075, outer = 0.145;
      const x1 = Math.cos(angle) * inner, y1 = 0.43 + Math.sin(angle) * inner;
      const x2 = Math.cos(angle) * outer, y2 = 0.43 + Math.sin(angle) * outer;
      const surface = (x, y) => 0.184 * Math.sqrt(Math.max(0.12, 1 - Math.pow(x / 0.244, 2) - Math.pow((y - 0.4) / 0.405, 2))) + 0.006;
      tube(prefix + "radial sunburst inlay " + (ray + 1), [[x1, y1, surface(x1, y1)], [x2, y2, surface(x2, y2)]], 0.0055, pose, ray % 2 ? palette.pattern : palette.gold, 0.38, 0.3, 6);
    }
    for (let side = -1; side <= 1; side++) {
      ellipsoid(prefix + "side brass stud " + (side + 2), [side * 0.176, 0.39, 0.105], [0.018, 0.018, 0.012], pose, palette.gold, 0.72, 0.2, 12, 8);
    }
  }
  maraca("coral", { x: -0.28, y: 0.02, z: 0.025, angle: -0.23 }, {
    body: "#c65243", wood: "#69412f", gold: "#f0ca78", accent: "#287f75", pattern: "#ffe8b7"
  });
  maraca("lagoon", { x: 0.28, y: 0.02, z: 0.045, angle: 0.23 }, {
    body: "#d99b43", wood: "#68452f", gold: "#f6d88c", accent: "#176b70", pattern: "#f7f0cc"
  });
  torus("Maracas shared presentation collar", [0, -0.79, 0.02], 0.3, 0.012,
    { x: 0, y: 0, z: 0, angle: 0 }, "#c9a45a", 0.62, 0.28, 40, 8);

  const chunks = [], views = [], accessors = [], primitives = [], materials = [];
  let byteOffset = 0;
  const addBuffer = (buffer, target) => {
    const padding = (4 - buffer.length % 4) % 4;
    const chunk = padding ? Buffer.concat([buffer, Buffer.alloc(padding)]) : buffer;
    const view = views.length;
    views.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    chunks.push(chunk);
    byteOffset += chunk.length;
    return view;
  };
  for (const part of parts) {
    const positions = Buffer.from(new Float32Array(part.positions).buffer);
    const normals = Buffer.from(new Float32Array(part.normals).buffer);
    const maxIndex = Math.max(...part.indices), use32 = maxIndex > 65535;
    const indices = use32 ? Buffer.from(new Uint32Array(part.indices).buffer) : Buffer.from(new Uint16Array(part.indices).buffer);
    const positionView = addBuffer(positions, 34962), normalView = addBuffer(normals, 34962), indexView = addBuffer(indices, 34963);
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < part.positions.length; index += 3) for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], part.positions[index + axis]);
      maximum[axis] = Math.max(maximum[axis], part.positions[index + axis]);
    }
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: positionView, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min: minimum, max: maximum });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: "VEC3" });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: use32 ? 5125 : 5123, count: part.indices.length, type: "SCALAR" });
    const rgb = [1, 3, 5].map(index => parseInt(part.color.slice(index, index + 2), 16) / 255);
    const material = materials.length;
    materials.push({ name: part.name + " material", pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: part.metallic, roughnessFactor: part.roughness }, doubleSided: true });
    primitives.push({ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material, mode: 4, extras: { mingloraPartName: part.name } });
  }
  const binary = Buffer.concat(chunks);
  return {
    asset: {
      version: "2.0", generator: "Minglora Gift Studio",
      extras: {
        mingloraAssetId: "gift-maracas-3d-v1",
        source: "assets/3d-assets/gift-models/maracas-model.mjs",
        artDirection: "a matched pair of separately crafted coral and lagoon maracas with sculpted calabash gourds, tapered hardwood handles, spiral grip wraps, concentric enamel bands, hand-painted diamond seed inlays and radial brass sunbursts",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Maracas - Coral and Lagoon Pair" }],
    meshes: [{ name: "Minglora Original Caribbean Maracas Pair", primitives }],
    materials,
    buffers: [{ byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64") }],
    bufferViews: views, accessors
  };
}
