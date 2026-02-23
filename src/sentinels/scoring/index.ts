/**
 * TRACER Scoring Module
 *
 * Exports the TRACER scoring engine and types for use by the trust-score-service
 * and any other consumer that needs to calculate 6-dimension scores from sentinel results.
 */

export { calculateTRACER } from './tracer';

export {
  type TRACERScore,
  type TRACERDimension,
  type TRACERTier,
  TRACER_WEIGHTS,
  SENTINEL_TO_DIMENSIONS,
} from './types';
