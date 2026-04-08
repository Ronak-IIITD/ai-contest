function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function stableSigmoid(x) {
  const z = clamp(Number(x), -50, 50);
  if (z >= 0) {
    const t = Math.exp(-z);
    return 1 / (1 + t);
  }
  const t = Math.exp(z);
  return t / (1 + t);
}

export function scoreWithModel(features, modelPack) {
  const safeFeatures = features && typeof features === 'object' ? features : {};
  const safeModel = modelPack && typeof modelPack === 'object' ? modelPack : { weights: {}, bias: 0, version: 'unknown' };
  const weights = safeModel.weights && typeof safeModel.weights === 'object' ? safeModel.weights : {};

  let linear = Number(safeModel.bias) || 0;
  const terms = [];

  for (const [name, weightRaw] of Object.entries(weights)) {
    const weight = Number(weightRaw) || 0;
    const value = clamp(Number(safeFeatures[name]) || 0);
    const contribution = weight * value;
    linear += contribution;
    terms.push({ name, value, weight, contribution });
  }

  const probability = clamp(stableSigmoid(linear));
  const mlScore = Math.round(clamp(probability) * 100);

  const absLinear = Math.abs(clamp(linear, -20, 20));
  const confidence = clamp(0.35 + 0.65 * Math.min(1, absLinear / 6));

  const topFactors = terms
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map((term) => ({
      feature: term.name,
      value: Number(term.value.toFixed(3)),
      weight: Number(term.weight.toFixed(3)),
      contribution: Number(term.contribution.toFixed(3)),
    }));

  return {
    modelVersion: String(safeModel.version || 'unknown'),
    probability: Number(probability.toFixed(4)),
    mlScore,
    confidence: Number(confidence.toFixed(4)),
    topFactors,
  };
}
