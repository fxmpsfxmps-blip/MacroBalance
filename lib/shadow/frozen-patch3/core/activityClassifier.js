import { classifyTrainingInput, deepFreeze } from './inputScope.js';

export const A1_CLASSIFIER_VERSION = 'a1-evidence-envelope-lab-0.1.1';
const CLASSES = Object.freeze(['INACTIVE','LOW_ACTIVE','ACTIVE','VERY_ACTIVE']);
const PLANNED = new Set(['PLANNED','PLANNED_FUTURE','FUTURE']);
const NONSTANDARD_LOCOMOTION = new Set(['WHEELCHAIR','NONSTANDARD_LOCOMOTION','MOBILITY_AID']);

export function inferContextualActivity(profile, a1) {
  const missingness=[];
  const contradictions=[];
  const reasonCodes=[];
  const occupation=occupationMovement(profile.occupation);
  const steps=Number.isFinite(profile.steps) ? profile.steps : null;
  const coverage=Number.isFinite(profile.stepsCoverage) ? profile.stepsCoverage : null;
  const observationDays=Number.isFinite(profile.stepsObservationDays) ? profile.stepsObservationDays : null;
  const trainingStatus=profile.trainingStatus || (profile.trainingRealized === false ? 'PLANNED_FUTURE' : 'REALIZED_HABITUAL');
  const trainingRealized=!PLANNED.has(trainingStatus);
  const trainingInput=profile.trainingInput || classifyTrainingInput(profile);
  const unresolvedTraining=trainingInput.state==='PARTIAL_OR_UNKNOWN_TRAINING';
  const modality=!trainingRealized ? 'NONE' : unresolvedTraining ? trainingInput.reported.trainingModality : (profile.trainingModality || 'NONE');
  const sessions=!trainingRealized ? 0 : unresolvedTraining ? trainingInput.reported.sessionsPerWeek : Number.isFinite(profile.sessionsPerWeek) ? profile.sessionsPerWeek : 0;
  const duration=!trainingRealized ? 0 : unresolvedTraining ? trainingInput.reported.sessionDurationMin : Number.isFinite(profile.sessionDurationMin) ? profile.sessionDurationMin : 0;
  const weeklyMinutes=Number.isFinite(sessions) && Number.isFinite(duration) ? sessions*duration : null;
  const stepBand=steps===null ? null : classifyStepBand(steps,a1.heuristicTestStepBands);
  const coverageState=coverage===null ? 'UNKNOWN' : coverage<0 || coverage>1 ? 'INVALID' : coverage<a1.coverageDegradationBelow ? 'DEGRADED' : 'USABLE_EXPERIMENTAL';
  const occupationTrainingOverlap=['RUNNING','WALKING'].includes(modality) && steps!==null;
  const nonStepEndurance=['CYCLING','SWIMMING','ROWING'].includes(modality);
  const mobilityContext=profile.mobilityContext || null;

  if (occupation==='UNKNOWN') missingness.push('OCCUPATION_MOVEMENT_UNKNOWN');
  if (steps===null) missingness.push('STEPS_MISSING_NOT_ZERO');
  if (coverage===null) missingness.push('STEP_COVERAGE_UNKNOWN');
  if (coverageState==='DEGRADED') missingness.push('STEP_COVERAGE_DEGRADED');
  if (coverageState==='INVALID') missingness.push('STEP_COVERAGE_INVALID');
  if (observationDays===null) missingness.push('STEP_OBSERVATION_DAYS_UNKNOWN');
  else if (observationDays<a1.heuristicMinObservationDays) missingness.push('STEP_WINDOW_SHORTER_THAN_HEURISTIC_7_DAY_MINIMUM');
  if (!trainingRealized) reasonCodes.push('PLANNED_TRAINING_EXCLUDED_FROM_CURRENT_TEE');
  if (unresolvedTraining) {
    missingness.push(...trainingInput.missingFields.map(field=>`TRAINING_INPUT_MISSING:${field}`));
    contradictions.push(...trainingInput.contradictions);
    reasonCodes.push('PARTIAL_TRAINING_INPUT_NOT_COERCED_TO_NONE_OR_ZERO');
  }
  if (occupationTrainingOverlap) reasonCodes.push('LOCOMOTOR_TRAINING_OVERLAPS_STEP_SIGNAL');
  if (profile.longestSessionMinutes===null || profile.longestSessionMinutes===undefined) missingness.push('LONGEST_SESSION_NOT_AVAILABLE');
  if (profile.twoADay===null || profile.twoADay===undefined) missingness.push('TWO_A_DAY_NOT_AVAILABLE');

  const nonstandard=NONSTANDARD_LOCOMOTION.has(mobilityContext);
  const compoundExtreme=occupation==='PHYSICAL' && stepBand==='S4' && nonStepEndurance && Number.isFinite(weeklyMinutes) && weeklyMinutes>=a1.highNonStepTrainingMinutesPerWeek;
  const oodFlag=nonstandard || profile.palEstimate>=2.5 || (!unresolvedTraining && profile.workload==='EXTREME') || compoundExtreme;
  if (nonstandard) reasonCodes.push('NONSTANDARD_LOCOMOTION_OOD_REVIEW');
  if (profile.palEstimate>=2.5) reasonCodes.push('PAL_AT_OR_ABOVE_2_5_OOD_CONSIDERATION');
  if (!unresolvedTraining && profile.workload==='EXTREME') reasonCodes.push('EXTREME_WORKLOAD_OOD_CONSIDERATION');
  if (compoundExtreme) reasonCodes.push('COMPOUND_HIGH_ACTIVITY_OOD_CONSIDERATION');

  if (oodFlag) return contract(nonstandard?'OUT_OF_DOMAIN_REVIEW':'HIGH_ACTIVITY_OOD_CONSIDERATION',[],profile,a1,{ occupation,steps,coverage,coverageState,observationDays,stepBand,trainingStatus,trainingRealized,modality,sessions,duration,weeklyMinutes,occupationTrainingOverlap,nonStepEndurance },missingness,contradictions,reasonCodes,true);

  if (unresolvedTraining) {
    return contract('INSUFFICIENT_DATA',CLASSES,profile,a1,{ occupation,steps,coverage,coverageState,observationDays,stepBand,trainingStatus,trainingRealized,trainingInputState:trainingInput.state,trainingInputContractVersion:trainingInput.schemaVersion,modality,sessions,duration,weeklyMinutes,occupationTrainingOverlap,nonStepEndurance },missingness,contradictions,reasonCodes,false);
  }

  if (steps===null || coverageState==='UNKNOWN' || coverageState==='DEGRADED' || coverageState==='INVALID' || (observationDays!==null && observationDays<a1.heuristicMinObservationDays)) {
    reasonCodes.push('INSUFFICIENT_STEP_EVIDENCE_FOR_CLASS_ENVELOPE');
    return contract('INSUFFICIENT_DATA',CLASSES,profile,a1,{ occupation,steps,coverage,coverageState,observationDays,stepBand,trainingStatus,trainingRealized,modality,sessions,duration,weeklyMinutes,occupationTrainingOverlap,nonStepEndurance },missingness,contradictions,reasonCodes,false);
  }

  if (occupation==='PHYSICAL' && stepBand==='S0') {
    contradictions.push('PHYSICAL_OCCUPATION_WITH_LOW_HIGH_COVERAGE_STEPS');
    reasonCodes.push('CONTRADICTION_REQUIRES_REVIEW_NOT_AVERAGING');
    return contract('CONTRADICTORY_EVIDENCE',CLASSES,profile,a1,{ occupation,steps,coverage,coverageState,observationDays,stepBand,trainingStatus,trainingRealized,modality,sessions,duration,weeklyMinutes,occupationTrainingOverlap,nonStepEndurance },missingness,contradictions,reasonCodes,false);
  }

  let candidates;
  if (nonStepEndurance && weeklyMinutes>=a1.highNonStepTrainingMinutesPerWeek) {
    candidates=['ACTIVE','VERY_ACTIVE'];
    reasonCodes.push('HIGH_VOLUME_NONSTEP_ENDURANCE_RAISES_PLAUSIBLE_ENVELOPE');
  } else if (stepBand==='S4') {
    candidates=['ACTIVE','VERY_ACTIVE'];
    reasonCodes.push('VERY_HIGH_LOCOMOTION_EVIDENCE_NOT_A_FIXED_CLASS');
  } else if (stepBand==='S3') {
    candidates=['LOW_ACTIVE','ACTIVE'];
    reasonCodes.push('HIGH_LOCOMOTION_SUPPORTS_ADJACENT_MIDDLE_CLASSES');
  } else if (stepBand==='S2' && modality==='RESISTANCE' && weeklyMinutes>0) {
    candidates=['LOW_ACTIVE','ACTIVE'];
    reasonCodes.push('DOCUMENTED_RESISTANCE_PROFILE_REMAINS_LOW_ACTIVE_ACTIVE_BORDERLINE');
  } else if (['STANDING','PHYSICAL'].includes(occupation) && ['S1','S2'].includes(stepBand)) {
    candidates=['LOW_ACTIVE','ACTIVE'];
    reasonCodes.push('OCCUPATION_SHIFTS_PLAUSIBILITY_WITHOUT_FIXED_CLASS_BONUS');
  } else if (occupation==='SEATED' && ['S0','S1'].includes(stepBand) && modality==='NONE') {
    candidates=['INACTIVE','LOW_ACTIVE'];
    reasonCodes.push('CONCORDANT_LOWER_ACTIVITY_EVIDENCE');
  } else {
    candidates=['INACTIVE','LOW_ACTIVE','ACTIVE'];
    reasonCodes.push('EVIDENCE_TOO_BROAD_FOR_ADJACENT_CLASS_ENVELOPE');
  }
  const status=candidates.length===2 && adjacent(candidates) ? 'ADJACENT_CLASS_ENVELOPE' : 'INSUFFICIENT_DATA';
  return contract(status,candidates,profile,a1,{ occupation,steps,coverage,coverageState,observationDays,stepBand,trainingStatus,trainingRealized,modality,sessions,duration,weeklyMinutes,occupationTrainingOverlap,nonStepEndurance },missingness,contradictions,reasonCodes,false);
}

