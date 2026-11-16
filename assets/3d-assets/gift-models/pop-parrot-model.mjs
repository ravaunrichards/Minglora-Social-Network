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

export function createPopParrotModel() {
  const parts = [];
  function add(name, positions, normals, indices, color, metallic = 0.04, roughness = 0.42) {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Pop Parrot mesh: " + name);
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
    if (outline.length < 3) throw new Error("Pop Parrot fin needs at least three points: " + name);
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

  // Original scarlet macaw silhouette with a warm breast and layered iridescent plumage.
  ellipsoid("Pop Parrot scarlet feathered torso", [0, -0.06, 0], [0.55, 0.7, 0.39], "#c92e43", 0.025, 0.39, 38, 26);
  ellipsoid("Pop Parrot golden orange breast", [0, -0.12, 0.305], [0.405, 0.49, 0.135], "#f2a83f", 0.04, 0.38, 34, 22);
  ellipsoid("Pop Parrot coral throat bib", [0, 0.22, 0.342], [0.29, 0.23, 0.075], "#ef6d42", 0.025, 0.4, 28, 18);
  ellipsoid("Pop Parrot scarlet head", [0, 0.7, 0.035], [0.445, 0.42, 0.365], "#d92d3c", 0.025, 0.35, 38, 26);
  ellipsoid("Pop Parrot crown red cap", [0, 1.005, 0.015], [0.34, 0.19, 0.29], "#e34442", 0.025, 0.33, 30, 18);

  // Each wing is assembled from a base and multiple individually named flight-feather meshes.
  for (const side of [-1, 1]) {
    ellipsoid(side < 0 ? "Pop Parrot far cobalt wing base" : "Pop Parrot near cobalt wing base",
      [side * 0.405, 0.18, -0.11], [0.255, 0.48, 0.235],
      side < 0 ? "#2454a5" : "#2d67bd", 0.08, 0.34, 28, 18);
    const wingColors = ["#1d4a9b", "#2369b7", "#168c9b", "#2a9a79", "#e6a33d", "#e85a48"];
    for (let index = 0; index < 7; index++) {
      const startX = side * (0.31 + index * 0.033);
      const tipX = side * (0.65 + index * 0.041);
      fin("Pop Parrot " + (side < 0 ? "far" : "near") + " primary flight feather " + (index + 1), [
        [startX, 0.43 - index * 0.045],
        [tipX, -0.07 - index * 0.075],
        [tipX - side * 0.065, -0.11 - index * 0.075],
        [startX - side * 0.035, 0.25 - index * 0.04]
      ], 0.105, 0.035, wingColors[index % wingColors.length], 0.04, 0.38);
    }
    for (let row = 0; row < 3; row++) {
      for (let index = 0; index < 5; index++) {
        const x = side * (0.27 + index * 0.078);
        const y = 0.37 - row * 0.13 - Math.abs(index - 2) * 0.025;
        const color = row === 0 ? "#f3b445" : row === 1 ? "#169d9b" : "#2c65b5";
        fin("Pop Parrot " + (side < 0 ? "far" : "near") + " layered wing covert " + (row + 1) + "-" + (index + 1), [
          [x - side * 0.045, y + 0.045], [x + side * 0.055, y - 0.025],
          [x + side * 0.018, y - 0.14], [x - side * 0.06, y - 0.08]
        ], 0.165 + row * 0.006, 0.024, color, 0.035, 0.42);
      }
    }

    // The ivory cheek mask, amber iris and glossy pupil are separately surfaced on both sides.
    ellipsoid("Pop Parrot " + (side < 0 ? "far" : "near") + " ivory cheek feather patch",
      [side * 0.22, 0.735, 0.318], [0.145, 0.18, 0.055], "#f8eedb", 0.015, 0.5, 22, 14);
    ellipsoid("Pop Parrot " + (side < 0 ? "far" : "near") + " amber eye ring",
      [side * 0.248, 0.79, 0.367], [0.067, 0.074, 0.028], "#eeb849", 0.08, 0.3, 20, 14);
    ellipsoid("Pop Parrot " + (side < 0 ? "far" : "near") + " glossy onyx eye",
      [side * 0.248, 0.795, 0.39], [0.039, 0.048, 0.024], "#121d2c", 0.12, 0.12, 18, 12);
    ellipsoid("Pop Parrot " + (side < 0 ? "far" : "near") + " eye catchlight",
      [side * 0.237, 0.816, 0.411], [0.012, 0.015, 0.008], "#ffffff", 0.02, 0.12, 12, 8);
    tube("Pop Parrot cheek feather groove " + side, [
      [side * 0.15, 0.69, 0.37], [side * 0.22, 0.66, 0.377], [side * 0.3, 0.68, 0.35]
    ], 0.006, "#d0c9bb", 0.01, 0.62, 6);
    ellipsoid("Pop Parrot " + (side < 0 ? "far" : "near") + " shoulder covert",
      [side * 0.29, -0.36, 0.245], [0.205, 0.21, 0.085], "#d6463f", 0.025, 0.43, 22, 14);
  }

  // Seven separate red, gold, teal and cobalt tail feathers create a long fan.
  const tailColors = ["#d93b43", "#f3b43e", "#137c93", "#2557a3", "#e05b43", "#2b9b83", "#e4a43e"];
  for (let index = 0; index < tailColors.length; index++) {
    const x = (index - 3) * 0.075;
    fin("Pop Parrot long tail feather " + (index + 1), [
      [x * 0.24 - 0.038, -0.45], [x * 1.9, -1.48 + Math.abs(index - 3) * 0.055],
      [x * 1.9 + 0.05, -1.39 + Math.abs(index - 3) * 0.055], [x * 0.24 + 0.04, -0.46]
    ], -0.23, 0.028, tailColors[index], 0.035, 0.41);
  }
  for (let index = 0; index < 5; index++) {
    const x = (index - 2) * 0.095;
    fin("Pop Parrot tail covert " + (index + 1), [
      [x - 0.055, -0.43], [x * 1.25 + 0.015, -0.92],
      [x * 1.25 + 0.075, -0.89], [x + 0.055, -0.42]
    ], 0.05, 0.025, index % 2 ? "#e6a542" : "#c93443", 0.025, 0.42);
  }

  // Five swept crest plumes and a graphite hooked beak give the parrot its profile.
  const crest = [
    [[-0.2, 0.91], [-0.34, 1.39], "#c93242"],
    [[-0.105, 0.98], [-0.16, 1.52], "#ec7040"],
    [[0, 1.015], [0.015, 1.58], "#f4bd46"],
    [[0.105, 0.98], [0.18, 1.5], "#149b9b"],
    [[0.2, 0.91], [0.35, 1.37], "#2867ad"]
  ];
  crest.forEach(([start, end, color], index) => {
    fin("Pop Parrot swept crest plume " + (index + 1), [
      [start[0], start[1]], [end[0], end[1]],
      [end[0] + 0.04, end[1] - 0.035], [start[0] + 0.045, start[1] - 0.045]
    ], 0.09, 0.035, color, 0.035, 0.37);
  });
  ellipsoid("Pop Parrot soft graphite cere", [0, 0.54, 0.353], [0.16, 0.115, 0.075], "#a7a69f", 0.02, 0.55, 24, 14);
  taperedCylinder("Pop Parrot sculpted hooked upper beak", [0, 0.625, 0.385], [0, 0.39, 0.57],
    0.155, 0.035, "#252c36", 0.1, 0.29, 28);
  ellipsoid("Pop Parrot upper beak glossy ridge", [0, 0.595, 0.455], [0.095, 0.075, 0.042], "#404a54", 0.12, 0.24, 20, 12);
  taperedCylinder("Pop Parrot curved lower beak", [0, 0.39, 0.55], [0, 0.245, 0.49],
    0.09, 0.025, "#3b454d", 0.08, 0.32, 22);
  ellipsoid("Pop Parrot lower beak tip", [0, 0.24, 0.49], [0.035, 0.045, 0.036], "#202a35", 0.08, 0.3, 16, 10);

  // Seven contour plumes detail the breast without obscuring its warm countershading.
  for (let index = 0; index < 7; index++) {
    const x = (index - 3) * 0.112;
    tube("Pop Parrot breast contour plume " + (index + 1), [
      [x * 0.8, -0.22, 0.37], [x, -0.36, 0.34], [x * 1.04, -0.52, 0.295]
    ], 0.012, index % 2 ? "#f5be54" : "#e98e42", 0.02, 0.52, 6);
  }

  // Golden scaled legs and individually modelled gripping toes finish the lower silhouette.
  for (const side of [-1, 1]) {
    const x = side * 0.22;
    ellipsoid("Pop Parrot " + (side < 0 ? "far" : "near") + " feathered thigh",
      [x, -0.55, 0.14], [0.13, 0.18, 0.13], "#c93242", 0.02, 0.47, 20, 12);
    taperedCylinder("Pop Parrot " + (side < 0 ? "far" : "near") + " golden scaly leg",
      [x, -0.63, 0.22], [x, -0.83, 0.25], 0.043, 0.035, "#d79a32", 0.08, 0.4, 12);
    ellipsoid("Pop Parrot " + (side < 0 ? "far" : "near") + " foot pad",
      [x, -0.84, 0.28], [0.115, 0.055, 0.11], "#e2a33d", 0.07, 0.39, 18, 10);
    for (let toe = -1; toe <= 1; toe++) {
      const endX = x + toe * 0.115;
      tube("Pop Parrot " + (side < 0 ? "far" : "near") + " gripping toe " + (toe + 2), [
        [x, -0.84, 0.31], [endX, -0.91, 0.43], [endX + toe * 0.018, -0.89, 0.49]
      ], 0.026, "#dca346", 0.05, 0.38, 8);
      taperedCylinder("Pop Parrot talon claw " + side + "-" + (toe + 2),
        [endX + toe * 0.018, -0.89, 0.49],
        [endX + toe * 0.026, -0.83, 0.53],
        0.018, 0.002, "#42404a", 0.02, 0.34, 8);
    }
    taperedCylinder("Pop Parrot rear gripping toe " + side,
      [x, -0.85, 0.22], [x, -0.94, 0.06], 0.026, 0.015, "#dca346", 0.05, 0.4, 10);
  }

  // Small pearl glints add a premium finish while keeping the model silhouette clear.
  for (let index = 0; index < 5; index++) {
    ellipsoid("Pop Parrot floating plumage glint " + (index + 1),
      [(index - 2) * 0.24, 0.15 + (index % 2) * 0.14, 0.39],
      [0.018, 0.018, 0.012], "#fff3d3", 0.08, 0.2, 12, 8);
  }

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
        mingloraAssetId: "gift-pop-parrot-3d-v1",
        source: "assets/3d-assets/gift-models/pop-parrot-model.mjs",
        artDirection: "an original scarlet macaw inspired parrot with a curved graphite beak, ivory cheek mask, amber eye rings, swept five-colour crest, golden breast, layered cobalt and teal flight feathers, seven individually sculpted tail feathers, scaled legs and curled gripping talons",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Pop Parrot - Rainbow Swoop" }],
    meshes: [{ name: "Minglora Original Sculpted Pop Parrot", primitives }],
    materials,
    buffers: [{ byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64") }],
    bufferViews,
    accessors
  };
}
