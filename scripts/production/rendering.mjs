import {ProductionError} from './api.mjs';

const need=(condition,message)=>{if(!condition)throw new ProductionError('rendering-contract',message)};
export const failureModes=['context-unavailable','context-lost'];
export function validateRenderingPlan(rendering){
 need(rendering&&['dom','local-3d'].includes(rendering.mode),'须静态配置DOM或必要局部3D的渲染方式');
 if(rendering.mode==='local-3d'){
  need(typeof rendering.canvasSelector==='string'&&rendering.canvasSelector.length>0&&rendering.canvasSelector.length<=200,'局部3D须配置实际画布');
  const fallback=rendering.fallback;
  need(fallback&&typeof fallback.selector==='string'&&fallback.selector.length>0&&fallback.selector.length<=200&&fallback.selector!==rendering.canvasSelector,'局部3D须配置独立且可见的备用内容');
  need(typeof fallback.ready==='string'&&fallback.ready.length>=20&&fallback.ready.length<=1000,'局部3D须配置备用内容的实际就绪条件');
 }
 return rendering;
}
export function usesWebGL(files){return files.some(f=>/\bfrom\s*['"]three(?:\/[^'"]+)?['"]|\bimport\s*['"]three(?:\/[^'"]+)?['"]|\bgetContext\s*\(\s*['"](?:webgl2?|experimental-webgl)['"]/i.test(f.content))}
export function assertRenderingSource(files,rendering){
 validateRenderingPlan(rendering);
 need(!usesWebGL(files)||rendering.mode==='local-3d','源码引入3D但静态计划未配置实际渲染失败备用');
 need(rendering.mode!=='local-3d'||usesWebGL(files),'计划要求必要局部3D，源码却省略了实际3D实现');
 return true;
}
export function validateFallbackCapture(report,digest){
 need(report?.result==='captured-not-visually-approved'&&report.sourceSha256===digest,'3D备用证据未绑定当前源码');
 need(report.checks?.length===6,'必须实测两种渲染故障及三个宽度');
 for(const mode of failureModes)for(const width of [1440,390,320]){
  const checks=report.checks.filter(c=>c.mode===mode&&c.width===width);
  need(checks.length===1,'3D备用状态重复或缺失');const check=checks[0];
  need(check.trigger?.observed===true&&check.states?.length===4&&new Set(check.states.map(s=>s.state)).size===4&&['opening','transition','middle','ending'].every(state=>check.states.some(s=>s.state===state)),'未真实触发故障或未查看完整备用路径');
  need(check.states.every(s=>s.contentVisible&&!s.overflow&&s.evidence?.path&&/^[a-f0-9]{64}$/.test(s.evidence.sha256)),'3D备用缺内容、溢出或缺实际画面');
 }
 return report.checks.flatMap(c=>c.states.map(s=>s.evidence));
}
