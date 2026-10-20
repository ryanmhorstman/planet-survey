import { createGeography, atlasPixels } from "./geography.js";
self.onmessage = ({ data }) => {
  try {
    const model = createGeography(data.params, data.physics);
    const pixels = atlasPixels(model);
    self.postMessage({ model, pixels }, [model.heights.buffer, pixels.buffer]);
  } catch {
    self.postMessage({
      error: "The cartographic model could not be prepared.",
    });
  }
};
