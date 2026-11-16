const TAU = Math.PI * 2;

function unit(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return vector.map(value => value / length);
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function createDolphinModel() {
  const parts = [];
  function add(name, positions, normals, indices, color, metallic = 0.04, roughness = 0.42) {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Dolphin mesh: " + name);
    }
    parts.push({ name, positions, normals, indices, color, metallic, roughness });
  }
  function ellipsoid(name, center, radii, color, metallic = 0.04, roughness = 0.42, segments = 28, rings = 18) {
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring <= rings; ring++) {
      const phi = Math.PI * ring / rings;
      for (let step = 0; step <= segments; step++) {
        const theta = TAU * step / segments;
        const normal = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
        positions.push(
          center[0] + normal[0] * radii[0],
          center[1] + normal[1] * radii[1],
          center[2] + normal[2] * radii[2]
        );
        normals.push(...unit([
          normal[0] / radii[0],
          normal[1] / radii[1],
          normal[2] / radii[2]
        ]));
      }
    }
    for (let ring = 0; ring < rings; ring++) for (let step = 0; step < segments; step++) {
      const a = ring * (segments + 1) + step;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function taperedCylinder(name, start, end, startRadius, endRadius, color, metallic = 0.06, roughness = 0.4, sides = 28) {
    const direction = unit([end[0] - start[0], end[1] - start[1], end[2] - start[2]]);
    const reference = Math.abs(direction[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const u = unit(cross(direction, reference));
    const v = unit(cross(direction, u));
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring < 2; ring++) {
      const center = ring ? end : start;
      const radius = ring ? endRadius : startRadius;
      for (let step = 0; step <= sides; step++) {
        const angle = TAU * step / sides;
        const radial = unit([
          u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
          u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
          u[2] * Math.cos(angle) + v[2] * Math.sin(angle)
        ]);
        positions.push(
          center[0] + radial[0] * radius,
          center[1] + radial[1] * radius,
          center[2] + radial[2] * radius
        );
        normals.push(...radial);
      }
    }
    for (let step = 0; step < sides; step++) {
      const a = step, b = sides + 1 + step;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function tube(name, points, radius, color, metallic = 0.04, roughness = 0.56, sides = 9) {
    for (let index = 0; index < points.length - 1; index++) {
      taperedCylinder(
        name + " segment " + (index + 1),
        points[index],
        points[index + 1],
        Array.isArray(radius) ? radius[index] : radius,
        Array.isArray(radius) ? radius[index + 1] : radius,
        color, metallic, roughness, sides
      );
    }
  }
  function fin(name, outline, centerZ, thickness, color, metallic = 0.08, roughness = 0.37) {
    if (outline.length < 3) throw new Error("Dolphin fin needs at least three points: " + name);
    const positions = [], normals = [], indices = [];
    const count = outline.length;
    for (const z of [centerZ + thickness / 2, centerZ - thickness / 2]) {
      for (const [x, y] of outline) {
        positions.push(x, y, z);
        normals.push(0, 0, z > centerZ ? 1 : -1);
      }
    }
    // Convex dorsal/pectoral/tail fin faces. Double-sided material covers either side.
    for (let index = 1; index < count - 1; index++) {
      indices.push(0, index, index + 1);
      indices.push(count, count + index + 1, count + index);
    }
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      const a = outline[index], b = outline[next];
      const normal = unit([b[1] - a[1], a[0] - b[0], 0]);
      const base = positions.length / 3;
      positions.push(
        a[0], a[1], centerZ + thickness / 2,
        b[0], b[1], centerZ + thickness / 2,
        b[0], b[1], centerZ - thickness / 2,
        a[0], a[1], centerZ - thickness / 2
      );
      normals.push(...normal, ...normal, ...normal, ...normal);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }

  // Hydrodynamic body, softly tapered head and bright ventral countershading.
  ellipsoid("Dolphin streamlined blue-grey body shell", [-0.02, 0, 0], [0.67, 0.265, 0.285], "#3b9bb5", 0.12, 0.33, 48, 28);
  ellipsoid("Dolphin rounded forehead and melon", [0.34, 0.075, 0], [0.35, 0.225, 0.235], "#48b1c6", 0.08, 0.31, 36, 24);
  ellipsoid("Dolphin soft pearl underside", [0.08, -0.17, 0], [0.49, 0.105, 0.218], "#d8f1ed", 0.02, 0.48, 36, 18);
  ellipsoid("Dolphin lower jaw highlight", [0.53, -0.095, 0], [0.27, 0.105, 0.182], "#c6e8e5", 0.025, 0.38, 32, 18);
  taperedCylinder("Dolphin tapered rostrum", [0.51, -0.012, 0], [0.9, -0.085, 0], 0.13, 0.061, "#3d9fb9", 0.08, 0.32, 40);
  ellipsoid("Dolphin rounded rostrum tip", [0.895, -0.084, 0], [0.07, 0.054, 0.071], "#367f9d", 0.1, 0.3, 24, 16);
  tube("Dolphin curved smile line", [
    [0.49, -0.138, 0.191], [0.61, -0.16, 0.179],
    [0.75, -0.166, 0.133], [0.86, -0.142, 0.07]
  ], 0.008, "#286478", 0.02, 0.54, 7);

  // Signature triangular dorsal fin, paired pectoral flippers and split tail flukes.
  fin("Dolphin sculpted dorsal fin", [
    [-0.2, 0.215], [-0.12, 0.31], [-0.005, 0.49],
    [0.085, 0.55], [0.105, 0.405], [0.235, 0.245]
  ], 0, 0.075, "#287c99", 0.12, 0.31);
  fin("Dolphin near pectoral flipper", [
    [0.11, -0.075], [0.37, -0.15], [0.6, -0.39],
    [0.5, -0.4], [0.22, -0.245], [0.06, -0.16]
  ], 0.235, 0.07, "#2f88a5", 0.1, 0.34);
  fin("Dolphin far pectoral flipper", [
    [0.12, -0.09], [0.34, -0.16], [0.54, -0.35],
    [0.45, -0.385], [0.2, -0.25], [0.055, -0.17]
  ], -0.235, 0.07, "#286f8c", 0.08, 0.38);
  ellipsoid("Dolphin tail peduncle", [-0.61, 0, 0], [0.245, 0.112, 0.135], "#317f9d", 0.09, 0.35, 30, 18);
  fin("Dolphin upper tail fluke", [
    [-0.63, 0.025], [-0.82, 0.1], [-1.075, 0.34],
    [-1.025, 0.18], [-0.87, 0.045], [-0.68, -0.005]
  ], 0, 0.065, "#2d7894", 0.1, 0.34);
  fin("Dolphin lower tail fluke", [
    [-0.63, -0.025], [-0.82, -0.1], [-1.075, -0.34],
    [-1.025, -0.18], [-0.87, -0.045], [-0.68, 0.005]
  ], 0, 0.065, "#2d7894", 0.1, 0.34);
  tube("Dolphin tail centre ridge", [
    [-0.65, 0, 0.038], [-0.82, 0, 0.038], [-0.99, 0, 0.015]
  ], [0.014, 0.009, 0.003], "#8bd0d7", 0.12, 0.3, 8);

  // Eyes, eye crescents, blowhole and delicate gill arcs establish the animal's expression.
  for (const side of [-1, 1]) {
    const z = side * 0.218;
    ellipsoid(side < 0 ? "Dolphin far glossy eye" : "Dolphin near glossy eye", [0.43, 0.152, z], [0.032, 0.039, 0.022], "#102b3d", 0.12, 0.14, 18, 12);
    ellipsoid(side < 0 ? "Dolphin far eye catchlight" : "Dolphin near eye catchlight", [0.441, 0.17, z + side * 0.018], [0.009, 0.011, 0.006], "#f8ffff", 0.04, 0.12, 12, 8);
    tube("Dolphin eye brow highlight " + side, [
      [0.365, 0.198, z * 0.98], [0.414, 0.216, z * 1.02], [0.465, 0.203, z * 0.98]
    ], 0.006, "#9ce0e1", 0.08, 0.28, 6);
    for (let gill = 0; gill < 3; gill++) {
      const x = 0.19 - gill * 0.055;
      tube("Dolphin gill groove " + side + " " + (gill + 1), [
        [x, 0.045, z * 0.94],
        [x - 0.012, -0.015, z * 1.01],
        [x + 0.012, -0.08, z * 0.94]
      ], 0.0055, "#26718b", 0.02, 0.5, 6);
    }
  }
  ellipsoid("Dolphin crown blowhole", [0.39, 0.294, 0], [0.041, 0.012, 0.032], "#17526c", 0.08, 0.28, 20, 10);
  ellipsoid("Dolphin blowhole rim", [0.39, 0.3, 0], [0.052, 0.008, 0.04], "#8bd2d7", 0.1, 0.28, 20, 10);

  // Discrete water droplets provide a sense of motion without hiding the dolphin.
  const droplets = [
    [-0.75, 0.42, 0.12, 0.035], [-0.91, 0.24, 0.18, 0.026],
    [0.65, 0.36, 0.17, 0.024], [0.98, 0.08, 0.1, 0.021]
  ];
  droplets.forEach(([x, y, z, size], index) => {
    ellipsoid("Dolphin suspended sea spray " + (index + 1), [x, y, z], [size * 0.7, size, size * 0.7], "#a2e9e7", 0.16, 0.22, 14, 9);
  });

  const chunks = [], bufferViews = [], accessors = [], primitives = [], materials = [];
  let byteOffset = 0;
  function addBuffer(buffer, target) {
    const padding = (4 - buffer.length % 4) % 4;
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
    for (let index = 0; index < part.positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], part.positions[index + axis]);
        maximum[axis] = Math.max(maximum[axis], part.positions[index + axis]);
      }
    }
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: positionView, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min: minimum, max: maximum });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: "VEC3" });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: use32BitIndices ? 5125 : 5123, count: part.indices.length, type: "SCALAR" });
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
        mingloraAssetId: "gift-dolphin-3d-v1",
        source: "assets/3d-assets/gift-models/dolphin-model.mjs",
        artDirection: "a streamlined blue-grey bottlenose dolphin with a softly tapered melon and rostrum, pearl countershading, a sculpted dorsal fin, paired pectoral flippers, split tail flukes, glossy eyes, gill grooves and sea-spray droplets",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Dolphin - Ocean Leap" }],
    meshes: [{ name: "Minglora Original Bottlenose Dolphin", primitives }],
    materials,
    buffers: [{ byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64") }],
    bufferViews,
    accessors
  };
}
