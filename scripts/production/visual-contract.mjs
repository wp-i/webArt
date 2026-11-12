import crypto from 'node:crypto';
import {verifyEvidence} from '../quality-gate.mjs';
import {ProductionError} from './api.mjs';

export const visualStates=['opening','transition','middle','ending'];
const need=(ok,message)=>{if(!ok)throw new ProductionError('visual-contract-failed',message)};
export const visualContractHash=contract=>crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex');
export function validateVisualContract(contract,signatures){
 need(contract?.schemaVersion===1&&Object.keys(contract.states??{}).length===4,'缺少静态四状态视觉合同');
 for(const state of visualStates){
  const s=contract.states[state];
  need(s&&['subject','material','composition','role'].every(key=>typeof s[key]==='string'&&s[key].length>=30),'每个状态须锁定主体、材质、构图和视觉作用，不能用通用通过标记');
  need(['desktop','mobile'].every(view=>Number.isInteger(s.visibleCharacters?.[view])&&s.visibleCharacters[view]>=20&&s.visibleCharacters[view]<=260),'每个状态须预设桌面/手机可见短文案预算');
  need(Array.isArray(s.subjectSelectors)&&s.subjectSelectors.length>0&&s.subjectSelectors.length<=4&&s.subjectSelectors.every(p=>typeof p.selector==='string'&&p.selector.length>0&&p.selector.length<=200&&p.minimumViewportArea>=.01&&p.minimumViewportArea<=1&&Number.isInteger(p.maxInstances)&&p.maxInstances>=1&&p.maxInstances<=4),'主体的可见范围与出现次数须先配置');
 }
 need(Array.isArray(contract.continuity)&&contract.continuity.length<=6&&new Set(contract.continuity.map(c=>c.id)).size===contract.continuity.length,'跨状态主体关系未明确配置');
 for(const c of contract.continuity)need(/^[a-z0-9-]+$/.test(c.id)&&c.identity?.length>=30&&c.states?.length>=2&&new Set(c.states).size===c.states.length&&c.states.every(s=>visualStates.includes(s))&&signatures.some(s=>s.name===c.signature),'跨状态关系须指向具体身份、已锁核心和对应状态');
 return contract;
}

// Serialized into the task browser. Geometry is a rejection check, never an aesthetic grade.
export function measureVisualState(config){
 const visible=e=>{
  let r=e.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
  for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return 0;const b=p.getBoundingClientRect();if(p!==e){if(/hidden|clip|auto|scroll/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right)}if(/hidden|clip|auto|scroll/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom)}}}
  return Math.max(0,right-left)*Math.max(0,bottom-top)/(innerWidth*innerHeight);
 };
 let characters=0;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(!p||p.closest('script,style,noscript,.sr-only')||!visible(p))continue;const range=document.createRange();range.selectNodeContents(n);if([...range.getClientRects()].some(r=>r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth))characters+=n.textContent.trim().replace(/\s+/g,' ').length}
 const subjects=config.subjectSelectors.map(p=>{const elements=[...document.querySelectorAll(p.selector)],areas=elements.map(visible).filter(a=>a>0);return {selector:p.selector,visibleInstances:areas.length,largestViewportArea:Math.max(0,...areas)}});
 return {characters,subjects};
}
export function visualMeasurementFailures(measured,config,viewport){
 const failures=[];if(!Number.isInteger(measured?.characters)||measured.characters<0||measured.characters>config.visibleCharacters[viewport])failures.push('当前视口文字超过固定预算或缺少实际测量');
 for(const expected of config.subjectSelectors){const actual=measured?.subjects?.find(p=>p.selector===expected.selector);if(!actual||!Number.isInteger(actual.visibleInstances)||!Number.isFinite(actual.largestViewportArea)||actual.visibleInstances<1||actual.visibleInstances>expected.maxInstances||actual.largestViewportArea<expected.minimumViewportArea)failures.push('核心主体缺失、缩成装饰或被重复：'+expected.selector)}
 return failures;
}
export function assertVisualCapture(capture,contract){
 need(capture.visualContractSha256===visualContractHash(contract),'视觉采证没有绑定静态合同');
 need(capture.states?.length===8,'视觉合同需要实际八状态');
 for(const viewport of ['desktop','mobile'])for(const state of visualStates){const s=capture.states.find(s=>s.viewport===viewport&&s.state===state);need(s,'缺少视觉合同状态');need(visualMeasurementFailures(s.visualMeasurement,contract.states[state],viewport).length===0,viewport+'/'+state+'：'+visualMeasurementFailures(s.visualMeasurement,contract.states[state],viewport).join('；'))}
 return true;
}
export function validateVisualReview(root,review,contract){
 need(review.visualContractSha256===visualContractHash(contract),'视觉审查未绑定当前四状态合同');
 const checks=review.stateChecks;need(checks?.length===8&&new Set(checks.map(c=>c.viewport+':'+c.state)).size===8,'审查须逐视口覆盖四状态');
 for(const viewport of ['desktop','mobile'])for(const state of visualStates){
  const c=checks.find(c=>c.viewport===viewport&&c.state===state),frame=review.states.find(s=>s.viewport===viewport&&s.state===state);
  need(c&&['subject','material','composition','role'].every(k=>c[k]==='preserved')&&c.finding?.length>=30,viewport+'/'+state+'的主体、材质、构图或视觉作用未保留');
  verifyEvidence(root,c.evidence);need(c.evidence.some(e=>frame.evidence.some(f=>f.sha256===e.sha256&&f.path===e.path)),'不能用开场或别的状态代替当前状态审查');
 }
 const continuity=review.continuityChecks;need(Array.isArray(continuity)&&continuity.length===contract.continuity.length*2,'跨状态主体关系缺少逐视口审查');
 for(const spec of contract.continuity)for(const viewport of ['desktop','mobile']){
  const c=continuity.find(c=>c.id===spec.id&&c.viewport===viewport);need(c?.status==='preserved'&&c.finding?.length>=30,'跨状态主体身份丢失或缺证据');verifyEvidence(root,c.evidence);
  need(spec.states.every(state=>review.states.find(s=>s.viewport===viewport&&s.state===state).evidence.some(e=>c.evidence.some(f=>f.sha256===e.sha256&&f.path===e.path))),'跨状态审查须同时引用每个相关状态，不能只看单幅图');
 }
 return true;
}
