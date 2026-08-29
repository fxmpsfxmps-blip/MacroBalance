import { deepFreeze } from '../core/inputScope.js';

export const OWNER_PROFILE_VERSION = 'OWNER_FUTURE_BENCHMARK_v1_AGE_23';

export const correctedOwnerBenchmarkProfile = deepFreeze({
  profileId: 'OWNER_CORRECTED_FUTURE_BENCHMARK',
  participantId: 'OWNER',
  participantDataVersion: OWNER_PROFILE_VERSION,
  benchmarkSplit: 'PROSPECTIVE',
  sex: 'MALE', age: 23, heightCm: 180, weightKg: 100, goal: 'MAINTENANCE',
  bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN',
  occupation: 'SEATED', steps: 7000, stepsCoverage: 0.9,
  stepsObservationDays: 7, trainingModality: 'RESISTANCE', trainingStatus: 'REALIZED_HABITUAL',
  sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE',
  longestSessionMinutes: null, twoADay: null, activityClass: null,
  activityClassSource: 'AUTO_LAB_EVIDENCE_ENVELOPE', requestedRatePerWeek: null,
  dietPreference: 'NONE', lowCarbPreference: 'NONE', dietPattern: 'MIXED',
  scopeState: 'IN_SCOPE', scopeFlags: [], sleepHours: null, stressLevel: null,
  historicalActivityFactor: 1.35, historicalTrainingMode: 'AUTO_EXACT'
});

export function ownerRunIntegrity(profile) {
  const ownerLike = profile?.participantId === 'OWNER' || String(profile?.profileId || '').startsWith('OWNER');
  const stale = ownerLike && profile?.age === 35;
  return deepFreeze({
    status: stale ? 'STALE_OWNER_RUN' : ownerLike && profile?.age === 23 ? 'CURRENT_OWNER_AGE_CONFIRMED' : 'NOT_OWNER_PROFILE',
    stale,
    suppliedAge: profile?.age ?? null,
    correctAge: ownerLike ? 23 : null,
    globalParameterMutationAuthorized: false
  });
}
