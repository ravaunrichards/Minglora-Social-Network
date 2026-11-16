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

export function createToucanModel() {
  const parts = [];

  function add(name, positions, normals, indices, color, metallic = 0.02, roughness = 0.66) {
    if (!name || !positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Toucan mesh: " + name);
    }
    if (positions.some(value => !Number.isFinite(value)) || normals.some(value => !Number.isFinite(value))) {
      throw new Error("Non-finite Toucan geometry: " + name);
    }
    const vertexCount = positions.length / 3;
    if (indices.some(index => !Number.isInteger(index) || index < 0 || index >= vertexCount)) {
      throw new Error("Out-of-range Toucan index: " + name);
    }
    parts.push({ name, positions, normals, indices, color, metallic, roughness });
  }

  function ellipsoid(name, center, radii, color, options = {}) {
    const segments = options.segments || 26;
    const rings = options.rings || 18;
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
        normals.push(...unit(nx / radii[0], ny / radii[1], nz / radii[2]));
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, options.metallic ?? 0.02, options.roughness ?? 0.66);
  }

  function taperedTube(name, points, radii, color, options = {}) {
    const sides = options.sides || 12;
    const positions = [], normals = [], indices = [];
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const tangent = unit(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]);
      const reference = Math.abs(tangent[1]) > 0.88 ? [0, 0, 1] : [0, 1, 0];
      const u = unit(...cross(tangent, reference));
      const v = unit(...cross(tangent, u));
      const radius = Array.isArray(radii) ? radii[i] : radii;
      if (!Number.isFinite(radius) || radius <= 0) throw new Error("Invalid Toucan tube radius: " + name);
      for (let j = 0; j <= sides; j++) {
        const angle = TAU * j / sides;
        const nx = u[0] * Math.cos(angle) + v[0] * Math.sin(angle);
        const ny = u[1] * Math.cos(angle) + v[1] * Math.sin(angle);
        const nz = u[2] * Math.cos(angle) + v[2] * Math.sin(angle);
        positions.push(
          points[i][0] + nx * radius,
          points[i][1] + ny * radius,
          points[i][2] + nz * radius
        );
        normals.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, options.metallic ?? 0.02, options.roughness ?? 0.58);
  }

  function tube(name, points, radius, color, options = {}) {
    taperedTube(name, points, radius, color, options);
  }

  function leaf(name, start, end, width, color, highlight) {
    const centerline = [
      start,
      [
        start[0] * 0.38 + end[0] * 0.62,
        start[1] * 0.38 + end[1] * 0.62 + width * 0.16,
        start[2] * 0.38 + end[2] * 0.62
      ],
      end
    ];
    tube(name + " central rib", centerline, 0.0055, highlight, { roughness: 0.72 });
    const tangent = unit(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const side = unit(...cross(tangent, [0, 0, 1]));
    const opposite = unit(...cross(tangent, side));
    const positions = [], normals = [], indices = [];
    const along = 12, across = 6;
    for (let i = 0; i <= along; i++) {
      const u = i / along;
      const taper = Math.pow(Math.sin(Math.PI * u), 0.72);
      const cx = start[0] + (end[0] - start[0]) * u;
      const cy = start[1] + (end[1] - start[1]) * u + width * 0.14 * Math.sin(Math.PI * u);
      const cz = start[2] + (end[2] - start[2]) * u;
      for (let j = 0; j <= across; j++) {
        const v = j / across * 2 - 1;
        const bulge = 0.018 * (1 - v * v) * taper;
        positions.push(
          cx + side[0] * width * taper * v + opposite[0] * bulge,
          cy + side[1] * width * taper * v + opposite[1] * bulge,
          cz + side[2] * width * taper * v + opposite[2] * bulge
        );
        normals.push(...opposite);
      }
    }
    for (let i = 0; i < along; i++) for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j, b = a + across + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, 0.01, 0.78);
  }

  // Rainforest perch: a naturally curved branch with small, individually modelled leaves.
  tube("Toucan rainforest perch - textured branch", [
    [-0.78, -0.69, 0.035], [-0.48, -0.66, 0.02], [-0.12, -0.675, 0.015],
    [0.22, -0.66, 0.02], [0.55, -0.685, 0.05], [0.77, -0.65, 0.08]
  ], 0.043, "#765039", { roughness: 0.88 });
  tube("Toucan perch bark highlight", [
    [-0.72, -0.635, 0.07], [-0.31, -0.622, 0.06], [0.12, -0.632, 0.06], [0.61, -0.64, 0.085]
  ], 0.008, "#b17a50", { roughness: 0.82 });
  leaf("Rainforest leaf left", [-0.56, -0.66, 0.04], [-0.78, -0.38, 0.02], 0.105, "#258c58", "#72c85e");
  leaf("Rainforest leaf right", [0.53, -0.665, 0.08], [0.78, -0.39, 0.09], 0.11, "#237e4d", "#83c85c");
  leaf("Rainforest leaf lower", [-0.35, -0.67, 0.01], [-0.47, -0.84, 0.08], 0.082, "#14724a", "#5dbd66");

  // Compact black body, layered wings and the characteristic yellow breast bib.
  ellipsoid("Toucan sculpted glossy-black body plumage", [0, -0.12, -0.12], [0.335, 0.435, 0.295], "#000000", { roughness: 0.98, metallic: 0.0 });
  ellipsoid("Toucan bright golden-yellow throat and chest bib", [0, 0.055, 0.115], [0.245, 0.355, 0.19], "#c89518", { roughness: 0.92, metallic: 0.0 });
  ellipsoid("Toucan cream lower breast transition", [0, -0.235, 0.16], [0.202, 0.19, 0.115], "#f4e5b2", { roughness: 0.88 });
  ellipsoid("Toucan scarlet undertail coverts", [0, -0.43, -0.245], [0.205, 0.11, 0.105], "#d63c36", { roughness: 0.72 });
  ellipsoid("Toucan upper rump white accent", [0, -0.36, -0.34], [0.16, 0.09, 0.075], "#eee9d9", { roughness: 0.82 });

  for (const side of [-1, 1]) {
    ellipsoid(side < 0 ? "Toucan left folded wing" : "Toucan right folded wing",
      [side * 0.255, -0.085, -0.065], [0.125, 0.285, 0.245], "#020407", { roughness: 0.96, metallic: 0.0 });
    ellipsoid(side < 0 ? "Toucan left wing coverts" : "Toucan right wing coverts",
      [side * 0.315, -0.105, 0.055], [0.075, 0.205, 0.17], "#0d202a", { roughness: 0.9, metallic: 0.0 });
    for (let feather = 0; feather < 5; feather++) {
      const spread = feather - 2;
      tube(
        "Toucan " + (side < 0 ? "left" : "right") + " layered wing feather " + (feather + 1),
        [
          [side * 0.285, -0.02 - feather * 0.035, 0.12],
          [side * (0.34 + Math.abs(spread) * 0.012), -0.18 - feather * 0.028, 0.02],
          [side * (0.29 + spread * 0.035), -0.40 - feather * 0.012, -0.17]
        ],
        0.018,
        feather % 2 ? "#243e4c" : "#18232d",
        { roughness: 0.6 }
      );
    }
  }

  // Short square tail with the red undertail signature and subtle green-blue feather edges.
  for (let feather = -2; feather <= 2; feather++) {
    const x = feather * 0.055;
    tube("Toucan tail feather " + (feather + 3), [
      [x * 0.55, -0.35, -0.29],
      [x * 0.82, -0.52, -0.47],
      [x, -0.71, -0.58]
    ], 0.018, feather === 0 ? "#18222b" : (feather % 2 ? "#294a4a" : "#202b37"), { roughness: 0.62 });
  }
  tube("Toucan tail red feather base", [[-0.12, -0.4, -0.32], [0, -0.48, -0.37], [0.12, -0.4, -0.32]], 0.026, "#cf3437", { roughness: 0.68 });

  // Head and face: black crown, yellow-green facial mask and blue-green bare eye skin.
  ellipsoid("Toucan rounded black crown and head", [0, 0.455, -0.035], [0.265, 0.285, 0.255], "#000000", { roughness: 0.98, metallic: 0.0 });
  ellipsoid("Toucan yellow-green cheek mask", [0, 0.41, 0.145], [0.205, 0.17, 0.112], "#e7dc53", { roughness: 0.78 });
  for (const side of [-1, 1]) {
    ellipsoid(side < 0 ? "Toucan left turquoise eye skin" : "Toucan right turquoise eye skin",
      [side * 0.155, 0.515, 0.205], [0.078, 0.083, 0.032], "#3ab8a5", { roughness: 0.48 });
    ellipsoid(side < 0 ? "Toucan left golden iris" : "Toucan right golden iris",
      [side * 0.155, 0.515, 0.232], [0.047, 0.055, 0.019], "#b2d64b", { roughness: 0.36 });
    ellipsoid(side < 0 ? "Toucan left dark pupil" : "Toucan right dark pupil",
      [side * 0.155, 0.515, 0.247], [0.022, 0.033, 0.012], "#10151c", { roughness: 0.2 });
    ellipsoid(side < 0 ? "Toucan left eye catchlight" : "Toucan right eye catchlight",
      [side * 0.163, 0.535, 0.258], [0.008, 0.011, 0.006], "#ffffff", { roughness: 0.15 });
  }
  tube("Toucan black facial bill seam", [[0, 0.62, 0.12], [0, 0.55, 0.17], [0, 0.47, 0.185]], 0.012, "#111a20", { roughness: 0.48 });

  // The oversized, banana-curved keel-billed bill is split into coloured keratin zones.
  taperedTube("Toucan oversized lime-green upper bill", [
    [0, 0.52, 0.18], [0, 0.55, 0.34], [0, 0.53, 0.52], [0, 0.46, 0.68], [0, 0.34, 0.79]
  ], [0.098, 0.142, 0.148, 0.095, 0.008], "#91c42d", { sides: 24, roughness: 0.48, metallic: 0.0 });
  taperedTube("Toucan turquoise lower mandible", [
    [0, 0.425, 0.18], [0, 0.40, 0.36], [0, 0.355, 0.54], [0, 0.315, 0.68]
  ], [0.072, 0.095, 0.075, 0.006], "#138fa7", { sides: 20, roughness: 0.5, metallic: 0.0 });
  ellipsoid("Toucan orange bill blaze", [0, 0.555, 0.49], [0.104, 0.053, 0.19], "#ef762c", { roughness: 0.36 });
  // Raised blaze stripe follows the camera-facing keratin surface; the inset colour
  // region above remains as its underlying enamel layer.
  tube("Toucan exposed orange upper-bill blaze stripe", [
    [-0.108, 0.60, 0.295],
    [-0.128, 0.615, 0.385],
    [-0.135, 0.595, 0.475],
    [-0.12, 0.555, 0.56],
    [-0.09, 0.51, 0.635]
  ], 0.028, "#d94b16", { roughness: 0.68, metallic: 0.0 });

  ellipsoid("Toucan red upper bill tip", [0, 0.365, 0.755], [0.065, 0.055, 0.06], "#d93631", { roughness: 0.32 });
  ellipsoid("Toucan deep-blue lower bill tip", [0, 0.315, 0.665], [0.061, 0.026, 0.065], "#1687b7", { roughness: 0.36 });
  tube("Toucan upper bill ridge highlight", [
    [0, 0.635, 0.22], [0, 0.665, 0.38], [0, 0.642, 0.54], [0, 0.565, 0.68]
  ], 0.008, "#e8f08a", { roughness: 0.3 });
  tube("Toucan bill lower edge highlight", [
    [-0.06, 0.35, 0.28], [-0.065, 0.335, 0.48], [-0.045, 0.305, 0.61]
  ], 0.006, "#8fe1db", { roughness: 0.34 });

  // Blue-grey legs and zygodactyl feet: two toes forward and two toes back on each foot.
  for (const side of [-1, 1]) {
    const footX = side * 0.125;
    tube("Toucan " + (side < 0 ? "left" : "right") + " blue-grey leg", [
      [footX, -0.39, 0.02], [footX * 0.98, -0.53, 0.07], [footX, -0.655, 0.075]
    ], 0.021, "#527f91", { roughness: 0.62 });
    tube("Toucan " + (side < 0 ? "left" : "right") + " forward outer toe", [
      [footX, -0.65, 0.075], [footX + side * 0.06, -0.685, 0.16], [footX + side * 0.075, -0.675, 0.24]
    ], 0.014, "#557f90");
    tube("Toucan " + (side < 0 ? "left" : "right") + " forward inner toe", [
      [footX, -0.65, 0.075], [footX - side * 0.045, -0.69, 0.17], [footX - side * 0.055, -0.68, 0.245]
    ], 0.014, "#557f90");
    tube("Toucan " + (side < 0 ? "left" : "right") + " backward outer toe", [
      [footX, -0.65, 0.06], [footX + side * 0.055, -0.685, -0.015], [footX + side * 0.065, -0.67, -0.09]
    ], 0.013, "#557f90");
    tube("Toucan " + (side < 0 ? "left" : "right") + " backward inner toe", [
      [footX, -0.65, 0.06], [footX - side * 0.04, -0.685, -0.025], [footX - side * 0.05, -0.67, -0.105]
    ], 0.013, "#557f90");
    for (const offset of [-0.06, 0.06]) {
      tube("Toucan " + (side < 0 ? "left" : "right") + " toe claw " + (offset < 0 ? "inner" : "outer"), [
        [footX + offset * 0.72, -0.68, 0.22],
        [footX + offset, -0.672, 0.265],
        [footX + offset * 1.05, -0.657, 0.27]
      ], 0.0065, "#27343a", { roughness: 0.44 });
    }
  }

  // Present the bird in a three-quarter profile so the keel-billed beak reads horizontally
  // in the existing model-viewer's front camera instead of pointing directly into the lens.
  const presentationYaw = 64 * Math.PI / 180;
  const yawCos = Math.cos(presentationYaw), yawSin = Math.sin(presentationYaw);
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      if (part.name.startsWith("Toucan rainforest perch") || part.name === "Toucan perch bark highlight" || part.name.startsWith("Rainforest leaf")) continue;
      const x = part.positions[i], z = part.positions[i + 2];
      part.positions[i] = x * yawCos + z * yawSin;
      part.positions[i + 2] = -x * yawSin + z * yawCos;
      const nx = part.normals[i], nz = part.normals[i + 2];
      part.normals[i] = nx * yawCos + nz * yawSin;
      part.normals[i + 2] = -nx * yawSin + nz * yawCos;
    }
  }

  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const primitives = [];
  let byteOffset = 0;

  function appendBuffer(buffer, target) {
    const padding = (4 - (byteOffset % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteOffset += padding;
    }
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    chunks.push(buffer);
    byteOffset += buffer.length;
    return index;
  }

  for (const part of parts) {
    const positionBytes = Buffer.from(Float32Array.from(part.positions).buffer);
    const normalBytes = Buffer.from(Float32Array.from(part.normals).buffer);
    const indexArray = Uint16Array.from(part.indices);
    const indexBytes = Buffer.from(indexArray.buffer);
    const positionView = appendBuffer(positionBytes, 34962);
    const normalView = appendBuffer(normalBytes, 34962);
    const indexView = appendBuffer(indexBytes, 34963);
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], part.positions[i + axis]);
      maximum[axis] = Math.max(maximum[axis], part.positions[i + axis]);
    }
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: positionView, componentType: 5126, count: part.positions.length / 3,
      type: "VEC3", min: minimum, max: maximum
    });
    const normalAccessor = accessors.length;
    accessors.push({
      bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: "VEC3"
    });
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView, componentType: 5123, count: part.indices.length, type: "SCALAR"
    });
    const rgb = [1, 3, 5].map(index => parseInt(part.color.slice(index, index + 2), 16) / 255);
    const material = materials.length;
    materials.push({
      name: part.name + " PBR material",
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
      material,
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
        mingloraAssetId: "gift-toucan-3d-v1",
        source: "assets/3d-assets/gift-models/toucan-model.mjs",
        artDirection: "original three-quarter-profile keel-billed rainforest toucan with near-black matte plumage, rich golden-yellow throat bib, turquoise eye skin with an exposed orange bill blaze stripe, oversized horizontally presented banana-curved lime bill with orange blaze and red-blue tips, layered wings, scarlet undertail, zygodactyl feet and natural perch",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Toucan - Keel-billed Rainforest Bird Sculpture" }],
    meshes: [{ name: "Minglora Toucan - Layered Plumage and Multicolour Keratin Bill", primitives }],
    materials,
    buffers: [{
      byteLength: binary.length,
      uri: "data:application/octet-stream;base64," + binary.toString("base64")
    }],
    bufferViews,
    accessors
  };
}
