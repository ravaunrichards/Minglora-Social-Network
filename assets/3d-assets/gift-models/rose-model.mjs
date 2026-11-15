const TAU = Math.PI * 2;
const unit = (x, y, z) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

export function createRoseModel() {
  const parts = [];
  const add = (name, positions, normals, indices, color, metallic = 0.02, roughness = 0.4) => {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) throw new Error("Invalid Rose mesh " + name);
    parts.push({name, positions, normals, indices, color, metallic, roughness});
  };

  function tubeNetwork(name, paths, radius, color, roughness = 0.48) {
    const positions = [], normals = [], indices = [];
    const sides = 7;
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
    for (const path of paths) {
      if (!Array.isArray(path) || path.length < 2) continue;
      const base = positions.length / 3;
      for (let i = 0; i < path.length; i++) {
        const previous = path[Math.max(0, i - 1)];
        const next = path[Math.min(path.length - 1, i + 1)];
        const tangent = unit(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]);
        const reference = Math.abs(tangent[1]) < 0.86 ? [0, 1, 0] : [0, 0, 1];
        const axisA = unit(...cross(tangent, reference));
        const axisB = unit(...cross(tangent, axisA));
        for (let side = 0; side <= sides; side++) {
          const angle = TAU * side / sides;
          const ca = Math.cos(angle), sa = Math.sin(angle);
          const radial = [
            axisA[0] * ca + axisB[0] * sa,
            axisA[1] * ca + axisB[1] * sa,
            axisA[2] * ca + axisB[2] * sa
          ];
          positions.push(
            path[i][0] + radial[0] * radius,
            path[i][1] + radial[1] * radius,
            path[i][2] + radial[2] * radius
          );
          normals.push(...radial);
        }
      }
      for (let ring = 0; ring < path.length - 1; ring++) {
        for (let side = 0; side < sides; side++) {
          const a = base + ring * (sides + 1) + side;
          const b = a + sides + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    if (positions.length) add(name, positions, normals, indices, color, 0.015, roughness);
  }

  function surfacePetal(name, angle, y0, length, width, radius, curl, color, uSteps = 14, vSteps = 10, roughness = 0.38, detail = null) {
    const c = Math.cos(angle), s = Math.sin(angle), grid = [], positions = [], normals = [], indices = [];
    const point = (i, j) => {
      const u = i / uSteps, v = j / vSteps * 2 - 1;
      const taper = Math.pow(Math.max(0.001, Math.sin(Math.PI * (0.12 + u * 0.78))), 0.72);
      const r = radius + length * u, side = v * width * taper;
      return [r * c - side * s, y0 + curl * u * u + 0.048 * (1 - v * v) * Math.sin(Math.PI * u), r * s + side * c];
    };
    for (let i = 0; i <= uSteps; i++) {
      grid[i] = [];
      for (let j = 0; j <= vSteps; j++) { const p = point(i, j); grid[i][j] = p; positions.push(...p); }
    }
    for (let i = 0; i <= uSteps; i++) for (let j = 0; j <= vSteps; j++) {
      const a = grid[Math.max(0, i - 1)][j], b = grid[Math.min(uSteps, i + 1)][j];
      const d = grid[i][Math.max(0, j - 1)], e = grid[i][Math.min(vSteps, j + 1)];
      const du = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], dv = [e[0]-d[0], e[1]-d[1], e[2]-d[2]];
      normals.push(...unit(dv[1]*du[2]-dv[2]*du[1], dv[2]*du[0]-dv[0]*du[2], dv[0]*du[1]-dv[1]*du[0]));
    }
    for (let i = 0; i < uSteps; i++) for (let j = 0; j < vSteps; j++) {
      const a = i * (vSteps + 1) + j, b = a + vSteps + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    add(name, positions, normals, indices, color, 0.015, roughness);
    if (detail) {
      const raisedPoint = (u, v) => {
        const p = point(u * uSteps, (v + 1) * vSteps / 2);
        const lift = detail.lift ?? 0.0025;
        return [p[0] + c * lift, p[1] + lift, p[2] + s * lift];
      };
      const paths = [];
      const midrib = [];
      for (let i = 0; i <= 10; i++) midrib.push(raisedPoint(0.14 + i / 10 * 0.82, 0));
      paths.push(midrib);
      for (const branchU of detail.branches || []) {
        for (const side of [-1, 1]) {
          const branch = [];
          for (let step = 0; step <= 4; step++) {
            const t = step / 4;
            branch.push(raisedPoint(Math.min(0.96, branchU + t * 0.13), side * t * 0.82));
          }
          paths.push(branch);
        }
      }
      tubeNetwork(name + " venation", paths, detail.radius ?? 0.002, detail.color, detail.roughness ?? 0.48);
    }
  }

  function ellipsoid(name, cx, cy, cz, sx, sy, sz, color, roughness = 0.32) {
    const seg = 16, rings = 10, positions = [], normals = [], indices = [];
    for (let y = 0; y <= rings; y++) {
      const phi = Math.PI * y / rings;
      for (let x = 0; x <= seg; x++) {
        const theta = TAU * x / seg, nx = Math.sin(phi) * Math.cos(theta), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(theta);
        positions.push(cx + nx * sx, cy + ny * sy, cz + nz * sz);
        normals.push(...unit(nx / sx, ny / sy, nz / sz));
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < seg; x++) {
      const a = y * (seg + 1) + x, b = a + seg + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, 0.02, roughness);
  }

  function stem(name, cy, lowRadius, highRadius, height, color, metallic = 0.02) {
    const seg = 24, positions = [], normals = [], indices = [];
    for (let i = 0; i <= seg; i++) {
      const a = TAU * i / seg, x = Math.cos(a), z = Math.sin(a);
      positions.push(x * lowRadius, cy - height / 2, z * lowRadius, x * highRadius, cy + height / 2, z * highRadius);
      const n = unit(x, (lowRadius - highRadius) / height, z);
      normals.push(...n, ...n);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2, b = a + 2; indices.push(a, b, a + 1, a + 1, b, b + 1); }
    add(name, positions, normals, indices, color, metallic, 0.48);
  }

  stem("Rose stem", -0.1, 0.023, 0.014, 0.9, "#1d6034");
  stem("Stem collar", -0.535, 0.041, 0.041, 0.042, "#a77d36", 0.72);
  surfacePetal("Lower leaf - left", -2.42, -0.31, 0.31, 0.078, 0.012, 0.05, "#1b6538", 18, 12, 0.5, {color: "#3d8a50", radius: 0.0022, branches: [0.28, 0.47, 0.66], lift: 0.0018});
  surfacePetal("Lower leaf - right", -0.48, -0.12, 0.28, 0.074, 0.01, 0.04, "#287b45", 18, 12, 0.48, {color: "#4b965a", radius: 0.002, branches: [0.3, 0.5, 0.69], lift: 0.0018});
  surfacePetal("Upper leaf", 2.86, -0.23, 0.23, 0.064, 0.008, 0.055, "#185d33", 18, 12, 0.52, {color: "#397d49", radius: 0.0019, branches: [0.32, 0.55], lift: 0.0018});
  tubeNetwork("Rose leaf petioles", [
    [[0, -0.31, 0], [-0.018, -0.296, -0.016], [-0.037, -0.284, -0.033]],
    [[0, -0.12, 0], [0.022, -0.105, -0.011], [0.044, -0.09, -0.022]],
    [[0, -0.23, 0], [-0.022, -0.215, 0.006], [-0.043, -0.2, 0.012]]
  ], 0.007, "#245b34", 0.54);
  surfacePetal("Stem thorn one", 0.12, -0.32, 0.09, 0.024, 0.006, -0.03, "#286b3e", 7, 5, 0.52);
  surfacePetal("Stem thorn two", Math.PI + 0.12, -0.08, 0.08, 0.022, 0.005, -0.025, "#286b3e", 7, 5, 0.52);

  for (let i = 0; i < 5; i++) surfacePetal("Rose sepal " + (i + 1), i * TAU / 5, 0.33, 0.19, 0.052, 0.008, -0.065, "#226b3d", 18, 12, 0.52);
  for (let i = 0; i < 7; i++) surfacePetal("Velvet outer petal " + (i + 1), i * TAU / 7, 0.38, 0.3, 0.142, 0.025, 0.31, "#95153f", 20, 14, 0.39, {color: "#a83b5f", radius: 0.00125, branches: [0.42, 0.67], lift: 0.00125});
  for (let i = 0; i < 6; i++) surfacePetal("Satin middle petal " + (i + 1), (i + 0.5) * TAU / 6, 0.48, 0.22, 0.118, 0.016, 0.33, "#bf2452", 18, 14, 0.36, {color: "#d85170", radius: 0.0011, branches: [0.51], lift: 0.0012});
  for (let i = 0; i < 5; i++) surfacePetal("Silk inner petal " + (i + 1), (i + 0.15) * TAU / 5, 0.58, 0.145, 0.088, 0.008, 0.34, "#e84d76", 18, 12, 0.33);

  ellipsoid("Rose heart", 0, 0.68, 0, 0.086, 0.084, 0.078, "#7e1235");
  const stamenPaths = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * TAU / 8;
    const x = Math.cos(angle), z = Math.sin(angle);
    stamenPaths.push([[x * 0.025, 0.67, z * 0.025], [x * 0.045, 0.72, z * 0.045], [x * 0.061, 0.79, z * 0.061]]);
    ellipsoid("Rose golden anther " + (i + 1), x * 0.061, 0.79, z * 0.061, 0.009, 0.012, 0.009, "#d6a13a", 0.34);
  }
  tubeNetwork("Rose golden stamen filaments", stamenPaths, 0.0025, "#e5b858", 0.42);
  ellipsoid("Rose heart highlight", -0.025, 0.735, 0.055, 0.022, 0.018, 0.012, "#e5a4b5", 0.34);
  ellipsoid("Dew drop", 0.235, 0.65, 0.04, 0.02, 0.026, 0.016, "#f4d7df", 0.18);

  const chunks = [], views = [], accessors = [], primitives = [], materials = [];
  let offset = 0;
  const addBuffer = (buffer, target) => {
    const paddedLength = Math.ceil(buffer.length / 4) * 4;
    const padded = paddedLength === buffer.length ? buffer : Buffer.concat([buffer, Buffer.alloc(paddedLength - buffer.length)]);
    const index = views.length;
    views.push({buffer: 0, byteOffset: offset, byteLength: buffer.length, target});
    chunks.push(padded); offset += padded.length; return index;
  };

  for (const part of parts) {
    const positionBuffer = Buffer.from(new Float32Array(part.positions).buffer);
    const normalBuffer = Buffer.from(new Float32Array(part.normals).buffer);
    const indexBuffer = Buffer.from(new Uint16Array(part.indices).buffer);
    const pv = addBuffer(positionBuffer, 34962), nv = addBuffer(normalBuffer, 34962), iv = addBuffer(indexBuffer, 34963);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], part.positions[i + axis]); max[axis] = Math.max(max[axis], part.positions[i + axis]);
    }
    const pa = accessors.length; accessors.push({bufferView: pv, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min, max});
    const na = accessors.length; accessors.push({bufferView: nv, componentType: 5126, count: part.normals.length / 3, type: "VEC3"});
    const ia = accessors.length; accessors.push({bufferView: iv, componentType: 5123, count: part.indices.length, type: "SCALAR"});
    const rgb = [1, 3, 5].map(index => parseInt(part.color.slice(index, index + 2), 16) / 255);
    const material = materials.length;
    materials.push({name: part.name + " material", pbrMetallicRoughness: {baseColorFactor: [...rgb, 1], metallicFactor: part.metallic, roughnessFactor: part.roughness}, doubleSided: true});
    primitives.push({attributes: {POSITION: pa, NORMAL: na}, indices: ia, material, mode: 4, extras: {mingloraPartName: part.name}});
  }

  const binary = Buffer.concat(chunks);
  return {
    asset: {version: "2.0", generator: "Minglora Gift Studio", extras: {
      mingloraAssetId: "gift-rose-3d-v1",
      source: "assets/3d-assets/gift-models/rose-model.mjs",
      artDirection: "upright layered rose bloom with cupped velvet outer petals, raised midribs and branching leaf venation, fitted green calyx, tapered thorned stem, three attached leaves, golden stamens and dew detail",
      reviewStatus: "design-review-pending"
    }},
    scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0, name: "Minglora Rose - Botanical Sculpture"}],
    meshes: [{name: "Minglora Rose - Layered Botanical Sculpture", primitives}],
    materials, buffers: [{byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64")}],
    bufferViews: views, accessors
  };
}
