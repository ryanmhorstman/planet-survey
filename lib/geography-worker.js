import { createGeography, atlasPixels } from "./geography.js";
import { createRegion } from "./region.js";
let model;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "region") {
      if (!model) return;
      const region = createRegion(
        model,
        data.latitude,
        data.longitude,
        data.span,
      );
      self.postMessage({ type: "region", requestId: data.requestId, region }, [
        region.positions.buffer,
        region.uvs.buffer,
        region.indices.buffer,
        region.pixels.buffer,
        region.bump.buffer,
        region.specular.buffer,
      ]);
      return;
    }
    model = createGeography(data.params, data.physics, 512, data.cartography);
    const pixelWidth = model.version === "cartography-2" ? 1024 : model.width,
      pixels = atlasPixels(model, pixelWidth),
      copy = { ...model, heights: model.heights.slice() };
    self.postMessage({ model: copy, pixels, pixelWidth }, [
      copy.heights.buffer,
      pixels.buffer,
    ]);
  } catch {
    self.postMessage({
      type: data.type,
      requestId: data.requestId,
      error: "The cartographic model could not be prepared.",
    });
  }
};
