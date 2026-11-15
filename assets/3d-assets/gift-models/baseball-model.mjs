const TAU = Math.PI * 2;

const normalize = vector => {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return vector.map(value => value / length);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export function createBaseballModel() {
  const parts = [];

  function add(name, positions, normals, indices, color, metallic, roughness) {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Minglora Baseball mesh: " + name);
    }
    const existing = parts.find(part => part.name === name && part.color === color &&
      part.metallic === metallic && part.roughness === roughness);
    if (existing) {
      const offset = existing.positions.length / 3;
      existing.positions.push(...positions);
      existing.normals.push(...normals);
      existing.indices.push(...indices.map(index => index + offset));
    } else {
      parts.push({ name, positions, normals, indices, color, metallic, roughness });
    }
  }

  function ellipsoid(name, center, radii, color, options = {}) {
    const segments = options.segments || 32;
    const rings = options.rings || 20;
    const positions = [], normals = [], indices = [];
    for (let y = 0; y <= rings; y++) {
      const phi = Math.PI * y / rings;
      const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      for (let x = 0; x <= segments; x++) {
        const theta = TAU * x / segments;
        const nx = sinPhi * Math.cos(theta);
        const ny = cosPhi;
        const nz = sinPhi * Math.sin(theta);
        positions.push(
          center[0] + nx * radii[0],
          center[1] + ny * radii[1],
          center[2] + nz * radii[2]
        );
        normals.push(...normalize([nx / radii[0], ny / radii[1], nz / radii[2]]));
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, options.metallic ?? 0.02, options.roughness ?? 0.82);
  }

  function tube(name, points, radius, color, metallic = 0.03, roughness = 0.56, sides = 8) {
    if (points.length < 2) return;
    const positions = [], normals = [], indices = [];
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const tangent = normalize([
        next[0] - previous[0],
        next[1] - previous[1],
        next[2] - previous[2]
      ]);
      const reference = Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const axisU = normalize(cross(tangent, reference));
      const axisV = normalize(cross(tangent, axisU));
      for (let side = 0; side <= sides; side++) {
        const angle = TAU * side / sides;
        const normal = normalize([
          axisU[0] * Math.cos(angle) + axisV[0] * Math.sin(angle),
          axisU[1] * Math.cos(angle) + axisV[1] * Math.sin(angle),
          axisU[2] * Math.cos(angle) + axisV[2] * Math.sin(angle)
        ]);
        positions.push(
          points[i][0] + normal[0] * radius,
          points[i][1] + normal[1] * radius,
          points[i][2] + normal[2] * radius
        );
        normals.push(...normal);
      }
    }
    for (let i = 0; i < points.length - 1; i++) for (let side = 0; side < sides; side++) {
      const a = i * (sides + 1) + side;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }

  function surfacePoint(longitude, latitude, radius = 0.844) {
    const cosLatitude = Math.cos(latitude);
    return [
      radius * cosLatitude * Math.sin(longitude),
      radius * Math.sin(latitude),
      radius * cosLatitude * Math.cos(longitude)
    ];
  }

  // One continuous, rounded leather-covered sphere with slightly warm ivory
  // leather rather than a glossy plastic finish.
  ellipsoid(
    "Baseball - full-grain warm ivory leather shell",
    [0, 0, 0],
    [0.84, 0.84, 0.84],
    "#f3efe2",
    { metallic: 0.0, roughness: 0.91, segments: 104, rings: 68 }
  );

  // Fine, low-contrast leather grain. These tiny raised flecks are merged
  // into one mesh/material so the detail remains lightweight to load.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 164; i++) {
    const y = 1 - (i / 163) * 2;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const direction = [Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius];
    const point = direction.map(value => value * 0.8408);
    const grain = i % 4 === 0 ? "#e9e4d7" : "#f8f4e9";
    ellipsoid("Baseball - fine leather grain", point, [0.0023, 0.0023, 0.0023], grain, {
      metallic: 0,
      roughness: 0.96,
      segments: 5,
      rings: 3
    });
  }

  // Two long curved seam paths follow the ball surface. A dark channel is
  // laid first, followed by a raised red thread cord.
  const seamPaths = [];
  for (const side of [-1, 1]) {
    const pathPoints = [];
    for (let i = 0; i <= 120; i++) {
      const t = -1 + (2 * i) / 120;
      const longitude = t * 2.48;
      const latitude = side * (0.31 + 0.105 * Math.cos(t * Math.PI));
      pathPoints.push(surfacePoint(longitude, latitude, 0.843));
    }
    seamPaths.push({ side, points: pathPoints });
    tube("Baseball - recessed red seam channel", pathPoints, 0.019, "#8f3740", 0.01, 0.88, 8);
    tube("Baseball - raised scarlet cotton seam", pathPoints, 0.0115, "#c6404b", 0.02, 0.72, 8);
  }

  // Distinct diagonal hand-sewn stitches span each curved seam. Every stitch
  // is its own short strand, merged by the helper into a single mesh.
  for (const seam of seamPaths) {
    const points = seam.points;
    for (let i = 5; i < points.length - 5; i += 3) {
      const previous = points[i - 1];
      const next = points[i + 1];
      const tangent = normalize([
        next[0] - previous[0],
        next[1] - previous[1],
        next[2] - previous[2]
      ]);
      const normal = normalize(points[i]);
      const across = normalize(cross(tangent, normal));
      const center = points[i].map((value, axis) => value + normal[axis] * 0.002);
      const halfLength = 0.022;
      const start = center.map((value, axis) => value - across[axis] * halfLength);
      const end = center.map((value, axis) => value + across[axis] * halfLength);
      tube("Baseball - raised red hand-sewn stitches", [start, end], 0.0048, "#ad3540", 0.02, 0.68, 6);
      // A small pale thread highlight gives each raised stitch a readable edge.
      const highlightStart = start.map((value, axis) => value + normal[axis] * 0.003);
      const highlightEnd = end.map((value, axis) => value + normal[axis] * 0.003);
      tube("Baseball - stitch thread highlights", [highlightStart, highlightEnd], 0.0019, "#f4d6c9", 0.0, 0.88, 5);
    }
  }

  const chunks = [], bufferViews = [], accessors = [], primitives = [], materials = [];
  let byteOffset = 0;
  function addBuffer(buffer, target) {
    const padding = (4 - (buffer.length % 4)) % 4;
    const padded = padding ? Buffer.concat([buffer, Buffer.alloc(padding)]) : buffer;
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    chunks.push(padded);
    byteOffset += padded.length;
    return view;
  }

  for (const part of parts) {
    const positionBuffer = Buffer.from(new Float32Array(part.positions).buffer);
    const normalBuffer = Buffer.from(new Float32Array(part.normals).buffer);
    const maxIndex = Math.max(...part.indices);
    const use32Bit = maxIndex > 65535;
    const indexBuffer = use32Bit
      ? Buffer.from(new Uint32Array(part.indices).buffer)
      : Buffer.from(new Uint16Array(part.indices).buffer);
    const positionView = addBuffer(positionBuffer, 34962);
    const normalView = addBuffer(normalBuffer, 34962);
    const indexView = addBuffer(indexBuffer, 34963);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], part.positions[i + axis]);
      max[axis] = Math.max(max[axis], part.positions[i + axis]);
    }
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: part.positions.length / 3,
      type: "VEC3",
      min,
      max
    });
    const normalAccessor = accessors.length;
    accessors.push({
      bufferView: normalView,
      componentType: 5126,
      count: part.normals.length / 3,
      type: "VEC3"
    });
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView,
      componentType: use32Bit ? 5125 : 5123,
      count: part.indices.length,
      type: "SCALAR"
    });
    const rgb = [1, 3, 5].map(index => parseInt(part.color.slice(index, index + 2), 16) / 255);
    const materialIndex = materials.length;
    materials.push({
      name: part.name + " PBR finish",
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb, 1],
        metallicFactor: part.metallic,
        roughnessFactor: part.roughness
      },
      doubleSided: true
    });
    primitives.push({
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
      indices: indexAccessor,
      material: materialIndex,
      mode: 4,
      extras: { mingloraPartName: part.name }
    });
  }

  const binary = Buffer.concat(chunks);
  return {
    asset: {
      version: "2.0",
      generator: "Minglora Gift Studio",
      extras: {
        mingloraAssetId: "gift-baseball-3d-v1",
        source: "assets/3d-assets/gift-models/baseball-model.mjs",
        artDirection: "original full-grain ivory baseball sculpture with curved recessed red seam channels, individually raised hand-sewn red cotton stitches and subtle leather-grain detail",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Baseball - Full-grain Leather Ball and Hand-sewn Seams" }],
    meshes: [{ name: "Minglora Baseball - Leather, Seam Channels, Cotton Stitching and Grain", primitives }],
    materials,
    buffers: [{
      byteLength: binary.length,
      uri: "data:application/octet-stream;base64," + binary.toString("base64")
    }],
    bufferViews,
    accessors
  };
}
