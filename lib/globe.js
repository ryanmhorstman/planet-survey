// Lazy, isolated cartography controller. No AI, provider or image-generation calls.
import { samplePlanetLocation, locationVector } from "./geography.js";
export function mountCartography(root, report) {
  root.innerHTML = `<p class="cartography-intro">ORBITAL CARTOGRAPHY · EXPERIMENTAL<br>A deterministic model, separate from existing AI illustrations. Drag to rotate, pinch or use controls to zoom. Select a location to inspect its imagined environment.</p>
    <p class="cartography-status" role="status">Preparing planetary atlas…</p>
    <div class="cartography-stage"></div>
    <div class="cartography-tools" role="group" aria-label="Globe controls">
    <button type="button" data-action="west" aria-label="Rotate globe west">←</button><button type="button" data-action="east" aria-label="Rotate globe east">→</button><button type="button" data-action="north" aria-label="Rotate globe north">↑</button><button type="button" data-action="south" aria-label="Rotate globe south">↓</button><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="out" aria-label="Zoom out">−</button><button type="button" data-action="reset">Reset view</button><button type="button" data-action="site">Center on site</button><button type="button" data-action="atlas" aria-pressed="false">2D atlas</button></div>
    <form class="cartography-coordinates"><label>Latitude (°)<input name="latitude" type="number" min="-90" max="90" step="any" value="0" required></label><label>Longitude (° E)<input name="longitude" type="number" min="-180" max="180" step="any" value="0" required></label><button type="submit">Inspect location</button></form>
    <p class="cartography-selection" role="status"></p><dl class="cartography-facts"></dl><p class="cartography-note"></p>
    <p class="cartography-limits">Modeled geography v1 · approx. 0.7° atlas cells. Latitude/elevation climate proxies, not observations. Prime meridian and illumination epoch are arbitrary. No AI calls are made by this explorer. Selection is retained for this report during this session.</p>`;
  const find = (selector) => root.querySelector(selector),
    stage = find(".cartography-stage"),
    status = find(".cartography-status");
  const abort = new AbortController(),
    { signal } = abort;
  let disposed = false,
    model,
    pixels,
    renderer,
    scene,
    camera,
    controls,
    sphere,
    marker,
    texture,
    observer,
    frame = 0,
    atlasMode = false,
    atlasCanvas;
  let THREE,
    worker = new Worker(new URL("./geography-worker.js", import.meta.url), {
      type: "module",
    });
  const resources = [];
  const selectionKey = `psu7-cartography-selection:${report.id}`;
  let selection = [15, -80];
  try {
    const saved = JSON.parse(sessionStorage.getItem(selectionKey));
    if (
      Array.isArray(saved) &&
      saved.length === 2 &&
      saved.every(Number.isFinite) &&
      Math.abs(saved[0]) <= 90 &&
      Math.abs(saved[1]) <= 180
    )
      selection = saved;
  } catch {
    /* Session storage is optional. */
  }
  function draw() {
    frame = 0;
    if (
      !disposed &&
      renderer &&
      !atlasMode &&
      root.getClientRects().length &&
      !document.hidden
    )
      renderer.render(scene, camera);
  }
  function invalidate() {
    if (!frame && !disposed) frame = requestAnimationFrame(draw);
  }
  function select(latitude, longitude) {
    if (!model) return;
    let sample;
    try {
      sample = samplePlanetLocation(model, latitude, longitude);
    } catch {
      status.textContent = "Choose valid coordinates.";
      return;
    }
    selection = [sample.latitude, sample.longitude];
    try {
      sessionStorage.setItem(selectionKey, JSON.stringify(selection));
    } catch {
      /* Optional storage. */
    }
    find("[name=latitude]").value = sample.latitude.toFixed(3);
    find("[name=longitude]").value = sample.longitude.toFixed(3);
    find(".cartography-selection").textContent =
      `${sample.latitude.toFixed(2)}° latitude · ${sample.longitude.toFixed(2)}° E · ${model.id}`;
    const number = (value, unit) =>
      value == null
        ? "Unresolved"
        : `${new Intl.NumberFormat("en", { maximumSignificantDigits: 3 }).format(value)} ${unit}`;
    const facts = [
      ["Surface", sample.surface],
      [
        sample.waterDepthMeters == null
          ? "Elevation · modeled"
          : "Basin depth · imagined",
        number(sample.waterDepthMeters ?? sample.elevationMeters, "m"),
      ],
      ["Temperature · local proxy", number(sample.temperatureC, "°C")],
      ["Pressure · assumption / proxy", number(sample.pressureBar, "bar")],
      ["Water phase", sample.waterPhase],
      ["Biosphere · imagined", sample.biome],
    ];
    const dl = find(".cartography-facts");
    dl.replaceChildren();
    for (const [label, value] of facts) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      dl.append(dt, dd);
    }
    find(".cartography-note").textContent =
      sample.note +
      (sample.biology ? ` Imagined morphology: ${model.biology.forms}.` : "");
    if (marker) {
      marker.position
        .set(...locationVector(...selection))
        .multiplyScalar(1.015);
      invalidate();
    }
    drawAtlas();
  }
  function drawAtlas() {
    if (!atlasCanvas || !model) return;
    const context = atlasCanvas.getContext("2d");
    context.putImageData(
      new ImageData(pixels, model.width, model.height),
      0,
      0,
    );
    const x = ((selection[1] + 180) / 360) * model.width,
      y = ((90 - selection[0]) / 180) * model.height;
    context.strokeStyle = "#ffe7a0";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.stroke();
  }
  function setAtlas(enabled) {
    atlasMode = enabled;
    atlasCanvas.hidden = !enabled;
    if (renderer) renderer.domElement.hidden = enabled;
    find("[data-action=atlas]").setAttribute("aria-pressed", String(enabled));
    for (const button of root.querySelectorAll("[data-action]"))
      if (button.dataset.action !== "atlas") button.disabled = enabled;
    status.textContent = enabled
      ? "2D model atlas · tap to select; coordinate inputs also available."
      : "3D model globe · drag to rotate; tap to select. Fixed illustrative illumination.";
    drawAtlas();
    invalidate();
  }
  function resize() {
    if (!renderer || disposed) return;
    const width = stage.clientWidth,
      height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  }
  async function init(data) {
    if (disposed) return;
    if (data.error) {
      status.textContent = data.error;
      return;
    }
    model = data.model;
    pixels = data.pixels;
    atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = model.width;
    atlasCanvas.height = model.height;
    atlasCanvas.setAttribute("role", "img");
    atlasCanvas.setAttribute(
      "aria-label",
      "Modeled planetary atlas. Select a location using the latitude and longitude inputs.",
    );
    stage.append(atlasCanvas);
    atlasCanvas.addEventListener(
      "click",
      (event) => {
        const rect = atlasCanvas.getBoundingClientRect();
        select(
          90 - ((event.clientY - rect.top) / rect.height) * 180,
          ((event.clientX - rect.left) / rect.width) * 360 - 180,
        );
      },
      { signal },
    );
    select(...selection);
    try {
      [THREE] = await Promise.all([import("../assets/vendor/three.module.js")]);
      const { OrbitControls } =
        await import("../assets/vendor/OrbitControls.js");
      if (disposed) return;
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setClearColor(0x090d10);
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute(
        "aria-label",
        "Interactive modeled globe. Equivalent coordinate and rotation controls are below.",
      );
      stage.append(renderer.domElement);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
      camera.position.set(...locationVector(...selection)).multiplyScalar(3.5);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.minDistance = 1.7;
      controls.maxDistance = 6;
      controls.enableDamping = false;
      controls.addEventListener("change", invalidate);
      texture = new THREE.DataTexture(pixels, model.width, model.height);
      texture.flipY = true;
      texture.wrapS = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      texture.magFilter = THREE.LinearFilter;
      const geometry = new THREE.SphereGeometry(1, 96, 64),
        material = new THREE.MeshPhongMaterial({
          map: texture,
          shininess: model.gas ? 4 : 10,
          specular: 0x18262c,
        });
      resources.push(geometry, material, texture);
      sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
      scene.add(new THREE.AmbientLight(0xffffff, 0.38));
      const sun = new THREE.DirectionalLight(0xfff0d7, 2.3);
      sun.position.set(-3, 2, 4);
      scene.add(sun);
      if (report.params.pressureBar > 0) {
        const g = new THREE.SphereGeometry(1.025, 64, 32),
          m = new THREE.MeshBasicMaterial({
            color: report.params.atmosphere.includes("CO2")
              ? 0xc4a98b
              : 0x6b9eaf,
            transparent: true,
            opacity: Math.min(
              0.12,
              0.12 * Math.sqrt(report.params.pressureBar),
            ),
            side: THREE.BackSide,
            depthWrite: false,
          });
        resources.push(g, m);
        scene.add(new THREE.Mesh(g, m));
      }
      const mg = new THREE.SphereGeometry(0.012, 12, 8),
        mm = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
      resources.push(mg, mm);
      marker = new THREE.Mesh(mg, mm);
      marker.position
        .set(...locationVector(...selection))
        .multiplyScalar(1.015);
      scene.add(marker);
      let down;
      renderer.domElement.addEventListener(
        "pointerdown",
        (e) => {
          down = { x: e.clientX, y: e.clientY, multi: !e.isPrimary };
        },
        { signal },
      );
      renderer.domElement.addEventListener(
        "pointercancel",
        () => {
          down = null;
        },
        { signal },
      );
      renderer.domElement.addEventListener(
        "pointerup",
        (e) => {
          if (
            !down ||
            down.multi ||
            Math.hypot(down.x - e.clientX, down.y - e.clientY) > 6
          ) {
            down = null;
            return;
          }
          down = null;
          const rect = renderer.domElement.getBoundingClientRect();
          const ray = new THREE.Raycaster();
          ray.setFromCamera(
            new THREE.Vector2(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              (-(e.clientY - rect.top) / rect.height) * 2 + 1,
            ),
            camera,
          );
          const hit = ray.intersectObject(sphere)[0];
          if (!hit) return;
          const point = sphere.worldToLocal(hit.point).normalize();
          select(
            (Math.asin(Math.max(-1, Math.min(1, point.y))) * 180) / Math.PI,
            (Math.atan2(-point.z, point.x) * 180) / Math.PI,
          );
        },
        { signal },
      );
      renderer.domElement.addEventListener(
        "webglcontextlost",
        (event) => {
          event.preventDefault();
          setAtlas(true);
          status.textContent =
            "Graphics context lost. The same model remains available in the 2D atlas.";
        },
        { signal },
      );
      observer = new ResizeObserver(resize);
      observer.observe(stage);
      resize();
      setAtlas(false);
    } catch {
      if (!disposed) {
        setAtlas(true);
        status.textContent =
          "3D graphics unavailable. Explore the same world with the 2D atlas and coordinates.";
      }
    }
  }
  worker.onmessage = ({ data }) => {
    worker.terminate();
    void init(data);
  };
  worker.onerror = () => {
    if (!disposed)
      status.textContent =
        "Atlas preparation failed. Switch tabs and reopen Cartography to retry.";
  };
  worker.postMessage({ params: report.params, physics: report.physics });
  find("form").addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      select(
        Number(find("[name=latitude]").value),
        Number(find("[name=longitude]").value),
      );
    },
    { signal },
  );
  root.addEventListener(
    "click",
    (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (!model || !action) return;
      if (action === "atlas") {
        if (renderer) {
          setAtlas(!atlasMode);
          resize();
        }
        return;
      }
      if (!camera || atlasMode) return;
      if (action === "reset") {
        camera.position.set(0, 0.4, 3.5);
        controls.target.set(0, 0, 0);
      } else if (action === "site")
        camera.position
          .set(...locationVector(...selection))
          .multiplyScalar(camera.position.length());
      else if (action === "in" || action === "out")
        camera.position.multiplyScalar(action === "in" ? 0.85 : 1.15);
      else {
        const spherical = new THREE.Spherical().setFromVector3(camera.position);
        spherical.theta +=
          action === "west" ? -0.2 : action === "east" ? 0.2 : 0;
        spherical.phi +=
          action === "north" ? -0.15 : action === "south" ? 0.15 : 0;
        spherical.makeSafe();
        camera.position.setFromSpherical(spherical);
      }
      controls.update();
      invalidate();
    },
    { signal },
  );
  document.addEventListener("visibilitychange", invalidate, { signal });
  return {
    dispose() {
      disposed = true;
      abort.abort();
      worker.terminate();
      observer?.disconnect();
      cancelAnimationFrame(frame);
      controls?.dispose();
      for (const resource of resources) resource.dispose();
      renderer?.dispose();
      if (renderer && !renderer.getContext().isContextLost())
        renderer.forceContextLoss();
      root.replaceChildren();
    },
  };
}
