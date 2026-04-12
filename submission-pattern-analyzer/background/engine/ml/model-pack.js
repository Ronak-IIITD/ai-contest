/**
 * ML Model Pack - v1.2.0 Enhanced
 * 
 * Linear logistic regression for cheat probability estimation.
 * Features extracted from contest snapshots and heuristic flags.
 * 
 * Calibration: sigmoid(linear) → probability
 * Confidence: based on absolute linear score magnitude
 */

// Base linear model
export const MODEL_PACK = {
  version: 'v1.2-enhanced',
  type: 'linear-logistic',
  bias: -1.2,
  weights: {
    // Normalized heuristic score (strongest predictor)
    heuristic_total_norm: 2.8,
    
    // Problem-solving metrics
    solve_count_norm: 0.35,
    rank_percentile: 1.8,
    wrong_attempt_ratio: 0.6,
    
    // Heuristic flags (binary)
    cluster_participation: 1.5,
    rapid_solve_flag: 1.3,
    rating_jump_flag: 1.1,
    speed_flag: 1.0,
    dormant_flag: 0.9,
    
    // Data quality
    partial_data_penalty: -1.2,
  },
  // Confidence thresholds
  thresholds: {
    minConfidence: 0.3,
    highConfidence: 0.7,
  },
  // Feature descriptions for explainability
  featureInfo: {
    heuristic_total_norm: 'Normalized heuristic risk score (0-1)',
    solve_count_norm: 'Problems solved / 8',
    rank_percentile: 'Rank percentile (top = 1)',
    wrong_attempt_ratio: 'Wrong attempts / total attempts',
    cluster_participation: 'Flagged for suspicious cluster',
    rapid_solve_flag: 'Flagged for rapid multi-solve',
    rating_jump_flag: 'Flagged for rating jump',
    speed_flag: 'Flagged for anomalous solve speed',
    dormant_flag: 'Flagged for dormant surge',
    partial_data_penalty: 'Penalty for partial data',
  },
};
