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

export function createCrocodileModel() {
  const parts = [];
  function add(name, positions, normals, indices, color, metallic = 0.04, roughness = 0.5) {
    if (!positions.length || positions.length !== normals.length || indices.length < 3) {
      throw new Error("Invalid Crocodile mesh: " + name);
    }
    parts.push({ name, positions, normals, indices, color, metallic, roughness });
  }
  function ellipsoid(name, center, radii, color, metallic = 0.04, roughness = 0.5, segments = 24, rings = 16) {
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
        normals.push(...normalize([normal[0] / radii[0], normal[1] / radii[1], normal[2] / radii[2]]));
      }
    }
    for (let ring = 0; ring < rings; ring++) for (let step = 0; step < segments; step++) {
      const a = ring * (segments + 1) + step, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function taperedCylinder(name, start, end, startRadius, endRadius, color, metallic = 0.04, roughness = 0.5, sides = 12) {
    const direction = normalize([end[0] - start[0], end[1] - start[1], end[2] - start[2]]);
    const reference = Math.abs(direction[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(direction, reference));
    const v = normalize(cross(direction, u));
    const positions = [], normals = [], indices = [];
    for (let ring = 0; ring < 2; ring++) {
      const center = ring ? end : start, radius = ring ? endRadius : startRadius;
      for (let step = 0; step <= sides; step++) {
        const angle = TAU * step / sides;
        const radial = normalize([
          u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
          u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
          u[2] * Math.cos(angle) + v[2] * Math.sin(angle)
        ]);
        positions.push(center[0] + radial[0] * radius, center[1] + radial[1] * radius, center[2] + radial[2] * radius);
        normals.push(...radial);
      }
    }
    for (let step = 0; step < sides; step++) {
      const a = step, b = sides + 1 + step;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function tube(name, points, radii, color, metallic = 0.04, roughness = 0.5, sides = 9) {
    for (let index = 0; index < points.length - 1; index++) {
      taperedCylinder(
        name + " segment " + (index + 1),
        points[index], points[index + 1],
        Array.isArray(radii) ? radii[index] : radii,
        Array.isArray(radii) ? radii[index + 1] : radii,
        color, metallic, roughness, sides
      );
    }
  }
  function cone(name, base, tip, radius, color, metallic = 0.04, roughness = 0.4, sides = 14) {
    const direction = normalize([tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]]);
    const reference = Math.abs(direction[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(direction, reference)), v = normalize(cross(direction, u));
    const positions = [], normals = [], indices = [];
    for (let step = 0; step <= sides; step++) {
      const angle = TAU * step / sides, radial = normalize([
        u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
        u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
        u[2] * Math.cos(angle) + v[2] * Math.sin(angle)
      ]);
      positions.push(base[0] + radial[0] * radius, base[1] + radial[1] * radius, base[2] + radial[2] * radius);
      normals.push(...normalize([radial[0] + direction[0] * .35, radial[1] + direction[1] * .35, radial[2] + direction[2] * .35]));
    }
    const tipIndex = positions.length / 3;
    positions.push(...tip);
    normals.push(...direction);
    for (let step = 0; step < sides; step++) indices.push(step, step + 1, tipIndex);
    add(name, positions, normals, indices, color, metallic, roughness);
  }
  function armorPlate(name, x, z, size, color, rotation = 0) {
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const center = [x, .205, z];
    ellipsoid(name + " raised osteoderm", center, [size, .036, size * .78], color, .08, .54, 16, 10);
    // A narrow ridge on each scute catches a warm highlight.
    tube(name + " central ridge", [
      [x - size * .48 * cos, .234, z - size * .48 * sin],
      [x, .252, z],
      [x + size * .48 * cos, .234, z + size * .48 * sin]
    ], .009, "#9aab74", .04, .48, 6);
  }

  // Broad low-slung torso with a warm segmented belly and natural countershading.
  ellipsoid("Crocodile powerful olive-green torso", [-.08, -.005, 0], [.73, .265, .345], "#5f8051", .08, .46, 48, 28);
  ellipsoid("Crocodile pale sand belly", [-.015, -.176, 0], [.62, .122, .288], "#d6c58e", .025, .63, 44, 22);
  ellipsoid("Crocodile throat and chest", [.46, -.12, 0], [.36, .155, .286], "#b8ae79", .025, .57, 32, 20);
  for (let row = 0; row < 4; row++) {
    for (let plate = 0; plate < 5; plate++) {
      const x = -.48 + plate * .215 + (row % 2 ? .055 : 0);
      const z = (row - 1.5) * .135;
      const size = row === 1 || row === 2 ? .085 : .07;
      armorPlate("Crocodile dorsal armor row " + (row + 1) + " plate " + (plate + 1), x, z, size, row % 2 ? "#718c58" : "#4f7049", (plate % 2 ? 1 : -1) * .08);
    }
  }

  // Long tapering tail with raised keel and diminishing triangular scutes.
  tube("Crocodile sweeping muscular tail", [
    [-.55, .045, 0], [-.79, .025, 0], [-1.02, .005, 0],
    [-1.23, -.015, 0], [-1.42, -.025, 0], [-1.58, -.02, 0], [-1.72, .005, 0]
  ], [.205, .17, .133, .095, .062, .035, .008], "#55794c", .07, .45, 16);
  tube("Crocodile tail pale underside", [
    [-.67, -.06, 0], [-.91, -.08, 0], [-1.15, -.065, 0], [-1.38, -.043, 0]
  ], [.09, .073, .052, .026], "#c4b985", .02, .6, 12);
  tube("Crocodile tail dorsal keel", [
    [-.62, .13, 0], [-.85, .12, 0], [-1.1, .085, 0], [-1.35, .045, 0], [-1.58, .01, 0]
  ], [.038, .03, .022, .014, .004], "#80945f", .05, .43, 9);
  for (let index = 0; index < 8; index++) {
    const x = -.67 - index * .135, y = .17 - index * .018, width = .066 - index * .005;
    cone("Crocodile tail armor spike " + (index + 1), [x, y, 0], [x - .055, y + .085 - index * .008, 0], width, "#405f43", .04, .54, 10);
  }

  // Distinct broad crocodilian skull, tapered snout and hinged lower jaw.
  ellipsoid("Crocodile broad skull crown", [.57, .11, 0], [.47, .24, .315], "#668957", .08, .42, 40, 26);
  ellipsoid("Crocodile long upper jaw", [.94, .015, 0], [.56, .153, .268], "#73915b", .06, .43, 44, 24);
  ellipsoid("Crocodile rounded snout tip", [1.37, -.015, 0], [.16, .12, .248], "#63804e", .05, .47, 28, 18);
  ellipsoid("Crocodile lower jaw", [.98, -.18, 0], [.51, .086, .246], "#c9bb84", .02, .61, 42, 22);
  tube("Crocodile dark jaw seam", [
    [.53, -.098, .258], [.74, -.107, .272], [1.02, -.112, .254], [1.27, -.105, .205], [1.46, -.07, .08]
  ], .012, "#344f3d", .02, .58, 7);
  tube("Crocodile lower lip highlight", [
    [.63, -.237, .214], [.91, -.258, .23], [1.19, -.235, .17], [1.4, -.15, .06]
  ], .012, "#e0d19b", .02, .56, 7);

  // Conical ivory teeth alternate along both sides of the upper and lower jaws.
  for (const side of [-1, 1]) {
    for (let tooth = 0; tooth < 7; tooth++) {
      const x = .65 + tooth * .12;
      const z = side * (.245 - tooth * .006);
      const radius = tooth % 2 ? .025 : .031;
      cone("Crocodile upper ivory tooth " + side + " " + (tooth + 1),
        [x, -.092, z], [x + (tooth % 2 ? .018 : -.012), -.184, z], radius, "#fff0c8", .02, .28, 10);
      if (tooth % 2 === 0) {
        cone("Crocodile lower ivory tooth " + side + " " + (tooth + 1),
          [x + .045, -.164, z], [x + .03, -.086, z], radius * .82, "#f5e5bd", .02, .32, 10);
      }
    }
  }

  // High amber eyes, ridged brows, nostrils and cheek scales.
  for (const side of [-1, 1]) {
    const z = side * .278;
    ellipsoid("Crocodile eye socket " + side, [.52, .267, z], [.118, .105, .084], "#466d48", .04, .51, 24, 16);
    ellipsoid("Crocodile amber eye " + side, [.557, .278, z + side * .052], [.055, .061, .035], "#dcad4e", .12, .24, 20, 14);
    ellipsoid("Crocodile vertical dark pupil " + side, [.574, .282, z + side * .078], [.016, .046, .011], "#172c2a", .08, .2, 16, 12);
    ellipsoid("Crocodile eye catchlight " + side, [.581, .304, z + side * .087], [.009, .012, .006], "#fff9df", .05, .15, 12, 8);
    tube("Crocodile heavy brow ridge " + side, [
      [.43, .335, z], [.51, .371, z + side * .015], [.61, .344, z]
    ], .025, "#78955d", .04, .45, 8);
    ellipsoid("Crocodile nostril rim " + side, [1.365, .091, side * .145], [.041, .025, .034], "#829765", .04, .45, 18, 10);
    ellipsoid("Crocodile nostril opening " + side, [1.374, .11, side * .15], [.018, .014, .019], "#253d31", .02, .5, 14, 8);
    for (let scale = 0; scale < 5; scale++) {
      const x = .69 + scale * .095;
      ellipsoid("Crocodile cheek scale " + side + " " + (scale + 1),
        [x, .11 - (scale % 2) * .025, side * .269], [.035, .026, .015],
        scale % 2 ? "#829966" : "#4b714b", .02, .52, 12, 8);
    }
  }

  // Four short muscular limbs, webbed feet, separated toes and dark hooked claws.
  for (const side of [-1, 1]) {
    for (const front of [true, false]) {
      const x = front ? .34 : -.42;
      const z = side * .27;
      const label = (front ? "front" : "rear") + " " + (side < 0 ? "far" : "near");
      ellipsoid("Crocodile " + label + " upper leg", [x, -.115, z], [.205, .128, .135], "#628455", .045, .47, 24, 14);
      const footX = x + (front ? .105 : -.055);
      const footZ = side * .43;
      tube("Crocodile " + label + " lower leg", [
        [x, -.17, z], [footX, -.255, footZ]
      ], [.075, .06], "#6e8d59", .04, .48, 10);
      ellipsoid("Crocodile " + label + " broad webbed paw", [footX, -.274, footZ], [.16, .06, .125], "#76905d", .035, .48, 22, 12);
      for (let toe = 0; toe < 4; toe++) {
        const lateral = (toe - 1.5) * .068;
        const toeStart = [footX + .045, -.29, footZ + lateral];
        const toeEnd = [footX + .155 + (toe === 0 || toe === 3 ? -.025 : .02), -.302, footZ + lateral * 1.25];
        tube("Crocodile " + label + " toe " + (toe + 1), [toeStart, toeEnd], [.033, .022], "#849d68", .025, .5, 8);
        cone("Crocodile " + label + " dark claw " + (toe + 1),
          toeEnd, [toeEnd[0] + .065, toeEnd[1] - .003, toeEnd[2]],
          .019, "#31443a", .04, .36, 8);
      }
      for (let scale = 0; scale < 3; scale++) {
        ellipsoid("Crocodile " + label + " leg scute " + (scale + 1),
          [x + (scale - 1) * .075, -.025, z], [.055, .04, .085],
          "#829864", .035, .48, 12, 8);
      }
    }
  }

  // Small irregular water beads sit below the jaw and tail to ground the composition.
  for (let index = 0; index < 7; index++) {
    const x = -1.1 + index * .35;
    ellipsoid("Crocodile water bead " + (index + 1),
      [x, -.37, (index % 2 ? 1 : -1) * .19], [.035, .045, .03],
      "#9ed6ca", .13, .24, 12, 8);
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
    const maxIndex = Math.max(...part.indices);
    const use32BitIndices = maxIndex > 65535;
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
        mingloraAssetId: "gift-crocodile-3d-v1",
        source: "assets/3d-assets/gift-models/crocodile-model.mjs",
        artDirection: "a broad olive-green crocodile with a low armored torso, pale segmented belly, tapering keel-backed tail, elongated tooth-lined jaws, amber vertical-pupil eyes, nostrils, cheek scales, four webbed clawed feet and small water beads",
        reviewStatus: "design-review-pending"
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Minglora Crocodile - River Guardian" }],
    meshes: [{ name: "Minglora Original Armoured Crocodile", primitives }],
    materials,
    buffers: [{ byteLength: binary.length, uri: "data:application/octet-stream;base64," + binary.toString("base64") }],
    bufferViews,
    accessors
  };
}
