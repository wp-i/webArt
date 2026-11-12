import fs from 'node:fs';
import path from 'node:path';
import {safeFile,verifyEvidence,verifyFrame} from '../quality-gate.mjs';
import {hash,ProductionError} from './api.mjs';
import {usesWebGL,assertRenderingSource} from './rendering.mjs';

const need=(ok,message)=>{if(!ok)throw new ProductionError('locked-module-failed',message)};
export function loadRejectedCoreModules(root){
 const policy=JSON.parse(fs.readFileSync(safeFile(root,'webart.quality.json'),'utf8'));
 need(policy.rejectedCoreModules,'生产局部3D须配置实际失败素材模块登记');
 const ledger=JSON.parse(fs.readFileSync(safeFile(root,policy.rejectedCoreModules),'utf8'));
 need(ledger.schemaVersion===1&&Array.isArray(ledger.modules)&&new Set(ledger.modules.map(m=>m.sourceSha256)).size===ledger.modules.length,'失败素材模块登记无效或重复');
 for(const item of ledger.modules){
  need(/^[a-f0-9]{64}$/.test(item.sourceSha256??'')&&item.reason?.length>=30,'失败素材模块缺少准确指纹及原因');
  verifyEvidence(root,[item.review]);const review=JSON.parse(fs.readFileSync(safeFile(root,item.review.path),'utf8'));
  need(review.phase==='asset-module'&&review.decision==='reject'&&review.vetoes?.length>0&&review.files?.some(f=>f.sha256===item.sourceSha256),'素材拒绝必须绑定真实版本及核心否决');
  need(review.states?.some(s=>s.viewport==='desktop')&&review.states?.some(s=>s.viewport==='mobile'),'失败素材须有实际桌面及手机画面');
  verifyEvidence(root,review.states.flatMap(s=>s.evidence));
 }
 return ledger.modules;
}
export function recordRejectedCoreModules(root,id,reviewPath){
 need(/^00[6-9]$|^010$/.test(id),'冻结第一稿不能进入素材重做登记');
 const policy=JSON.parse(fs.readFileSync(safeFile(root,'webart.quality.json'),'utf8')),items=loadRejectedCoreModules(root),reviewBytes=fs.readFileSync(safeFile(root,reviewPath)),review=JSON.parse(reviewBytes);
 need(review.phase==='asset-module'&&review.id===id&&review.decision==='reject'&&review.vetoes?.length>0&&review.finding?.length>=30,'只能登记有实际否决依据的素材拒绝');
 need(review.states?.some(s=>s.viewport==='desktop')&&review.states?.some(s=>s.viewport==='mobile'),'素材拒绝须含实际桌面及手机证据');verifyEvidence(root,review.states.flatMap(s=>s.evidence));
 need(review.files?.length>0&&review.files.every(f=>f.path.endsWith('.js')),'素材拒绝须绑定关键造型/材质源码');verifyEvidence(root,review.files);
 for(const file of review.files)if(!items.some(item=>item.sourceSha256===file.sha256))items.push({id,sourceSha256:file.sha256,reason:review.finding,review:{path:reviewPath,sha256:hash(reviewBytes)}});
 fs.writeFileSync(safeFile(root,policy.rejectedCoreModules),JSON.stringify({schemaVersion:1,modules:items},null,2)+'\n');
 return {result:'rejected-core-modules-registered',total:items.length,inventoryChanged:false,pageAuthorized:false};
}
export function resolveLockedModules(root,modules,rendering,signatures){
 need(Array.isArray(modules)&&modules.length<=8,'须明确配置驱动器持有的核心模块');
 need(rendering.mode!=='local-3d'||modules.some(m=>m.target?.endsWith('.js')),'局部3D须先批准关键造型/材质模块，不能交给页面生成临场近似');
 need(new Set(modules.map(m=>m.target)).size===modules.length,'核心模块目标重复');let size=0;
 const rejected=modules.length&&fs.existsSync(path.join(root,'webart.quality.json'))?loadRejectedCoreModules(root):[];
 return modules.map(m=>{
  need(!rejected.some(item=>item.sourceSha256===m.sha256),'该造型/材质模块已被实际拒绝，改名、换稿号或重新填写admit不能恢复准入');
  need(/^src\/locked\/[a-z0-9/_-]+\.(?:js|css|svg|glsl)$/.test(m.target)&&!m.target.includes('..')&&!m.target.includes('//'),'核心模块必须放在专有src/locked目录');
  need(m.interface?.length>=30&&m.signatures?.length>0&&m.signatures.every(name=>signatures.some(s=>s.name===name)),'核心模块须关联接口及来源签名，不能只锁一个无关文件');
  need(m.creator&&m.sourceDescription&&m.license&&m.distributionBasis?.length>=30&&m.verified,'核心模块须有作者、来源、许可核验及源码分发依据');
  verifyEvidence(root,[{path:m.source,sha256:m.sha256},m.approval]);
  const approval=JSON.parse(fs.readFileSync(safeFile(root,m.approval.path),'utf8'));
  need(approval.schemaVersion===1&&approval.decision==='admit'&&approval.finding?.length>=30&&approval.files?.some(f=>f.path===m.source&&f.sha256===m.sha256),'核心模块缺少绑定确切源码的素材准入');
  need(approval.evidence?.some(e=>e.viewport==='desktop')&&approval.evidence?.some(e=>e.viewport==='mobile'),'核心素材准入须有桌面和手机实际画面');verifyEvidence(root,approval.evidence);
  for(const viewport of ['desktop','mobile'])verifyFrame(root,approval.evidence.filter(e=>e.viewport===viewport),viewport);
  const content=fs.readFileSync(safeFile(root,m.source),'utf8');size+=Buffer.byteLength(content);need(size<=250000,'锁定核心模块超出源码预算');return {path:m.target,content};
 });
}
export function mergeLockedModules(files,locked){
 need(!files.some(f=>f.path.startsWith('src/locked/')),'模型不能创建或改写驱动器持有的核心模块');
 if(locked.length)need(!usesWebGL(files),'页面编排不能另建3D代理；渲染、关键造型与材质由已批准模块提供');
 const merged=[...files,...locked],byPath=new Map(merged.map(f=>[f.path,f])),reachable=new Set();
 const visit=file=>{if(reachable.has(file))return;reachable.add(file);const src=byPath.get(file)?.content??'';for(const m of src.matchAll(/(?:import|export)\s+[\s\S]*?\s+from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)){const target=m[1]??m[2];if(target.startsWith('.'))visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),target.split('?')[0])))}};
 visit('src/main.js');need(locked.every(f=>reachable.has(f.path)),'页面省略了已批准核心模块，不能仅放进归档充当保留');return merged;
}
export function assertPackagedModules(root,entry,modules,rendering){
 const manifest=JSON.parse(fs.readFileSync(safeFile(root,entry.manifest),'utf8'));
 const source=target=>{const mapping=manifest.files.find(f=>target===f.archive||target.startsWith(f.archive+'/'));need(mapping,'源码包没有包含已锁核心模块或其入口');const relative=target===mapping.archive?'':target.slice(mapping.archive.length+1);return fs.readFileSync(safeFile(root,mapping.source+(relative?'/'+relative:'')),'utf8')};
 for(const m of modules)need(hash(Buffer.from(source(m.target)))===m.sha256,'归档中的核心造型/材质模块已改变');
 if(rendering){
  const files=[],visited=new Set(),walk=target=>{if(visited.has(target))return;visited.add(target);const content=source(target);files.push({path:target,content});for(const m of content.matchAll(/(?:import|export)\s+[\s\S]*?\s+from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)){const ref=m[1]??m[2];if(ref.startsWith('.'))walk(path.posix.normalize(path.posix.join(path.posix.dirname(target),ref.split('?')[0])))}};
  walk('src/main.js');assertRenderingSource(files,rendering);const locked=files.filter(f=>modules.some(m=>m.target===f.path));need(locked.length===modules.length,'已锁核心模块未从页面入口引用');mergeLockedModules(files.filter(f=>!f.path.startsWith('src/locked/')),locked);
 }
}
