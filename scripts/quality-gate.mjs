import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateVisualContract,validateVisualReview,assertVisualCapture} from './production/visual-contract.mjs';
import {resolveLockedModules,assertPackagedModules} from './production/locked-modules.mjs';
import {validateCliReviewConsumptionReceipt} from './production/cli-review-receipt.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (condition, message) => { if (!condition) throw new Error(`Quality gate: ${message}`); };
const read = (root, filename) => JSON.parse(fs.readFileSync(safeFile(root, filename), 'utf8'));
export function safeFile(root, filename) {
  need(typeof filename === 'string' && filename && !filename.includes('\\') && !filename.startsWith('/') && !/^[a-z]:/i.test(filename) && !filename.split('/').some(p => !p || p === '.' || p === '..'), 'unsafe evidence path');
  const target = path.resolve(root, filename);
  need(target.startsWith(path.resolve(root) + path.sep), 'evidence escapes workspace');
  let current = path.resolve(root);
  for (const segment of filename.split('/')) { current = path.join(current, segment); need(!fs.lstatSync(current).isSymbolicLink(), 'linked evidence is not permitted'); }
  return target;
}
export function verifyEvidence(root, evidence) {
  need(Array.isArray(evidence) && evidence.length > 0, 'missing actual evidence');
  for (const file of evidence) {
    need(/^[a-f0-9]{64}$/.test(file.sha256 || ''), 'missing evidence fingerprint');
    const bytes = fs.readFileSync(safeFile(root, file.path));
    need(bytes.length > 0 && sha(bytes) === file.sha256, 'changed or empty evidence: ' + file.path);
  }
}
export function verifyFrame(root, evidence, viewport) {
  verifyEvidence(root, evidence);
  const bytes = fs.readFileSync(safeFile(root, evidence[0].path));
  let dimensions;
  if (bytes.length > 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) dimensions = [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  else if (bytes[0] === 255 && bytes[1] === 216) {
    for (let offset=2;offset+8<bytes.length;) {
      need(bytes[offset]===255, 'invalid JPEG evidence');
      const marker=bytes[offset+1];offset+=2;
      if ([0xc0,0xc1,0xc2].includes(marker)) { dimensions=[bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];break; }
      if (marker===0xda || marker===0xd9) break;
      const length=bytes.readUInt16BE(offset);need(length>=2,'invalid JPEG segment');offset+=length;
    }
  }
  need(dimensions, 'state evidence must be an actual PNG/JPEG viewport');
  const [width,height] = Array.isArray(viewport) ? viewport : viewport === 'desktop' ? [1440,900] : [390,844];
  need(dimensions[0] === width && dimensions[1] === height, 'state evidence has the wrong viewport');
}
export function loadQualityPolicy(root) {
  const policy = read(root, 'webart.quality.json');
  need(policy.schemaVersion === 2 && policy.enabled === true, 'the calibrated production policy must be enabled');
  const calibration = read(root, policy.calibration);
  need(calibration.revision === policy.revision && calibration.baseline.userScore === 95 && calibration.negatives.length >= 5, 'missing user calibration');
  return { policy, calibration };
}
export function loadRejectedSources(root, policy = loadQualityPolicy(root).policy) {
  if (!policy.rejectedSources) return [];
  const ledger = read(root, policy.rejectedSources);
  need(ledger.schemaVersion === 1 && Array.isArray(ledger.sources) && ledger.sources.length > 0, 'missing rejected-source ledger');
  need(new Set(ledger.sources.map(s => s.sourceSha256)).size === ledger.sources.length, 'duplicate rejected source');
  for (const item of ledger.sources) {
    need(/^[a-f0-9]{64}$/.test(item.sourceSha256 || '') && item.reason?.length >= 30, 'incomplete rejected-source record');
    verifyEvidence(root, [item.review]);
    const review = read(root, item.review.path);
    validateRejectedReview(root,review,item.sourceSha256);
  }
  return ledger.sources;
}
export function validateRejectedReview(root,review,sourceSha256){
 need(review.decision==='reject'&&review.sourceSha256===sourceSha256&&review.vetoes?.length>0,'rejected-source record is not bound to a real rejection');
 if(review.phase==='prototype'){verifyEvidence(root,review.states.flatMap(s=>s.evidence));return}
 need(review.phase==='full-qa'&&['pass','reject'].includes(review.responsiveComposition)&&evidenceReviewer(review.reviewer),'late rejection must be an actual full-QA comparison');
 // A control-only rejection must retain its actual execution receipt.
 // Relabelling it as a historical blind review cannot skip that proof.
 const controlOnly=review.responsiveComposition==='pass';
 need(!controlOnly||['evidence-only-current-conversation','evidence-only-fresh-codex-cli'].includes(review.reviewer.mode),'control rejection requires its actual current-conversation receipt or validated CLI execution receipt');
 const executionProof=validateSessionReceipt(root,review,'controls-review');verifyEvidence(root,[review.runtimeEvidence]);
 let request,response;
 if(review.reviewer.mode==='evidence-only-current-conversation'){const receipt=read(root,review.reviewReceipt.path);request=read(root,receipt.requestFile);response=read(root,receipt.responseFile);need(response.result?.decision==='reject'&&response.result?.responsiveComposition===review.responsiveComposition,'late rejection cannot be fabricated from a passing or inconsistent response')}
 if(review.reviewer.mode==='evidence-only-fresh-codex-cli'){request=read(root,executionProof.receipt.request.path);response={result:executionProof.result};need(response.result.decision==='reject'&&response.result.responsiveComposition===review.responsiveComposition,'late CLI rejection differs from its actual response')}
 const runtime=read(root,review.runtimeEvidence.path);
 need(runtime.sourceSha256===sourceSha256&&runtime.result==='passed-observable-checks'&&runtime.responsive?.length===20,'late rejection must bind the measured same-source five-width runtime');
 need(review.responsiveChecks?.length===20&&new Set(review.responsiveChecks.map(c=>c.viewport+':'+c.state)).size===20,'late rejection needs every measured responsive state');
 for(const [viewport,width,height]of [['desktop',1440,900],['wide',2048,912],['tablet',768,1024],['mobile',390,844],['narrow',320,844]])for(const name of ['opening','transition','middle','ending']){
  const states=runtime.responsive.filter(s=>s.viewport===viewport&&s.state===name),check=review.responsiveChecks.find(c=>c.viewport===viewport&&c.state===name),state=states[0];
  need(states.length===1&&state.width===width&&state.height===height&&check,'late rejection needs every measured responsive state');
  verifyEvidence(root,check.evidence);need(check.evidence.some(e=>e.path===state.evidence.path&&e.sha256===state.evidence.sha256),'late rejection substituted another state');verifyFrame(root,[state.evidence],[width,height]);
  if(controlOnly){
   const originals=response.result.responsiveChecks?.filter(c=>c.viewport===viewport&&c.state===name),original=originals?.[0];
   need(originals?.length===1&&Array.isArray(original.frames)&&original.frames.length>0&&original.frames.every(id=>typeof id==='string'&&request.images.some(image=>image.sha256===state.evidence.sha256&&image.label?.split('\n').some(line=>line.startsWith(id+' ')))),'control rejection substituted an unreviewed responsive state');
  }
 }
}
export function recordRejectedSource(root, id, reviewPath) {
  const {policy} = loadQualityPolicy(root), sources = loadRejectedSources(root, policy);
  need(policy.rejectedSources, 'rejected-source ledger is required by production');
  const review = read(root, reviewPath);
  need(id!=='001'&&/^[a-f0-9]{64}$/.test(review.sourceSha256||''),'the benchmark cannot enter candidate rejection');validateRejectedReview(root,review,review.sourceSha256);
  if (sources.some(s => s.sourceSha256 === review.sourceSha256)) return;
  const reason = review.phase==='full-qa'
    ? '完整QA已因控件、构图或故障备用的实际品质问题拒绝此源码；必须修改源码并重新采证，不能靠更换评分、名称或稿号恢复资格。'
    : '生产试片已因核心视觉或品质差距被拒绝；必须修改来源计划或源码并重新采证，不能靠更换评分、名称或稿号恢复资格。';
  sources.push({id,sourceSha256:review.sourceSha256,reason,review:{path:reviewPath,sha256:sha(fs.readFileSync(safeFile(root,reviewPath)))}});
  fs.writeFileSync(safeFile(root,policy.rejectedSources),JSON.stringify({schemaVersion:1,sources},null,2)+'\n');
}
export function evidenceReviewer(reviewer) {
  if(reviewer?.implementationContextIncluded !== false)return false;
  return reviewer.mode==='blind-evidence-only'||(reviewer.mode==='evidence-only-current-conversation'&&reviewer.kind==='current-conversation'&&reviewer.independent===false&&reviewer.contextIsolated===false)||(reviewer.mode==='evidence-only-fresh-codex-cli'&&reviewer.kind==='fresh-codex-cli'&&reviewer.independent===false&&reviewer.contextIsolated===true&&reviewer.backendIndependenceEstablished===false&&typeof reviewer.contextIsolationScope==='string'&&reviewer.contextIsolationScope.length>0);
}
export function validateSessionReceipt(root,report,role){
  if(report.reviewer?.mode==='evidence-only-fresh-codex-cli'){
    need(evidenceReviewer(report.reviewer),'CLI review has incorrect provenance');
    return validateCliReviewConsumptionReceipt({root,receipt:report.reviewReceipt,role,report});
  }
  if(report.reviewer?.mode!=='evidence-only-current-conversation')return;
  verifyEvidence(root,[report.reviewReceipt]);
  const receipt=read(root,report.reviewReceipt.path);
  need(receipt.role===role&&receipt.requestId&&receipt.provenance?.kind==='current-conversation'&&receipt.provenance.independent===false&&receipt.provenance.contextIsolated===false,'session review receipt has wrong provenance');
  verifyEvidence(root,[{path:receipt.requestFile,sha256:receipt.requestSha256},{path:receipt.responseFile,sha256:receipt.responseSha256}]);
  const request=read(root,receipt.requestFile),response=read(root,receipt.responseFile);
  need(request.id===receipt.requestId&&request.role===role&&response.requestId===receipt.requestId&&response.requestSha256===receipt.requestSha256&&!response.cancelled,'session review is stale or cancelled');
  verifyEvidence(root,request.images);
  if(report.decision==='admit')need(response.result?.decision==='admit','session rejection cannot be promoted to admission');
}
export function assertCalibratedReviewer(root,evaluator,report,role){
  need(report.reviewer?.id===evaluator.reviewer?.id&&report.reviewer.calibrationRunId===evaluator.runId,'review is not bound to its calibrated evaluator');
  const cli='evidence-only-fresh-codex-cli';
  if(evaluator.reviewer.mode!==cli&&report.reviewer.mode!==cli)return;
  need(evaluator.reviewer.mode===cli&&report.reviewer.mode===cli,'CLI review cannot inherit another execution mode calibration');
  const calibrated=validateSessionReceipt(root,evaluator,'calibration'),reviewed=validateSessionReceipt(root,report,role);
  const features=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
  need(calibrated.receipt.cliVersion===reviewed.receipt.cliVersion&&calibrated.receipt.provenance.requestedModel===reviewed.receipt.provenance.requestedModel&&features(calibrated.receipt.effectiveFeatures)===features(reviewed.receipt.effectiveFeatures),'CLI reviewer configuration changed after calibration');
  const before=calibrated.provenance.actualModel,after=reviewed.provenance.actualModel;
  need(!before||!after||before===after,'Known CLI model identity changed after calibration');
}
export function validateCalibration(root, report, calibration) {
  validateSessionReceipt(root,report,'calibration');
  need(report.schemaVersion === 2 && report.calibrationRevision === calibration.revision, 'stale calibration review');
  const samples = [calibration.baseline, ...calibration.negatives];
  need(report.samples?.length === samples.length, 'calibration must include the whole accepted/rejected cohort');
  for (const sample of samples) {
    const result = report.samples.find(s => s.id === sample.id);
    need(result?.sourceSha256 === sample.sourceSha256 && result.verdict === sample.class, 'reviewer cannot distinguish benchmark from user-rejected sample ' + sample.id);
    need(typeof result.finding === 'string' && result.finding.length >= 30, 'calibration requires a concrete visual finding');
    need(result.evidence?.some(e => e.viewport === 'desktop') && result.evidence?.some(e => e.viewport === 'mobile'), 'calibration needs both viewports');
    verifyEvidence(root, result.evidence);
  }
  return true;
}
export function validateReview(root, review, calibration, phase, sourceSha256) {
  validateSessionReceipt(root,review,phase+'-review');
  need(review.schemaVersion === 2 && review.phase === phase && review.calibrationRevision === calibration.revision, 'wrong review phase/revision');
  need(review.benchmarkSha256 === calibration.baseline.sourceSha256, 'wrong quality benchmark');
  need(!('score' in review) && !('totalScore' in review), 'a self-awarded total cannot admit a design');
  const allowedScope = phase === 'reference' ? ['benchmark+negative+reference','benchmark+negative+reference+candidate'] : ['benchmark+negative+reference+candidate'];
  need(evidenceReviewer(review.reviewer) && allowedScope.includes(review.reviewer.inputScope), 'the art review must exclude implementation justifications and old scores');
  need(review.decision === 'admit' && review.vetoes?.length === 0, 'review has a material deficit or is not admitted');
  if (phase === 'prototype') need(review.sourceSha256 === sourceSha256, 'prototype changed after visual review');
  need(review.states?.length === 8 && new Set(review.states.map(s => s.viewport + ':' + s.state)).size === 8, 'need four actual states at both viewports');
  need(new Set(review.states.map(s => s.evidence?.[0]?.sha256)).size === 8, 'one anchor cannot be reused as eight visual states');
  for (const viewport of ['desktop', 'mobile']) for (const state of ['opening', 'middle', 'transition', 'ending']) {
    const s = review.states.find(x => x.viewport === viewport && x.state === state);
    need(s?.finalAssets === true && s?.loaded === true, 'four-state evidence must use loaded final assets'); verifyFrame(root, s.evidence, viewport);
  }
  need(review.dimensions?.length === calibration.dimensions.length, 'missing quality dimensions');
  for (const key of calibration.dimensions) {
    const d = review.dimensions.find(x => x.key === key);
    need(d && ['peer','above'].includes(d.againstBenchmark), key + ' is below the accepted benchmark');
    need(typeof d.finding === 'string' && d.finding.length >= 30, key + ' needs a concrete comparison');
    verifyEvidence(root, d.benchmarkEvidence); verifyEvidence(root, d.candidateEvidence);
  }
  need(Array.isArray(review.signatureFeatures) && review.signatureFeatures.length > 0, 'missing source-specific signature');
  need(new Set(review.signatureFeatures.map(f=>f.name)).size === review.signatureFeatures.length && review.signatureFeatures.every(f=>typeof f.name==='string'&&f.name.length>=3), 'core signatures need unique explicit names');
  for (const feature of review.signatureFeatures) {
    need(feature.core === true && feature.retained === true && feature.role === 'signature' && feature.sceneLevel === true, 'a core source quality cannot be deleted or replaced with utility/ambient motion');
    need(typeof feature.visualPurpose === 'string' && feature.visualPurpose.length >= 30, 'signature must explain its visual role');
    verifyEvidence(root, feature.referenceEvidence); if (phase === 'prototype') verifyEvidence(root, feature.candidateEvidence);
  }
  for (const input of ['pointer','scroll']) {
    const m = review.motion?.find(x => x.input === input);
    need(m?.normal === true && m.forward === true && m.reverse === true && m.leaveOrStop === true && m.reduced === true && m.primaryVisual === true, input + ' lacks reviewed primary visual process');
    need(m.evidence.length >= 3 && new Set(m.evidence.map(e=>e.sha256)).size >= 2, 'motion needs a changing sequence, not a single anchor'); verifyEvidence(root, m.evidence);
  }
  return true;
}
export function evaluateQuality(root, entry, sourceSha256, phase = 'prototype') {
  const { policy, calibration } = loadQualityPolicy(root);
  const baseline = calibration.baseline;
  if (entry.id === baseline.id && sourceSha256 === baseline.sourceSha256) return { decision: 'approved-user-baseline', scoreAuthority: 'user', sourceSha256 };
  const negative = calibration.negatives.find(n => n.sourceSha256 === sourceSha256);
  if (negative) return { decision: 'blocked-below-user-benchmark', approximateUserScore: negative.userScore, sourceSha256, reason: 'Unchanged source is a user-calibrated negative; old self-scores and passing QA cannot override it.' };
  try {
    const rejected = loadRejectedSources(root, policy).find(s => s.sourceSha256 === sourceSha256);
    if (rejected) return { decision: 'blocked-previously-rejected-source', sourceSha256, reason: rejected.reason, review: rejected.review.path };
  } catch (error) { return { decision: 'blocked-invalid-rejection-ledger', sourceSha256, reason: error.message }; }
  if (!entry.qualityReview) return { decision: 'blocked-missing-comparison', sourceSha256, reason: 'No calibrated reference/prototype quality certificate.' };
  try {
    const contract = read(root, entry.qualityReview);
    need(contract.schemaVersion === 2 && contract.id === entry.id && contract.sourceSha256 === sourceSha256, 'stale production contract');
    need(contract.calibrationRevision === calibration.revision, 'production contract uses the old evaluator');
    const evaluator = read(root, contract.calibrationReview);
    validateCalibration(root, evaluator, calibration);
    need(evaluator.purpose === 'reviewer-calibration' && evaluator.runId && evaluator.reviewer?.id && evidenceReviewer(evaluator.reviewer), 'a ground-truth audit cannot stand in for a fresh reviewer calibration');
    const referenceReview = read(root, contract.referenceReview);
    const sameEvaluator = review => assertCalibratedReviewer(root,evaluator,review,review.phase+'-review');
    sameEvaluator(referenceReview); validateReview(root, referenceReview, calibration, 'reference', sourceSha256);
    if (policy.visualContractRequired) {
      validateVisualContract(contract.visualContract, referenceReview.signatureFeatures);
      validateVisualReview(root, referenceReview, contract.visualContract);
      resolveLockedModules(root, contract.lockedModules, contract.rendering, referenceReview.signatureFeatures);
      assertPackagedModules(root, entry, contract.lockedModules, contract.rendering);
    }
    if (phase !== 'reference') {
      const prototypeReview = read(root, contract.prototypeReview); sameEvaluator(prototypeReview); validateReview(root, prototypeReview, calibration, 'prototype', sourceSha256);
      if (policy.visualContractRequired) { validateVisualReview(root, prototypeReview, contract.visualContract); assertVisualCapture(prototypeReview, contract.visualContract); }
      need(referenceReview.signatureFeatures.every(feature => prototypeReview.signatureFeatures.some(candidate => candidate.name === feature.name && candidate.core && candidate.retained && candidate.sceneLevel)), 'prototype review omitted a locked reference signature');
    }
    need(contract.assetPlan?.heroRoleLocked === true && contract.assetPlan.replacementCompared === true && contract.assetPlan.rightsVerified === true && contract.assetPlan.lowCostIsNotMerit === true, 'asset quality/rights were not locked before implementation');
    verifyEvidence(root, contract.assetPlan.evidence);
    return { decision: 'admitted-for-review', sourceSha256, authority: 'calibrated-pairwise-review', limitations: 'Structural validation cannot itself judge aesthetic quality or guarantee user acceptance.' };
  } catch (error) { return { decision: 'blocked-incomplete-comparison', sourceSha256, reason: error.message }; }
}
export function assertProductionQuality(root, entry, sourceSha256, phase = 'prototype') {
  const result = evaluateQuality(root, entry, sourceSha256, phase);
  need(['approved-user-baseline','admitted-for-review'].includes(result.decision), `${entry.id} ${result.decision}: ${result.reason}`);
  return result;
}
export function assertRetainedPreview(root, entry, sourceSha256, archiveReceipt) {
  const { policy } = loadQualityPolicy(root);
  const retained = policy.retainedForComparison.find(e => e.id === entry.id);
  if (retained) {
    need(retained.sourceSha256 === sourceSha256 && retained.bytes === archiveReceipt.bytes && retained.sha256 === archiveReceipt.sha256, 'retained comparison source/archive changed; requires a new calibrated review');
    return { decision: 'existing-user-authorized-comparison-only' };
  }
  return assertProductionQuality(root, entry, sourceSha256);
}
