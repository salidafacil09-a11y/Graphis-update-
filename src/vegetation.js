(function (G) {
  'use strict';

  // Vegetación. Treinta años después la naturaleza ha vuelto: árboles grandes de copa ancha (arces y robles),
  // abetos altos, abedules que han nacido entre el asfalto, arbolillos en las grietas, prados de hierba que se
  // comen los jardines, helechos a la sombra, flores silvestres, maleza en las juntas de las aceras, musgo y hojas
  // caídas por el suelo.
  //
  // Árboles: tronco y ramas en 3D (con musgo abajo) y la copa hecha de racimos de hojas (láminas con
  // transparencia, sombreadas como un volumen); de lejos, cada árbol es una sola lámina que mira a la cámara,
  // pintada a partir del propio árbol (misma silueta). Todo lo pequeño (hierba, helechos, flores, maleza, hojas,
  // musgo, arbolillos) va instanciado por trozo del mundo, se encoge a lo lejos y su cantidad depende de la
  // calidad (cambiarla no obliga a reconstruir). Todo se mece con el viento.
  //
  // Cuánta naturaleza hay en cada mapa lo dice su «wild» (0 a 1); la estación, «autumn» (otoño) o «winter»
  // (invierno: árboles pelados y abetos con nieve).

  const U = G.Util;
  let R = null;
  const uTime = { value: 0 };
  let swapT = 0;

  // ---------- Texturas dibujadas en un canvas ----------
  function canvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }
  function tex(cv, repeat) {
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 2;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const hsl = (h, s, l, a) => 'hsla(' + h.toFixed(1) + ',' + s.toFixed(1) + '%,' + l.toFixed(1) + '%,' + (a == null ? 1 : a) + ')';

  // Una hoja con punta (de arce, roble o aliso): dos curvas y el nervio
  function leaf(g, x, y, ang, L, W, col, vein) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = col;
    g.beginPath(); g.moveTo(-L * 0.5, 0);
    g.quadraticCurveTo(-L * 0.1, -W, L * 0.5, 0);
    g.quadraticCurveTo(-L * 0.1, W, -L * 0.5, 0);
    g.fill();
    if (vein) { g.strokeStyle = vein; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-L * 0.45, 0); g.lineTo(L * 0.4, 0); g.stroke(); }
    g.restore();
  }

  // Racimo de hojas: ramitas desde el centro y hojas en grupos; las de atrás más oscuras (el racimo hace sombra
  // sobre sí mismo), las de arriba y delante más claras. Bordes irregulares (no un círculo)
  function leafCanvas(o) {
    const S = o.size || 256, cv = canvas(S, S), g = cv.getContext('2d');
    const r = rng(o.seed), C = S / 2;
    // ramitas
    g.lineCap = 'round';
    const tips = [];
    for (let k = 0; k < (o.twigs || 7); k++) {
      const a = r() * Math.PI * 2, L = S * (0.28 + r() * 0.16);
      const bx = C + Math.cos(a) * L, by = C + Math.sin(a) * L * 0.85;
      g.strokeStyle = o.twig || '#3d3122'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(C + (r() - 0.5) * 10, C + 12); g.quadraticCurveTo(C + Math.cos(a) * L * 0.5 + (r() - 0.5) * 20, C + Math.sin(a) * L * 0.4, bx, by); g.stroke();
      tips.push([bx, by]);
    }
    // grupos de hojas: alrededor de las puntas de las ramitas y por dentro
    const groups = tips.concat(Array.from({ length: o.inner || 5 }, () => [C + (r() - 0.5) * S * 0.36, C + (r() - 0.5) * S * 0.32]));
    const n = o.n || 380;
    for (let i = 0; i < n; i++) {
      const t = i / n;                                   // orden: primero las de atrás
      const gp = groups[Math.floor(r() * groups.length)];
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * (o.spread || 0.15);
      const x = gp[0] + Math.cos(a) * d, y = gp[1] + Math.sin(a) * d;
      if (Math.hypot(x - C, (y - C) * 1.1) > S * 0.47) continue;
      const lit = 0.25 + t * 0.55 + (1 - y / S) * 0.25 + (r() - 0.5) * 0.15;
      const hh = o.hue + (r() - 0.5) * (o.hueVar || 14) + (o.hueLit || 0) * lit;
      const sat = o.sat + (r() - 0.5) * 10, li = o.light[0] + lit * (o.light[1] - o.light[0]);
      const L = o.leaf * (0.75 + r() * 0.5);
      leaf(g, x, y, r() * Math.PI * 2, L, L * (o.wide || 0.36), hsl(hh, sat, li), lit > 0.6 ? hsl(hh, sat - 6, li + 9, 0.5) : null);
    }
    return cv;
  }

  // Rama de abeto: tallos con agujas densas y cortas, más claras en las puntas (los brotes nuevos)
  function needleCanvas(snow) {
    const W = 256, H = 128, cv = canvas(W, H), g = cv.getContext('2d');
    const r = rng(77);
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const y0 = H / 2 + (k - 1.5) * 20 + (r() - 0.5) * 8;
      const pt = (t) => [t * W * 0.96, H / 2 + (y0 - H / 2) * Math.min(1, t * 1.7) + 5 * t * t];
      g.strokeStyle = '#33281c'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(0, H / 2);
      for (let t = 0.05; t <= 1; t += 0.05) { const p = pt(t); g.lineTo(p[0], p[1]); }
      g.stroke();
      for (let i = 0; i < 300; i++) {
        const t = Math.pow(r(), 0.75) * 0.99;
        const [x, y] = pt(t);
        const len = (1 - t * 0.45) * (8 + r() * 13);
        const a = (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.9) + 0.25;
        const tip = t > 0.8 ? (t - 0.8) * 5 : 0;
        const li = 11 + r() * 13 + (y < H / 2 ? 4 : 0) + tip * 12;
        g.strokeStyle = hsl(150 - tip * 30 + r() * 18, 22 + r() * 16 + tip * 12, li);
        g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y - Math.sin(a) * len * 0.8); g.stroke();
      }
      if (snow) {
        // nieve encima de las ramas
        for (let i = 0; i < 60; i++) {
          const t = r() * 0.95, [x, y] = pt(t);
          g.fillStyle = hsl(205, 12, 88 + r() * 8);
          g.beginPath(); g.ellipse(x, y - 4, 4 + r() * 8, 2 + r() * 2.5, 0, 0, Math.PI * 2); g.fill();
        }
      }
    }
    return cv;
  }

  // Ramas peladas (invierno): ramitas que se abren y se dividen
  function twigCanvas() {
    const S = 256, cv = canvas(S, S), g = cv.getContext('2d');
    const r = rng(19);
    g.lineCap = 'round';
    const br = (x, y, a, L, w, d) => {
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      g.strokeStyle = '#3a3029'; g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (d > 0) for (let k = 0; k < 2 + (r() < 0.4 ? 1 : 0); k++) br(x2, y2, a + (r() - 0.5) * 1.3, L * (0.6 + r() * 0.2), w * 0.68, d - 1);
    };
    for (let k = 0; k < 5; k++) br(S / 2, S * 0.62, -Math.PI / 2 + (r() - 0.5) * 2.2, S * 0.17, 3.2, 4);
    return cv;
  }

  // Prado: hojas de hierba finas de distintas alturas (verdes abajo, pajizas en las puntas), algunas espigas y
  // alguna hoja ancha de otras plantas
  function meadowCanvas(dry) {
    const W = 256, H = 128, cv = canvas(W, H), g = cv.getContext('2d');
    const r = rng(dry ? 33 : 31);
    for (let i = 0; i < 120; i++) {
      const x = 4 + r() * (W - 8), h = H * (0.3 + Math.pow(r(), 0.8) * 0.68), bend = (r() - 0.5) * 34;
      const grad = g.createLinearGradient(0, H, 0, H - h);
      const hue = (dry ? 48 : 82) + r() * 22;
      grad.addColorStop(0, hsl(hue + 14, 30, 12));
      grad.addColorStop(0.6, hsl(hue, dry ? 36 : 34, 26 + r() * 10));
      grad.addColorStop(1, hsl(hue - (dry ? 6 : 16), dry ? 38 : 30, (dry ? 46 : 32) + r() * 10));
      g.fillStyle = grad;
      const w = 1.3 + r() * 1.8;
      g.beginPath();
      g.moveTo(x - w, H);
      g.quadraticCurveTo(x - w * 0.4 + bend * 0.5, H - h * 0.55, x + bend, H - h);
      g.quadraticCurveTo(x + w * 0.4 + bend * 0.5, H - h * 0.55, x + w, H);
      g.fill();
      // espiga
      if (r() < 0.13) {
        g.fillStyle = hsl(dry ? 42 : 52, 30, 58 + r() * 12);
        for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(x + bend + (r() - 0.5) * 3, H - h - 2 + k * 3.2, 1.4, 2.6, 0.3 * (r() - 0.5), 0, Math.PI * 2); g.fill(); }
      }
    }
    // alguna hoja ancha (llantén, diente de león)
    for (let i = 0; i < 9; i++) {
      const x = 10 + r() * (W - 20);
      leaf(g, x, H - 8 - r() * 10, -Math.PI / 2 + (r() - 0.5) * 1.6, 22 + r() * 14, 7, hsl(dry ? 60 : 96, 30, 20 + r() * 8));
    }
    return cv;
  }

  // Flores silvestres entre la hierba: umbelas blancas (zanahoria silvestre), florecitas amarillas y espigas
  // moradas (adelfilla). Colores apagados, de verdad
  function flowerCanvas() {
    const W = 256, H = 128, cv = canvas(W, H), g = cv.getContext('2d');
    g.drawImage(meadowCanvas(false), 0, 0);
    const r = rng(57);
    for (let i = 0; i < 16; i++) {
      const x = 10 + r() * (W - 20), top = H * (0.12 + r() * 0.4), kind = Math.floor(r() * 3);
      g.strokeStyle = hsl(90, 28, 24); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + (r() - 0.5) * 12, (H + top) / 2, x, top); g.stroke();
      if (kind === 0) {
        for (let k = 0; k < 26; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 8; g.fillStyle = hsl(50, 12, 84 + r() * 10); g.beginPath(); g.arc(x + Math.cos(a) * d, top + Math.sin(a) * d * 0.45, 1.5, 0, Math.PI * 2); g.fill(); }
      } else if (kind === 1) {
        for (let k = 0; k < 4; k++) { g.fillStyle = hsl(46, 70, 52 + r() * 10); g.beginPath(); g.arc(x + (r() - 0.5) * 9, top + (r() - 0.5) * 6, 2.4, 0, Math.PI * 2); g.fill(); }
      } else {
        for (let k = 0; k < 9; k++) { g.fillStyle = hsl(318 + r() * 16, 36, 50 + r() * 10); g.beginPath(); g.ellipse(x + (r() - 0.5) * 3, top + k * 4, 2.3, 2.0, 0, 0, Math.PI * 2); g.fill(); }
      }
    }
    return cv;
  }

  // Fronda de helecho: el tallo central y los foliolos que se acortan hacia la punta (u: de la base a la punta)
  function fernCanvas() {
    const W = 256, H = 64, cv = canvas(W, H), g = cv.getContext('2d');
    const r = rng(23);
    g.strokeStyle = '#3c4a22'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    for (let i = 0; i < 34; i++) {
      const t = i / 34, x = 8 + t * (W - 14), L = (1 - t * 0.8) * 26 * (0.85 + r() * 0.3);
      for (const s of [-1, 1]) {
        g.save(); g.translate(x, H / 2); g.rotate(s * (1.05 + t * 0.25));
        const li = 20 + r() * 9 + t * 8;
        g.fillStyle = hsl(98 + r() * 12, 40, li);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -4.2, L, 0); g.quadraticCurveTo(L * 0.5, 4.2, 0, 0); g.fill();
        g.restore();
      }
    }
    return cv;
  }

  // Suelo: hojas caídas (secas, pardas y anaranjadas) y ramitas; y manchas de musgo
  function litterCanvas() {
    const S = 256, cv = canvas(S, S), g = cv.getContext('2d');
    const r = rng(91), C = S / 2;
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.44;
      if (r() > 1 - d / (S * 0.5)) continue;
      const L = 9 + r() * 9;
      leaf(g, C + Math.cos(a) * d, C + Math.sin(a) * d, r() * 6.28, L, L * 0.38, hsl(22 + r() * 26, 32 + r() * 22, 18 + r() * 18));
    }
    g.strokeStyle = '#3a2e22'; g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) { const x = C + (r() - 0.5) * S * 0.6, y = C + (r() - 0.5) * S * 0.6, a = r() * 6.28, L = 14 + r() * 22; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
    return cv;
  }
  function stack(a, b) { const cv = canvas(a.width, a.height + b.height), g = cv.getContext('2d'); g.drawImage(a, 0, 0); g.drawImage(b, 0, a.height); return cv; }
  // hojas a la izquierda, musgo a la derecha
  function decalAtlas() {
    const cv = canvas(512, 256), g = cv.getContext('2d');
    g.drawImage(litterCanvas(), 0, 0, 256, 256);
    g.drawImage(mossCanvas(), 256, 0, 256, 256);
    return cv;
  }
  function mossCanvas() {
    const S = 128, cv = canvas(S, S), g = cv.getContext('2d');
    const r = rng(13), C = S / 2;
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * S * 0.46;
      const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d * (0.7 + 0.3 * Math.sin(a * 3));
      g.fillStyle = hsl(78 + r() * 22, 30 + r() * 14, 16 + r() * 14);
      g.beginPath(); g.arc(x, y, 1.2 + r() * 2.6, 0, Math.PI * 2); g.fill();
    }
    return cv;
  }

  // Hiedra que trepa por una pared (de abajo arriba: abajo tupida, arriba zarcillos sueltos). Se repite a lo
  // ancho. upsideDown: la que cuelga de un tejado o una barandilla (tupida arriba)
  function ivyCanvas() {
    const W = 256, H = 512, cv = canvas(W, H), g = cv.getContext('2d');
    const r = rng(61);
    g.lineCap = 'round';
    // tallos: muchos, que suben serpenteando y se ramifican (por encima del borde también, para que se repita)
    const stems = [];
    for (let k = 0; k < 16; k++) {
      let x = (k + r() * 0.9) / 16 * W, y = H + 4;
      const top = H * (0.03 + Math.pow(r(), 0.5) * 0.6), pts = [[x, y]];
      while (y > top) { y -= 8 + r() * 12; x += (r() - 0.5) * 14; pts.push([x, y]); }
      stems.push(pts);
      g.strokeStyle = '#4a3a2a'; g.lineWidth = 1.8;
      for (const ox of [-W, 0, W]) { g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1]); for (const p of pts) g.lineTo(p[0] + ox, p[1]); g.stroke(); }
    }
    const ivyLeaf = (x, y, s, col, rot) => {
      for (const ox of [-W, 0, W]) {
        g.save(); g.translate(x + ox, y); g.rotate(rot); g.fillStyle = col;
        g.beginPath(); g.moveTo(0, s * 0.5);
        g.lineTo(-s * 0.55, -s * 0.02); g.lineTo(-s * 0.3, -s * 0.16); g.lineTo(-s * 0.32, -s * 0.52); g.lineTo(0, -s * 0.3);
        g.lineTo(s * 0.32, -s * 0.52); g.lineTo(s * 0.3, -s * 0.16); g.lineTo(s * 0.55, -s * 0.02); g.closePath(); g.fill();
        g.restore();
      }
    };
    // manto de hojas: tupido abajo (casi cubre), que se abre hacia arriba en zarcillos; de atrás (oscuras) a
    // delante (claras)
    for (let pass = 0; pass < 3; pass++) {
      const n = [900, 700, 420][pass];
      for (let i = 0; i < n; i++) {
        const st = stems[Math.floor(r() * stems.length)], p = st[Math.floor(Math.pow(r(), 0.6) * st.length)];
        const y = p[1] + (r() - 0.5) * 20, dens = Math.pow(U.clamp(y / H, 0, 1), 0.8);
        if (r() > -0.1 + dens * 1.25) continue;
        const x = p[0] + (r() - 0.5) * (14 + 40 * dens);
        const lit = pass === 0 ? r() * 0.3 : (pass === 1 ? 0.3 + r() * 0.35 : 0.6 + r() * 0.4);
        ivyLeaf(x, y, 11 + r() * 9, hsl(98 + r() * 24, 28 + r() * 16, 10 + lit * 22), (r() - 0.5) * 1.3);
      }
    }
    return cv;
  }

  // ---------- Viento ----------
  // k: cuánto se mueve según la altura (y + off) · fade: lo pequeño se encoge a lo lejos
  function windMat(mat, k, off, fade, atl) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      if (fade) sh.uniforms.uFade = fade;
      if (atl) sh.vertexShader = 'attribute vec4 aAtl;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = aAtl.xy + uv * aAtl.zw;\n#endif');
      sh.vertexShader = 'uniform float uTime;\n' + (fade ? 'uniform vec2 uFade;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);',
        '#else',
        '  vec3 ip = vec3(0.0);',
        '#endif',
        fade ? '  float fd = 1.0 - smoothstep(uFade.x, uFade.y, distance(ip.xz, cameraPosition.xz));\n  transformed *= vec3(mix(0.4, 1.0, fd), fd, mix(0.4, 1.0, fd));' : '',
        // ráfagas: una onda lenta que recorre el mapa y modula el balanceo
        '  float gust = 0.65 + 0.35 * sin(uTime * 0.37 + ip.x * 0.045 + ip.z * 0.031);',
        '  float ph = uTime * 1.7 + ip.x * 0.37 + ip.z * 0.29;',
        '  float wk = max(0.0, transformed.y + ' + off.toFixed(2) + ') * ' + k.toFixed(4) + ' * gust;',
        '  transformed.x += (sin(ph) + 0.35 * sin(ph * 2.3 + transformed.z)) * wk;',
        '  transformed.z += cos(ph * 0.8 + transformed.x * 0.5) * wk * 0.6;'
      ].join('\n'));
      if (G.Flash) G.Flash.patch(sh);           // (la linterna)
    };
    // ¡Importante! Three.js reutiliza el sombreador compilado si el texto de onBeforeCompile es igual, y aquí lo es
    // para todos (cambian solo los números de dentro). Sin una clave propia, copas, pinos, arbustos y hierba
    // acababan con el sombreador del primero que se compilaba
    const key = 'wind_' + k.toFixed(4) + '_' + off.toFixed(2) + (fade ? '_fade' : '') + (atl ? '_atl' : '');
    mat.customProgramCacheKey = () => key;
    return mat;
  }

  // Lámina que mira siempre a la cámara (girando solo en vertical). Todas las láminas de lejos van en una sola
  // textura (un atlas): cada instancia dice su trozo (aAtl: u, v, ancho, alto) y su tamaño va en la matriz
  function billboardMat(map) {
    const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 aAtl;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = aAtl.xy + uv * aAtl.zw;\n#endif')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <project_vertex>', [
          'vec4 bc = vec4(0.0, 0.0, 0.0, 1.0);',
          'float bsx = 1.0, bsy = 1.0;',
          '#ifdef USE_INSTANCING',
          '  bc = instanceMatrix * bc; bsx = length(instanceMatrix[0].xyz); bsy = length(instanceMatrix[1].xyz);',
          '#endif',
          'vec3 toC = cameraPosition - bc.xyz; toC.y = 0.0; toC = normalize(toC + vec3(1e-4, 0.0, 0.0));',
          'vec3 rgt = vec3(toC.z, 0.0, -toC.x);',
          'vec3 wp = bc.xyz + rgt * transformed.x * bsx + vec3(0.0, transformed.y * bsy, 0.0);',
          'vec4 mvPosition = viewMatrix * vec4(wp, 1.0);',
          'gl_Position = projectionMatrix * mvPosition;'
        ].join('\n'));
      if (G.Flash) G.Flash.patch(sh);
    };
    mat.customProgramCacheKey = () => 'billboardAtl';
    return mat;
  }
  // Un material con atlas (aAtl) para las manchas del suelo (hojas y musgo en la misma textura)
  function atlasMat(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 aAtl;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = aAtl.xy + uv * aAtl.zw;\n#endif');
      if (G.Flash) G.Flash.patch(sh);
    };
    mat.customProgramCacheKey = () => 'atlasDecal';
    return mat;
  }

  // ---------- Geometrías ----------
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _w = new THREE.Vector3();
  // Láminas: cada una { c: [x, y, z] centro, s: tamaño, yaw, tilt, k: racimo [x, y, z] (o null), sx: ancho / alto }.
  // Normales: hacia fuera del racimo y de la copa, con algo de cielo (así la copa se ilumina como un volumen). Color
  // por vértice: más oscuro abajo y por dentro (la copa se hace sombra)
  function cardsGeo(cards, center, H0, H1, R0) {
    const pos = [], nor = [], uv = [], col = [], idx = [];
    for (const cd of cards) {
      _e.set(cd.tilt || 0, cd.yaw || 0, cd.roll || 0, 'YXZ'); _q.setFromEuler(_e);
      const b = pos.length / 3, sx = cd.sx || 1;
      for (const [ux, uy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        _v.set((ux - 0.5) * cd.s * sx, (uy - 0.5) * cd.s, 0).applyQuaternion(_q);
        _v.x += cd.c[0]; _v.y += cd.c[1]; _v.z += cd.c[2];
        pos.push(_v.x, _v.y, _v.z);
        _n.copy(_v).sub(center);
        if (cd.k) { _w.set(_v.x - cd.k[0], _v.y - cd.k[1], _v.z - cd.k[2]); _n.multiplyScalar(0.45).add(_w.multiplyScalar(0.8)); }
        _n.normalize(); _n.y += 0.3; _n.normalize();
        nor.push(_n.x, _n.y, _n.z);
        uv.push(ux, uy);
        const hk = H1 > H0 ? U.clamp((_v.y - H0) / (H1 - H0), 0, 1) : 1;
        const out = R0 ? U.clamp(Math.hypot(_v.x - center.x, _v.z - center.z) / R0, 0, 1) : 1;
        const ao = cd.ao != null ? cd.ao : (0.5 + 0.38 * hk + 0.22 * out);
        col.push(ao, ao, ao);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // ---------- Especies ----------
  // Un árbol: tronco (con raíces que asoman y musgo abajo), ramas maestras hasta los racimos, y la copa. Devuelve
  // { trunk, crown, cards, limbs, H (alto), R (radio de la copa) } — cards y limbs sirven para pintar la lámina
  // de lejos con la misma silueta
  function makeTree(sp, seed) {
    const r = rng(seed);
    const m = new G.Mesher();
    const BARK = sp.bark, MOSS = 0x4e5a30;
    const limbs = [];
    const seg = (x0, y0, z0, x1, y1, z1, r0, r1, hex, sides) => {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
      const tilt = Math.acos(U.clamp(dy / L, -1, 1)), az = Math.atan2(dz, dx);
      m.cyl((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r0, r1, L, hex, sides || 6, undefined, 0, -az, -tilt);
      limbs.push([x0, y0, z0, x1, y1, z1, r0, r1]);
    };
    // tronco en dos tramos (algo torcido) y el pie más ancho con raíces
    const H = sp.trunkH * (0.9 + r() * 0.2), TR = sp.trunkR;
    const lean = [(r() - 0.5) * sp.lean, (r() - 0.5) * sp.lean];
    const mid = [lean[0] * 0.5, H * 0.5, lean[1] * 0.5], top = [lean[0], H, lean[1]];
    seg(0, -0.1, 0, mid[0], mid[1], mid[2], TR * 1.25, TR, U.shade(BARK, 0.9), sp.sides);
    seg(mid[0], mid[1], mid[2], top[0], top[1], top[2], TR, TR * 0.72, BARK, sp.sides);
    if (sp.moss) m.cyl(0, 0.45, 0, TR * 1.32, TR * 1.12, 0.9, MOSS, sp.sides);                  // musgo en el pie
    if (sp.roots) for (let k = 0; k < sp.roots; k++) {
      const a = k / sp.roots * Math.PI * 2 + r() * 0.5, L = TR * (2.6 + r() * 1.4);
      seg(0, 0.32, 0, Math.cos(a) * L, -0.05, Math.sin(a) * L, TR * 0.42, TR * 0.12, U.shade(BARK, 0.85), 5);
    }
    if (sp.bands) for (let k = 0; k < sp.bands; k++) {                                         // abedul: las marcas oscuras
      const y = 0.4 + r() * (H - 0.6);
      m.cyl(lean[0] * y / H, y, lean[1] * y / H, TR * 1.04, TR * 0.98, 0.08 + r() * 0.12, 0x2c2a26, sp.sides);
    }
    // ramas maestras: de lo alto del tronco hacia fuera y arriba; en la punta de cada una, un racimo
    const clusters = [];
    const nL = sp.limbs[0] + Math.floor(r() * (sp.limbs[1] - sp.limbs[0] + 1));
    for (let i = 0; i < nL; i++) {
      const a = (i + r() * 0.6) / nL * Math.PI * 2;
      const y0 = H * (sp.limbFrom + r() * (1 - sp.limbFrom));
      const sx = lean[0] * y0 / H, sz = lean[1] * y0 / H;
      const reach = sp.reach[0] + r() * (sp.reach[1] - sp.reach[0]);
      const ty = y0 + sp.rise[0] + r() * (sp.rise[1] - sp.rise[0]);
      const tx = sx + Math.cos(a) * reach, tz = sz + Math.sin(a) * reach;
      const kx = sx + Math.cos(a) * reach * 0.5, kz = sz + Math.sin(a) * reach * 0.5, ky = (y0 + ty) / 2 + 0.3;
      seg(sx, y0, sz, kx, ky, kz, TR * 0.5, TR * 0.32, U.shade(BARK, 0.95), 5);
      seg(kx, ky, kz, tx, ty, tz, TR * 0.32, TR * 0.12, U.shade(BARK, 0.95), 4);
      clusters.push([tx, ty + sp.clLift, tz, sp.clR[0] + r() * (sp.clR[1] - sp.clR[0])]);
      if (sp.midClusters && r() < sp.midClusters) clusters.push([kx * 1.05, ky + 0.4, kz * 1.05, (sp.clR[0] + r() * (sp.clR[1] - sp.clR[0])) * 0.8]);
    }
    // el líder: la punta de la copa
    if (sp.leader) {
      const ly = H + sp.leader * (0.85 + r() * 0.3);
      seg(top[0], top[1], top[2], top[0] * 1.2, ly - 0.6, top[2] * 1.2, TR * 0.6, TR * 0.2, BARK, 5);
      clusters.push([top[0] * 1.2, ly, top[2] * 1.2, sp.clR[1] * 1.05]);
    }
    // relleno: racimos interiores (que no se vea el cielo a través del centro de la copa)
    for (let k = 0; k < (sp.fill || 0); k++) {
      const a = r() * Math.PI * 2, d = r() * sp.reach[1] * 0.45;
      clusters.push([top[0] + Math.cos(a) * d, H + sp.rise[1] * (0.3 + r() * 0.5), top[2] + Math.sin(a) * d, sp.clR[1] * 0.95]);
    }
    // la copa: láminas en cada racimo
    const cards = [];
    let y0 = Infinity, y1 = -Infinity, R0 = 0;
    for (const [cx, cy, cz, cr] of clusters) { y0 = Math.min(y0, cy - cr); y1 = Math.max(y1, cy + cr); R0 = Math.max(R0, Math.hypot(cx, cz) + cr); }
    const ctr = new THREE.Vector3(top[0], (y0 + y1) / 2 - 0.4, top[2]);
    for (const [cx, cy, cz, cr] of clusters) {
      const n = sp.cards;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * cr * 0.55;
        cards.push({ c: [cx + Math.cos(a) * d, cy + (r() - 0.5) * cr * 0.7, cz + Math.sin(a) * d], s: cr * (1.3 + r() * 0.45), yaw: r() * Math.PI, tilt: (r() - 0.5) * 1.2, roll: r() * 6.28, k: [cx, cy, cz] });
      }
      // una lámina casi horizontal arriba y otra abajo (de lejos y desde arriba también se ve llena)
      cards.push({ c: [cx, cy + cr * 0.35, cz], s: cr * 1.5, yaw: r() * 3, tilt: -1.35, roll: r() * 6.28, k: [cx, cy, cz] });
      cards.push({ c: [cx, cy - cr * 0.3, cz], s: cr * 1.4, yaw: r() * 3, tilt: -1.45, roll: r() * 6.28, k: [cx, cy, cz] });
    }
    return { trunk: barkTone(m.build(), sp.moss, seed), crown: cardsGeo(cards, ctr, y0, y1, R0), cards, limbs, H: y1, R: R0, base: y0 };
  }
  // La corteza: vetas verticales, más oscura y verdosa (musgo) abajo, algo más clara arriba
  function barkTone(g, moss, seed) {
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x), st = 0.86 + 0.14 * Math.sin(a * 7 + seed + Math.sin(y * 1.3) * 0.8);
      const up = U.clamp(y / 6, 0, 1), k = st * (0.72 + 0.4 * up);
      let r = c.getX(i) * k, gg = c.getY(i) * k, b = c.getZ(i) * k;
      if (moss) { const mk = U.clamp(1 - y / 1.6, 0, 1) * (0.5 + 0.5 * Math.sin(a * 3 + seed)); r = r * (1 - mk * 0.45); gg = gg * (1 - mk * 0.1) + mk * 0.02; b = b * (1 - mk * 0.5); }
      c.setXYZ(i, r, gg, b);
    }
    return g;
  }

  // Abeto: tronco recto y pisos de ramas que caen, más anchos abajo; la punta afilada
  function makeFir(sp, seed, snow) {
    const r = rng(seed);
    const m = new G.Mesher();
    const H = sp.H * (0.9 + r() * 0.2), limbs = [];
    m.cyl(0, H * 0.45, 0, sp.trunkR, sp.trunkR * 0.3, H * 0.9, sp.bark, 7);
    limbs.push([0, 0, 0, 0, H * 0.9, 0, sp.trunkR, sp.trunkR * 0.3]);
    if (sp.moss) m.cyl(0, 0.35, 0, sp.trunkR * 1.3, sp.trunkR * 1.1, 0.7, 0x4e5a30, 7);
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + r(), L = sp.trunkR * 2.6; m.cyl(Math.cos(a) * L * 0.5, 0.12, Math.sin(a) * L * 0.5, sp.trunkR * 0.4, sp.trunkR * 0.15, L, U.shade(sp.bark, 0.85), 5, undefined, 0, -a, Math.PI / 2 - 0.25); }
    const cards = [];
    const tiers = sp.tiers, y0 = H * sp.from;
    for (let L = 0; L < tiers; L++) {
      const t = L / (tiers - 1), y = y0 + t * (H - y0) * 0.94;
      const rad = sp.R * (1 - t) * (0.85 + r() * 0.3) + 0.35;
      const n = Math.max(4, Math.round(sp.perTier * (1 - t * 0.5)));
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + L * 0.9 + r() * 0.4;
        // rama: una lámina que sale del tronco y cae (inclinada), con la textura del tallo hacia fuera
        const len = rad * (0.85 + r() * 0.3), drop = 0.3 + 0.25 * (1 - t);
        cards.push({ c: [Math.cos(a) * len * 0.5, y - len * 0.5 * Math.sin(drop), Math.sin(a) * len * 0.5], s: len * 0.62, sx: 1 / 0.62 * 1.02, yaw: -a, tilt: 0, roll: -drop, ao: 0.5 + 0.5 * t, branch: true });
      }
    }
    // punta
    for (const a of [0, Math.PI / 2]) cards.push({ c: [0, H - 0.1, 0], s: 0.9, sx: 2.2, yaw: a, tilt: 0, roll: Math.PI / 2, ao: 1, tip: true });
    // las láminas de rama: el ancho va a lo largo de la rama (yaw ya orienta)
    const g = firCardsGeo(cards, H);
    return { trunk: barkTone(m.build(), sp.moss, seed), crown: g, cards, limbs, H: H + 1, R: sp.R + 0.35, base: y0 };
  }
  function firCardsGeo(cards, H) {
    const pos = [], nor = [], uv = [], col = [], idx = [];
    for (const cd of cards) {
      _e.set(0, cd.yaw, cd.roll, 'YXZ'); _q.setFromEuler(_e);
      const b = pos.length / 3, w = cd.s * cd.sx, h = cd.s;
      for (const [ux, uy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        _v.set((ux - 0.5) * w, (uy - 0.5) * h, 0).applyQuaternion(_q);
        _v.x += cd.c[0]; _v.y += cd.c[1]; _v.z += cd.c[2];
        pos.push(_v.x, _v.y, _v.z);
        _n.set(_v.x, 0.9 + (_v.y / H) * 0.4, _v.z).normalize();
        nor.push(_n.x, _n.y, _n.z);
        uv.push(ux, uy);
        const ao = cd.ao * (0.75 + 0.25 * ux);
        col.push(ao, ao, ao);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    // las ramas: dos láminas cruzadas por cada una (de canto no desaparecen)
    const n0 = pos.length / 3;
    for (let i = 0; i < n0; i += 4) {
      if (cards[i / 4] && cards[i / 4].tip) continue;
      const b = pos.length / 3;
      const p = (j) => [pos[(i + j) * 3], pos[(i + j) * 3 + 1], pos[(i + j) * 3 + 2]];
      const A = p(0), B = p(1), C = p(2), D = p(3);
      const mA = [(A[0] + D[0]) / 2, (A[1] + D[1]) / 2, (A[2] + D[2]) / 2], mB = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2, (B[2] + C[2]) / 2];
      const hw = Math.hypot(D[0] - A[0], D[1] - A[1], D[2] - A[2]) / 2;
      // perpendicular horizontal al eje de la rama
      const ax = mB[0] - mA[0], az = mB[2] - mA[2], al = Math.hypot(ax, az) || 1, px = -az / al * hw, pz = ax / al * hw;
      for (const [q, ux, uy] of [[[mA[0] - px, mA[1], mA[2] - pz], 0, 0], [[mB[0] - px, mB[1], mB[2] - pz], 1, 0], [[mB[0] + px, mB[1], mB[2] + pz], 1, 1], [[mA[0] + px, mA[1], mA[2] + pz], 0, 1]]) {
        pos.push(q[0], q[1], q[2]); _n.set(q[0], 1.4, q[2]).normalize(); nor.push(_n.x, _n.y, _n.z); uv.push(ux, uy);
        const c0 = col[i * 3] * 1.05; col.push(c0, c0, c0);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // Especies (tamaños en metros). Arce grande: la copa ancha que domina el paisaje. Arce mediano. Abedul: tronco
  // blanco y copa clara. Arbolillo: lo que ha nacido en las grietas (sin tronco que choque)
  const SP = {
    big: { trunkH: 4.6, trunkR: 0.34, lean: 0.6, sides: 8, roots: 5, moss: true, limbs: [5, 6], limbFrom: 0.62, reach: [2.6, 3.6], rise: [1.2, 2.6], clR: [1.7, 2.2], clLift: 0.5, leader: 3.6, fill: 2, midClusters: 0.5, cards: 7, bark: 0x544a40 },
    mid: { trunkH: 3.4, trunkR: 0.22, lean: 0.5, sides: 7, roots: 4, moss: true, limbs: [4, 5], limbFrom: 0.6, reach: [1.6, 2.4], rise: [0.9, 1.9], clR: [1.25, 1.6], clLift: 0.4, leader: 2.4, fill: 1, midClusters: 0.3, cards: 6, bark: 0x564a3e },
    birch: { trunkH: 4.4, trunkR: 0.12, lean: 0.7, sides: 6, roots: 0, moss: false, bands: 7, limbs: [3, 4], limbFrom: 0.55, reach: [0.9, 1.5], rise: [1.0, 2.0], clR: [0.95, 1.25], clLift: 0.3, leader: 2.2, fill: 1, midClusters: 0.6, cards: 6, bark: 0xd6d2c6 },
    sapling: { trunkH: 1.3, trunkR: 0.05, lean: 0.4, sides: 5, roots: 0, moss: false, limbs: [2, 3], limbFrom: 0.5, reach: [0.35, 0.6], rise: [0.3, 0.7], clR: [0.42, 0.6], clLift: 0.1, leader: 0.7, fill: 0, cards: 5, bark: 0x6a5642 },
    fir: { H: 12.5, trunkR: 0.3, tiers: 13, from: 0.16, R: 3.1, perTier: 8, moss: true, bark: 0x4a3a2c },
    firS: { H: 8.5, trunkR: 0.2, tiers: 10, from: 0.14, R: 2.2, perTier: 7, moss: true, bark: 0x4a3a2c }
  };

  // ---------- Láminas de lejos, pintadas a partir del árbol (vista de lado, ortográfica) ----------
  // Las láminas de la copa se dibujan con su transformación afín (exacta en vista ortográfica), de atrás adelante y
  // sombreadas por su normal; el tronco y las ramas, como trapecios
  function shades(img, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const cv = canvas(img.width, img.height), g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(0,0,0,' + (0.62 * (1 - i / (n - 1))).toFixed(3) + ')';
      g.fillRect(0, 0, cv.width, cv.height);
      out.push(cv);
    }
    return out;
  }
  function paintImpostor(T, leafShades, barkHex, cv, ox, oy) {
    const W = 128, H = 256;
    const g = cv.getContext('2d');
    g.save(); g.beginPath(); g.rect(ox, oy, W, H); g.clip(); g.translate(ox, oy);
    const half = Math.max(T.R, 0.6) * 1.04, top = T.H + 0.2;
    const ppm = Math.min(W / (2 * half), H / top);
    const sx = (x) => W / 2 + x * ppm, sy = (y) => H - y * ppm;
    const bark = '#' + new THREE.Color(barkHex).getHexString();
    g.fillStyle = bark;
    for (const [x0, y0, , x1, y1, , r0, r1] of T.limbs) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
      g.beginPath();
      g.moveTo(sx(x0 + px * r0), sy(y0 + py * r0)); g.lineTo(sx(x1 + px * r1), sy(y1 + py * r1));
      g.lineTo(sx(x1 - px * r1), sy(y1 - py * r1)); g.lineTo(sx(x0 - px * r0), sy(y0 - py * r0)); g.closePath(); g.fill();
    }
    const geo = T.crown, P = geo.attributes.position.array, N = geo.attributes.normal.array, Cc = geo.attributes.color.array;
    const quads = [];
    for (let i = 0; i < P.length / 12; i++) {
      const o = i * 12;
      let zc = 0; for (let j = 0; j < 4; j++) zc += P[o + j * 3 + 2];
      const n = [N[o] + N[o + 3] + N[o + 6] + N[o + 9], N[o + 1] + N[o + 4] + N[o + 7] + N[o + 10], N[o + 2] + N[o + 5] + N[o + 8] + N[o + 11]];
      const nl = Math.hypot(n[0], n[1], n[2]) || 1;
      const lam = Math.max(0, (n[0] * -0.35 + n[1] * 0.75 + n[2] * 0.55) / nl);
      quads.push({ o, z: zc / 4, sh: U.clamp(0.25 + lam * 0.55 + (Cc[o / 3 * 3] - 0.6) * 0.8, 0, 1) });
    }
    quads.sort((a, b) => a.z - b.z);
    for (const q of quads) {
      const p = (j) => [sx(P[q.o + j * 3]), sy(P[q.o + j * 3 + 1])];
      const c0 = p(0), c1 = p(1), c3 = p(3);
      const img = leafShades[Math.min(leafShades.length - 1, Math.round(q.sh * (leafShades.length - 1)))];
      const S = img.width, Sh = img.height;
      g.setTransform((c1[0] - c0[0]) / S, (c1[1] - c0[1]) / S, (c0[0] - c3[0]) / Sh, (c0[1] - c3[1]) / Sh, c3[0] + ox, c3[1] + oy);
      g.drawImage(img, 0, 0);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.restore();
    return { w: W / ppm, h: H / ppm };
  }

  // ---------- Recursos compartidos ----------
  function lam(map, extra) { return new THREE.MeshLambertMaterial(Object.assign({ map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }, extra || {})); }
  function depth(map) { return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 }); }

  // Un juego de hojas (verano u otoño): las texturas y materiales de las copas
  function leafSet(season) {
    const aut = season === 'aut';
    const opt = (o) => Object.assign({ light: aut ? [16, 50] : [11, 36], sat: aut ? 58 : 34 }, o);
    const broad = leafCanvas(opt({ seed: 1, hue: aut ? 30 : 98, hueVar: aut ? 26 : 16, hueLit: aut ? 8 : -8, n: 420, leaf: 15, twigs: 8, inner: 6, spread: 0.14 }));
    const birch = leafCanvas(opt({ seed: 3, hue: aut ? 46 : 84, hueVar: 14, hueLit: aut ? 4 : -6, n: 300, leaf: 11, wide: 0.42, twigs: 9, inner: 4, spread: 0.12, light: aut ? [26, 60] : [16, 44], sat: aut ? 62 : 40 }));
    const bush = leafCanvas(opt({ seed: 2, hue: aut ? 26 : 94, hueVar: 18, n: 460, leaf: 13, twigs: 6, inner: 8, spread: 0.18 }));
    return { broad, birch, bush };
  }

  function init() {
    R = { sets: {}, mats: {} };
    const needle = needleCanvas(false), needleSnow = needleCanvas(true);
    R.tex = {
      needle: tex(needle), needleSnow: tex(needleSnow),
      fern: tex(fernCanvas()), decal: tex(decalAtlas()), ivy: tex(ivyCanvas(), true),
      // el prado (arriba) y las flores (abajo) en la misma textura: van en la misma malla
      meadowAtl: tex(stack(meadowCanvas(false), flowerCanvas())), meadowAtlDry: tex(stack(meadowCanvas(true), flowerCanvas()))
    };
    R.canv = { needle, needleSnow };
    R.bark = new THREE.MeshLambertMaterial({ vertexColors: true });
    R.grassFade = { value: new THREE.Vector2(20, 30) };
    R.smallFade = { value: new THREE.Vector2(14, 22) };
    // las especies (dos de cada, para que no se repitan)
    R.trees = {};
    for (const [id, n] of [['big', 2], ['mid', 1], ['birch', 1], ['sapling', 1]]) R.trees[id] = Array.from({ length: n }, (_, i) => makeTree(SP[id], 101 + i * 37 + id.length * 7));
    R.trees.fir = [makeFir(SP.fir, 7), makeFir(SP.fir, 11)];
    R.trees.firS = [makeFir(SP.firS, 13)];
    // matas: arbusto (racimos bajos)
    R.bushGeo = bushGeo();
    // prado, maleza, helechos, flores
    R.meadowGeo = tuftGeo(3, 0.95, 0.55);
    R.fernGeo = fernGeo();
    R.decalGeo = (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0.025, 0); return g; })();
    R.bbGeo = (() => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g; })();
    // materiales de lo pequeño
    R.mats.meadow = windMat(lam(R.tex.meadowAtl), 0.16, 0, R.grassFade, true);
    R.mats.meadowDry = windMat(lam(R.tex.meadowAtlDry), 0.16, 0, R.grassFade, true);
    R.mats.fern = windMat(lam(R.tex.fern), 0.09, 0, R.smallFade);
    R.mats.decal = atlasMat(new THREE.MeshLambertMaterial({ map: R.tex.decal, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    R.mats.ivy = lam(R.tex.ivy, { vertexColors: true });
    // la que cuelga: se mece más cuanto más abajo (uv.y: 0 arriba, donde se agarra)
    R.mats.ivyHang = lam(R.tex.ivy, { vertexColors: true });
    R.mats.ivyHang.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float hk = clamp( uv.y * 2.2, 0.0, 1.0 );',
        'float ph = uTime * 1.25 + position.x * 0.7 + position.z * 0.6;',
        'transformed.x += ( sin( ph ) + 0.4 * sin( ph * 2.7 ) ) * 0.05 * hk;',
        'transformed.z += cos( ph * 0.8 ) * 0.04 * hk;'].join('\n'));
      if (G.Flash) G.Flash.patch(sh);
    };
    R.mats.ivyHang.customProgramCacheKey = () => 'ivyhang';
  }

  // Las texturas y materiales de una estación (se hacen la primera vez que hacen falta)
  function season(s) {
    if (R.sets[s]) return R.sets[s];
    const win = s === 'win';
    const L = win ? null : leafSet(s);
    const o = {};
    const crownMat = (cv) => windMat(lam(tex(cv)), 0.016, 0);
    if (win) {
      const tw = twigCanvas();
      o.broad = crownMat(tw); o.broadDepth = depth(o.broad.map); o.broadShades = shades(tw, 4);
      o.birch = o.broad; o.birchDepth = o.broadDepth; o.birchShades = o.broadShades;
      o.bush = windMat(lam(tex(tw)), 0.05, 0);
    } else {
      o.broad = crownMat(L.broad); o.broadDepth = depth(o.broad.map); o.broadShades = shades(L.broad, 5);
      o.birch = crownMat(L.birch); o.birchDepth = depth(o.birch.map); o.birchShades = shades(L.birch, 5);
      o.bush = windMat(lam(tex(L.bush)), 0.06, 0);
    }
    const nd = win ? R.canv.needleSnow : R.canv.needle;
    o.fir = windMat(lam(win ? R.tex.needleSnow : R.tex.needle), 0.006, 0); o.firDepth = depth(o.fir.map); o.firShades = shades(nd, 5);
    // las láminas de lejos: una por variante de cada especie, todas en un atlas de 8 x 2 celdas de 128 x 256
    o.bb = {};
    const atl = canvas(1024, 512);
    let cell = 0;
    for (const id of ['big', 'mid', 'birch', 'sapling', 'fir', 'firS']) {
      o.bb[id] = R.trees[id].map((T) => {
        const sh = id === 'fir' || id === 'firS' ? o.firShades : (id === 'birch' ? o.birchShades : o.broadShades);
        const cx = cell % 8, cy = Math.floor(cell / 8); cell++;
        const im = paintImpostor(T, sh, id === 'birch' ? 0xbab6aa : 0x4e3e30, atl, cx * 128, cy * 256);
        return { u: cx / 8, v: 1 - (cy + 1) / 2, du: 1 / 8, dv: 1 / 2, w: im.w, h: im.h };
      });
    }
    o.bbMat = billboardMat(tex(atl));
    R.sets[s] = o;
    return o;
  }

  // Matas: racimos bajos (no una cruz de dos láminas)
  function bushGeo() {
    const r = rng(5), cards = [];
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * 6.28 + r(), d = 0.25 + r() * 0.2, cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 0.45 + r() * 0.25, cr = 0.42 + r() * 0.15;
      for (let j = 0; j < 4; j++) cards.push({ c: [cx + (r() - 0.5) * 0.3, cy + (r() - 0.5) * 0.25, cz + (r() - 0.5) * 0.3], s: cr * 1.7, yaw: r() * 3.14, tilt: (r() - 0.5) * 1.0, roll: r() * 6.28, k: [cx, cy, cz] });
    }
    cards.push({ c: [0, 0.85, 0], s: 1.1, yaw: 0.3, tilt: -1.3, roll: 1, k: [0, 0.6, 0] });
    return cardsGeo(cards, new THREE.Vector3(0, 0.2, 0), 0, 1.1, 0.8);
  }
  // Mata de hierba: n láminas verticales cruzadas (w ancho, h alto)
  function tuftGeo(n, w, h) {
    const cards = [];
    for (let i = 0; i < n; i++) cards.push({ c: [0, h / 2, 0], s: h, sx: w / h, yaw: i * Math.PI / n + 0.4, tilt: 0, roll: 0, ao: 1 });
    const g = cardsGeo(cards, new THREE.Vector3(0, -3, 0), 0, h, 0);
    // las de la base, algo más oscuras
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { const k = 0.62 + 0.38 * U.clamp(p.getY(i) / h, 0, 1); c.setXYZ(i, k, k, k); }
    return g;
  }
  // Helecho: frondas que salen del centro y se arquean hacia fuera (dos tramos cada una)
  function fernGeo() {
    const r = rng(8), pos = [], nor = [], uv = [], col = [], idx = [];
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.28 + r() * 0.4, L = 0.55 + r() * 0.25, w = 0.16;
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa * w, pz = ca * w;
      const up = 0.55 + r() * 0.35;
      // puntos del eje: base, codo, punta
      const P0 = [0, 0.03, 0], P1 = [ca * L * 0.5, up * 0.62, sa * L * 0.5], P2 = [ca * L, up * 0.38, sa * L];
      const b = pos.length / 3;
      const ring = [[P0, 0], [P1, 0.5], [P2, 1]];
      for (const [p, u] of ring) {
        const ww = (u === 1 ? 0.35 : 1);
        for (const s of [-1, 1]) {
          pos.push(p[0] + px * s * ww, p[1], p[2] + pz * s * ww);
          _n.set(ca * 0.3, 1, sa * 0.3).normalize(); nor.push(_n.x, _n.y, _n.z);
          uv.push(u, s < 0 ? 0 : 1);
          const ao = 0.6 + 0.4 * u; col.push(ao, ao, ao);
        }
      }
      for (let j = 0; j < 2; j++) { const o = b + j * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // ---------- Construcción por chunk ----------
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  function inst(geo, mat, n, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    im.count = n;
    im.castShadow = !!shadow; im.receiveShadow = false;
    im.frustumCulled = false;
    return im;
  }
  // La estación y cuánta naturaleza tiene el mapa
  function mapInfo() {
    const mp = G.Maps && G.World.layout && G.Maps.get(G.World.layout);
    return { mp, wild: mp && mp.wild != null ? mp.wild : 0, season: mp && mp.winter ? 'win' : (mp && mp.autumn ? 'aut' : 'sum'), sand: !!(mp && mp.sandDirt) };
  }
  const AUT = [[1.25, 0.72, 0.5], [1.2, 1.0, 0.55], [1.0, 0.82, 0.62], [1.3, 0.6, 0.45], [0.9, 0.95, 0.6]];

  // ¿Cuánto sitio hay alrededor (hasta el edificio más cercano)? Para que las copas no se metan en las casas
  function clearance(X, Z, maxR) {
    const Wd = G.World;
    let best = maxR;
    for (let r = 1; r <= Math.ceil(maxR); r++) {
      for (let k = 0; k < 8 + r * 4; k++) {
        const a = k / (8 + r * 4) * Math.PI * 2, x = Math.floor(X + Math.cos(a) * r), z = Math.floor(Z + Math.sin(a) * r);
        let b = null;
        try { b = Wd.bldAt(x, z, 0); } catch (e) { b = null; }
        if (b && b.roof !== 'none') { best = Math.min(best, Math.hypot(x + 0.5 - X, z + 0.5 - Z) - 0.7); }
      }
      if (best < r) break;
    }
    return Math.max(0, best);
  }

  // trees, pines, bushes: [[X, Z], ...] · devuelve lo que necesita update()
  function build(c, group, trees, pines, bushes, px, pz) {
    if (!R) init();
    const Wd = G.World, CS = Wd.CS;
    const v = { list: [], meshes: [], small: [], box: new THREE.Box3(new THREE.Vector3(c.cx * CS - 6, -15, c.cz * CS - 6), new THREE.Vector3(c.cx * CS + CS + 6, 30, c.cz * CS + CS + 6)) };
    const q = G.Quality ? G.Quality.cur : { treeFar: 30, grass: 1 };
    const MI = mapInfo(), S = season(MI.season), aut = MI.season === 'aut', win = MI.season === 'win';

    // ---- árboles: cada uno de una especie y variante según su sitio ----
    const recs = { big: [], mid: [], birch: [], sapling: [], fir: [], firS: [] };
    const addTree = (X, Z, pine) => {
      const h1 = Wd.hash(Math.floor(X), Math.floor(Z), pine ? 43 : 41), h2 = Wd.hash(Math.floor(X), Math.floor(Z), pine ? 44 : 42), h3 = Wd.hash(Math.floor(X), Math.floor(Z), 45);
      let sp;
      if (pine) sp = h3 < 0.7 ? 'fir' : 'firS';
      else sp = h3 < (0.34 + MI.wild * 0.12) ? 'big' : (h3 < 0.78 ? 'mid' : 'birch');
      // las copas no se meten en las casas: si no cabe, una especie más pequeña o más baja
      let s = pine ? 0.85 + h1 * 0.4 : 0.85 + h1 * 0.35;
      const cl = clearance(X, Z, 6);
      const order = pine ? ['fir', 'firS'] : ['big', 'mid', 'birch'];
      let oi = order.indexOf(sp);
      while (oi < order.length - 1 && R.trees[order[oi]][0].R * s * 0.75 > cl + 1.2) oi++;
      sp = order[oi];
      const RR = R.trees[sp][0].R;
      if (RR * s * 0.75 > cl + 1.2) s = Math.max(0.55, (cl + 1.2) / (RR * 0.75));
      // alguno, viejísimo y enorme (donde hay sitio de sobra): el que se ve desde todo el mapa
      else if (sp === 'big' && h1 > 0.88 && cl >= 6) s = 1.4 + (h1 - 0.88) * 3;
      const vi = Math.floor(h2 * R.trees[sp].length) % R.trees[sp].length;
      recs[sp].push({ X, Z, Y: Wd.terrainAt(X, Z) - 0.05, s, rot: h2 * 6.28, vi, h1, h2 });
    };
    for (const [X, Z] of trees) addTree(X, Z, false);
    for (const [X, Z] of pines) addTree(X, Z, true);
    // arbolillos (decorativos, sin choque): los pone el reparto de abajo
    const small = decor(c, MI);
    const vk = G.Quality && G.Quality.vegK ? G.Quality.vegK : 1;
    for (const s of small.saplings) if (s.h2 < vk) recs.sapling.push(s);

    // las láminas de lejos de todos los árboles del trozo: una sola malla (atlas)
    let nAll = 0;
    for (const sp of Object.keys(recs)) nAll += recs[sp].length;
    const bb = nAll ? inst(R.bbGeo.clone(), S.bbMat, nAll, false) : null;
    if (bb) { bb.userData.nearN = 0; bb.userData.bbTotal = nAll; }
    const atl = nAll ? new Float32Array(nAll * 4) : null;
    let bi = 0;
    for (const sp of Object.keys(recs)) {
      const list = recs[sp];
      if (!list.length) continue;
      const fir = sp === 'fir' || sp === 'firS', isB = sp === 'birch';
      const cmat = fir ? S.fir : (isB ? S.birch : S.broad), cdepth = fir ? S.firDepth : (isB ? S.birchDepth : S.broadDepth);
      for (let vi = 0; vi < R.trees[sp].length; vi++) {
        const sub = list.filter((r) => r.vi === vi);
        if (!sub.length) continue;
        const T = R.trees[sp][vi], n = sub.length, bbd = S.bb[sp][vi];
        const trunk = inst(T.trunk, R.bark, n, true);
        const crown = inst(T.crown, cmat, n, sp !== 'sapling');
        crown.customDepthMaterial = cdepth;
        trunk.userData.nearN = 0; crown.userData = trunk.userData; trunk.userData.tree = true;
        sub.forEach((r, i) => {
          r.i = i; r.trunk = trunk; r.crown = crown; r.bb = bb; r.bi = bi; r.bw = bbd.w; r.bh = bbd.h; r.near = null;
          atl.set([bbd.u, bbd.v, bbd.du, bbd.dv], bi * 4); bi++;
          trunk.setColorAt(i, col.setRGB(0.85 + r.h2 * 0.3, 0.85 + r.h2 * 0.25, 0.85 + r.h2 * 0.2));
          const g = 0.82 + r.h1 * 0.3;
          if (aut && !fir) { const t = AUT[Math.floor(r.h2 * AUT.length) % AUT.length]; crown.setColorAt(i, col.setRGB(t[0] * g, t[1] * g, t[2] * g)); bb.setColorAt(r.bi, col.setRGB(t[0] * g, t[1] * g, t[2] * g)); }
          else if (win && !fir) { crown.setColorAt(i, col.setRGB(1, 1, 1)); bb.setColorAt(r.bi, col.setRGB(1, 1, 1)); }
          else { crown.setColorAt(i, col.setRGB(g * (0.94 + r.h2 * 0.12), g, g * (0.88 + r.h2 * 0.16))); bb.setColorAt(r.bi, col.setRGB(g * (0.94 + r.h2 * 0.12), g, g * (0.88 + r.h2 * 0.16))); }
          v.list.push(r);
          place(r, Math.hypot(r.X - px, r.Z - pz) < q.treeFar * (sp === 'sapling' ? 0.6 : 1));
          if (sp === 'sapling') r.sap = true;
        });
        for (const im of [trunk, crown]) { if (im.instanceColor) im.instanceColor.needsUpdate = true; group.add(im); v.meshes.push(im); }
      }
    }
    if (bb) {
      bb.geometry.setAttribute('aAtl', new THREE.InstancedBufferAttribute(atl, 4));
      if (bb.instanceColor) bb.instanceColor.needsUpdate = true;
      group.add(bb); v.meshes.push(bb);
    }

    // ---- matas (las del mapa y las que crecen solas junto a las paredes) ----
    const allB = bushes.map(([X, Z]) => [X, Z, 1]).concat(small.bushes);
    if (allB.length) {
      const bm = inst(R.bushGeo, S.bush, allB.length, false);
      allB.forEach(([X, Z, k], i) => {
        const h = Wd.hash(Math.floor(X * 3), Math.floor(Z * 3), 31), h2 = Wd.hash(Math.floor(X * 3), Math.floor(Z * 3), 32);
        const s = (0.85 + h * 0.6) * k;
        dummy.position.set(X + (h2 - 0.5) * 0.3, Wd.terrainAt(X, Z) - 0.05, Z + (h - 0.5) * 0.3); dummy.rotation.set(0, h2 * 6.28, 0); dummy.scale.set(s, s * (0.8 + h2 * 0.4), s);
        dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix);
        if (aut) { const t = AUT[Math.floor(h * AUT.length) % AUT.length]; bm.setColorAt(i, col.setRGB(t[0] * (0.8 + h2 * 0.3), t[1] * (0.8 + h2 * 0.3), t[2] * 0.9)); }
        else bm.setColorAt(i, col.setRGB(0.8 + h * 0.3, 0.85 + h2 * 0.25, 0.75 + h * 0.2));
      });
      bm.instanceMatrix.needsUpdate = true; bm.instanceColor.needsUpdate = true;
      group.add(bm); v.meshes.push(bm);
    }

    // ---- hierba alta (la del juego: esconde), prado, maleza, flores, helechos, hojas y musgo ----
    const ox = c.cx * CS, oz = c.cz * CS;
    const tall = [];
    if (c.tall) {
      for (let z = 0; z < CS; z++) {
        for (let x = 0; x < CS; x++) {
          if (!c.tall[z * CS + x]) continue;
          for (let k = 0; k < 3; k++) {
            const a = Wd.hash(ox + x, oz + z, 70 + k), b = Wd.hash(ox + x, oz + z, 80 + k);
            tall.push([ox + x + 0.1 + a * 0.8, oz + z + 0.1 + b * 0.8, a * 6.28 + k, 1.05 + b * 0.5, Wd.hash(ox + x, oz + z, 90 + k), 1]);
          }
        }
      }
    }
    // cada capa: geometría, material, lista de [X, Z, giro, escala, azar, alto]; las de cantidad según la calidad
    const meadowM = aut || win ? R.mats.meadowDry : R.mats.meadow;
    // (la maleza va en la misma malla que el prado: la misma lámina, más pequeña y de otro tono)
    const wt = aut || win ? [1.3, 1.15, 0.6] : [1.05, 1.08, 0.8];
    const weeds = small.weeds.map((e) => [e[0], e[1], e[2], e[3] * 0.62, e[4], e[5] * 1.05, wt]);
    const flw = small.flowers.map((e) => [e[0], e[1], e[2], e[3] * 0.84, e[4], (e[5] || 1) * 1.1, [1, 1, 1], 1]);
    const layers = [
      { list: tall.concat(small.meadow, weeds, flw), geo: R.meadowGeo, mat: meadowM, grass: true, tint: aut || win ? [1.45, 1.2, 0.55] : null, atlas: 'v' },
      { list: small.ferns, geo: R.fernGeo, mat: R.mats.fern, grass: true, tint: aut ? [1.3, 0.95, 0.5] : null },
      { list: small.litter.map((e) => e.concat([null, 0])).concat(small.moss.map((e) => e.concat([null, 1]))), geo: R.decalGeo, mat: R.mats.decal, flat: true, atlas: true }
    ];
    for (const L of layers) {
      if (!L.list.length) continue;
      L.list.sort((p, q2) => p[4] - q2[4]);          // (en orden al azar: la calidad dibuja las primeras)
      const gm = inst(L.atlas ? L.geo.clone() : L.geo, L.mat, L.list.length, false);
      const atlD = L.atlas ? new Float32Array(L.list.length * 4) : null;
      L.list.forEach(([X, Z, rr, s, h, hk, tt, ai], i) => {
        dummy.position.set(X, Wd.terrainAt(X, Z) + (L.flat ? 0 : -0.02), Z); dummy.rotation.set(0, rr, 0);
        if (L.flat) dummy.scale.set(s, 1, s); else dummy.scale.set(s, s * (hk || 1) * (0.85 + h * 0.4), s);
        dummy.updateMatrix(); gm.setMatrixAt(i, dummy.matrix);
        if (atlD) atlD.set(L.atlas === 'v' ? [0, ai ? 0 : 0.5, 1, 0.5] : [ai ? 0.5 : 0, 0, 0.5, 1], i * 4);
        const t = tt || L.tint;
        if (t) gm.setColorAt(i, col.setRGB(t[0] * (0.85 + h * 0.3), t[1] * (0.88 + h * 0.2), t[2] * (0.8 + h * 0.15)));
        else gm.setColorAt(i, col.setRGB(0.85 + h * 0.3, 0.88 + h * 0.2, 0.8 + h * 0.15));
      });
      gm.instanceMatrix.needsUpdate = true; gm.instanceColor.needsUpdate = true;
      if (atlD) gm.geometry.setAttribute('aAtl', new THREE.InstancedBufferAttribute(atlD, 4));
      gm.userData.total = L.list.length;
      gm.count = Math.max(0, Math.round(L.list.length * (L.flat ? Math.max(0.5, q.grass) : q.grass)));
      if (L.flat) gm.receiveShadow = true;
      group.add(gm); v.meshes.push(gm); v.small.push(gm);
      gm.userData.flat = !!L.flat;
    }
    return v;
  }

  // ---------- Lo que crece solo ----------
  // Reparte por el trozo (con el azar de cada casilla, siempre igual) el prado, la maleza de las grietas y las
  // juntas, las flores, los helechos a la sombra, las hojas caídas, el musgo, las matas junto a las paredes y los
  // arbolillos. Nada de esto choca ni esconde: es solo para la vista
  function decor(c, MI) {
    const out = { meadow: [], weeds: [], flowers: [], ferns: [], litter: [], moss: [], bushes: [], saplings: [] };
    const wild = MI.wild;
    if (!wild) return out;
    const Wd = G.World, F = Wd.F, O = Wd.O, CS = Wd.CS;
    const ox = c.cx * CS, oz = c.cz * CS;
    const H = (x, z, s) => Wd.hash(x, z, s), N = (x, z, s) => Wd.vnoise(x, z, s);
    // lo que ocupa cada casilla: muebles, vehículos y charcos (ahí no crece nada); el césped de las grietas, más maleza
    const occ = new Uint8Array(CS * CS);
    for (const f of c.furn) {
      if (f.lv) continue;
      const crack = f.type === 'cesped' || f.type === 'maleza';
      for (let z = Math.floor(f.z0); z < Math.ceil(f.z1); z++) for (let x = Math.floor(f.x0); x < Math.ceil(f.x1); x++) {
        const lx = x - ox, lz = z - oz;
        if (lx < 0 || lz < 0 || lx >= CS || lz >= CS) continue;
        occ[lz * CS + lx] = crack ? Math.max(occ[lz * CS + lx], 1) : 2;
      }
    }
    const lanes = (MI.mp && MI.mp.lanes) || [];
    const inLane = (X, Z) => lanes.some((L) => X > L[0] - 0.3 && X < L[2] + 0.3 && Z > L[1] - 0.3 && Z < L[3] + 0.3);
    const roofed = (i) => { const b = c.bld[i] ? c.buildings[c.bld[i] - 1] : null; return b && b.roof !== 'none'; };
    // el mar (mapas de costa): nada; fuera del mapa (donde no se llega): menos
    const mp = MI.mp, seaZ = mp ? (mp.seaZ || (mp.skyline && mp.skyline.beach ? 89.6 : null)) : null;
    const Bd = mp && mp.bounds, inMap = (X, Z) => (Bd ? X >= Bd[0] && Z >= Bd[1] && X <= Bd[2] && Z <= Bd[3] : (mp ? X >= mp.min && Z >= mp.min && X < mp.max && Z < mp.max : true));
    const gAt = (lx, lz) => (lx >= 0 && lz >= 0 && lx < CS && lz < CS ? c.ground[lz * CS + lx] : -1);
    // árboles cerca (sombra, hojas caídas): una rejilla de distancias
    const treeD = new Float32Array(CS * CS).fill(99);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const o = c.obj[z * CS + x];
      if (o !== O.TREE && o !== O.PINE) continue;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= CS || zz >= CS) continue;
        treeD[zz * CS + xx] = Math.min(treeD[zz * CS + xx], Math.hypot(dx, dz));
      }
    }
    // junto a una pared (casilla vecina dentro de un edificio con techo)
    const wallNear = (lx, lz) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = lx + dx, zz = lz + dz;
        if (xx < 0 || zz < 0 || xx >= CS || zz >= CS) continue;
        if (c.bld[zz * CS + xx] && roofed(zz * CS + xx)) return true;
      }
      return false;
    };
    const add = (arr, X, Z, rot, s, h, hk) => arr.push([X, Z, rot, s, h, hk || 1]);
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const i = z * CS + x, X = ox + x, Z = oz + z;
        if (seaZ != null && Z > seaZ - 1.5) continue;
        if (!inMap(X + 0.5, Z + 0.5) && Wd.hash(X, Z, 399) < 0.55) continue;
        if (c.deck && c.deck[i]) continue;
        if (occ[i] === 2) continue;
        if (c.obj[i] === O.LAMP) continue;
        const inB = !!c.bld[i];
        if (inB && roofed(i)) continue;                       // (dentro de las casas no; en las ruinas sin techo sí)
        if (c.tall && c.tall[i]) continue;                    // (ya tiene la hierba alta del juego)
        const g = c.ground[i];
        const n1 = N(X / 7.5, Z / 7.5, 301), n2 = N(X / 2.6, Z / 2.6, 302), n3 = N(X / 15, Z / 15, 303);
        const h0 = H(X, Z, 310), h1 = H(X, Z, 311), h2 = H(X, Z, 312), h3 = H(X, Z, 313);
        const shade = treeD[i] < 3.5 || wallNear(x, z);
        const crackC = occ[i] === 1;
        if (g === F.GRASS || (inB && !roofed(i))) {
          // prado: más tupido en manchas, ralo en otras; algo más alto lejos de los caminos
          const clr = U.smooth(U.clamp((n3 - 0.22) / 0.25, 0, 1));            // (claros: hierba rala)
          const dens = inB ? wild * (0.8 + 0.8 * n1) : wild * (0.2 + 1.35 * n1 * n1 * clr + 0.25 * n3);
          const k = Math.floor(dens * 2.2 + h0);
          for (let j = 0; j < k; j++) {
            const a = H(X, Z, 320 + j), b = H(X, Z, 330 + j);
            add(out.meadow, X + 0.05 + a * 0.9, Z + 0.05 + b * 0.9, a * 6.28 + j, 0.7 + b * 0.4, H(X, Z, 340 + j), 0.5 + n1 * 0.55 * clr);
          }
          if (n2 > 0.6 && h1 < 0.22 * wild && !shade) add(out.flowers, X + 0.2 + h2 * 0.6, Z + 0.2 + h3 * 0.6, h2 * 6.28, 0.75 + h3 * 0.4, h1);
          if (shade && h2 < 0.3 * wild) add(out.ferns, X + 0.25 + h1 * 0.5, Z + 0.25 + h3 * 0.5, h3 * 6.28, 0.8 + h0 * 0.6, h2);
          if (wallNear(x, z) && h3 < 0.16 * wild) out.bushes.push([X + 0.5, Z + 0.5, 0.75 + h1 * 0.4]);
          if ((treeD[i] < 2.6 || inB) && h1 < 0.5) add(out.litter, X + h2, Z + h3, h0 * 6.28, 1.0 + h2 * 0.8, h1);
          if (inB && h3 < 0.35 * wild) add(out.moss, X + h1, Z + h2, h0 * 6.28, 0.8 + h3, h2);
          if (inB && h0 < 0.2 * wild) add(out.ferns, X + 0.3 + h2 * 0.4, Z + 0.3 + h1 * 0.4, h3 * 6.28, 0.8 + h0, h2);
          if (!inLane(X + 0.5, Z + 0.5) && treeD[i] > 3 && !wallNear(x, z) && H(X, Z, 350) < 0.012 * wild) out.saplings.push({ X: X + 0.5, Z: Z + 0.5, Y: Wd.terrainAt(X + 0.5, Z + 0.5) - 0.05, s: 0.8 + h0 * 0.7, rot: h1 * 6.28, vi: 0, h1, h2 });
        } else if (g === F.DIRT) {
          if (MI.sand) { if (h0 < 0.12 * wild) add(out.weeds, X + h1, Z + h2, h3 * 6.28, 0.9 + h0, h1, 1.3); continue; }
          const k = Math.floor(wild * Math.max(0, n1 - 0.42) * 6 + h0 * 0.75);
          for (let j = 0; j < k; j++) add(out.weeds, X + H(X, Z, 360 + j), Z + H(X, Z, 370 + j), j * 2.1, 0.8 + h1 * 0.5, H(X, Z, 380 + j), 1.2);
          if (treeD[i] < 3 && h1 < 0.45) add(out.litter, X + h2, Z + h3, h0 * 6.28, 1.0 + h2, h1);
        } else if (g === F.ROAD) {
          // el asfalto agrietado: maleza en las grietas (dos redes de grietas por ruido), en los bordes y donde el
          // mapa ya puso césped; musgo y hojas; algún arbolillo en los bordes
          const crack = Math.abs(N(X / 4.3, Z / 4.3, 391) - 0.5) < 0.05 || Math.abs(N(X / 2.9 + 40, Z / 2.9, 392) - 0.5) < 0.03;
          let edge = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const gg = gAt(x + dx, z + dz); if (gg >= 0 && gg !== F.ROAD) edge = true; }
          const p = (crackC ? 1.6 : 0) + (crack ? 0.9 : 0) + (edge ? 0.55 : 0);
          const k = Math.floor(p * wild * (0.6 + n1) + h0 * 0.9);
          for (let j = 0; j < k; j++) add(out.weeds, X + H(X, Z, 400 + j), Z + H(X, Z, 410 + j), j * 1.7 + h1, 0.7 + h2 * 0.6, H(X, Z, 420 + j), crackC ? 1.25 : 1);
          if ((crack || crackC) && h1 < 0.3 * wild) add(out.moss, X + h2, Z + h3, h0 * 6.28, 0.7 + h1 * 1.1, h2);
          if (treeD[i] < 3.5 && h2 < 0.6) add(out.litter, X + h1, Z + h3, h0 * 6.28, 1.1 + h3, h2);
          if (edge && crack && !inLane(X + 0.5, Z + 0.5) && H(X, Z, 430) < 0.05 * wild) out.saplings.push({ X: X + 0.5, Z: Z + 0.5, Y: Wd.terrainAt(X + 0.5, Z + 0.5) - 0.05, s: 0.6 + h0 * 0.5, rot: h1 * 6.28, vi: 0, h1, h2 });
        } else if (g === F.SIDEWALK) {
          // la acera: maleza en las juntas de las losas y en el bordillo; musgo
          if (h0 < 0.42 * wild) add(out.weeds, X + (h1 < 0.5 ? 0.02 : 0.5 + h2 * 0.45), Z + (h1 < 0.5 ? h2 : 0.02), h3 * 6.28, 0.55 + h2 * 0.4, h0, 0.8);
          if (h1 < 0.22 * wild * (0.5 + n1)) add(out.moss, X + h2, Z + h3, h0 * 6.28, 0.6 + h1, h2);
          if (treeD[i] < 3.5 && h3 < 0.5) add(out.litter, X + h1, Z + h2, h0 * 6.28, 1.0 + h3, h2);
        }
      }
    }
    return out;
  }

  // Cerca: tronco y copa 3D; lejos: lámina
  function place(r, near) {
    if (r.near === near) return false;
    if (r.near !== null) { r.trunk.userData.nearN += near ? 1 : -1; r.bb.userData.nearN += near ? 1 : -1; }
    else if (near) { r.trunk.userData.nearN++; r.bb.userData.nearN++; }
    r.near = near;
    if (near) {
      dummy.position.set(r.X, r.Y, r.Z); dummy.rotation.set(0, r.rot, 0); dummy.scale.set(r.s, r.s, r.s);
      dummy.updateMatrix(); r.trunk.setMatrixAt(r.i, dummy.matrix); r.crown.setMatrixAt(r.i, dummy.matrix);
      r.bb.setMatrixAt(r.bi, ZERO);
    } else {
      r.trunk.setMatrixAt(r.i, ZERO); r.crown.setMatrixAt(r.i, ZERO);
      dummy.position.set(r.X, r.Y, r.Z); dummy.rotation.set(0, 0, 0); dummy.scale.set(r.s * r.bw, r.s * r.bh, r.s);
      dummy.updateMatrix(); r.bb.setMatrixAt(r.bi, dummy.matrix);
    }
    r.trunk.instanceMatrix.needsUpdate = true; r.crown.instanceMatrix.needsUpdate = true; r.bb.instanceMatrix.needsUpdate = true;
    return true;
  }

  // Viento cada fotograma; cambio cerca/lejos unas veces por segundo.
  // Las láminas instanciadas no se recortan solas: se ocultan los chunks fuera de cámara
  // (los árboles cercanos se quedan, por sus sombras) y lo pequeño de los chunks lejanos
  const frustum = new THREE.Frustum(), _pm = new THREE.Matrix4();
  function update(dt, px, pz, chunks, camera) {
    if (!R) return;
    uTime.value += dt;
    if (camera) {
      camera.updateMatrixWorld();
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(_pm);
      const gf = (G.Quality ? G.Quality.cur.grassFar : 30) + 4;
      chunks.forEach((c) => {
        const v = c.view && c.view.veg;
        if (!v) return;
        const b = v.box;
        const dx = Math.max(b.min.x - px, 0, px - b.max.x), dz = Math.max(b.min.z - pz, 0, pz - b.max.z);
        const dd = Math.hypot(dx, dz);
        const inView = frustum.intersectsBox(b);
        for (const m of v.meshes) {
          const ud = m.userData;
          let vis = v.small && v.small.indexOf(m) >= 0 ? inView && dd < gf : (inView || dd < 18);
          // (los árboles de cerca, solo si alguno lo está; las láminas de lejos, solo si alguno está lejos)
          if (ud.tree && !ud.nearN) vis = false;
          if (ud.bbTotal && ud.nearN >= ud.bbTotal) vis = false;
          if (m.visible !== vis) m.visible = vis;
        }
      });
    }
    swapT -= dt;
    if (swapT > 0) return;
    swapT = 0.3;
    const q = G.Quality ? G.Quality.cur : { treeFar: 30, grass: 1, grassFar: 30 };
    const gf = q.grassFar || 30;
    R.grassFade.value.set(gf * 0.65, gf);
    R.smallFade.value.set(gf * 0.45, gf * 0.72);
    const far = q.treeFar;
    chunks.forEach((c) => {
      const v = c.view && c.view.veg;
      if (!v) return;
      for (const r of v.list) {
        const d = Math.hypot(r.X - px, r.Z - pz), f = r.sap ? far * 0.6 : far;
        place(r, r.near ? d < f + 1.5 : d < f - 1.5);
      }
      for (const m of v.small || []) {
        const n = Math.round(m.userData.total * (m.userData.flat ? Math.max(0.5, q.grass) : q.grass));
        if (m.count !== n) m.count = n;
      }
    });
  }

  // Hiedra de las paredes (la pone worldview): sus materiales
  function ivyMats() { if (!R) init(); return { wall: R.mats.ivy, hang: R.mats.ivyHang }; }

  G.Vegetation = { build, update, init, ivyMats, inView: (box) => frustum.intersectsBox(box), mapInfo };
})(window.Game = window.Game || {});
