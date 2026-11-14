const TAU = Math.PI * 2;

function unit(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return vector.map(value => value / length);
}

export function createGamerOtterModel() {
  const parts = [];

  function add(name, positions, normals, indices, color, metallic = 0.02, roughness = 0.48) {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Gamer Otter mesh: " + name);
    }
    parts.push({ name, positions, normals, indices, color, metallic, roughness });
  }

  function ellipsoid(name, center, radii, color, options = {}) {
    const segments = options.segments || 24;
    const rings = options.rings || 16;
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
        normals.push(...unit([nx / radii[0], ny / radii[1], nz / radii[2]]));
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, options.metallic ?? 0.02, options.roughness ?? 0.48);
  }

  function cylinderBetween(name, start, end, radius, color, metallic = 0.05, roughness = 0.42, sides = 12) {
    const direction = unit([end[0] - start[0], end[1] - start[1], end[2] - start[2]]);
    const reference = Math.abs(direction[1]) > 0.88 ? [1, 0, 0] : [0, 1, 0];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const u = unit(cross(direction, reference));
    const v = unit(cross(direction, u));
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring < 2; ring++) {
      const center = ring ? end : start;
      for (let i = 0; i <= sides; i++) {
        const angle = TAU * i / sides;
        const radial = [
          u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
          u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
          u[2] * Math.cos(angle) + v[2] * Math.sin(angle)
        ];
        positions.push(
          center[0] + radial[0] * radius,
          center[1] + radial[1] * radius,
          center[2] + radial[2] * radius
        );
        normals.push(...radial);
      }
    }
    for (let i = 0; i < sides; i++) {
      const a = i, b = sides + 1 + i;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }

  function tube(name, points, radius, color, metallic = 0.02, roughness = 0.52) {
    for (let i = 0; i < points.length - 1; i++) {
      cylinderBetween(name + " segment " + (i + 1), points[i], points[i + 1], radius, color, metallic, roughness, 10);
    }
  }

  // Small, stable presentation plinth; the subject remains the visual focus.
  ellipsoid("Gamer Otter midnight presentation plinth", [0, -0.69, 0], [0.57, 0.075, 0.43], "#17233d", { metallic: 0.48, roughness: 0.3 });
  ellipsoid("Gamer Otter cyan plinth inlay", [0, -0.635, 0], [0.49, 0.018, 0.36], "#43d4d2", { metallic: 0.58, roughness: 0.26 });

  // Sculpted otter body, warm muzzle, cheek pads and layered facial details.
  ellipsoid("Otter compact seated body - deep umber fur", [0, -0.12, -0.015], [0.34, 0.46, 0.29], "#68402f", { roughness: 0.86 });
  ellipsoid("Otter soft chest bib - warm cream", [0, -0.16, 0.248], [0.235, 0.31, 0.075], "#dfc29a", { roughness: 0.9 });
  ellipsoid("Otter rounded head - chestnut fur", [0, 0.43, 0.015], [0.365, 0.325, 0.305], "#805039", { roughness: 0.84 });
  ellipsoid("Otter left cheek", [-0.185, 0.3, 0.245], [0.155, 0.115, 0.09], "#b37d59", { roughness: 0.82 });
  ellipsoid("Otter right cheek", [0.185, 0.3, 0.245], [0.155, 0.115, 0.09], "#b37d59", { roughness: 0.82 });
  ellipsoid("Otter muzzle - sculpted cream", [0, 0.265, 0.302], [0.205, 0.125, 0.105], "#ead5b4", { roughness: 0.9 });
  ellipsoid("Otter nose - polished cocoa", [0, 0.333, 0.397], [0.061, 0.043, 0.034], "#261d1b", { metallic: 0.04, roughness: 0.22 });
  ellipsoid("Otter nose glint", [-0.019, 0.35, 0.425], [0.012, 0.008, 0.006], "#fff0d6", { roughness: 0.12 });

  // Eyes sit above the muzzle and use dedicated highlights for legible expression.
  for (const side of [-1, 1]) {
    const x = side * 0.135;
    ellipsoid(side < 0 ? "Otter left eye" : "Otter right eye", [x, 0.492, 0.279], [0.035, 0.049, 0.025], "#241a19", { roughness: 0.18 });
    ellipsoid(side < 0 ? "Otter left eye catchlight" : "Otter right eye catchlight", [x - 0.009, 0.512, 0.301], [0.009, 0.012, 0.006], "#fff7e9", { roughness: 0.1 });
    ellipsoid(side < 0 ? "Otter left ear" : "Otter right ear", [side * 0.31, 0.665, 0.005], [0.105, 0.12, 0.09], "#754731", { roughness: 0.86 });
    ellipsoid(side < 0 ? "Otter left inner ear" : "Otter right inner ear", [side * 0.315, 0.663, 0.075], [0.056, 0.066, 0.025], "#d49a78", { roughness: 0.78 });
    ellipsoid(side < 0 ? "Otter left paw" : "Otter right paw", [side * 0.265, -0.34, 0.285], [0.13, 0.095, 0.105], "#79503b", { roughness: 0.9 });
  }
  tube("Otter mouth smile", [[-0.064, 0.205, 0.38], [0, 0.18, 0.389], [0.064, 0.205, 0.38]], 0.008, "#694536", 0, 0.72);
  for (const side of [-1, 1]) {
    for (let whisker = 0; whisker < 3; whisker++) {
      const y = 0.275 - whisker * 0.035;
      tube("Otter whisker " + side + " " + (whisker + 1), [
        [side * 0.115, y, 0.37],
        [side * 0.22, y + (whisker - 1) * 0.018, 0.39],
        [side * 0.31, y + (whisker - 1) * 0.035, 0.37]
      ], 0.0035, "#9d795d", 0, 0.78);
    }
  }

  // Curved tail and two feet make the seated character read as an otter.
  tube("Otter curled tail", [
    [0, -0.34, -0.23], [0.12, -0.46, -0.36], [0.28, -0.48, -0.35],
    [0.39, -0.39, -0.25], [0.36, -0.29, -0.16]
  ], 0.075, "#5a382b", 0.01, 0.82);
  ellipsoid("Otter left webbed foot", [-0.2, -0.55, 0.16], [0.17, 0.085, 0.16], "#67402f", { roughness: 0.9 });
  ellipsoid("Otter right webbed foot", [0.2, -0.55, 0.16], [0.17, 0.085, 0.16], "#67402f", { roughness: 0.9 });
  for (const side of [-1, 1]) {
    for (let toe = 0; toe < 3; toe++) {
      ellipsoid("Otter toe " + side + " " + (toe + 1), [side * 0.2 + (toe - 1) * 0.055, -0.56, 0.292], [0.018, 0.026, 0.018], "#c39a7a", { roughness: 0.84 });
    }
  }

  // A padded gaming headset follows the head silhouette, with a flexible boom mic.
  tube("Gaming headset padded arch", [
    [-0.34, 0.49, 0.015], [-0.32, 0.69, 0.005], [-0.2, 0.83, 0.005],
    [0, 0.885, 0.005], [0.2, 0.83, 0.005], [0.32, 0.69, 0.005], [0.34, 0.49, 0.015]
  ], 0.037, "#273452", 0.56, 0.28);
  ellipsoid("Gaming headset left ear cup", [-0.355, 0.465, 0.035], [0.09, 0.145, 0.09], "#273452", { metallic: 0.48, roughness: 0.3 });
  ellipsoid("Gaming headset right ear cup", [0.355, 0.465, 0.035], [0.09, 0.145, 0.09], "#273452", { metallic: 0.48, roughness: 0.3 });
  ellipsoid("Gaming headset left cyan ring", [-0.355, 0.465, 0.108], [0.056, 0.103, 0.022], "#4ad8df", { metallic: 0.62, roughness: 0.24 });
  ellipsoid("Gaming headset right cyan ring", [0.355, 0.465, 0.108], [0.056, 0.103, 0.022], "#4ad8df", { metallic: 0.62, roughness: 0.24 });
  ellipsoid("Gaming headset left cushion", [-0.355, 0.465, 0.13], [0.034, 0.074, 0.014], "#101c31", { roughness: 0.62 });
  ellipsoid("Gaming headset right cushion", [0.355, 0.465, 0.13], [0.034, 0.074, 0.014], "#101c31", { roughness: 0.62 });
  tube("Gaming headset microphone boom", [
    [0.405, 0.41, 0.08], [0.43, 0.29, 0.18], [0.32, 0.2, 0.29], [0.2, 0.205, 0.34]
  ], 0.012, "#273452", 0.5, 0.32);
  ellipsoid("Gaming headset microphone capsule", [0.192, 0.205, 0.35], [0.035, 0.024, 0.026], "#4ad8df", { metallic: 0.42, roughness: 0.25 });

  // The otter holds a custom controller with a cross pad, thumbsticks and four lit buttons.
  tube("Otter left arm", [[-0.24, -0.02, 0.2], [-0.31, -0.13, 0.31], [-0.22, -0.27, 0.39]], 0.067, "#805039", 0.01, 0.86);
  tube("Otter right arm", [[0.24, -0.02, 0.2], [0.31, -0.13, 0.31], [0.22, -0.27, 0.39]], 0.067, "#805039", 0.01, 0.86);
  ellipsoid("Gamer controller shell", [0, -0.3, 0.425], [0.31, 0.11, 0.105], "#2b3656", { metallic: 0.42, roughness: 0.3 });
  ellipsoid("Gamer controller center touch panel", [0, -0.252, 0.51], [0.09, 0.025, 0.018], "#17213b", { metallic: 0.35, roughness: 0.25 });
  tube("Controller D-pad vertical", [[-0.19, -0.3, 0.51], [-0.19, -0.3, 0.54]], 0.018, "#f1c66f", 0.5, 0.27);
  tube("Controller D-pad horizontal", [[-0.22, -0.3, 0.525], [-0.16, -0.3, 0.525]], 0.018, "#f1c66f", 0.5, 0.27);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const x = 0.19 + Math.cos(angle) * 0.038;
    const y = -0.3 + Math.sin(angle) * 0.038;
    ellipsoid("Controller face button " + (i + 1), [x, y, 0.525], [0.022, 0.022, 0.018],
      ["#4ad8df", "#f28bb6", "#e9c367", "#9b91ff"][i], { metallic: 0.36, roughness: 0.24, segments: 12, rings: 8 });
  }
  ellipsoid("Controller left thumbstick", [-0.09, -0.288, 0.526], [0.039, 0.039, 0.025], "#151d33", { metallic: 0.24, roughness: 0.35 });
  ellipsoid("Controller right thumbstick", [0.09, -0.288, 0.526], [0.039, 0.039, 0.025], "#151d33", { metallic: 0.24, roughness: 0.35 });
  ellipsoid("Controller cyan status light", [0, -0.253, 0.532], [0.019, 0.009, 0.006], "#78f4ee", { metallic: 0.65, roughness: 0.18 });

  // Four floating pixel sparks are separate meshes for clean selection and shading.
  const sparkColors = ["#54e3dc", "#f3c66c", "#a79aff", "#f18ab5"];
  for (let i = 0; i < 4; i++) {
    const angle = i * TAU / 4 + Math.PI / 4;
    const center = [Math.cos(angle) * 0.53, 0.18 + Math.sin(angle) * 0.43, 0.08];
    ellipsoid("Gamer Otter floating arcade sparkle " + (i + 1), center, [0.035, 0.035, 0.035], sparkColors[i], { metallic: 0.42, roughness: 0.23, segments: 12, rings: 8 });
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
    const maximumIndex = Math.max(...part.indices);
    const use32BitIndices = maximumIndex > 65535;
    const indexBuffer = use32BitIndices
      ? Buffer.from(new Uint32Array(part.indices).buffer)
      : Buffer.from(new Uint16Array(part.indices).buffer);
    const positionView = addBuffer(positionBuffer, 34962);
    const normalView = addBuffer(normalBuffer, 34962);
    const indexView = addBuffer(indexBuffer, 34963);
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], part.positions[i + axis]);
        maximum[axis] = Math.max(maximum[axis], part.positions[i + axis]);
      }
    }
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: positionView, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min: minimum, max: maximum });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: "VEC3" });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: use32BitIndices ? 5125 : 5123, count: part.indices.length, type: "SCALAR" });
    const rgb = [1, 3, 5].map(index => parseInt(part.color.slice(index, index + 2), 16) / 255);
    const materialIndex = materials.length;
    materials.push({
      name: part.name,
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
        mingloraAssetId: "gift-gamer-otter-3d-v1",
        source: "assets/3d-assets/gift-models/gamer-otter-model.mjs",
        artDirection: "original seated otter character with sculpted chestnut fur, warm muzzle, webbed paws, curled tail, padded cyan-lit gaming headset, boom microphone and a custom four-button controller with thumbsticks and cross pad",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Gamer Otter - Seated Arcade Companion" }],
    meshes: [{ name: "Minglora Gamer Otter - Character, Headset and Controller", primitives }],
    materials,
    buffers: [{ byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64") }],
    bufferViews,
    accessors
  };
}
