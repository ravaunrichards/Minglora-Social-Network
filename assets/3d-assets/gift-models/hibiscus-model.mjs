const TAU = Math.PI * 2;
const unit = (x, y, z) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

export function createHibiscusModel() {
  const parts = [];
  const add = (name, positions, normals, indices, color, metallic = 0.015, roughness = 0.4) => {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Hibiscus mesh " + name);
    }
    parts.push({name, positions, normals, indices, color, metallic, roughness});
  };

  function surfacePetal(name, angle, y0, length, width, radius, curl, color, uSteps = 18, vSteps = 12, roughness = 0.34) {
    const c = Math.cos(angle), s = Math.sin(angle), grid = [], positions = [], normals = [], indices = [];
    const point = (i, j) => {
      const u = i / uSteps, v = j / vSteps * 2 - 1;
      const taper = Math.pow(Math.max(0.001, Math.sin(Math.PI * (0.12 + u * 0.79))), 0.72);
      const r = radius + length * u;
      const side = v * width * taper;
      const raised = 0.055 * (1 - v * v) * Math.sin(Math.PI * u);
      return [r * c - side * s, y0 + curl * u * u + raised, r * s + side * c];
    };
    for (let i = 0; i <= uSteps; i++) {
      grid[i] = [];
      for (let j = 0; j <= vSteps; j++) {
        const p = point(i, j);
        grid[i][j] = p;
        positions.push(...p);
      }
    }
    for (let i = 0; i <= uSteps; i++) for (let j = 0; j <= vSteps; j++) {
      const a = grid[Math.max(0, i - 1)][j], b = grid[Math.min(uSteps, i + 1)][j];
      const d = grid[i][Math.max(0, j - 1)], e = grid[i][Math.min(vSteps, j + 1)];
      const du = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const dv = [e[0] - d[0], e[1] - d[1], e[2] - d[2]];
      normals.push(...unit(
        dv[1] * du[2] - dv[2] * du[1],
        dv[2] * du[0] - dv[0] * du[2],
        dv[0] * du[1] - dv[1] * du[0]
      ));
    }
    for (let i = 0; i < uSteps; i++) for (let j = 0; j < vSteps; j++) {
      const a = i * (vSteps + 1) + j, b = a + vSteps + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    add(name, positions, normals, indices, color, 0.012, roughness);
  }

  function ellipsoid(name, cx, cy, cz, sx, sy, sz, color, roughness = 0.3, metallic = 0.01) {
    const segments = 18, rings = 12, positions = [], normals = [], indices = [];
    for (let y = 0; y <= rings; y++) {
      const phi = Math.PI * y / rings;
      for (let x = 0; x <= segments; x++) {
        const theta = TAU * x / segments;
        const nx = Math.sin(phi) * Math.cos(theta), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(theta);
        positions.push(cx + nx * sx, cy + ny * sy, cz + nz * sz);
        normals.push(...unit(nx / sx, ny / sy, nz / sz));
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }

  function taperedStem(name, start, end, lowRadius, highRadius, color, metallic = 0.01, roughness = 0.5) {
    const direction = unit(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const reference = Math.abs(direction[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const tangent = unit(
      direction[1] * reference[2] - direction[2] * reference[1],
      direction[2] * reference[0] - direction[0] * reference[2],
      direction[0] * reference[1] - direction[1] * reference[0]
    );
    const bitangent = unit(
      direction[1] * tangent[2] - direction[2] * tangent[1],
      direction[2] * tangent[0] - direction[0] * tangent[2],
      direction[0] * tangent[1] - direction[1] * tangent[0]
    );
    const segments = 12, positions = [], normals = [], indices = [];
    for (let ring = 0; ring <= 1; ring++) {
      const center = ring ? end : start, radius = ring ? highRadius : lowRadius;
      for (let i = 0; i <= segments; i++) {
        const angle = TAU * i / segments, ca = Math.cos(angle), sa = Math.sin(angle);
        const radial = [
          tangent[0] * ca + bitangent[0] * sa,
          tangent[1] * ca + bitangent[1] * sa,
          tangent[2] * ca + bitangent[2] * sa
        ];
        positions.push(center[0] + radial[0] * radius, center[1] + radial[1] * radius, center[2] + radial[2] * radius);
        normals.push(...radial);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = i, b = i + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }

  // Tapered stem, calyx and three individually surfaced leaves.
  taperedStem("Hibiscus stem", [0, -0.86, 0], [0, 0.68, 0], 0.026, 0.018, "#287448");
  ellipsoid("Hibiscus calyx", 0, 0.67, 0, 0.16, 0.11, 0.16, "#2f8b4c", 0.5);
  surfacePetal("Leaf left - sculpted", Math.PI + 0.38, -0.18, 0.46, 0.14, 0.018, 0.12, "#318f4e", 16, 10, 0.5);
  surfacePetal("Leaf right - sculpted", -0.52, -0.36, 0.39, 0.12, 0.012, 0.15, "#45a85c", 16, 10, 0.48);
  surfacePetal("Upper leaf - sculpted", 2.42, -0.08, 0.3, 0.095, 0.01, 0.1, "#267b43", 14, 10, 0.52);

  // Five pointed sepals sit beneath the flower head.
  for (let i = 0; i < 5; i++) {
    surfacePetal("Hibiscus sepal " + (i + 1), i * TAU / 5, 0.64, 0.22, 0.052, 0.025, -0.12, "#2c8148", 12, 8, 0.52);
  }

  // Five broad, cupped hibiscus petals with alternating coral-pink finishes.
  const petalColors = ["#e94f78", "#f36a8b", "#df3e6c", "#f47b98", "#cf355f"];
  for (let i = 0; i < 5; i++) {
    surfacePetal(
      "Hibiscus satin petal " + (i + 1),
      i * TAU / 5 + 0.08,
      0.75,
      0.69,
      0.205,
      0.055,
      0.12 + (i % 2) * 0.025,
      petalColors[i],
      22,
      14,
      0.31 + (i % 2) * 0.035
    );
  }

  // Raised throat and central column with separated anthers and golden pollen tips.
  ellipsoid("Flower throat - deep coral", 0, 0.795, 0, 0.18, 0.095, 0.18, "#c82f5e", 0.28);
  ellipsoid("Flower throat highlight", -0.045, 0.86, 0.05, 0.085, 0.032, 0.074, "#ffb1c2", 0.22);
  taperedStem("Central stamen column", [0, 0.82, 0], [0.02, 1.31, 0.04], 0.024, 0.014, "#f0b63e", 0.08, 0.32);
  for (let i = 0; i < 7; i++) {
    const angle = i * TAU / 7;
    const start = [0, 0.91 + (i % 2) * 0.025, 0];
    const end = [Math.cos(angle) * 0.1, 1.1 + (i % 3) * 0.055, Math.sin(angle) * 0.1];
    taperedStem("Stamen filament " + (i + 1), start, end, 0.009, 0.007, "#f6ce62", 0.04, 0.3);
    ellipsoid("Pollen anther " + (i + 1), end[0], end[1], end[2], 0.027, 0.034, 0.027, "#ffd66e", 0.24, 0.035);
  }
  for (let i = 0; i < 3; i++) {
    const angle = i * TAU / 3 + 0.25;
    ellipsoid("Dew highlight " + (i + 1), Math.cos(angle) * 0.42, 0.93, Math.sin(angle) * 0.42, 0.018, 0.026, 0.018, "#fff2f4", 0.12);
  }

  const chunks = [], views = [], accessors = [], primitives = [], materials = [];
  let offset = 0;
  const addBuffer = (buffer, target) => {
    const paddedLength = Math.ceil(buffer.length / 4) * 4;
    const padded = paddedLength === buffer.length ? buffer : Buffer.concat([buffer, Buffer.alloc(paddedLength - buffer.length)]);
    const index = views.length;
    views.push({buffer: 0, byteOffset: offset, byteLength: buffer.length, target});
    chunks.push(padded);
    offset += padded.length;
    return index;
  };

  for (const part of parts) {
    const positionBuffer = Buffer.from(new Float32Array(part.positions).buffer);
    const normalBuffer = Buffer.from(new Float32Array(part.normals).buffer);
    const indexBuffer = Buffer.from(new Uint16Array(part.indices).buffer);
    const pv = addBuffer(positionBuffer, 34962), nv = addBuffer(normalBuffer, 34962), iv = addBuffer(indexBuffer, 34963);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], part.positions[i + axis]);
      max[axis] = Math.max(max[axis], part.positions[i + axis]);
    }
    const pa = accessors.length;
    accessors.push({bufferView: pv, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min, max});
    const na = accessors.length;
    accessors.push({bufferView: nv, componentType: 5126, count: part.normals.length / 3, type: "VEC3"});
    const ia = accessors.length;
    accessors.push({bufferView: iv, componentType: 5123, count: part.indices.length, type: "SCALAR"});
    const rgb = [1, 3, 5].map(index => parseInt(part.color.slice(index, index + 2), 16) / 255);
    const material = materials.length;
    materials.push({
      name: part.name + " material",
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb, 1],
        metallicFactor: part.metallic,
        roughnessFactor: part.roughness
      },
      doubleSided: true
    });
    primitives.push({attributes: {POSITION: pa, NORMAL: na}, indices: ia, material, mode: 4, extras: {mingloraPartName: part.name}});
  }

  const binary = Buffer.concat(chunks);
  return {
    asset: {version: "2.0", generator: "Minglora Gift Studio", extras: {
      mingloraAssetId: "gift-hibiscus-3d-v1",
      source: "assets/3d-assets/gift-models/hibiscus-model.mjs",
      artDirection: "five cupped coral-pink petals, five green sepals, three sculpted leaves, a tapered stem, a raised throat and a golden pollen column with seven anthers",
      reviewStatus: "design-review-pending"
    }},
    scene: 0,
    scenes: [{nodes: [0]}],
    nodes: [{mesh: 0, name: "Minglora Hibiscus - Botanical Sculpture"}],
    meshes: [{name: "Minglora Hibiscus - Layered Tropical Flower", primitives}],
    materials,
    buffers: [{byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64")}],
    bufferViews: views,
    accessors
  };
}