function contract(status,classCandidates,profile,a1,evidence,missingness,contradictions,reasonCodes,ood) {
  const selectedClass=classCandidates.length===1 ? classCandidates[0] : null;
  const classEnvelope=classCandidates.length ? { lower:classCandidates[0], upper:classCandidates.at(-1), adjacent:adjacent(classCandidates) } : null;
  return deepFreeze({ status,evidence:{ ...evidence, longestSessionMinutes:profile.longestSessionMinutes??null, twoADay:profile.twoADay??null, excludedPrimaryInputs:['WEARABLE_ACTIVE_KCAL','MACHINE_KCAL','RPE','SETS_REPS','TONNAGE','PERCENT_1RM','EPOC','SLEEP_STRESS','PLANNED_FUTURE_ACTIVITY'] },classCandidates,selectedClass,classEnvelope,confidence:'NOT_CALIBRATED',calibrationStatus:'UNVALIDATED_NO_DLW_CRITERION',missingness,contradictions,ood:{flag:ood,reasonCodes:reasonCodes.filter(code=>code.includes('OOD'))},reasonCodes,source:'Documentacion_Macrobalance.md MB-06/07/09/10/10A/10C/10D; R1 Evidence Envelope; H0 bands [HEURISTIC_TEST]',modelVersion:A1_CLASSIFIER_VERSION,mode:'LAB_ONLY_DO_NOT_FREEZE',manualClassUsed:false,additiveKcalBlocks:false,parameters:{ heuristicTestStepBands:a1.heuristicTestStepBands,coverageDegradationBelow:a1.coverageDegradationBelow,heuristicMinObservationDays:a1.heuristicMinObservationDays,highNonStepTrainingMinutesPerWeek:a1.highNonStepTrainingMinutesPerWeek } });
}

function classifyStepBand(steps,bands) {
  if (steps<bands[0]) return 'S0';
  if (steps<bands[1]) return 'S1';
  if (steps<bands[2]) return 'S2';
  if (steps<=bands[3]) return 'S3';
  return 'S4';
}

function occupationMovement(value) {
  if (['SEATED','MOSTLY_SEATED'].includes(value)) return 'SEATED';
  if (['MIXED','SEATED_INTERRUPTED'].includes(value)) return 'MIXED';
  if (['STANDING','STANDING_WALKING','MOSTLY_STANDING_OR_WALKING'].includes(value)) return 'STANDING';
  if (['PHYSICAL','HEAVY_MANUAL','MANUAL_LIGHT_LOAD','PHYSICALLY_DEMANDING_HEAVY_LOAD'].includes(value)) return 'PHYSICAL';
  return 'UNKNOWN';
}

function adjacent(candidates) {
  if (candidates.length===1) return true;
  if (candidates.length!==2) return false;
  return CLASSES.indexOf(candidates[1])-CLASSES.indexOf(candidates[0])===1;
}
