const TAU = Math.PI * 2;
const unit = (x, y, z) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

export function createDjembeModel() {
  const parts = [];
  const add = (name, positions, normals, indices, color, metallic = 0.02, roughness = 0.42) => {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Djembe mesh " + name);
    }
    parts.push({ name, positions, normals, indices, color, metallic, roughness });
  };

  function lathe(name, profile, color, options = {}) {
    const segments = options.segments || 48;
    const inside = options.inside === true;
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring < profile.length; ring++) {
      const [y, radius] = profile[ring];
      const previous = profile[Math.max(0, ring - 1)];
      const next = profile[Math.min(profile.length - 1, ring + 1)];
      const slope = (next[1] - previous[1]) / Math.max(0.0001, next[0] - previous[0]);
      for (let segment = 0; segment <= segments; segment++) {
        const angle = TAU * segment / segments;
        const cosine = Math.cos(angle), sine = Math.sin(angle);
        positions.push(radius * cosine, y, radius * sine);
        normals.push(...unit(inside ? -cosine : cosine, inside ? slope : -slope, inside ? -sine : sine));
      }
    }
    for (let ring = 0; ring < profile.length - 1; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const a = ring * (segments + 1) + segment, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    add(name, positions, normals, indices, color, options.metallic ?? 0.02, options.roughness ?? 0.44);
  }

  function torus(name, centerY, majorRadius, minorRadius, color, roughness = 0.4) {
    const segments = 48, sides = 10, positions = [], normals = [], indices = [];
    for (let i = 0; i <= segments; i++) {
      const u = TAU * i / segments;
      for (let j = 0; j <= sides; j++) {
        const v = TAU * j / sides;
        const radial = majorRadius + minorRadius * Math.cos(v);
        positions.push(radial * Math.cos(u), centerY + minorRadius * Math.sin(v), radial * Math.sin(u));
        normals.push(...unit(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)));
      }
    }
    for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, 0.02, roughness);
  }

  function sphere(name, center, scale, color, roughness = 0.36) {
    const segments = 14, rings = 10, positions = [], normals = [], indices = [];
    for (let y = 0; y <= rings; y++) {
      const phi = Math.PI * y / rings;
      for (let x = 0; x <= segments; x++) {
        const theta = TAU * x / segments;
        const nx = Math.sin(phi) * Math.cos(theta), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(theta);
        positions.push(center[0] + nx * scale[0], center[1] + ny * scale[1], center[2] + nz * scale[2]);
        normals.push(...unit(nx / scale[0], ny / scale[1], nz / scale[2]));
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, 0.01, roughness);
  }

  function tube(name, points, radius, color, roughness = 0.68) {
    if (points.length < 2) return;
    const sides = 7, positions = [], normals = [], indices = [];
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const tangent = unit(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]);
      const reference = Math.abs(tangent[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0];
      const axisU = unit(
        tangent[1] * reference[2] - tangent[2] * reference[1],
        tangent[2] * reference[0] - tangent[0] * reference[2],
        tangent[0] * reference[1] - tangent[1] * reference[0]
      );
      const axisV = unit(
        tangent[1] * axisU[2] - tangent[2] * axisU[1],
        tangent[2] * axisU[0] - tangent[0] * axisU[2],
        tangent[0] * axisU[1] - tangent[1] * axisU[0]
      );
      for (let side = 0; side <= sides; side++) {
        const angle = TAU * side / sides;
        const nx = axisU[0] * Math.cos(angle) + axisV[0] * Math.sin(angle);
        const ny = axisU[1] * Math.cos(angle) + axisV[1] * Math.sin(angle);
        const nz = axisU[2] * Math.cos(angle) + axisV[2] * Math.sin(angle);
        positions.push(points[i][0] + nx * radius, points[i][1] + ny * radius, points[i][2] + nz * radius);
        normals.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < points.length - 1; i++) for (let side = 0; side < sides; side++) {
      const a = i * (sides + 1) + side, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, 0.01, roughness);
  }

  function drumHead() {
    const radialRings = 9, segments = 64, positions = [], normals = [], indices = [];
    for (let ring = 0; ring <= radialRings; ring++) {
      const radius = 0.492 * ring / radialRings;
      for (let segment = 0; segment <= segments; segment++) {
        const angle = TAU * segment / segments;
        const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
        const dome = 0.725 + 0.028 * (1 - (radius / 0.492) ** 2);
        positions.push(x, dome, z);
        normals.push(...unit(-0.11 * x, 1, -0.11 * z));
      }
    }
    for (let ring = 0; ring < radialRings; ring++) for (let segment = 0; segment < segments; segment++) {
      const a = ring * (segments + 1) + segment, b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    add("Djembe taut goat-skin drumhead", positions, normals, indices, "#d7c29e", 0.0, 0.78);
  }

  const profile = [
    [-0.76, 0.245], [-0.68, 0.258], [-0.55, 0.278], [-0.39, 0.302],
    [-0.22, 0.337], [-0.05, 0.388], [0.12, 0.455], [0.29, 0.515],
    [0.45, 0.548], [0.58, 0.548], [0.67, 0.518]
  ];
  const bodyRadius = y => {
    if (y <= profile[0][0]) return profile[0][1];
    if (y >= profile[profile.length - 1][0]) return profile[profile.length - 1][1];
    for (let i = 0; i < profile.length - 1; i++) {
      if (y >= profile[i][0] && y <= profile[i + 1][0]) {
        const amount = (y - profile[i][0]) / (profile[i + 1][0] - profile[i][0]);
        return profile[i][1] + (profile[i + 1][1] - profile[i][1]) * amount;
      }
    }
    return 0.4;
  };

  const wood = "#6f3528", woodLight = "#a95b3c", woodDark = "#3d211e";
  const rope = "#d4bd91", ropeHighlight = "#eee0c3";
  lathe("Djembe hand-carved mahogany shell", profile, wood, { segments: 56, roughness: 0.39 });
  lathe("Djembe dark hollow inner wall", [[0.33, 0.385], [0.43, 0.405], [0.54, 0.444], [0.65, 0.478]], woodDark, { segments: 48, inside: true, roughness: 0.58 });
  lathe("Djembe sculpted lower foot", [[-0.79, 0.218], [-0.77, 0.254], [-0.72, 0.265], [-0.68, 0.252]], woodDark, { segments: 48, roughness: 0.5 });
  lathe("Djembe top leather binding", [[0.645, 0.492], [0.675, 0.518], [0.707, 0.515]], woodDark, { segments: 56, roughness: 0.46 });
  drumHead();

  torus("Djembe outer head rim", 0.685, 0.519, 0.029, ropeHighlight, 0.42);
  torus("Djembe inner head binding", 0.688, 0.489, 0.012, woodDark, 0.58);
  torus("Djembe rim lower carved ring", 0.625, 0.493, 0.013, woodLight, 0.43);
  torus("Djembe bowl shoulder inlay", 0.485, bodyRadius(0.485) + 0.008, 0.012, "#d9a56c", 0.42);
  torus("Djembe neck upper carved band", -0.18, bodyRadius(-0.18) + 0.008, 0.014, woodDark, 0.47);
  torus("Djembe neck lower carved band", -0.37, bodyRadius(-0.37) + 0.008, 0.013, woodLight, 0.45);
  torus("Djembe base binding", -0.69, 0.26, 0.018, "#b9784e", 0.48);
  torus("Djembe base shadow ring", -0.77, 0.237, 0.014, woodDark, 0.58);

  const strandCount = 16;
  const strandY = [0.69, 0.61, 0.48, 0.31, 0.12, -0.08, -0.27, -0.45, -0.58];
  for (let i = 0; i < strandCount; i++) {
    const anchor = TAU * i / strandCount;
    const points = strandY.map((y, index) => {
      const angle = anchor + 0.065 * Math.sin(index * 0.7 + i * 0.16);
      const radius = bodyRadius(Math.min(0.665, y)) + 0.018;
      return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
    });
    tube("Djembe vertical tension rope " + (i + 1), points, 0.012, i % 2 ? rope : ropeHighlight, 0.72);
    sphere("Djembe rope rim knot " + (i + 1), points[0], [0.025, 0.025, 0.025], ropeHighlight, 0.6);
  }

  const weaveRows = [[0.57, 0.43], [0.39, 0.24], [0.18, 0.03], [-0.04, -0.18], [-0.26, -0.39]];
  for (let row = 0; row < weaveRows.length; row++) {
    const points = [];
    for (let i = 0; i <= strandCount; i++) {
      const angle = TAU * i / strandCount;
      const y = i % 2 === 0 ? weaveRows[row][0] : weaveRows[row][1];
      const radius = bodyRadius(y) + 0.029;
      points.push([radius * Math.cos(angle), y, radius * Math.sin(angle)]);
    }
    tube("Djembe continuous diamond cross-lacing " + (row + 1), points, 0.009, row % 2 ? rope : ropeHighlight, 0.7);
  }

  for (let i = 0; i < 24; i++) {
    const angle = TAU * i / 24, centerY = -0.43, radius = bodyRadius(centerY) + 0.018;
    const center = [radius * Math.cos(angle), centerY, radius * Math.sin(angle)];
    const tangent = [-Math.sin(angle), 0, Math.cos(angle)];
    const points = [
      [center[0] - tangent[0] * 0.026, center[1] - 0.055, center[2] - tangent[2] * 0.026],
      [center[0] + tangent[0] * 0.026, center[1], center[2] + tangent[2] * 0.026],
      [center[0] + tangent[0] * 0.026, center[1] + 0.055, center[2] + tangent[2] * 0.026],
      [center[0] - tangent[0] * 0.026, center[1], center[2] - tangent[2] * 0.026],
      [center[0] - tangent[0] * 0.026, center[1] - 0.055, center[2] - tangent[2] * 0.026]
    ];
    tube("Djembe carved diamond accent " + (i + 1), points, 0.004, i % 2 ? woodDark : woodLight, 0.5);
  }

  for (let i = 1; i <= 3; i++) {
    torus("Djembe drumhead stitched guide " + i, 0.725 + (1 - i / 4) * 0.012, 0.492 * i / 4, 0.0035, "#bba47f", 0.88);
  }

  const chunks = [], bufferViews = [], accessors = [], primitives = [], materials = [];
  let byteOffset = 0;
  function addBuffer(buffer, target) {
    const padding = (4 - (buffer.length % 4)) % 4;
    const padded = padding ? Buffer.concat([buffer, Buffer.alloc(padding)]) : buffer;
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    chunks.push(padded);
    byteOffset += padded.length;
    return index;
  }

  for (const part of parts) {
    const positionBuffer = Buffer.from(new Float32Array(part.positions).buffer);
    const normalBuffer = Buffer.from(new Float32Array(part.normals).buffer);
    const maximumIndex = Math.max(...part.indices);
    const use32BitIndices = maximumIndex > 65535;
    const indexBuffer = use32BitIndices ? Buffer.from(new Uint32Array(part.indices).buffer) : Buffer.from(new Uint16Array(part.indices).buffer);
    const positionView = addBuffer(positionBuffer, 34962);
    const normalView = addBuffer(normalBuffer, 34962);
    const indexView = addBuffer(indexBuffer, 34963);
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], part.positions[i + axis]);
      maximum[axis] = Math.max(maximum[axis], part.positions[i + axis]);
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
      name: part.name + " material",
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
        mingloraAssetId: "gift-djembe-3d-v1",
        source: "assets/3d-assets/gift-models/djembe-model.mjs",
        artDirection: "sculpted goblet-shaped mahogany shell, hollow bowl, taut hide drumhead, sixteen hand-laid tension cords, woven diamond lacing, carved lower-band detailing and concentric rim bindings",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Djembe - Handcrafted Percussion Sculpture" }],
    meshes: [{ name: "Minglora Djembe - 3D Wood and Hide Instrument", primitives }],
    materials,
    buffers: [{ byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64") }],
    bufferViews,
    accessors
  };
}
