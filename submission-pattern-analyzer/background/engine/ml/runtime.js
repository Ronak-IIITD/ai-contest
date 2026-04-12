/**
 * ML Runtime - ONNX-free inference for browser
 * 
 * Provides logistic regression scoring with confidence estimation.
 * Designed to run entirely client-side with no external dependencies.
 */

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

/**
 * Compute risk score using logistic regression model
 * @param {Object} features - Feature values (normalized 0-1)
 * @param {Object} modelPack - Model weights and bias
 * @returns {Object} Score result with probability, confidence, top factors
 */
export function scoreWithModel(features, modelPack) {
  const safeFeatures = features && typeof features === 'object' ? features : {};
  const safeModel = modelPack && typeof modelPack === 'object' ? modelPack : { weights: {}, bias: 0, version: 'unknown' };
  const weights = safeModel.weights && typeof safeModel.weights === 'object' ? safeModel.weights : {};
  const thresholds = safeModel.thresholds || { minConfidence: 0.3, highConfidence: 0.7 };

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

  // Confidence based on linear score magnitude (more extreme = more confident)
  const absLinear = Math.abs(clamp(linear, -20, 20));
  const confidenceRaw = clamp(0.35 + 0.65 * Math.min(1, absLinear / 6));
  
  // Apply model-specific thresholds
  const minConf = thresholds.minConfidence || 0.3;
  const confidence = Number(confidenceRaw.toFixed(4));
  // When model pack is invalid/null, treat as below threshold (don't trust fallback output)
  const belowMinConfidence = !modelPack || confidenceRaw < minConf;

  // Top contributing factors sorted by absolute contribution
  const topFactors = terms
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)
    .map((term) => ({
      feature: term.name,
      value: Number(term.value.toFixed(3)),
      weight: Number(term.weight.toFixed(3)),
      contribution: Number(term.contribution.toFixed(3)),
    }));

  // Explanation text
  const explanation = generateExplanation(topFactors, probability);

  return {
    modelVersion: String(safeModel.version || 'unknown'),
    type: safeModel.type || 'linear-logistic',
    probability: Number(probability.toFixed(4)),
    mlScore,
    confidence,
    belowMinConfidence,
    topFactors,
    explanation,
  };
}

/**
 * Generate human-readable explanation of the score
 */
function generateExplanation(topFactors, probability) {
  if (!topFactors || topFactors.length === 0) return 'No factors available';
  
  const highRisk = probability > 0.5;
  const factorNames = topFactors
    .filter(f => Math.abs(f.contribution) > 0.1)
    .map(f => f.feature.replace(/_flag|_norm|_penalty/g, ''))
    .slice(0, 2);

  if (factorNames.length === 0) {
    return highRisk ? 'High risk based on overall pattern' : 'Low risk overall';
  }

  const factorStr = factorNames.join(', ');
  return highRisk 
    ? `Elevated risk from: ${factorStr}`
    : `Primary factors: ${factorStr}`;
}
