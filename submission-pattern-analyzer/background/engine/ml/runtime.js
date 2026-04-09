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
  const confidence = confidenceRaw < minConf ? confidenceRaw : clamp(confidenceRaw);

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
    confidence: Number(confidence.toFixed(4)),
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

/**
 * Batch score multiple users efficiently
 */
export function batchScoreWithModel(snapshot, modelPack) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const results = [];

  for (const row of rows) {
    const features = extractFeaturesForRow(row, snapshot);
    const score = scoreWithModel(features, modelPack);
    results.push({
      handle: row.handle,
      ...score,
    });
  }

  // Sort by probability descending
  results.sort((a, b) => b.probability - a.probability);

  return results;
}

// Feature extraction for a single row
function extractFeaturesForRow(row, snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const totalUsers = Math.max(1, rows.length);

  const solveCount = Number(row?.solveCount ?? (Array.isArray(row?.solves) ? row.solves.length : 0));
  const rank = Number(row?.rank ?? totalUsers);
  const solves = Array.isArray(row?.solves) ? row.solves : [];

  const attempts = solves
    .map((s) => Number(s?.attempts ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const totalAttempts = attempts.reduce((sum, n) => sum + n, 0);
  const wrongAttempts = attempts.reduce((sum, n) => sum + Math.max(0, n - 1), 0);
  const wrongAttemptRatio = totalAttempts > 0 ? wrongAttempts / totalAttempts : 0;

  return {
    heuristic_total_norm: 0,  // Caller should provide
    solve_count_norm: clamp(solveCount / 8),
    rank_percentile: clamp((totalUsers - rank + 1) / totalUsers),
    wrong_attempt_ratio: clamp(wrongAttemptRatio),
    partial_data_penalty: snapshot?.isPartial ? 1 : 0,
  };
}

/**
 * Validate feature completeness
 */
export function validateFeatures(features, modelPack) {
  const modelWeights = modelPack?.weights || {};
  const missing = [];
  
  for (const key of Object.keys(modelWeights)) {
    if (!(key in features) || !Number.isFinite(features[key])) {
      missing.push(key);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
